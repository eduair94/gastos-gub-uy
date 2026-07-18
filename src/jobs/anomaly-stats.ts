/**
 * Pure statistics for price-anomaly detection.
 *
 * This module deliberately has ZERO imports (no mongo, no config, no I/O) so the
 * estimator can be unit-tested without a database. See tests/unit/test-anomaly-stats.ts.
 *
 * WHY NOT MEAN/STDDEV: a z-score built on mean and standard deviation has a
 * breakdown point of 0 - a single enormous contract drags the mean toward itself
 * and inflates the stddev, so the outlier MASKS ITSELF and is never flagged. The
 * median and MAD have a breakdown point of 0.5: up to half the sample can be
 * arbitrarily corrupted before the estimate moves.
 *
 * WHY LOG SPACE: procurement unit prices are strongly right-skewed and roughly
 * log-normal. Symmetric thresholds on the raw scale flag every expensive-but-normal
 * item; in log space the distribution is approximately symmetric, so a fixed
 * two-sided cutoff is meaningful.
 */

/** Iglewicz-Hoaglin constant: E[MAD] = 0.6745 * sigma for a normal distribution. */
export const MAD_Z_CONSTANT = 0.6745;

/**
 * Smallest madLn that can carry a z-score. Below this the baseline is treated as
 * degenerate and scoring falls back to the IQR fence.
 *
 * Guarding only madLn === 0 is not enough. When over half the count mass sits on a
 * single price the true MAD is zero, but the percentile helpers interpolate, so
 * medianLn lands a hair off the dominant bin and the deviations come back as float
 * residue near 1e-8 rather than exactly 0. That passes a `> 0` check and then divides
 * into it: production produced z-scores of 1.9e7 on a NEUROESTIMULADOR whose price
 * merely equalled its own p95, and 325 anomalies scored |z| > 10000.
 *
 * 1e-3 is a behavioural floor, not just a numerical one: it means the middle of the
 * distribution spans under ~0.1% in price, i.e. a fixed-price item where the
 * denominator is interpolation noise rather than real dispersion. Measured against
 * production, this routes 238 of 40,948 baselines (0.6%) to the IQR fence, which is
 * built on actual p25/p75 and stays honest for exactly these commodities.
 */
export const MAD_LN_EPSILON = 1e-3;

/**
 * The IQR counterpart to MAD_LN_EPSILON, as a fraction of the median price.
 *
 * Same failure, second estimator: `p75 - p25` is zero whenever three quarters of the count mass
 * sits on one price, but interpolation leaves residue, so an `iqr > 0` check passes and
 * `(price - p75) / iqr` divides into ~1e-8. Fixing only the MAD path made this worse, not better —
 * degenerate baselines were rerouted here and came out at z = 5.4e7 instead of 1.9e7.
 *
 * This is relative because IQR is in price units, and prices here span 0.0001 to billions, so no
 * absolute floor can be right for both.
 *
 * When it trips there is genuinely nothing to measure: every robust dispersion estimator is zero on
 * a distribution that concentrated, which is a fact about the data, not a bug to work around. Such
 * items are skipped and counted rather than flagged on a fabricated scale. The cost is real — an
 * item priced at 1.53M in 75% of purchases will not flag at 3.28M — and catching those needs a
 * deviation-from-mode rule rather than a dispersion rule. See scoreUnitPrice.
 */
export const IQR_REL_EPSILON = 1e-6;

/**
 * Ceiling on the reported z magnitude.
 *
 * Severity already saturates at |z| > 10, so anything past this changes no decision; the only thing
 * an unbounded value adds is a number in the UI that reads as broken. Clamping keeps the field
 * meaningful without discarding the finding.
 */
export const MAX_REPORTED_Z = 1000;

/** Flag when the modified z-score exceeds this. The Iglewicz-Hoaglin recommendation. */
export const Z_FLAG_THRESHOLD = 3.5;

/**
 * Minimum practical effect size: how far above the baseline median a price must sit before it can
 * be flagged at all, as a natural log ratio. ln(1.25) = a price 25% over the median.
 *
 * Statistical significance alone is not enough here. MAD_LN_EPSILON floors the DENOMINATOR, but
 * nothing floored the numerator, so on a tight baseline the z-score converts a trivial price
 * difference into a huge score. Measured at the epsilon floor (madLn = 1e-3): a price 0.5% over the
 * median flags, and 1.5% over is "critical". That is noise being reported as corruption.
 *
 * With this floor, whichever of the two constraints is stricter wins: below madLn ~0.05 the effect
 * size binds, above it statistical significance binds. Against production this suppresses 361 of
 * 22,368 findings (1.6%) — all of them in the 0.5%-to-25%-over band.
 *
 * A price under 25% over the category median is not evidence of anything in public procurement:
 * ordinary variation in timing, lot size, and supplier margin covers it.
 */
export const MIN_LOG_DEVIATION = Math.log(1.25);

/** Multiplier on the IQR for the "extreme" (Tukey far-out) fence. */
export const IQR_FENCE_K = 3;

/**
 * A distinct unit price observed at least this many times in the baseline window is a
 * LIST/TARIFF price, and is never flagged — regardless of how far it sits from the median.
 *
 * Motivating failure: the ARCE catalogue groups every legal denomination of the timbre
 * profesional under one classification (10233), so the baseline median lands on the dominant
 * low denomination (certificado médico, 140-170 UYU) and every legally higher denomination
 * flagged critical: the OFFICIAL 590 UYU parto stamp (DGI value for 2024; 650 in 2026) scored
 * z = 14.3 on adjudicacion-1207973. The distribution is not log-normal at all — it is a menu
 * of administratively fixed prices updated yearly (570/590/600/620/650 for the parto stamp).
 *
 * Recurrence is the evidence: dozens of independent buyers do not coincidentally overpay to
 * the exact peso, while genuine spikes in the same corpus are one-off values (24480, 19380,
 * 8643.14 — all singletons). At 3, the scored item's own in-window observation still needs two
 * INDEPENDENT corroborating purchases. The known cost: a price repeated only twice is not
 * suppressed, and a corrupt price repeated verbatim 3+ times would be — both are accepted,
 * because a price point that recurs across the corpus is a negotiated/list price by any
 * operational definition, and list prices are exactly what a price-SPIKE detector must not flag.
 */
export const RECURRING_PRICE_MIN_COUNT = 3;

/**
 * CONTAMINATION GUARD (heuristic #3).
 *
 * When one classification code pools genuinely different products (e.g. a code that mixes a cheap
 * consumable with an expensive instrument), the pooled baseline spans a huge price range and its
 * low/medium findings are noise: a price in the upper cluster is a DIFFERENT product, not an
 * overpay. `ln(p95/p25)` measures that span in log units.
 *
 * The cutoff is deliberately high. Measured over the 5,265 production baselines that reach the
 * robust path (n>=30, p25>0), the MEDIAN p95/p25 is already ~5.5x and the p90 is ~78x — wide
 * baselines are the norm in procurement, not the exception. A cutoff of 50x hardens only the top
 * ~13%, i.e. the genuinely pathological buckets, leaving ordinary commodity dispersion untouched.
 *
 * "Harden" here means only raising the effect-size floor to ln(2) — a finding on such a baseline
 * must be at least 2x the median, not merely 25% over it. It never fabricates or suppresses an
 * extreme finding; the robust z-score's own severity ladder is untouched. Absent p95/p25 => the
 * guard is skipped (older baselines behave exactly as before).
 */
export const CONTAMINATION_LOG_SPAN = Math.log(50);
export const CONTAMINATION_MIN_LOG_DEVIATION = Math.log(2);

/**
 * DEVIATION-FROM-MODE (heuristic #5) — the detector's biggest documented blind spot.
 *
 * When one price holds most of a baseline's count mass, MAD and IQR are BOTH ~0, so neither the
 * robust z-score nor the IQR fence can score anything and the item is silently skipped — the exact
 * failure the source admits: "an item priced at 1.53M in 75% of purchases will not flag at 3.28M".
 * This is a dispersion rule's blind spot to a deviation-FROM-MODE fact.
 *
 * The branch fires ONLY as a last resort, when both dispersion estimators are already degenerate,
 * and only on a concentrated baseline (the mode holds at least this share of observations) where
 * the scored price is at least this many log-units above the mode. Severity is capped at "high"
 * (never critical) because concentrated buckets are also where classification contamination lives.
 * Absent modePrice/modeShare => the rule is skipped, like recurringPrices.
 */
export const DEVIATION_FROM_MODE_MIN_SHARE = 0.55;
export const DEVIATION_FROM_MODE_MIN_LOG_DEVIATION = Math.log(2);

/** Below this many observations a baseline is not trustworthy at all - emit nothing. */
export const MIN_BASELINE_N = 10;

/** At or above this many observations the full robust z-score and full severity are allowed. */
export const ROBUST_MIN_N = 30;

/** Shrinkage denominator constant: confidence is scaled by n / (n + this). */
export const CONFIDENCE_SHRINKAGE = 20;

/**
 * For a normal distribution: (p75 - median) = 0.6745 sigma and IQR = 1.349 sigma.
 * Used to express an IQR-fence exceedance on the same scale as the modified
 * z-score, so one severity ladder serves both estimators.
 */
const NORMAL_QUARTILE_SIGMA = 0.6745;
const NORMAL_IQR_SIGMA = 1.349;

export type AnomalySeverity = "low" | "medium" | "high" | "critical";

export const SEVERITY_BY_RANK: Record<number, AnomalySeverity> = {
  1: "low",
  2: "medium",
  3: "high",
  4: "critical",
};

/** One distinct price and how many times it was observed. */
export interface HistogramBin {
  value: number;
  count: number;
}

export interface BaselineStats {
  n: number;
  medianLn: number;
  madLn: number;
  p25: number;
  p50: number;
  p75: number;
  p95: number;
  min: number;
  max: number;
  distinctPrices: number;
  /**
   * Distinct prices observed >= RECURRING_PRICE_MIN_COUNT times AND strictly above p50.
   * Only upper-tail prices can ever flag (the detector is upper-tail only and enforces
   * MIN_LOG_DEVIATION over the median), so storing the lower ones would be dead weight.
   */
  recurringPrices: number[];
  /** The single most-frequently-observed unit price (the histogram's tallest bin). */
  modePrice: number;
  /** modeCount / n — how concentrated the baseline is on that one price. Drives deviation-from-mode. */
  modeShare: number;
}

/** The subset of a baseline document the scorer actually needs. */
export interface BaselineInput {
  n: number;
  medianLn: number;
  madLn: number;
  p25: number;
  p75: number;
  /**
   * 95th-percentile price. Optional: only the contamination guard (heuristic #3) reads it, so
   * baselines written before it existed simply skip that guard.
   */
  p95?: number | undefined;
  /**
   * Exact-match lookup of recurring (list/tariff) prices. EXACT equality is correct here:
   * the scored price and the baseline bins both originate from the same JSON number in the
   * same source files, so they are bit-identical doubles — no tolerance needed, and a
   * tolerance would only invent matches. Optional: baselines written before this field
   * existed simply skip the rule.
   */
  recurringPrices?: ReadonlySet<number> | undefined;
  /** Most-frequent price + its share of n. Optional: absent => deviation-from-mode (#5) is skipped. */
  modePrice?: number | undefined;
  modeShare?: number | undefined;
}

export type ScoringMethod = "log_modified_zscore" | "iqr_fence" | "mode_deviation";

export interface ScoredFinding {
  /** Signed for the z-score path; positive pseudo-z for the (upper-tail-only) IQR path. */
  zScore: number;
  absZ: number;
  severity: AnomalySeverity;
  severityRank: number;
  confidence: number;
  method: ScoringMethod;
  direction: "above" | "below";
}

export function totalCount(bins: HistogramBin[]): number {
  let total = 0;
  for (const bin of bins) {
    total += bin.count;
  }
  return total;
}

/**
 * Value at a 0-based rank in the conceptual expanded sorted array the histogram
 * represents. `bins` MUST be sorted ascending by `value`.
 */
function valueAtRank(bins: HistogramBin[], rank: number): number {
  let cumulative = 0;
  for (const bin of bins) {
    cumulative += bin.count;
    if (rank < cumulative) {
      return bin.value;
    }
  }
  return bins[bins.length - 1]!.value;
}

/**
 * Linearly-interpolated percentile computed directly from a weighted histogram,
 * without ever materialising the expanded array.
 *
 * MongoDB 4.4 has no $percentile / $median operator, so this is done in Node over
 * the collapsed histogram the aggregation emits.
 *
 * `bins` MUST be sorted ascending by `value`. `q` is in [0, 1].
 */
export function weightedPercentile(bins: HistogramBin[], q: number): number {
  if (bins.length === 0) {
    return Number.NaN;
  }
  const n = totalCount(bins);
  if (n <= 0) {
    return Number.NaN;
  }
  if (n === 1) {
    return bins[0]!.value;
  }

  const clampedQ = Math.min(Math.max(q, 0), 1);
  const position = clampedQ * (n - 1);
  const lowerRank = Math.floor(position);
  const upperRank = Math.ceil(position);
  const lower = valueAtRank(bins, lowerRank);
  if (lowerRank === upperRank) {
    return lower;
  }
  const upper = valueAtRank(bins, upperRank);
  return lower + (upper - lower) * (position - lowerRank);
}

export function weightedMedian(bins: HistogramBin[]): number {
  return weightedPercentile(bins, 0.5);
}

/**
 * Collapse a price histogram into a frozen baseline.
 *
 * Returns null when there is nothing usable (no positive prices). Note this does
 * NOT enforce MIN_BASELINE_N - a small baseline is still stored so the tiering in
 * scoreUnitPrice() can make an explicit, visible decision about it.
 */
export function computeBaselineStats(rawBins: HistogramBin[]): BaselineStats | null {
  const bins = rawBins
    .filter((bin) => Number.isFinite(bin.value) && bin.value > 0 && bin.count > 0)
    .sort((a, b) => a.value - b.value);

  if (bins.length === 0) {
    return null;
  }
  const n = totalCount(bins);
  if (n <= 0) {
    return null;
  }

  // ln is strictly monotonic on positive reals, so the ln bins keep the sort order.
  const lnBins: HistogramBin[] = bins.map((bin) => ({ value: Math.log(bin.value), count: bin.count }));
  const medianLn = weightedMedian(lnBins);

  // MAD = median(|ln(x) - median(ln(x))|). The absolute deviations are NOT sorted
  // (they fold around the median), so they must be re-sorted before the median.
  const deviationBins: HistogramBin[] = lnBins
    .map((bin) => ({ value: Math.abs(bin.value - medianLn), count: bin.count }))
    .sort((a, b) => a.value - b.value);
  const madLn = weightedMedian(deviationBins);

  const p50 = weightedPercentile(bins, 0.5);
  const recurringPrices = bins.filter((bin) => bin.count >= RECURRING_PRICE_MIN_COUNT && bin.value > p50).map((bin) => bin.value);

  // The mode: the tallest histogram bin. One pass over the already-resident bins, so it is free.
  // On the concentrated baselines deviation-from-mode targets, this is the dominant list price.
  let modeCount = 0;
  let modePrice = bins[0]!.value;
  for (const bin of bins) {
    if (bin.count > modeCount) {
      modeCount = bin.count;
      modePrice = bin.value;
    }
  }

  return {
    n,
    medianLn,
    madLn,
    p25: weightedPercentile(bins, 0.25),
    p50,
    p75: weightedPercentile(bins, 0.75),
    p95: weightedPercentile(bins, 0.95),
    min: bins[0]!.value,
    max: bins[bins.length - 1]!.value,
    distinctPrices: bins.length,
    recurringPrices,
    modePrice,
    modeShare: modeCount / n,
  };
}

/**
 * Log-space modified z-score (Iglewicz-Hoaglin):
 *
 *     z = 0.6745 * (ln(x) - medianLn) / madLn
 *
 * Returns NaN rather than +/-Infinity when madLn is 0 - callers must fall back to
 * the IQR fence. Never divides by zero.
 */
export function modifiedZScore(x: number, medianLn: number, madLn: number): number {
  if (!Number.isFinite(x) || x <= 0) {
    return Number.NaN;
  }
  if (!Number.isFinite(madLn) || madLn < MAD_LN_EPSILON) {
    return Number.NaN;
  }
  if (!Number.isFinite(medianLn)) {
    return Number.NaN;
  }
  return (MAD_Z_CONSTANT * (Math.log(x) - medianLn)) / madLn;
}

/** Severity ladder. Returns null below the flag threshold. */
export function severityRankFromAbsZ(absZ: number): number | null {
  if (!Number.isFinite(absZ)) {
    return null;
  }
  if (absZ > 10) {
    return 4;
  }
  if (absZ > 7) {
    return 3;
  }
  if (absZ > 5) {
    return 2;
  }
  if (absZ > Z_FLAG_THRESHOLD) {
    return 1;
  }
  return null;
}

/**
 * confidence = clamp(0.5 + 0.05*(|z| - 3.5), 0, 0.99) * n / (n + 20)
 *
 * The second factor is a shrinkage term: a baseline of 10 observations can only
 * ever reach ~1/3 of the confidence of an effectively infinite one.
 */
export function confidenceFromZ(absZ: number, n: number): number {
  if (!Number.isFinite(absZ) || !Number.isFinite(n) || n <= 0) {
    return 0;
  }
  const base = Math.min(Math.max(0.5 + 0.05 * (absZ - Z_FLAG_THRESHOLD), 0), 0.99);
  return base * (n / (n + CONFIDENCE_SHRINKAGE));
}

/**
 * Score one observed unit price against a frozen baseline.
 *
 * Tiers (honest degradation - the baseline earns the estimator it deserves):
 *   n >= 30      -> log-space modified z-score, full severity ladder
 *   10 <= n < 30 -> IQR extreme fence only, severity capped at 'medium'
 *   n < 10       -> emit nothing
 *
 * The IQR fence is also the fallback at ANY n when madLn === 0, which is common
 * for commodity items bought repeatedly at one dominant price. If the IQR is 0
 * too, the item is degenerately constant-priced and is skipped rather than
 * flagging every single deviation.
 *
 * Returns null when the observation is not anomalous (or cannot be scored).
 */
export function scoreUnitPrice(price: number, baseline: BaselineInput): ScoredFinding | null {
  if (!Number.isFinite(price) || price <= 0) {
    return null;
  }

  // Gates BOTH estimator paths: a recurring list/tariff price is not an anomaly no matter
  // which estimator would have scored it. See RECURRING_PRICE_MIN_COUNT.
  if (baseline.recurringPrices?.has(price)) {
    return null;
  }

  const n = baseline.n;
  if (!Number.isFinite(n) || n < MIN_BASELINE_N) {
    return null;
  }

  const severityCap = n < ROBUST_MIN_N ? 2 : 4;
  const canUseRobustZ =
    n >= ROBUST_MIN_N && Number.isFinite(baseline.madLn) && baseline.madLn >= MAD_LN_EPSILON;

  // Contamination guard (heuristic #3): on a baseline whose p95/p25 span is extreme, one code is
  // pooling different products, so require a larger effect before flagging. Only ever raises the
  // floor; skipped when p95/p25 are absent. See CONTAMINATION_LOG_SPAN.
  const minLogDeviation = contaminationHardenedFloor(baseline);

  if (canUseRobustZ) {
    const z = modifiedZScore(price, baseline.medianLn, baseline.madLn);
    if (!Number.isFinite(z)) {
      return null;
    }

    // Upper tail only. This detector emits type "price_spike", and a contract cheaper than its
    // category norm is not a price spike — it is a different signal entirely (and a weak one for
    // finding overspending). Flagging it under this name mislabels it.
    //
    // It also removes an incoherence: the IQR fence below is upper-tail-only by construction, so
    // while this branch was two-sided, whether an identically cheap contract got flagged depended
    // on nothing but its baseline's dispersion — i.e. on which estimator happened to run.
    // Production carried 7,464 of 22,368 findings (33%) priced BELOW their median, all labelled
    // "price_spike".
    if (z <= 0) {
      return null;
    }

    // Practical significance, not just statistical. See MIN_LOG_DEVIATION (raised on contaminated baselines).
    const logDeviation = Math.log(price) - baseline.medianLn;
    if (logDeviation < minLogDeviation) {
      return null;
    }

    const absZ = Math.abs(z);
    const rank = severityRankFromAbsZ(absZ);
    if (rank === null) {
      return null;
    }
    const reported = clampZ(z);
    return {
      zScore: reported,
      absZ: Math.abs(reported),
      severity: SEVERITY_BY_RANK[rank]!,
      severityRank: rank,
      confidence: confidenceFromZ(absZ, n),
      method: "log_modified_zscore",
      direction: "above",
    };
  }

  // IQR extreme fence. Upper tail only, by construction.
  const iqr = baseline.p75 - baseline.p25;
  // Degenerate when there is no dispersion to divide by. The floor is relative to the median price
  // because IQR carries price units; see IQR_REL_EPSILON for why an absolute one cannot work.
  const medianPrice = Math.exp(baseline.medianLn);
  const iqrFloor = Number.isFinite(medianPrice) ? Math.abs(medianPrice) * IQR_REL_EPSILON : 0;
  if (!Number.isFinite(iqr) || iqr <= 0 || iqr < iqrFloor) {
    // BOTH dispersion estimators are degenerate. Last resort: deviation-from-mode (heuristic #5),
    // which catches a price many times the sole dominant list price where MAD and IQR are both ~0.
    // Returns null when the mode fields are absent or the gate is not met.
    return scoreDeviationFromMode(price, baseline, severityCap);
  }
  const excess = (price - baseline.p75) / iqr;
  if (!(excess > IQR_FENCE_K)) {
    return null;
  }

  // Same practical-significance floor the z path applies, so a finding means the same thing
  // regardless of which estimator produced it. A tight-but-not-degenerate baseline can otherwise
  // clear a k=3 fence on a price only a few percent over the median.
  if (Math.log(price) - baseline.medianLn < minLogDeviation) {
    return null;
  }

  // Express the exceedance on the modified-z scale so one severity ladder and one
  // confidence formula serve both estimators. For a normal distribution
  // x = p75 + k*IQR implies (x - median)/sigma = 0.6745 + 1.349*k, and the
  // modified z-score is itself approximately (x - median)/sigma. At the k=3 fence
  // this yields ~4.72, comfortably past the 3.5 flag threshold.
  const pseudoZ = NORMAL_QUARTILE_SIGMA + NORMAL_IQR_SIGMA * excess;
  const rank = severityRankFromAbsZ(pseudoZ);
  if (rank === null) {
    return null;
  }
  const cappedRank = Math.min(rank, severityCap);
  const reported = clampZ(pseudoZ);
  return {
    zScore: reported,
    absZ: Math.abs(reported),
    severity: SEVERITY_BY_RANK[cappedRank]!,
    severityRank: cappedRank,
    confidence: confidenceFromZ(pseudoZ, n),
    method: "iqr_fence",
    direction: "above",
  };
}

/**
 * The effect-size floor for this baseline, raised to CONTAMINATION_MIN_LOG_DEVIATION when the
 * p95/p25 span is extreme (heuristic #3). Returns the ordinary MIN_LOG_DEVIATION when p95/p25 are
 * absent or the span is ordinary — so it can only ever make flagging STRICTER, never looser.
 */
function contaminationHardenedFloor(baseline: BaselineInput): number {
  const { p25, p95 } = baseline;
  if (Number.isFinite(p25) && Number.isFinite(p95) && (p25 as number) > 0 && (p95 as number) > 0) {
    if (Math.log((p95 as number) / (p25 as number)) >= CONTAMINATION_LOG_SPAN) {
      return CONTAMINATION_MIN_LOG_DEVIATION;
    }
  }
  return MIN_LOG_DEVIATION;
}

/**
 * Deviation-from-mode scorer (heuristic #5).
 *
 * Called only when BOTH dispersion estimators are degenerate, so a concentrated baseline no longer
 * silently swallows a gross overprice. Fires only when the mode is genuinely dominant
 * (modeShare >= DEVIATION_FROM_MODE_MIN_SHARE) and the price is at least DEVIATION_FROM_MODE_MIN_LOG_DEVIATION
 * (ln 2, i.e. 2x) above that mode. Severity is capped at "high" — concentrated buckets are also
 * where classification contamination lives, so this never asserts "critical" on a mode alone.
 *
 * Absent modePrice/modeShare => returns null (rule skipped, like recurringPrices). The scored price
 * is already guaranteed to be non-recurring by the gate at the top of scoreUnitPrice.
 */
function scoreDeviationFromMode(price: number, baseline: BaselineInput, severityCap: number): ScoredFinding | null {
  const { modePrice, modeShare, n } = baseline;
  if (!Number.isFinite(modePrice) || !Number.isFinite(modeShare)) {
    return null;
  }
  if ((modeShare as number) < DEVIATION_FROM_MODE_MIN_SHARE) {
    return null;
  }
  if (!((modePrice as number) > 0) || price <= (modePrice as number)) {
    return null;
  }

  const logDeviation = Math.log(price) - Math.log(modePrice as number);
  if (logDeviation < DEVIATION_FROM_MODE_MIN_LOG_DEVIATION) {
    return null;
  }

  // Rank from the multiple over the mode: >=3x is "high", >=2x is "medium". Capped at high (3) and
  // by the small-n severity cap. A representative pseudo-z carries the finding onto the shared
  // severity/confidence scale without pretending a dispersion z exists.
  const ratio = price / (modePrice as number);
  const baseRank = ratio >= 3 ? 3 : 2;
  const rank = Math.min(baseRank, severityCap, 3);
  const pseudoZ = rank >= 3 ? 8 : 6;
  return {
    zScore: pseudoZ,
    absZ: pseudoZ,
    severity: SEVERITY_BY_RANK[rank]!,
    severityRank: rank,
    confidence: confidenceFromZ(pseudoZ, n),
    method: "mode_deviation",
    direction: "above",
  };
}

/** Clamps a z magnitude to MAX_REPORTED_Z, preserving sign. */
function clampZ(z: number): number {
  if (!Number.isFinite(z)) return z;
  const sign = z < 0 ? -1 : 1;
  return sign * Math.min(Math.abs(z), MAX_REPORTED_Z);
}
