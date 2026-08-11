/**
 * Señales de gestión — procurement risk indicators, and the thresholds that classify them.
 *
 * PURE. No mongo, no config, no I/O, so tests/unit can import it. The job
 * (src/jobs/refresh-integrity-signals.ts) does the measuring; this module only decides what a
 * measurement MEANS.
 *
 * ## What this is, and what it is not
 *
 * Every indicator here is a DESCRIPTIVE MEASUREMENT of published procurement records. None of them
 * is evidence of wrongdoing, and several have entirely legitimate explanations — a hospital that
 * buys all its oxygen from the one licensed supplier will show 100% concentration and be perfectly
 * in order. The site's standing framing applies: a signal is a starting point for a question, never
 * an accusation. Thresholds are chosen so that crossing one is unusual enough to be worth asking
 * about, and each one carries the corpus measurement that justified it.
 *
 * ## Why these four, and not the ones you would expect
 *
 * The canonical international red flag is SINGLE BIDDING (one offer received on a competitive
 * call). It cannot be built here: `tender.tenderers` and `tender.numberOfTenderers` are populated on
 * 0% of the feed — measured over 155,547 tender-phase releases since 2023. Estimated-vs-awarded
 * value is likewise impossible (`tender.value.amount`, 0%). December budget-dumping was measured and
 * is simply not there nationally (December 10.1% of awarded value, July 12.0%), so no indicator was
 * built on it. See tests/unit/red-flag-feasibility.verify.ts for the probes.
 *
 * What IS available, and is what this module classifies:
 *   1. supplier concentration     — who gets the money
 *   2. award bursts               — the shape of contract splitting
 *   3. non-competitive share      — how the money is awarded
 *   4. express bidding windows    — how long anyone had to compete
 * plus a fifth carried through from the existing detector: price flags no explanation covers.
 */

export type SignalLevel = 'none' | 'watch' | 'high'

export type SignalKey =
  | 'concentration'
  | 'bursts'
  | 'directAward'
  | 'expressWindow'
  | 'unexplainedPrices'

export const SIGNAL_KEYS: ReadonlyArray<SignalKey> = [
  'concentration',
  'bursts',
  'directAward',
  'expressWindow',
  'unexplainedPrices',
]

// ---------------------------------------------------------------------------
// Eligibility
// ---------------------------------------------------------------------------

/**
 * Below this many priced awards in the window an organism is not measured at all.
 *
 * A body with nine purchases can show 100% concentration by buying nine times from the only firm
 * that sells what it needs. That is noise, not signal, and publishing it as a "señal" would be
 * unfair to small units. 20 is where the concentration distribution stops being dominated by
 * single-supplier trivia; 270 of the 288 buyers active since 2023 clear it, so the cost in coverage
 * is small.
 */
export const MIN_CONTRACTS_FOR_SIGNALS = 20

/**
 * Concentration needs a real ROSTER to be meaningful: sharing 95% with one supplier means something
 * different when there were 79 suppliers on the books than when there were two.
 */
export const MIN_SUPPLIERS_FOR_CONCENTRATION = 5

// ---------------------------------------------------------------------------
// How a measurement becomes a level: POPULATION PERCENTILE + an absolute floor
// ---------------------------------------------------------------------------

/**
 * A level is relative to the other organisms, not to a bar someone invented.
 *
 * The first cut of this module used absolute thresholds and it FAILED on measurement: 170 of the
 * 268 organisms (63%) raised at least one signal, because the thresholds were fighting the base
 * rates rather than describing them. Compra Directa is 66% of all Uruguayan procurement, and a
 * hospital pharmacy issuing many small orders to one distributor every month is ordinary practice,
 * so any absolute bar either flags every hospital or nothing at all.
 *
 * So a signal fires when the organism sits in the top decile (`watch`) or the top 3% (`high`) of
 * every organism measured in the same window. That makes the level mean something a reader can
 * check — "adjudica directamente más que el 90% de los organismos" — and bounds how many can fire.
 *
 * The ABSOLUTE FLOOR is what stops a benign population from manufacturing outliers: someone is
 * always the worst tenth, and without a floor a set of organisms that are all perfectly fine would
 * still produce a top-3%. Below its floor an indicator is never raised, however high its percentile.
 */
export const PERCENTILE_WATCH = 0.9
export const PERCENTILE_HIGH = 0.97

/** Below this many measured organisms the percentiles are noise; nothing is raised. */
export const MIN_POPULATION_FOR_PERCENTILES = 30

// ---------------------------------------------------------------------------
// 1. Supplier concentration
// ---------------------------------------------------------------------------

/**
 * Share of the window's awarded UYU going to the single largest supplier.
 *
 * Measured on the live corpus (awards since 2023, buyers with >= 20 contracts): Dirección Nacional
 * de Transporte 98.2% across 246 contracts with 79 suppliers on its roster; Presidencia de la
 * República 94.8% of 5,996M UYU across 422 contracts and 216 suppliers.
 *
 * FLOOR: half the money. Below that, "concentrated in one supplier" is not a description anyone
 * would recognise, whatever the percentile says.
 *
 * UPPER BOUND, like dept_indicators.top5Share: the release amount is not apportioned per supplier,
 * so an award shared between two suppliers counts fully for each. The page must say so.
 */
export const CONCENTRATION_FLOOR = 0.5

// ---------------------------------------------------------------------------
// 2. Award bursts (the shape of fraccionamiento)
// ---------------------------------------------------------------------------

/**
 * Separate awards to the SAME supplier by the SAME organism inside one calendar month.
 *
 * Splitting one purchase into many small ones to stay under the threshold that would force a
 * competitive procedure is the textbook manoeuvre, and this is its footprint. It is NOT proof of it:
 * a hospital pharmacy legitimately issues many small orders to one distributor, and the measured
 * extreme — Dirección General de la Salud to MURRY S A, 190-260 separate awards EVERY month for
 * ~100M UYU a month — may well be exactly that. The number is published so the question can be
 * asked, with the drill-down attached.
 *
 * 8 separate awards in one month is where a burst stops looking like ordinary cadence. The
 * organism's measurement is how many BURSTS it had in the window — one per (supplier, calendar
 * month) pair that reaches the threshold, so an organism with four such suppliers in the same month
 * counts four. It is NOT a count of months, and the label must not say months: Centro Departamental
 * de Flores measures 177 over a 36-month window. The level then comes from the percentile among all
 * organisms, because many bodies have a few bursts and only a handful have many.
 *
 * FLOOR: one burst. Zero can never be a signal.
 */
export const BURST_MIN_AWARDS = 8
export const BURST_COUNT_FLOOR = 1

// ---------------------------------------------------------------------------
// 3. Non-competitive share
// ---------------------------------------------------------------------------

/**
 * Share of awards with a KNOWN procurement method that were awarded non-competitively
 * (`methodClass === 'direct'`: Compra Directa, Compra por Excepción, any Contratación Directa).
 *
 * Two denominators matter and the page must show both:
 *   - the method resolves for only ~26.7% of awards, because award releases carry no `tender` object
 *     and the method has to come from the tender-phase sibling sharing the `ocid`;
 *   - among those, Compra Directa is already 66% NATIONALLY (103,600 of 155,547 tender-phase
 *     releases since 2023). Direct awarding is the normal case in Uruguayan procurement, not the
 *     exception, so a threshold anywhere near the national rate would flag everyone and mean nothing.
 *
 * FLOOR is therefore the national rate itself, 0.66: an organism at or below the national norm is
 * by definition not remarkable, and only its position ABOVE that norm can carry a level.
 */
export const DIRECT_SHARE_FLOOR = 0.66

/** Below this many method-resolved awards the share is too thin to publish. */
export const MIN_METHOD_KNOWN = 10

// ---------------------------------------------------------------------------
// 4. Express bidding windows
// ---------------------------------------------------------------------------

/**
 * A call whose bidding window is shorter than `EXPRESS_PERCENTILE` of all calls run under the SAME
 * procurement method.
 *
 * The threshold has to be per-method, because the methods are not comparable: measured over 2023+,
 * Licitación Abreviada averages 25.0 days and NEVER goes below 3.5, Licitación Pública averages
 * 43.1 days with a 7.0-day floor, while Compra Directa averages 5.1 days and runs 32.6% of its calls
 * under 3 days and 2.5% under a single day (1,992 of 79,040). An absolute "under 3 days" rule would
 * therefore flag a third of all Compra Directa — the normal case — and never flag an abreviada, no
 * matter how irregular. Comparing each call against its own method's distribution is the only honest
 * reading.
 */
export const EXPRESS_PERCENTILE = 0.05

/** A method needs this many measured windows before its percentile means anything. */
export const MIN_CALLS_FOR_METHOD_BASELINE = 50

/**
 * FLOOR: 10% of the organism's calls. By construction 5% of all calls are express, so an organism at
 * 5% is exactly average and only double that is worth a reader's attention.
 */
export const EXPRESS_SHARE_FLOOR = 0.1

/** Below this many calls with a measurable window the share is too thin to publish. */
export const MIN_CALLS_WITH_WINDOW = 10

// ---------------------------------------------------------------------------
// 5. Price flags no explanation covers
// ---------------------------------------------------------------------------

/**
 * Anomalies on this organism's contracts that survived BOTH the statistical detector and the AI
 * triage (`aiVerdict.explainable === 'no'`). The corpus holds only ~69 of them in total, so any
 * concentration in one organism is notable by construction.
 *
 * FLOOR: two. A single flag is one contract with one reviewer's opinion attached, not a pattern.
 */
export const UNEXPLAINED_FLOOR = 2

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

/** One organism's raw measurements over the window. Every field comes from the job's aggregations. */
export interface OrganismMeasurement {
  buyerId: string
  buyerName: string | null
  /** Priced, plausibility-capped awards in the window. */
  contracts: number
  totalUyu: number
  supplierCount: number
  topSupplierName: string | null
  topSupplierUyu: number
  /** (supplier, month) pairs reaching BURST_MIN_AWARDS. */
  burstCount: number
  burstWorstAwards: number
  /** Awards whose procurement method resolved through the ocid sibling. */
  methodKnown: number
  directCount: number
  /** Calls with a measurable bidding window, and how many fell below their method's percentile. */
  callsWithWindow: number
  expressCalls: number
  unexplainedFlags: number
}

export interface ClassifiedSignal {
  key: SignalKey
  level: SignalLevel
  /** The measured value the level was derived from: a share in [0,1] or a count. */
  value: number | null
  /** Denominator, so the page can show "17 de 22" rather than a bare percentage. */
  basis: number
  /**
   * Where this value sits among every organism that could be measured on this indicator, in [0,1].
   * Null when the value itself is null. This is what the page shows: "supera al 94% de los
   * organismos" is checkable, "riesgo alto" is not.
   */
  populationPercentile: number | null
}

/** The two cutoffs for one indicator, derived from the measured population. */
export interface SignalCutoff {
  watch: number
  high: number
  /** Organisms the cutoffs were computed over. */
  population: number
}

export type SignalCutoffs = Partial<Record<SignalKey, SignalCutoff>>

/** The absolute floor below which an indicator is never raised, whatever its percentile. */
export const SIGNAL_FLOORS: Record<SignalKey, number> = {
  concentration: CONCENTRATION_FLOOR,
  bursts: BURST_COUNT_FLOOR,
  directAward: DIRECT_SHARE_FLOOR,
  expressWindow: EXPRESS_SHARE_FLOOR,
  unexplainedPrices: UNEXPLAINED_FLOOR,
}

/** Share, or null when the denominator is too thin to publish. */
export function shareOrNull(numerator: number, denominator: number, minDenominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) return null
  if (denominator < minDenominator || denominator <= 0) return null
  return numerator / denominator
}

/**
 * The five raw values for one organism, before any level is assigned. Null means "cannot say" —
 * either the organism is too small to measure or that indicator's denominator is too thin — and it
 * must never render the same as a measured zero.
 */
export function measureOrganism(m: OrganismMeasurement): Record<SignalKey, number | null> {
  const eligible = m.contracts >= MIN_CONTRACTS_FOR_SIGNALS
  return {
    concentration:
      eligible && m.supplierCount >= MIN_SUPPLIERS_FOR_CONCENTRATION && m.totalUyu > 0
        ? m.topSupplierUyu / m.totalUyu
        : null,
    bursts: eligible ? m.burstCount : null,
    directAward: eligible ? shareOrNull(m.directCount, m.methodKnown, MIN_METHOD_KNOWN) : null,
    expressWindow: eligible ? shareOrNull(m.expressCalls, m.callsWithWindow, MIN_CALLS_WITH_WINDOW) : null,
    unexplainedPrices: eligible ? m.unexplainedFlags : null,
  }
}

/**
 * Derive each indicator's cutoffs from the values measured across every organism.
 *
 * Only non-null values take part: an organism that could not be measured on an indicator must not
 * drag that indicator's percentiles down as if it had scored zero.
 */
export function deriveCutoffs(allValues: ReadonlyArray<Record<SignalKey, number | null>>): SignalCutoffs {
  const cutoffs: SignalCutoffs = {}
  for (const key of SIGNAL_KEYS) {
    const values = allValues
      .map((v) => v[key])
      .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
      .sort((a, b) => a - b)
    if (values.length < MIN_POPULATION_FOR_PERCENTILES) continue
    const watch = percentile(values, PERCENTILE_WATCH)
    const high = percentile(values, PERCENTILE_HIGH)
    if (watch === null || high === null) continue
    cutoffs[key] = { watch, high, population: values.length }
  }
  return cutoffs
}

/** Fraction of `sortedAsc` at or below `value`, in [0,1]. */
export function percentileRank(sortedAsc: ReadonlyArray<number>, value: number): number | null {
  if (sortedAsc.length === 0) return null
  let count = 0
  for (const v of sortedAsc) {
    if (v <= value) count++
    else break
  }
  return count / sortedAsc.length
}

/**
 * Classify one organism against the population cutoffs.
 *
 * An indicator is raised only when BOTH hold: it clears its absolute floor, and it sits at or above
 * the population's watch/high cutoff. Missing cutoffs (population too small) raise nothing — the
 * job then publishes measurements without levels rather than levels built on nothing.
 */
export function classifyOrganism(
  m: OrganismMeasurement,
  cutoffs: SignalCutoffs,
  sortedByKey?: Partial<Record<SignalKey, ReadonlyArray<number>>>
): ClassifiedSignal[] {
  const values = measureOrganism(m)
  const basis: Record<SignalKey, number> = {
    concentration: m.supplierCount,
    bursts: m.burstWorstAwards,
    directAward: m.methodKnown,
    expressWindow: m.callsWithWindow,
    unexplainedPrices: m.contracts,
  }

  return SIGNAL_KEYS.map((key) => {
    const value = values[key]
    const cutoff = cutoffs[key]
    let level: SignalLevel = 'none'
    if (value !== null && cutoff && value >= SIGNAL_FLOORS[key]) {
      if (value >= cutoff.high) level = 'high'
      else if (value >= cutoff.watch) level = 'watch'
    }
    const sorted = sortedByKey?.[key]
    return {
      key,
      level,
      value,
      basis: basis[key],
      populationPercentile: value !== null && sorted ? percentileRank(sorted, value) : null,
    }
  })
}

/**
 * How many signals are raised, weighting `high` double.
 *
 * Deliberately NOT a corruption score. It exists only to order a list so the reader starts
 * somewhere, and the page shows the five signals individually next to it so the number is never the
 * whole story. A composite that collapsed incomparable measurements into a single "risk %" would
 * imply a precision none of this data supports.
 */
export function signalWeight(signals: ReadonlyArray<ClassifiedSignal>): number {
  let weight = 0
  for (const s of signals) {
    if (s.level === 'high') weight += 2
    else if (s.level === 'watch') weight += 1
  }
  return weight
}

/**
 * Linear-interpolated percentile of an ASCENDING-sorted array. Used for the per-method bidding
 * window cutoffs. Returns null on an empty array.
 */
export function percentile(sortedAsc: ReadonlyArray<number>, q: number): number | null {
  if (sortedAsc.length === 0) return null
  if (sortedAsc.length === 1) return sortedAsc[0]!
  const clamped = Math.min(Math.max(q, 0), 1)
  const position = clamped * (sortedAsc.length - 1)
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  if (lower === upper) return sortedAsc[lower]!
  return sortedAsc[lower]! + (sortedAsc[upper]! - sortedAsc[lower]!) * (position - lower)
}
