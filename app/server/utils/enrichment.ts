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
