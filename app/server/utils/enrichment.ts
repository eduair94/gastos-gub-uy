import { mongoose } from './database'

/**
 * Shared read side of supplier_enrichment (written by src/jobs/enrich-suppliers.ts).
 *
 * The category is the reliable signal; the free-text description is only handed
 * back when the model was confident AND it isn't just the legal name echoed
 * back — so consumers never surface a low-value or shaky AI line as if it were a
 * fact. Everything here is ADVISORY AI context; the UI labels it as such.
 */

const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toUpperCase()

export interface Enrichment {
  category: string | null
  description: string | null
}

const EMPTY: Enrichment = { category: null, description: null }

/** Gated enrichment for a set of supplier names, keyed by exact name. */
export async function fetchEnrichment(names: string[]): Promise<Map<string, Enrichment>> {
  const out = new Map<string, Enrichment>()
  const uniq = [...new Set(names.filter(Boolean))]
  if (!uniq.length || mongoose.connection.readyState !== 1) return out

  const rows = await mongoose.connection.db!
    .collection('supplier_enrichment')
    .find({ name: { $in: uniq } }, { projection: { name: 1, category: 1, description: 1, confidence: 1 } })
    .toArray()

  for (const e of rows as Array<{ name: string, category?: string, description?: string, confidence?: number }>) {
    const conf = e.confidence ?? 0
    const category = conf >= 0.5 && e.category && e.category !== 'otro' ? e.category : null
    const desc = e.description ?? ''
    const description = conf >= 0.6 && desc && norm(desc) !== norm(e.name) ? desc : null
    out.set(e.name, { category, description })
  }
  return out
}

/** Attach {category, description} to each item by its supplier name. */
export async function attachEnrichment<T>(items: T[], getName: (item: T) => string): Promise<Array<T & Enrichment>> {
  const map = await fetchEnrichment(items.map(getName))
  return items.map(it => ({ ...it, ...(map.get(getName(it)) ?? EMPTY) }))
}

/**
 * The `sup.cat.*` values a supplier can be filtered by (mirrors SupplierChip;
 * excludes 'otro', which never renders as a chip). The single source of truth for
 * both the /api/suppliers and /api/contacts "type" filters.
 */
export const CATEGORIES = new Set([
  'medio-tv', 'medio-radio', 'medio-prensa', 'medio-digital', 'medio-via-publica',
  'agencia-publicidad', 'productora', 'organismo-publico', 'empresa', 'cooperativa', 'persona',
])

/**
 * Supplier names whose enrichment resolves to `category`, gated the same way
 * `fetchEnrichment` gates what it shows (confidence >= 0.5) so a "type" filter
 * never matches a supplier whose chip wouldn't actually render that category.
 */
export async function fetchNamesByCategory(category: string): Promise<string[]> {
  if (!category || mongoose.connection.readyState !== 1) return []
  const rows = await mongoose.connection.db!
    .collection('supplier_enrichment')
    .find({ category, confidence: { $gte: 0.5 } }, { projection: { name: 1, _id: 0 } })
    .toArray()
  return rows.map(r => (r as { name: string }).name)
}
