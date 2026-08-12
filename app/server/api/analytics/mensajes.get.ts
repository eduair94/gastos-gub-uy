import { createError, defineEventHandler } from 'h3'
import {
  AMOUNT_ARTIFACTS,
  CONTENT_PROBES,
  MESSAGE_LAYERS,
  allLayersFilter,
  layerOf,
} from '../../../../shared/message-spend'
import { connectToDatabase, mongoose } from '../../utils/database'

/**
 * "Qué compra el Estado cuando compra palabras" — the read side.
 *
 * Built entirely from `product_analytics`, like /api/pauta: amounts there are
 * already apportioned per line and per supplier, so the totals are exact and
 * additive instead of a release-level sum that double-counts multi-item
 * contracts. One pass over ~46k precomputed docs; cached for an hour.
 *
 * Every code is claimed by exactly ONE layer (see shared/message-spend.ts), so
 * the four layer totals sum to the grand total with no overlap.
 *
 * The `content` block is the counter-evidence: the catalogue is searched for
 * the words a reader looking for curricular content would use, and whatever
 * comes back — including nothing — is published.
 */
const TTL_MS = 60 * 60 * 1000

interface PaDoc {
  code: string
  canonicalName: string
  clasName?: string
  subcName?: string
  totalUYU?: number
  contractCount?: number
  topSuppliers?: { id?: string, name?: string, spendUYU?: number }[]
  topBuyers?: { id?: string, name?: string, spendUYU?: number }[]
  byYear?: { year: number, spendUYU?: number }[]
}

let cache: { data: unknown, at: number } | null = null

/**
 * The same company is spelled differently across sources — "TRADINCO S A" in
 * `releases` but "TRADINCO  S.A.-" in the catalogue rollup, "OBERTHUR FIDUCIAIRE
 * S.A.S" and "…S.A.S." in the same list. Comparing raw strings splits one
 * supplier into several rows and silently misses an exclusion.
 */
function normName(name?: string | null): string {
  return (name ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

/** Sum a contributor list across many codes, biggest first, merging spellings. */
function rollUp(
  rows: { id?: string, name?: string, spendUYU?: number }[][],
  limit: number,
): { id: string | null, name: string, total: number }[] {
  const acc = new Map<string, { id: string | null, name: string, total: number }>()
  for (const list of rows) {
    for (const r of list ?? []) {
      const name = (r.name ?? '').trim()
      const key = normName(name)
      if (!key) continue
      const cur = acc.get(key) ?? { id: r.id ?? null, name, total: 0 }
      cur.total += r.spendUYU ?? 0
      if (!cur.id && r.id) cur.id = r.id
      // Keep the tidiest spelling seen (fewest stray separators).
      if (name && name.length < cur.name.length) cur.name = name
      acc.set(key, cur)
    }
  }
  return [...acc.values()].sort((a, b) => b.total - a.total).slice(0, limit)
}

export default defineEventHandler(async () => {
  if (cache && Date.now() - cache.at < TTL_MS) {
    return { success: true, data: cache.data }
  }

  try {
    await connectToDatabase()
    if (mongoose.connection.readyState !== 1) {
      throw createError({ statusCode: 503, statusMessage: 'Database connection not ready' })
    }
    const db = mongoose.connection.db!
    const pa = db.collection<PaDoc>('product_analytics')

    const docs = await pa
      .find(allLayersFilter(), {
        projection: {
          code: 1,
          canonicalName: 1,
          clasName: 1,
          subcName: 1,
          totalUYU: 1,
          contractCount: 1,
          topSuppliers: 1,
          topBuyers: 1,
          byYear: 1,
        },
      })
      .maxTimeMS(60_000)
      .toArray()

    // --- remove the proven lump-sum artifacts ------------------------------
    // Done before any roll-up so the layer totals, the article ranking and the
    // supplier ranking all see the same corrected numbers.
    const byCode = new Map<string, PaDoc>(docs.map(d => [d.code, d]))
    for (const a of AMOUNT_ARTIFACTS) {
      const doc = byCode.get(a.code)
      if (!doc) continue
      doc.totalUYU = Math.max(0, (doc.totalUYU ?? 0) - a.amount)
      const target = normName(a.supplierName)
      doc.topSuppliers = (doc.topSuppliers ?? []).map(s2 =>
        normName(s2.name) === target
          ? { ...s2, spendUYU: Math.max(0, (s2.spendUYU ?? 0) - a.amount) }
          : s2,
      )
      doc.byYear = (doc.byYear ?? []).map(y =>
        y.year === a.year ? { ...y, spendUYU: Math.max(0, (y.spendUYU ?? 0) - a.amount) } : y,
      )
    }

    // --- fold each code into exactly one layer -----------------------------
    const byLayer = new Map<string, PaDoc[]>()
    for (const d of docs) {
      const key = layerOf(d)
      if (!key) continue
      const list = byLayer.get(key) ?? []
      list.push(d)
      byLayer.set(key, list)
    }

    const yearAcc = new Map<number, number>()
    const layers = MESSAGE_LAYERS.map((l) => {
      const list = byLayer.get(l.key) ?? []
      const total = list.reduce((s, d) => s + (d.totalUYU ?? 0), 0)
      for (const d of list) {
        for (const y of d.byYear ?? []) {
          if (!y?.year) continue
          yearAcc.set(y.year, (yearAcc.get(y.year) ?? 0) + (y.spendUYU ?? 0))
        }
      }
      return {
        key: l.key,
        labelEs: l.labelEs,
        labelEn: l.labelEn,
        noteEs: l.noteEs,
        noteEn: l.noteEn,
        total,
        codes: list.length,
        contracts: list.reduce((s, d) => s + (d.contractCount ?? 0), 0),
        topArticles: [...list]
          .sort((a, b) => (b.totalUYU ?? 0) - (a.totalUYU ?? 0))
          .slice(0, 8)
          .map(d => ({ code: d.code, name: d.canonicalName, total: d.totalUYU ?? 0 })),
        topSuppliers: rollUp(list.map(d => d.topSuppliers ?? []), 10),
        topBuyers: rollUp(list.map(d => d.topBuyers ?? []), 8),
      }
    })

    // --- the counter-evidence ---------------------------------------------
    const content = await Promise.all(CONTENT_PROBES.map(async (p) => {
      const hits = await pa
        .find(
          { canonicalName: { $regex: p.term, $options: 'i' } },
          { projection: { code: 1, canonicalName: 1, totalUYU: 1, clasName: 1 } },
        )
        .limit(6)
        .maxTimeMS(20_000)
        .toArray()
      return {
        term: p.term,
        labelEs: p.labelEs,
        labelEn: p.labelEn,
        codes: hits.length,
        total: hits.reduce((s, h) => s + (h.totalUYU ?? 0), 0),
        examples: hits.map(h => ({ code: h.code, name: h.canonicalName, total: h.totalUYU ?? 0 })),
      }
    }))

    const catalogueSize = await db.collection('sice_catalog').countDocuments({ retired: false })

    const data = {
      layers,
      artifacts: AMOUNT_ARTIFACTS,
      artifactsTotal: AMOUNT_ARTIFACTS.reduce((s2, a) => s2 + a.amount, 0),
      content,
      catalogueSize,
      total: layers.reduce((s, l) => s + l.total, 0),
      codes: layers.reduce((s, l) => s + l.codes, 0),
      contracts: layers.reduce((s, l) => s + l.contracts, 0),
      byYear: [...yearAcc.entries()]
        .map(([year, total]) => ({ year, total }))
        .filter(y => y.year >= 2002)
        .sort((a, b) => a.year - b.year),
      calculatedAt: new Date().toISOString(),
    }

    cache = { data, at: Date.now() }
    return { success: true, data }
  }
  catch (error: any) {
    if (error?.statusCode) throw error
    console.error('Error building message-spend analytics:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to build message-spend analytics' })
  }
})
