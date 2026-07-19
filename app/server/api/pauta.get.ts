import { createError, defineEventHandler } from 'h3'
import { connectToDatabase, mongoose } from '../utils/database'

/**
 * Pauta oficial — the state's advertising spend, and who receives it.
 *
 * Built entirely from `product_analytics`, which is precomputed per catalogue
 * code with amounts already APPORTIONED per supplier and per buyer (spendUYU),
 * i.e. the honest, line-level split — not the release total. So summing the
 * "PUBLICIDAD Y PROPAGANDA" class gives the real advertising figures without a
 * 2.2M-document scan.
 *
 * Totals and the year trend are EXACT (additive across codes). The outlet and
 * buyer rankings merge each code's top-N contributors, so they surface the
 * major recipients/spenders rather than an exhaustive long tail — labelled as
 * such in the UI.
 *
 * Nothing is filtered out: a few recipients are ad agencies or even state
 * entities rather than media outlets, and one buyer-shaped name tops the list.
 * That is the source's data; the page shows it and says what it is.
 */
const PAUTA_CLASS = 'PUBLICIDAD Y PROPAGANDA'
const TTL_MS = 60 * 60 * 1000

let cache: { data: unknown, at: number } | null = null

export default defineEventHandler(async () => {
  if (cache && Date.now() - cache.at < TTL_MS) {
    return { success: true, data: cache.data }
  }

  await connectToDatabase()
  if (mongoose.connection.readyState !== 1) {
    throw createError({ statusCode: 503, statusMessage: 'Database connection not ready' })
  }

  const col = mongoose.connection.db!.collection('product_analytics')

  const [result] = await col.aggregate([
    { $match: { clasName: PAUTA_CLASS } },
    {
      $facet: {
        total: [
          { $group: { _id: null, total: { $sum: '$totalUYU' }, formats: { $sum: 1 } } },
        ],
        // Each doc is one catalogue code — a "format" of advertising.
        formats: [
          { $project: { _id: 0, name: '$description', value: '$totalUYU', contracts: '$contractCount' } },
          { $sort: { value: -1 } },
          { $limit: 12 },
        ],
        // Recipients: media outlets, ad agencies, some state entities.
        outlets: [
          { $unwind: '$topSuppliers' },
          { $group: { _id: '$topSuppliers.name', value: { $sum: '$topSuppliers.spendUYU' } } },
          { $sort: { value: -1 } },
          { $limit: 15 },
        ],
        // Who pays for the advertising.
        buyers: [
          { $unwind: '$topBuyers' },
          { $group: { _id: '$topBuyers.name', value: { $sum: '$topBuyers.spendUYU' } } },
          { $sort: { value: -1 } },
          { $limit: 12 },
        ],
        byYear: [
          { $unwind: '$byYear' },
          { $group: { _id: '$byYear.year', value: { $sum: '$byYear.spendUYU' } } },
          { $sort: { _id: 1 } },
        ],
      },
    },
  ]).toArray()

  const totals = result?.total?.[0] ?? { total: 0, formats: 0 }
  const named = (rows: Array<{ _id: unknown, value: number }> = []) =>
    rows.filter(r => typeof r._id === 'string' && r._id).map(r => ({ name: r._id as string, value: r.value ?? 0 }))

  const byYear = (result?.byYear ?? [])
    .filter((b: { _id: unknown }) => Number.isFinite(Number(b._id)) && Number(b._id) > 2000)
    .map((b: { _id: unknown, value: number }) => ({ year: Number(b._id), value: b.value ?? 0 }))

  const outlets = named(result?.outlets)
  const grandTotal = totals.total ?? 0

  // Attach AI enrichment (category + one-line description) to the recipients.
  // The category is the reliable, low-risk signal; the free-text description is
  // shown only when confident and when it isn't just the legal name echoed back.
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toUpperCase()
  const enrichRows = await mongoose.connection.db!
    .collection('supplier_enrichment')
    .find({ name: { $in: outlets.map(o => o.name) } }, { projection: { name: 1, category: 1, description: 1, confidence: 1 } })
    .toArray()
  const enrichMap = new Map(enrichRows.map(e => [e.name, e]))
  const enrichOf = (name: string) => {
    const e = enrichMap.get(name) as { category?: string, description?: string, confidence?: number } | undefined
    if (!e) return { category: null as string | null, description: null as string | null }
    const conf = e.confidence ?? 0
    const category = conf >= 0.5 && e.category && e.category !== 'otro' ? e.category : null
    const desc = e.description ?? ''
    const description = conf >= 0.6 && desc && norm(desc) !== norm(name) ? desc : null
    return { category, description }
  }

  const data = {
    total: grandTotal,
    formatCount: totals.formats ?? 0,
    topOutlet: outlets[0] ?? null,
    outlets: outlets.map(o => ({ ...o, share: grandTotal ? o.value / grandTotal : 0, ...enrichOf(o.name) })),
    buyers: named(result?.buyers),
    formats: (result?.formats ?? []).map((f: { name: string, value: number, contracts: number }) => ({
      name: f.name,
      value: f.value ?? 0,
      contracts: f.contracts ?? 0,
      share: grandTotal ? (f.value ?? 0) / grandTotal : 0,
    })),
    byYear,
    meta: {
      classNames: [PAUTA_CLASS],
      basis: 'product_analytics; amounts apportioned per supplier/buyer per catalogue code',
      totalsExact: true,
      rankingsBasis: 'merge of each code\'s top contributors (major recipients/spenders, not exhaustive)',
    },
  }

  cache = { data, at: Date.now() }
  return { success: true, data }
})
