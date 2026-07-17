/**
 * Unit tests for the anomaly detection statistics (src/jobs/anomaly-stats.ts).
 *
 * Pure functions only - no database, no network, no env. Run with:
 *   npx tsx tests/unit/test-anomaly-stats.ts
 */

import { BaselineInput, computeBaselineStats, confidenceFromZ, HistogramBin, MAD_LN_EPSILON, MAX_REPORTED_Z, modifiedZScore, scoreUnitPrice, severityRankFromAbsZ, weightedPercentile } from "../../src/jobs/anomaly-stats";

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail = ""): void {
  if (condition) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}${detail ? ` -> ${detail}` : ""}`);
  }
}

function closeTo(name: string, actual: number, expected: number, tolerance = 1e-9): void {
  check(name, Math.abs(actual - expected) <= tolerance, `expected ${expected}, got ${actual}`);
}

function bins(pairs: [number, number][]): HistogramBin[] {
  return pairs.map(([value, count]) => ({ value, count }));
}

console.log("🧪 Anomaly statistics");
console.log("=====================");

// --- weightedPercentile / median from a histogram -------------------------
console.log("\n📊 weightedPercentile (no $percentile on MongoDB 4.4)");
{
  const b = bins([
    [1, 1],
    [2, 1],
    [3, 1],
    [4, 1],
  ]);
  closeTo("median of [1,2,3,4] = 2.5", weightedPercentile(b, 0.5), 2.5);
  closeTo("p25 of [1,2,3,4] = 1.75", weightedPercentile(b, 0.25), 1.75);
  closeTo("p75 of [1,2,3,4] = 3.25", weightedPercentile(b, 0.75), 3.25);
  closeTo("p0 = min", weightedPercentile(b, 0), 1);
  closeTo("p100 = max", weightedPercentile(b, 1), 4);
}
{
  // Counts must weight correctly: [10,10,10,20]
  const b = bins([
    [10, 3],
    [20, 1],
  ]);
  closeTo("weighted median of [10,10,10,20] = 10", weightedPercentile(b, 0.5), 10);
}
{
  const b = bins([
    [5, 1],
    [7, 1],
    [9, 1],
  ]);
  closeTo("median of odd-length [5,7,9] = 7", weightedPercentile(b, 0.5), 7);
}
check("empty histogram -> NaN", Number.isNaN(weightedPercentile([], 0.5)));

// --- computeBaselineStats -------------------------------------------------
console.log("\n📊 computeBaselineStats");
{
  const stats = computeBaselineStats(bins([[100, 20]]));
  check("constant-price item produces stats", stats !== null);
  closeTo("constant price -> madLn 0", stats!.madLn, 0);
  closeTo("constant price -> p25 == p75", stats!.p75 - stats!.p25, 0);
  check("n counts observations, not bins", stats!.n === 20, `got ${stats!.n}`);
  check("distinctPrices counts bins", stats!.distinctPrices === 1, `got ${stats!.distinctPrices}`);
}
{
  check("no positive prices -> null", computeBaselineStats(bins([[0, 5]])) === null);
  check("negative prices filtered -> null", computeBaselineStats(bins([[-3, 5]])) === null);
  check("unsorted input is sorted internally", computeBaselineStats(bins([[9, 1], [1, 1], [5, 1]]))!.min === 1);
}

// --- THE REGRESSION THAT MOTIVATED ALL OF THIS ---------------------------
// The replaced detector used mean/stddev, which has breakdown point 0: one huge
// contract drags the mean toward itself and inflates the stddev, so the outlier
// masks itself. median/MAD have breakdown point 0.5 and must not move.
console.log("\n📊 Robustness: a single 1000x contract must not hide itself");
{
  const prices: [number, number][] = [];
  for (let p = 90; p <= 129; p++) {
    prices.push([p, 1]); // 40 ordinary items around ~100
  }
  prices.push([100_000, 1]); // one absurd contract
  const stats = computeBaselineStats(bins(prices))!;

  const rawMean = (prices.reduce((sum, [v, c]) => sum + v * c, 0)) / 41;
  check("mean IS contaminated by the outlier (>2000)", rawMean > 2000, `mean=${rawMean.toFixed(1)}`);
  closeTo("median is NOT contaminated (stays 110)", Math.exp(stats.medianLn), 110, 1e-6);
  check("madLn stays small", stats.madLn > 0 && stats.madLn < 0.3, `madLn=${stats.madLn}`);
  check("n = 41", stats.n === 41);

  const baseline: BaselineInput = { n: stats.n, medianLn: stats.medianLn, madLn: stats.madLn, p25: stats.p25, p75: stats.p75 };
  const outlier = scoreUnitPrice(100_000, baseline);
  check("the 100000 outlier IS flagged", outlier !== null);
  check("...as critical", outlier!.severity === "critical", `got ${outlier?.severity}`);
  check("...via the robust z path", outlier!.method === "log_modified_zscore");
  check("...with direction above", outlier!.direction === "above");

  check("an ordinary 105 is NOT flagged", scoreUnitPrice(105, baseline) === null);
  check("an ordinary 129 is NOT flagged", scoreUnitPrice(129, baseline) === null);
}

// --- modifiedZScore -------------------------------------------------------
console.log("\n📊 modifiedZScore");
{
  const medianLn = Math.log(100);
  closeTo("z at the median = 0", modifiedZScore(100, medianLn, 0.2), 0);
  const z = modifiedZScore(1000, medianLn, 0.2);
  closeTo("z = 0.6745 * ln(10) / 0.2", z, (0.6745 * Math.LN10) / 0.2, 1e-9);
  check("z is negative below the median", modifiedZScore(10, medianLn, 0.2) < 0);
  check("madLn = 0 -> NaN, never Infinity", Number.isNaN(modifiedZScore(1000, medianLn, 0)));
  check("madLn < 0 -> NaN", Number.isNaN(modifiedZScore(1000, medianLn, -1)));
  check("price 0 -> NaN (no log of 0)", Number.isNaN(modifiedZScore(0, medianLn, 0.2)));
  check("negative price -> NaN", Number.isNaN(modifiedZScore(-5, medianLn, 0.2)));
}

// --- severity ladder ------------------------------------------------------
console.log("\n📊 severity ladder");
{
  check("|z| 3.5 exactly -> not flagged", severityRankFromAbsZ(3.5) === null);
  check("|z| 3.6 -> low(1)", severityRankFromAbsZ(3.6) === 1);
  check("|z| 5 exactly -> low(1)", severityRankFromAbsZ(5) === 1);
  check("|z| 5.1 -> medium(2)", severityRankFromAbsZ(5.1) === 2);
  check("|z| 7.1 -> high(3)", severityRankFromAbsZ(7.1) === 3);
  check("|z| 10.1 -> critical(4)", severityRankFromAbsZ(10.1) === 4);
  check("NaN -> null", severityRankFromAbsZ(Number.NaN) === null);
}

// --- confidence -----------------------------------------------------------
console.log("\n📊 confidence + small-n shrinkage");
{
  closeTo("at the threshold with n=10: 0.5 * 10/30", confidenceFromZ(3.5, 10), 0.5 * (10 / 30), 1e-12);
  check("shrinkage: same z, bigger n -> more confidence", confidenceFromZ(6, 1000) > confidenceFromZ(6, 10));
  check("confidence never exceeds 1", confidenceFromZ(1e6, 1e9) <= 1);
  check("confidence never below 0", confidenceFromZ(0, 10) >= 0);
}

// --- madLn == 0 fallback --------------------------------------------------
console.log("\n📊 madLn == 0 -> IQR extreme fence fallback");
{
  // >50% of mass sits exactly at 100, so the median absolute deviation is 0,
  // but the quartiles still straddle a real spread (p25=100, p75=150).
  const stats = computeBaselineStats(
    bins([
      [50, 10],
      [100, 55],
      [150, 35],
    ])
  )!;
  closeTo("madLn is exactly 0", stats.madLn, 0);
  closeTo("p25 = 100", stats.p25, 100);
  closeTo("p75 = 150", stats.p75, 150);

  const baseline: BaselineInput = { n: stats.n, medianLn: stats.medianLn, madLn: stats.madLn, p25: stats.p25, p75: stats.p75 };
  // fence = p75 + 3*(p75-p25) = 150 + 150 = 300
  check("just inside the fence (299) -> not flagged", scoreUnitPrice(299, baseline) === null);
  const flagged = scoreUnitPrice(301, baseline);
  check("just outside the fence (301) -> flagged", flagged !== null);
  check("...via the iqr_fence path", flagged!.method === "iqr_fence");
  check("...not via a divide-by-zero z", Number.isFinite(flagged!.zScore));
  check("fence path is upper-tail only: tiny price not flagged", scoreUnitPrice(0.01, baseline) === null);
  check("n=100 fence finding is NOT severity-capped", scoreUnitPrice(1e9, baseline)!.severity === "critical");
}
{
  // madLn == 0 AND IQR == 0 -> degenerate constant-price item -> skip entirely.
  const stats = computeBaselineStats(bins([[100, 50]]))!;
  const baseline: BaselineInput = { n: stats.n, medianLn: stats.medianLn, madLn: stats.madLn, p25: stats.p25, p75: stats.p75 };
  check("degenerate constant-price item -> skipped, no division by zero", scoreUnitPrice(1_000_000, baseline) === null);
}

// --- sample-size tiers ----------------------------------------------------
console.log("\n📊 sample-size tiers");
{
  const wide: Omit<BaselineInput, "n"> = { medianLn: Math.log(100), madLn: 0.2, p25: 90, p75: 110 };

  check("n=9  -> emit nothing", scoreUnitPrice(100_000, { ...wide, n: 9 }) === null);
  check("n=9  -> emit nothing even at absurd prices", scoreUnitPrice(1e12, { ...wide, n: 9 }) === null);

  const small = scoreUnitPrice(100_000, { ...wide, n: 10 });
  check("n=10 -> emitted", small !== null);
  check("n=10 -> IQR fence only (no z path)", small!.method === "iqr_fence");
  check("n=10 -> severity capped at medium", small!.severity === "medium", `got ${small?.severity}`);
  check("n=10 -> severityRank capped at 2", small!.severityRank === 2);

  const stillSmall = scoreUnitPrice(100_000, { ...wide, n: 29 });
  check("n=29 -> still IQR fence only", stillSmall!.method === "iqr_fence");
  check("n=29 -> still capped at medium", stillSmall!.severity === "medium");

  const robust = scoreUnitPrice(100_000, { ...wide, n: 30 });
  check("n=30 -> robust z path engages", robust!.method === "log_modified_zscore");
  check("n=30 -> full severity available", robust!.severity === "critical", `got ${robust?.severity}`);

  check("severity/severityRank stay in sync", robust!.severityRank === 4 && robust!.severity === "critical");
  check("small-n confidence is shrunk below large-n", scoreUnitPrice(100_000, { ...wide, n: 10 })!.confidence < scoreUnitPrice(100_000, { ...wide, n: 5000 })!.confidence);

  // Two-sided detection on the z path.
  const low = scoreUnitPrice(0.0001, { ...wide, n: 100 });
  check("absurdly low price flagged on the z path", low !== null);
  check("...with direction below", low!.direction === "below");
  check("...and a negative signed zScore", low!.zScore < 0);
  check("...but absZ positive", low!.absZ > 0);
}

// --- input hygiene --------------------------------------------------------
console.log("\n📊 input hygiene");
{
  const baseline: BaselineInput = { n: 100, medianLn: Math.log(100), madLn: 0.2, p25: 90, p75: 110 };
  check("price 0 -> null", scoreUnitPrice(0, baseline) === null);
  check("negative price -> null", scoreUnitPrice(-1, baseline) === null);
  check("NaN price -> null", scoreUnitPrice(Number.NaN, baseline) === null);
  check("Infinity price -> null", scoreUnitPrice(Number.POSITIVE_INFINITY, baseline) === null);
  check("NaN n -> null", scoreUnitPrice(100_000, { ...baseline, n: Number.NaN }) === null);
}

// --- degenerate madLn -----------------------------------------------------
// Regression cover for the production failure: a baseline whose count mass sits on one
// price has a true MAD of 0, but percentile interpolation leaves float residue near 1e-8.
// That passed the old `madLn > 0` check and divided into it, yielding z-scores of ~1.9e7.
console.log("\n📊 degenerate madLn falls back to the IQR fence");
{
  const residue: BaselineInput = { n: 45, medianLn: Math.log(2_000_000), madLn: 1.7e-8, p25: 1_532_486, p75: 2_100_000 };

  check("float-residue madLn -> z is NaN, not astronomical", Number.isNaN(modifiedZScore(2_618_370, residue.medianLn, residue.madLn)));

  // p95-ish price inside the IQR fence must not be flagged at all.
  const insideFence = scoreUnitPrice(2_618_370, residue);
  check("price within IQR fence -> not flagged", insideFence === null);

  // A genuine outlier still gets caught via the fence.
  const fence = 2_100_000 + 3 * (2_100_000 - 1_532_486); // p75 + 3*IQR = 3_802_542
  const outlier = scoreUnitPrice(fence * 2, residue);
  check("gross outlier still flagged via fence", outlier !== null);
  check("fence-scored z stays sane (|z| < 100)", outlier === null || Math.abs(outlier.zScore) < 100);

  // Exactly at the epsilon boundary the z path is allowed again.
  const atEpsilon: BaselineInput = { n: 45, medianLn: Math.log(100), madLn: MAD_LN_EPSILON, p25: 90, p75: 110 };
  check("madLn exactly at epsilon -> z path usable", Number.isFinite(modifiedZScore(150, atEpsilon.medianLn, atEpsilon.madLn)));
}

// --- degenerate IQR -------------------------------------------------------
// The same residue defect in the fallback. Guarding madLn alone made this WORSE: degenerate
// baselines rerouted to the fence and divided by a ~1e-8 IQR, so production z went 1.9e7 -> 5.4e7.
// Numbers below are the real NEUROESTIMULADOR baseline that exposed it.
console.log("\n📊 degenerate IQR does not fabricate a pseudo-z");
{
  const concentrated: BaselineInput = {
    n: 45,
    medianLn: Math.log(1_532_486),
    madLn: 1.7e-8,           // degenerate -> forced onto the fence path
    p25: 1_532_486,
    p75: 1_532_486 + 1e-8,   // interpolation residue, NOT real dispersion
  };

  const scored = scoreUnitPrice(3_280_780, concentrated);
  check("residue IQR -> skipped, not flagged on a fabricated scale", scored === null);

  // Real dispersion at the same median must still work.
  const dispersed: BaselineInput = { n: 45, medianLn: Math.log(1_532_486), madLn: 1.7e-8, p25: 1_400_000, p75: 1_700_000 };
  const realOutlier = scoreUnitPrice(10_000_000, dispersed);
  check("real IQR dispersion still flags outliers", realOutlier !== null);
  check("fence z is clamped to MAX_REPORTED_Z", realOutlier === null || Math.abs(realOutlier.zScore) <= MAX_REPORTED_Z);
}

// --- reported z is bounded ------------------------------------------------
console.log("\n📊 reported z magnitude is bounded");
{
  // Severity saturates at |z|>10, so an unbounded value changes no decision and only reads as broken.
  const tiny: BaselineInput = { n: 100, medianLn: Math.log(100), madLn: MAD_LN_EPSILON, p25: 99, p75: 101 };
  const huge = scoreUnitPrice(1e9, tiny);
  check("extreme z clamped", huge !== null && Math.abs(huge.zScore) <= MAX_REPORTED_Z);
  check("clamped finding is still critical", huge !== null && huge.severity === "critical");
  check("clamped z keeps its sign", huge !== null && huge.zScore > 0);
}

console.log("\n=====================");
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
