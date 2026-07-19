import { createError, defineEventHandler, getRouterParam } from 'h3'
import type { PipelineStage } from 'mongoose'
import { ReleaseModel } from '../../../../shared/models/release'
import { connectToDatabase, mongoose } from '../../utils/database'
import { sourceUrl } from '../../utils/query'
import { getRecopDef, listRecopDefs, recopToQueryParams } from '../../utils/recopilatorios'
import { buildContractFilters, toMatchDocument } from '../contracts/index.get'

/**
 * One recopilatorio, resolved live. Given a slug, it looks up the saved query,
 * builds the SAME match the explorer would, and returns the event's total,
 * supplier mix, rubro mix, a year trend and the ledger of contracts.
 *
 * Totals exclude the implausible-quantity artefacts (see stats.get.ts) so one
 * corrupt source record can't blow up a tidy event total.
 */
const IMPLAUSIBLE_UYU = 1e11
const MAX_TIME_MS = 9000

const plausible = {
  $cond: [{ $lt: ['$amount.primaryAmount', IMPLAUSIBLE_UYU] }, { $ifNull: ['$amount.primaryAmount', 0] }, 0],
}

interface LeanRelease {
  id?: string
  ocid?: string
  tender?: { title?: string }
  buyer?: { name?: string }
  awards?: Array<{ suppliers?: Array<{ name?: string }>, items?: Array<{ description?: string, classification?: { description?: string } }> }>
  amount?: { primaryAmount?: number }
  date?: Date
}

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug') ?? ''
  const def = getRecopDef(slug)
  if (!def) {
    throw createError({ statusCode: 404, statusMessage: 'Recopilatorio not found' })
  }

  await connectToDatabase()
  if (mongoose.connection.readyState !== 1) {
    throw createError({ statusCode: 503, statusMessage: 'Database connection not ready' })
  }

  const filters = buildContractFilters(recopToQueryParams(def.query))
  const match = toMatchDocument(filters)

  // $text (when the query has a search phrase) must lead the pipeline.
  const pre: PipelineStage[] = []
  if (filters.text) {
    pre.push({ $match: filters.text })
    if (filters.and.length) pre.push({ $match: { $and: filters.and } })
  }
  else if (filters.and.length) {
    pre.push({ $match: { $and: filters.and } })
  }

  const facet: PipelineStage = {
    $facet: {
      totals: [
        { $group: { _id: null, count: { $sum: 1 }, totalValue: { $sum: plausible } } },
      ],
      byYear: [
        { $group: { _id: '$sourceYear', count: { $sum: 1 }, value: { $sum: plausible } } },
        { $sort: { _id: 1 } },
      ],
      // Release amount is per release, not per supplier — a multi-supplier award
      // adds its full amount to each. Ranking holds; absolute values are a ceiling.
      suppliers: [
        { $unwind: '$awards' },
        { $unwind: '$awards.suppliers' },
        { $group: { _id: '$awards.suppliers.name', value: { $sum: '$amount.primaryAmount' }, count: { $sum: 1 } } },
        { $sort: { value: -1 } },
        { $limit: 10 },
      ],
      supplierCount: [
        { $unwind: '$awards' },
        { $unwind: '$awards.suppliers' },
        { $group: { _id: '$awards.suppliers.name' } },
        { $count: 'n' },
      ],
      // Rubro spend from the item lines (quantity x unit price) in the contract's
      // own currency. These events are single-currency (UYU); a mixed-currency
      // event would need per-currency splitting.
      categories: [
        { $unwind: '$awards' },
        { $unwind: '$awards.items' },
        {
          $group: {
            _id: '$awards.items.classification.description',
            value: { $sum: { $multiply: [{ $ifNull: ['$awards.items.quantity', 0] }, { $ifNull: ['$awards.items.unit.value.amount', 0] }] } },
            releases: { $addToSet: '$_id' },
          },
        },
        { $project: { value: 1, contracts: { $size: '$releases' } } },
        { $sort: { value: -1 } },
        { $limit: 8 },
      ],
    },
  }

  const [aggResult] = await ReleaseModel.aggregate([...pre, facet], {
    allowDiskUse: false,
    maxTimeMS: MAX_TIME_MS,
  })

  const items = await ReleaseModel
    .find(match, {
      'id': 1,
      'ocid': 1,
      'tender.title': 1,
      'buyer.name': 1,
      'awards.suppliers.name': 1,
      'awards.items.description': 1,
      'awards.items.classification.description': 1,
      'amount.primaryAmount': 1,
      'date': 1,
    })
    .sort({ 'amount.primaryAmount': -1 })
    .limit(40)
    .maxTimeMS(MAX_TIME_MS)
    .lean() as LeanRelease[]

  const totals = aggResult?.totals?.[0] ?? { count: 0, totalValue: 0 }
  const supplierCount = aggResult?.supplierCount?.[0]?.n ?? 0

  const toNamed = (rows: Array<{ _id: unknown, value: number, count: number }> = []) =>
    rows.filter(r => typeof r._id === 'string' && r._id).map(r => ({ name: r._id as string, value: r.value ?? 0, count: r.count }))

  const suppliers = toNamed(aggResult?.suppliers)
  const categories = (aggResult?.categories ?? [])
    .filter((c: { _id: unknown }) => typeof c._id === 'string' && c._id)
    .map((c: { _id: string, value: number, contracts: number }) => ({ name: c._id, value: c.value ?? 0, contracts: c.contracts }))

  const byYear = (aggResult?.byYear ?? [])
    .filter((b: { _id: unknown }) => Number.isFinite(Number(b._id)))
    .map((b: { _id: unknown, count: number, value: number }) => ({ year: Number(b._id), count: b.count, value: b.value ?? 0 }))

  const ledger = items.map((doc) => {
    const firstAward = doc.awards?.[0]
    const supplier = firstAward?.suppliers?.[0]?.name ?? null
    const firstItem = firstAward?.items?.[0]
    const title = doc.tender?.title || firstItem?.description || firstItem?.classification?.description || null
    return {
      id: doc.id,
      title,
      buyerName: doc.buyer?.name ?? null,
      supplier,
      amount: doc.amount?.primaryAmount ?? null,
      date: doc.date ?? null,
      sourceUrl: sourceUrl(doc.ocid),
    }
  })

  // Related = the other compilations, for lateral navigation.
  const related = listRecopDefs()
    .filter(r => r.slug !== def.slug)
    .map(r => ({ slug: r.slug, emoji: r.emoji, es: r.es, en: r.en }))

  return {
    success: true,
    data: {
      slug: def.slug,
      emoji: def.emoji,
      period: def.period ?? null,
      es: def.es,
      en: def.en,
      kpis: {
        total: totals.totalValue ?? 0,
        count: totals.count ?? 0,
        suppliers: supplierCount,
      },
      byYear,
      suppliers,
      categories,
      ledger,
      related,
      meta: {
        supplierValueBasis: 'upper bound; release amount is not apportioned across suppliers',
        categoryValueBasis: 'item line total (quantity x unit price) in the contract currency',
        totalExcludesAbove: IMPLAUSIBLE_UYU,
      },
    },
  }
})
