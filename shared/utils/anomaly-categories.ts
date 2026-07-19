/**
 * The second-stage AI-triage categories (aiVerdict.category in shared/models/anomaly.ts).
 * This is the semantically meaningful "tipo de error" — where a genuine overprice is
 * re-classified as a data-load error (error-carga / moneda-erronea), a different product,
 * an urgency, etc. Kept here so both the list endpoint and the "changes" feed validate
 * a ?category= filter against the same source of truth.
 */
export const AI_CATEGORY_VALUES = [
  'cantidad-baja',
  'producto-distinto',
  'marca-especializado',
  'urgencia',
  'servicio-incluido',
  'error-carga',
  'moneda-erronea',
  'sin-explicacion',
  'otro',
] as const

export type AiCategory = typeof AI_CATEGORY_VALUES[number]

/** Load errors — data-entry mistakes to report to the source, not corruption. */
export const LOAD_ERROR_CATEGORIES: readonly AiCategory[] = ['error-carga', 'moneda-erronea']

const SET = new Set<string>(AI_CATEGORY_VALUES)

/**
 * Parse a `?category=` query value into a clean, validated list.
 * Accepts a comma-joined string (`?category=a,b`) OR repeated params
 * (`?category=a&category=b`). Values are trimmed, lower-cased, filtered to known
 * enum members and de-duplicated. Unknown values are dropped — a garbage param
 * therefore yields `[]` (⇒ no category filter applied), never an empty result set.
 */
export function parseCategories(v: unknown): AiCategory[] {
  const raw: string[] = Array.isArray(v)
    ? v.flatMap(x => (typeof x === 'string' ? x.split(',') : []))
    : typeof v === 'string'
      ? v.split(',')
      : []
  const out: AiCategory[] = []
  for (const s of raw) {
    const k = s.trim().toLowerCase()
    if (SET.has(k) && !out.includes(k as AiCategory)) out.push(k as AiCategory)
  }
  return out
}
