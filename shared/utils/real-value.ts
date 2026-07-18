/**
 * Turn a nominal (amount, currency, date) into a COMPARABLE value.
 *
 * Two conversions, both driven by the monthly BCU table (exchange_rates):
 *   - Currency: a foreign amount is converted to UYU at the rate of its OWN
 *     month, never today's — a 2010 USD price becomes 2010 pesos.
 *   - Inflation: the UYU amount is divided by the Unidad Indexada (UI) of its
 *     month and multiplied by the LATEST UI, re-expressing it in today's pesos.
 *     The UI is the BCU's CPI-indexed unit, so this is exact and self-updating.
 *
 * All functions are pure: pass a `RateTable` the caller has loaded once. Any
 * date whose month is not in the table (or a currency with no rate) yields
 * `null` — the caller then shows the nominal amount rather than a wrong one.
 */

export interface MonthRate {
  usd?: number
  eur?: number
  ui?: number
}

/** month (`YYYY-MM`) -> rates, plus the most recent UI for "today's pesos". */
export interface RateTable {
  byMonth: Record<string, MonthRate>
  /** UYU per UI in the latest month we hold — the deflation target. */
  latestUi: number | null
}

/** `YYYY-MM` for a Date or ISO string, in UTC (dates here are wall-clock stamped Z). */
export function monthKey(date: string | Date | null | undefined): string | null {
  if (!date) return null
  const d = typeof date === 'string' ? new Date(date) : date
  if (Number.isNaN(d.getTime())) return null
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

/** The rate for a month, falling back to the nearest earlier month we hold. */
function rateForMonth(table: RateTable, month: string): MonthRate | null {
  const exact = table.byMonth[month]
  if (exact) return exact
  // Nearest earlier month — rates move slowly; a one-month gap is harmless, and
  // this covers the newest contracts before the month's average has been written.
  const months = Object.keys(table.byMonth).filter(m => m <= month).sort()
  const prev = months[months.length - 1]
  return prev ? table.byMonth[prev]! : null
}

/** Convert a native amount to nominal UYU of its own month. Null if unconvertible. */
export function toNominalUyu(
  amount: number,
  currency: string,
  month: string | null,
  table: RateTable,
): number | null {
  const cur = (currency || 'UYU').toUpperCase()
  if (cur === 'UYU') return amount
  if (!month) return null
  const r = rateForMonth(table, month)
  if (!r) return null
  if (cur === 'USD' && r.usd) return amount * r.usd
  if (cur === 'EUR' && r.eur) return amount * r.eur
  return null
}

/**
 * The amount expressed in TODAY's pesos: converted to UYU at its own month's
 * rate, then re-based from that month's UI to the latest UI. Null when the
 * month's UI or the currency rate is missing (caller shows nominal instead).
 */
export function toTodayUyu(
  amount: number,
  currency: string,
  date: string | Date | null | undefined,
  table: RateTable,
): number | null {
  if (!Number.isFinite(amount)) return null
  const month = monthKey(date)
  const nominal = toNominalUyu(amount, currency, month, table)
  if (nominal === null) return null
  if (!month || !table.latestUi) return null
  const r = rateForMonth(table, month)
  if (!r?.ui) return null
  return nominal * (table.latestUi / r.ui)
}
