/**
 * The algebra behind "did spending rise, or did the peso fall?".
 *
 * Two pure decompositions, kept out of the job so they can be tested without a
 * database (tests/unit/test-spending-bridge.ts) and so the identity they promise
 * is checkable line by line.
 *
 *   1. `buildBridge` — the exact bridge from year-1 to year. Every term is in
 *      pesos of `year`, and they sum to the year's total by construction:
 *
 *        base + inflation + entrants + exits + panelDelta === total
 *
 *      `inflation` re-prices last year's spend at this year's price level, so
 *      what survives it is real change. That real change is then split by WHO:
 *      bodies that only appear in one of the two years are coverage, not
 *      spending, and are separated from the panel present in both.
 *
 *   2. `splitPriceQuantity` — a Laspeyres/Paasche split of the change inside
 *      article codes present in both years. Deliberately NOT part of the bridge:
 *      it sees only the codes it can compare, and the feed's quantities are
 *      integer-floored, so it is a direction signal with a declared coverage,
 *      never an accounting identity.
 */

/** One body's year: own-month nominal UYU, and the same money in today's pesos. */
export interface BuyerYearTotals {
  nominal: number
  real: number
}

export interface SpendingBridge {
  /** Nominal(year-1), in pesos of year-1. */
  base: number
  /** What re-pricing year-1 at year's price level adds. */
  inflation: number
  /** Spend of bodies reporting in `year` but not in year-1. */
  entrants: number
  /** Negative: re-priced spend of bodies that stopped reporting. */
  exits: number
  /** Change among bodies present in both years. */
  panelDelta: number
  /** Nominal(year). */
  total: number
  /** total - (base + inflation). */
  realDelta: number
  panelBuyers: number
  entrantBuyers: number
  exitBuyers: number
}

/** A body's contribution to the year's change, before ranking and labelling. */
export interface BuyerContribution {
  key: string
  /** current - previousRepriced. */
  delta: number
  current: number
  /** Last year's spend for this body, at this year's prices. */
  previous: number
}

export interface BridgeInput {
  /** Nominal(year-1), pesos of year-1. */
  prevNominal: number
  /** Nominal(year), pesos of year. */
  curNominal: number
  /** Real(year-1), today's pesos. */
  prevReal: number
  /**
   * uiAvg(year) / latestUi — converts today's pesos into pesos of `year`.
   * Deriving the re-priced base from the REAL total (rather than inflating the
   * nominal one) keeps month-level timing inside the year intact.
   */
  k: number
  prevBuyers: Map<string, BuyerYearTotals>
  curBuyers: Map<string, BuyerYearTotals>
}

export interface BridgeOutput {
  bridge: SpendingBridge
  contributions: BuyerContribution[]
}

/**
 * The bridge. Any residual from intra-year timing lands in `panelDelta` rather
 * than being hidden, which is what keeps the five terms summing to `total`.
 */
export function buildBridge(input: BridgeInput): BridgeOutput {
  const { prevNominal, curNominal, prevReal, k, prevBuyers, curBuyers } = input

  const base = prevNominal
  const rebase = prevReal * k
  const inflation = rebase - base
  const realDelta = curNominal - rebase

  let entrants = 0
  let exits = 0
  let panelDelta = 0
  let entrantBuyers = 0
  let exitBuyers = 0
  let panelBuyers = 0
  const contributions: BuyerContribution[] = []

  for (const [key, cur] of curBuyers) {
    const before = prevBuyers.get(key)
    if (!before) {
      entrants += cur.nominal
      entrantBuyers += 1
      contributions.push({ key, delta: cur.nominal, current: cur.nominal, previous: 0 })
      continue
    }
    const previous = before.real * k
    panelDelta += cur.nominal - previous
    panelBuyers += 1
    contributions.push({ key, delta: cur.nominal - previous, current: cur.nominal, previous })
  }

  for (const [key, before] of prevBuyers) {
    if (curBuyers.has(key)) continue
    const previous = before.real * k
    exits -= previous
    exitBuyers += 1
    contributions.push({ key, delta: -previous, current: 0, previous })
  }

  return {
    bridge: {
      base,
      inflation,
      entrants,
      exits,
      panelDelta,
      total: curNominal,
      realDelta,
      panelBuyers,
      entrantBuyers,
      exitBuyers,
    },
    contributions,
  }
}

/** One article code + unit in one year. */
export interface CodeUnitTotals {
  qty: number
  /** Value in UYU of that year (qty x unit price). */
  value: number
}

export interface PriceQuantitySplit {
  quantity: number
  price: number
  matchedDelta: number
  matchedTotal: number
  coverage: number
  codes: number
  droppedCodes: number
}

export interface PriceQuantityOptions {
  /** uiAvg(year) / uiAvg(year-1) — re-prices last year's unit price. */
  inflationFactor: number
  /** Denominator for `coverage`: the year's total spend. */
  yearTotal: number
  /** Reject a code whose quantity moved by more than this factor either way. */
  qtyRatioCeil: number
  /** Reject a code whose real unit price moved by more than this factor. */
  priceRatioCeil: number
  /** Reject a code whose price or quantity term exceeds this absolute value. */
  contributionCap: number
}

/**
 * Split the change inside comparable article codes into a price term and a
 * quantity term.
 *
 *   quantity_c = (q_now - q_then) x p_then
 *   price_c    =  q_now x (p_now - p_then)
 *
 * with `p_then` re-priced by inflation, so a code whose price merely tracked the
 * CPI contributes zero to `price`. Codes that fail a comparability gate are
 * counted in `droppedCodes` — a 10.000-unit "quantity" against a lump sum would
 * otherwise produce a pair of ±1e15 terms that cancel into a meaningless net.
 *
 * Returns null when nothing was comparable.
 */
export function splitPriceQuantity(
  current: Map<string, CodeUnitTotals>,
  previous: Map<string, CodeUnitTotals>,
  options: PriceQuantityOptions,
): PriceQuantitySplit | null {
  const { inflationFactor, yearTotal, qtyRatioCeil, priceRatioCeil, contributionCap } = options
  let price = 0
  let quantity = 0
  let matchedTotal = 0
  let codes = 0
  let droppedCodes = 0

  for (const [key, now] of current) {
    const then = previous.get(key)
    if (!then || then.qty <= 0 || now.qty <= 0) continue

    const qtyRatio = now.qty / then.qty
    if (qtyRatio > qtyRatioCeil || qtyRatio < 1 / qtyRatioCeil) { droppedCodes += 1; continue }

    const pNow = now.value / now.qty
    const pThen = (then.value / then.qty) * inflationFactor
    if (pThen <= 0) { droppedCodes += 1; continue }

    const priceRatio = pNow / pThen
    if (priceRatio > priceRatioCeil || priceRatio < 1 / priceRatioCeil) { droppedCodes += 1; continue }

    const qTerm = (now.qty - then.qty) * pThen
    const pTerm = now.qty * (pNow - pThen)
    if (Math.abs(qTerm) > contributionCap || Math.abs(pTerm) > contributionCap) { droppedCodes += 1; continue }

    quantity += qTerm
    price += pTerm
    matchedTotal += now.value
    codes += 1
  }

  if (codes === 0) return null

  return {
    quantity,
    price,
    matchedDelta: price + quantity,
    matchedTotal,
    coverage: yearTotal > 0 ? matchedTotal / yearTotal : 0,
    codes,
    droppedCodes,
  }
}
