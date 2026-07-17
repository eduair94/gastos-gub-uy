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

/** Flag when the modified z-score exceeds this. The Iglewicz-Hoaglin recommendation. */
export const Z_FLAG_THRESHOLD = 3.5;

/** Multiplier on the IQR for the "extreme" (Tukey far-out) fence. */
export const IQR_FENCE_K = 3;

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
}

/** The subset of a baseline document the scorer actually needs. */
export interface BaselineInput {
  n: number;
  medianLn: number;
  madLn: number;
  p25: number;
  p75: number;
}

export type ScoringMethod = "log_modified_zscore" | "iqr_fence";

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

  return {
    n,
    medianLn,
    madLn,
    p25: weightedPercentile(bins, 0.25),
    p50: weightedPercentile(bins, 0.5),
    p75: weightedPercentile(bins, 0.75),
    p95: weightedPercentile(bins, 0.95),
    min: bins[0]!.value,
    max: bins[bins.length - 1]!.value,
    distinctPrices: bins.length,
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
  const n = baseline.n;
  if (!Number.isFinite(n) || n < MIN_BASELINE_N) {
    return null;
  }

  const severityCap = n < ROBUST_MIN_N ? 2 : 4;
  const canUseRobustZ =
    n >= ROBUST_MIN_N && Number.isFinite(baseline.madLn) && baseline.madLn >= MAD_LN_EPSILON;

  if (canUseRobustZ) {
    const z = modifiedZScore(price, baseline.medianLn, baseline.madLn);
    if (!Number.isFinite(z)) {
      return null;
    }
    const absZ = Math.abs(z);
    const rank = severityRankFromAbsZ(absZ);
    if (rank === null) {
      return null;
    }
    return {
      zScore: z,
      absZ,
      severity: SEVERITY_BY_RANK[rank]!,
      severityRank: rank,
      confidence: confidenceFromZ(absZ, n),
      method: "log_modified_zscore",
      direction: z > 0 ? "above" : "below",
    };
  }

  // IQR extreme fence. Upper tail only, by construction.
  const iqr = baseline.p75 - baseline.p25;
  if (!Number.isFinite(iqr) || iqr <= 0) {
    // Degenerate constant-price item: no dispersion to measure against.
    return null;
  }
  const excess = (price - baseline.p75) / iqr;
  if (!(excess > IQR_FENCE_K)) {
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
  return {
    zScore: pseudoZ,
    absZ: pseudoZ,
    severity: SEVERITY_BY_RANK[cappedRank]!,
    severityRank: cappedRank,
    confidence: confidenceFromZ(pseudoZ, n),
    method: "iqr_fence",
    direction: "above",
  };
}
