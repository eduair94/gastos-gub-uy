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
 * The canonical public URL for a release on the government site.
 *
 * This is pure derivation from the stored `id` — the source RSS feed
 * hands us this link at ingest time and then discards it, so nothing
 * is persisted and no migration is needed. Keep it in one place: if
 * Compras Estatales ever moves, this function is the only edit.
 *
 * @example sourceUrl('adjudicacion-i455643')
 *   -> 'https://www.comprasestatales.gub.uy/ocds/release/adjudicacion-i455643'
 */
export function sourceUrl(releaseId?: string | null): string | null {
  if (!releaseId || typeof releaseId !== 'string') return null
  return `https://www.comprasestatales.gub.uy/ocds/release/${encodeURIComponent(releaseId)}`
}
