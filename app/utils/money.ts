// ============================================================
// The peso scale.
//
// Uruguayan procurement amounts span roughly six orders of
// magnitude — a $3.940 air-conditioning service sits in the same
// table as a $2.000.000.000 infrastructure award. A linear bar
// would render everything but the largest handful as an invisible
// sliver, so the magnitude rule is logarithmic.
//
// The domain is fixed and site-wide on purpose: a rule's length
// must mean the same thing on the dashboard, in the explorer
// table, and on a detail page. Never derive it from the max of
// the current view — that would make the scale shift under the
// reader as they filter.
// ============================================================

/** $100 — below this, amounts are rounding errors in this dataset. */
export const MAG_MIN_LOG = 2
/** $10.000.000.000 — above the largest award on record. */
export const MAG_MAX_LOG = 10

/** Maps an amount to 0..1 on the fixed site-wide log scale. */
export function magnitude(amount?: number | null): number {
  if (!amount || amount <= 0 || !Number.isFinite(amount)) return 0
  const l = Math.log10(amount)
  return Math.min(1, Math.max(0, (l - MAG_MIN_LOG) / (MAG_MAX_LOG - MAG_MIN_LOG)))
}

const CURRENCY_SYMBOL: Record<string, string> = {
  UYU: '$',
  USD: 'US$',
  EUR: '€',
  UYI: 'UI',
  UR: 'UR',
}

/**
 * Formats an amount the way a Uruguayan reader expects: 1.234.567,89.
 * `compact` gives the short form used in dense tables and tiles.
 */
export function formatMoney(
  amount?: number | null,
  currency = 'UYU',
  opts: { compact?: boolean, decimals?: boolean } = {},
): string {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) return '—'

  const symbol = CURRENCY_SYMBOL[currency] ?? currency

  if (opts.compact && Math.abs(amount) >= 1_000_000) {
    const millions = amount / 1_000_000
    if (Math.abs(amount) >= 1_000_000_000) {
      return `${symbol} ${new Intl.NumberFormat('es-UY', {
        maximumFractionDigits: 2,
        minimumFractionDigits: 0,
      }).format(amount / 1_000_000_000)} mil M`
    }
    return `${symbol} ${new Intl.NumberFormat('es-UY', {
      maximumFractionDigits: millions >= 100 ? 0 : 1,
      minimumFractionDigits: 0,
    }).format(millions)} M`
  }

  return `${symbol} ${new Intl.NumberFormat('es-UY', {
    maximumFractionDigits: opts.decimals ? 2 : 0,
    minimumFractionDigits: opts.decimals ? 2 : 0,
  }).format(amount)}`
}

/** Plain integer formatting (contract counts, item counts). */
export function formatNumber(n?: number | null): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—'
  return new Intl.NumberFormat('es-UY').format(n)
}

/** Compact integer for tiles: 2.171.928 -> "2,17 M" */
export function formatCount(n?: number | null): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—'
  if (Math.abs(n) >= 1_000_000) {
    return `${new Intl.NumberFormat('es-UY', { maximumFractionDigits: 2 }).format(n / 1_000_000)} M`
  }
  if (Math.abs(n) >= 10_000) {
    return `${new Intl.NumberFormat('es-UY', { maximumFractionDigits: 1 }).format(n / 1000)} mil`
  }
  return new Intl.NumberFormat('es-UY').format(n)
}
