/**
 * Unit tests for the anomaly detection statistics (src/jobs/anomaly-stats.ts).
 *
 * Pure functions only - no database, no network, no env. Run with:
 *   npx tsx tests/unit/test-anomaly-stats.ts
 */

import { BaselineInput, computeBaselineStats, confidenceFromZ, HistogramBin, MAD_LN_EPSILON, MAX_REPORTED_Z, modifiedZScore, RECURRING_PRICE_MIN_COUNT, scoreUnitPrice, severityRankFromAbsZ, weightedPercentile } from "../../src/jobs/anomaly-stats";

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

  // The z path used to be two-sided and emit below-median prices as "price_spike" with
  // direction 'below'. It is upper-tail only now: the name has to mean what it says, and the IQR
  // fence was already upper-only, so two-sided here made detection depend on which estimator ran.
  const low = scoreUnitPrice(0.0001, { ...wide, n: 100 });
  check("absurdly low price is NOT a price_spike", low === null);
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

// --- practical significance ----------------------------------------------
// The epsilons floor the DENOMINATOR; nothing floored the numerator. On a baseline sitting at the
// madLn epsilon, the z-score turned a 0.5% price difference into a flag and 1.5% into "critical".
console.log("\n📊 effect-size floor: statistical significance is not enough");
{
  const tight: BaselineInput = { n: 200, medianLn: Math.log(1000), madLn: MAD_LN_EPSILON, p25: 999, p75: 1001 };

  // 1.5% over the median scored |z| ~ 10 (critical) before the floor existed.
  check("+1.5% over median -> not flagged", scoreUnitPrice(1015, tight) === null);
  check("+10% over median -> not flagged", scoreUnitPrice(1100, tight) === null);
  check("+24% over median -> not flagged (just under the floor)", scoreUnitPrice(1240, tight) === null);
  check("+26% over median -> flagged (just over the floor)", scoreUnitPrice(1260, tight) !== null);
  check("3x over median -> still flagged", scoreUnitPrice(3000, tight) !== null);

  // The floor must not swallow real outliers on a normally-dispersed baseline.
  const normal: BaselineInput = { n: 200, medianLn: Math.log(100), madLn: 0.2, p25: 90, p75: 110 };
  check("wide baseline: genuine 10x outlier still flagged", scoreUnitPrice(1000, normal) !== null);
  check("wide baseline: +10% still not flagged", scoreUnitPrice(110, normal) === null);
}

// --- price_spike is upper-tail only ---------------------------------------
// The z path was two-sided while the IQR fence is upper-only, so whether a cheap contract got
// flagged depended purely on its baseline's dispersion. 7,464 of 22,368 production findings (33%)
// were priced BELOW their median and still labelled "price_spike".
console.log("\n📊 price_spike never fires below the median");
{
  const normal: BaselineInput = { n: 200, medianLn: Math.log(100), madLn: 0.2, p25: 90, p75: 110 };

  const cheap = scoreUnitPrice(0.01, normal); // |z| enormous, but far BELOW the median
  check("absurdly cheap price -> not a price_spike", cheap === null);
  check("half the median -> not flagged", scoreUnitPrice(50, normal) === null);

  const expensive = scoreUnitPrice(10_000, normal);
  check("expensive outlier -> still flagged", expensive !== null);
  check("...direction is always 'above'", expensive === null || expensive.direction === "above");
  check("...z is positive", expensive === null || expensive.zScore > 0);

  // Consistency: the fence path agrees with the z path on direction.
  const degenerate: BaselineInput = { n: 200, medianLn: Math.log(100), madLn: 0, p25: 100, p75: 150 };
  check("fence path: cheap price not flagged", scoreUnitPrice(1, degenerate) === null);
}

// --- recurring (tariff/list) prices are never anomalies --------------------
// Regression cover for the TIMBRE PROFESIONAL false positives (classification
// 10233): the ARCE catalogue groups EVERY legal timbre denomination under one
// id, so the baseline median sits on the dominant low denomination (certificado
// médico, 140-170 UYU) and every legally higher denomination — parto 590/650,
// cirugía 5400-6200 — scored z >= 14 and flagged "critical". Real corpus:
// adjudicacion-1207973 paid the OFFICIAL 2024 parto stamp of 590 (DGI 2026
// value: 650) and was reported as descabellado.
//
// The rule: a unit price observed RECURRING_PRICE_MIN_COUNT+ times at the exact
// same value in the baseline window is a list/tariff price — dozens of
// independent buyers do not coincidentally overpay to the peso. Genuine spikes
// are one-off values (the same corpus's 24480/19380/8643.14 are all singletons).
console.log("\n📊 recurring tariff prices are suppressed (timbre profesional)");
{
  // Miniature of the real 10233/UYU histogram: dominant low denomination,
  // recurring higher denominations, one singleton data-entry error.
  const stats = computeBaselineStats(
    bins([
      [140, 2098],
      [150, 2588],
      [160, 1474],
      [170, 1502],
      [590, 14],
      [650, 14],
      [24480, 1],
    ])
  )!;
  check("recurringPrices computed", Array.isArray(stats.recurringPrices));
  check("590 (parto 2024) is recurring", stats.recurringPrices.includes(590));
  check("650 (parto 2026) is recurring", stats.recurringPrices.includes(650));
  check("singleton 24480 is NOT recurring", !stats.recurringPrices.includes(24480));
  check("prices at/below the median are not stored (cannot flag anyway)", !stats.recurringPrices.includes(140) && !stats.recurringPrices.includes(150));

  const baseline: BaselineInput = {
    n: stats.n,
    medianLn: stats.medianLn,
    madLn: stats.madLn,
    p25: stats.p25,
    p75: stats.p75,
    recurringPrices: new Set(stats.recurringPrices),
  };
  check("official 590 stamp -> NOT flagged", scoreUnitPrice(590, baseline) === null);
  check("official 650 stamp -> NOT flagged", scoreUnitPrice(650, baseline) === null);
  const singleton = scoreUnitPrice(24480, baseline);
  check("singleton 24480 -> still flagged", singleton !== null);
  check("...as critical", singleton?.severity === "critical", `got ${singleton?.severity}`);
  check("non-recurring 591 -> still scored on its own merits", scoreUnitPrice(591, baseline) !== null);
}
{
  // The rule must also gate the IQR-fence path, and be a no-op when absent.
  const degenerate: BaselineInput = { n: 200, medianLn: Math.log(100), madLn: 0, p25: 100, p75: 150, recurringPrices: new Set([590]) };
  check("fence path: recurring 590 -> not flagged", scoreUnitPrice(590, degenerate) === null);
  check("fence path: non-recurring 600 -> still flagged", scoreUnitPrice(600, degenerate) !== null);

  const withoutField: BaselineInput = { n: 200, medianLn: Math.log(100), madLn: 0.2, p25: 90, p75: 110 };
  check("baselines without recurringPrices behave as before", scoreUnitPrice(1000, withoutField) !== null);
  check("threshold constant exported and sane", RECURRING_PRICE_MIN_COUNT >= 2);
}
{
  // Boundary: exactly at the threshold counts, one below does not.
  const stats = computeBaselineStats(
    bins([
      [100, 50],
      [500, RECURRING_PRICE_MIN_COUNT],
      [700, RECURRING_PRICE_MIN_COUNT - 1],
    ])
  )!;
  check("count == threshold -> recurring", stats.recurringPrices.includes(500));
  check("count == threshold-1 -> not recurring", !stats.recurringPrices.includes(700));
}

console.log("\n=====================");
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
