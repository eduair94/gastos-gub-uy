/**
 * Shared query primitives for the public API.
 *
 * Everything here is reachable by anonymous callers, so treat every
 * input as hostile.
 */

/**
 * Escapes a user string for safe use inside a RegExp.
 *
 * Without this, a query like `(a+)+$` reaches the regex engine and
 * becomes a ReDoS against an unauthenticated endpoint backed by a
 * 2.1M-document collection.
 */
export function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Caps a user-supplied search string so a pathological input can't
 *  build an enormous regex or text query. */
export function sanitizeSearch(raw: unknown, maxLen = 120): string | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim().replace(/\s+/g, ' ')
  if (!trimmed) return null
  return trimmed.slice(0, maxLen)
}

/** Builds a case-insensitive anchored-anywhere regex from user input. */
export function safeRegex(raw: string, flags = 'i'): RegExp {
  return new RegExp(escapeRegex(raw), flags)
}

export function toInt(v: unknown, fallback: number, min: number, max: number): number {
  const n = Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.min(Math.max(Math.trunc(n), min), max)
}

export function toNumberOrNull(v: unknown): number | null {
  if (v === undefined || v === null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** Normalises a query param that may arrive as a scalar or a repeated key. */
export function toArray(v: unknown): string[] {
  if (v === undefined || v === null || v === '') return []
  const arr = Array.isArray(v) ? v : [v]
  return arr
    .flatMap(x => (typeof x === 'string' ? x.split(',') : [x]))
    .map(x => String(x).trim())
    .filter(Boolean)
}

/**
 * The public page for a purchase on the government site — the thing a
 * reader can actually open and check against.
 *
 * Derived from `ocid`, NOT `id`. The ocid suffix is the `id_compra` the
 * government's own site keys on, which `rssTitle` confirms
 * (`id_compra:1356289` ↔ `ocds-yfs5dr-1356289`). `id` is a per-release
 * key that does NOT match it on adjustment/cancellation records, and
 * using it silently links to a different contract:
 *
 *   ajuste_llamado-47064  (ocid ocds-yfs5dr-1356289)
 *     /id/1356289 -> Compra Directa 1240/2026   <- correct
 *     /id/47064   -> Compra Directa 1023/2005   <- a real, unrelated contract
 *
 * On a site whose whole claim is "go check the source", pointing at the
 * wrong source is the worst bug available. Verified against the live
 * site for numeric (1355780), legacy alpha (a100) and i-prefixed
 * (i455643) ocids — all resolve.
 *
 * @example sourceUrl('ocds-yfs5dr-1352393')
 *   -> 'https://www.comprasestatales.gub.uy/consultas/detalle/mostrar-llamado/1/id/1352393'
 */
export function sourceUrl(ocid?: string | null): string | null {
  const compraId = compraIdFromOcid(ocid)
  if (!compraId) return null
  return `https://www.comprasestatales.gub.uy/consultas/detalle/mostrar-llamado/1/id/${encodeURIComponent(compraId)}`
}

/** The government's `id_compra`: the ocid with its `ocds-<prefix>-` stripped. */
export function compraIdFromOcid(ocid?: string | null): string | null {
  if (!ocid || typeof ocid !== 'string') return null
  const m = /^ocds-[a-z0-9]+-(.+)$/i.exec(ocid.trim())
  const id = (m?.[1] ?? '').trim()
  return id || null
}

/**
 * The raw OCDS JSON for a release, keyed by `id` (not ocid) because this
 * endpoint is per-release. Useful to link alongside the human page.
 */
export function ocdsJsonUrl(releaseId?: string | null): string | null {
  if (!releaseId || typeof releaseId !== 'string') return null
  return `https://www.comprasestatales.gub.uy/ocds/release/${encodeURIComponent(releaseId)}`
}
