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
 * Formateadores memoizados. NUNCA construyas un `Intl.NumberFormat` por llamada.
 *
 * Construirlo resuelve el locale y arma un formateador ICU, que cuesta órdenes
 * de magnitud más que formatear un número con uno ya armado. Este archivo lo
 * hacía siete veces, una por cada sitio de llamada.
 *
 * Medido con un perfil de CPU sobre un worker de producción el 05-09-2026:
 * `formatNumber` sola era el 20% del tiempo de CPU del proceso, el consumo más
 * grande de todo el perfil. Una página del explorador formatea un número por
 * celda, así que un render son cientos de llamadas.
 *
 * La caché no crece sin control: las claves salen de literales del código y de
 * un único ternario, así que el máximo son seis entradas.
 */
const FORMATTERS = new Map<string, Intl.NumberFormat>()

function numberFormat(max?: number, min?: number): Intl.NumberFormat {
  const key = `${max ?? ''}:${min ?? ''}`
  const cached = FORMATTERS.get(key)
  if (cached) return cached

  const opts: Intl.NumberFormatOptions = {}
  if (max !== undefined) opts.maximumFractionDigits = max
  if (min !== undefined) opts.minimumFractionDigits = min

  const created = new Intl.NumberFormat('es-UY', opts)
  FORMATTERS.set(key, created)
  return created
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
      return `${symbol} ${numberFormat(2, 0).format(amount / 1_000_000_000)} mil M`
    }
    return `${symbol} ${numberFormat(millions >= 100 ? 0 : 1, 0).format(millions)} M`
  }

  return `${symbol} ${numberFormat(opts.decimals ? 2 : 0, opts.decimals ? 2 : 0).format(amount)}`
}

/** Plain integer formatting (contract counts, item counts). */
export function formatNumber(n?: number | null): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—'
  return numberFormat().format(n)
}

/** Compact integer for tiles: 2.171.928 -> "2,17 M" */
export function formatCount(n?: number | null): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—'
  if (Math.abs(n) >= 1_000_000) {
    return `${numberFormat(2).format(n / 1_000_000)} M`
  }
  if (Math.abs(n) >= 10_000) {
    return `${numberFormat(1).format(n / 1000)} mil`
  }
  return numberFormat().format(n)
}
