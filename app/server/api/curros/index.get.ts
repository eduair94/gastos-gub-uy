import { createError, defineEventHandler } from 'h3'
import { ReleaseModel } from '../../../../shared/models/release'
import { curroToQueryParams, listCurroDefs } from '../../utils/curros'
import { connectToDatabase, mongoose } from '../../utils/database'
import { buildContractFilters, toMatchDocument } from '../contracts/index.get'

/**
 * The curros index: one card per documented case with its live cross-referenced
 * total and contract count, its legal status and its sources. Each case is a
 * small, tightly-scoped set (tens to hundreds of contracts), so a count + capped
 * sum per case is cheap; cached for an hour so the listing never re-scans on
 * every visit.
 *
 * The total is *what the state spent with the entities named in the case* — a
 * cross-reference, not a measure of wrongdoing. The detail endpoint spells that
 * out per case (`caveat`).
 */
const IMPLAUSIBLE_UYU = 1e11
const TTL_MS = 60 * 60 * 1000

let cache: { data: unknown, at: number } | null = null

async function summarize(def: ReturnType<typeof listCurroDefs>[number]) {
  const filters = buildContractFilters(curroToQueryParams(def.query))
  const match = toMatchDocument(filters)

  const [row] = await ReleaseModel.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        count: { $sum: 1 },
        total: { $sum: { $cond: [{ $lt: ['$amount.primaryAmount', IMPLAUSIBLE_UYU] }, { $ifNull: ['$amount.primaryAmount', 0] }, 0] } },
      },
    },
  ], { maxTimeMS: 8000, allowDiskUse: false }).catch(() => [])

  return {
    slug: def.slug,
    emoji: def.emoji,
    period: def.period ?? null,
    status: def.status,
    amountReported: def.amountReported ?? null,
    investigationPath: def.investigationPath ?? null,
    sourceCount: def.sources.length,
    sources: def.sources,
    es: { title: def.es.title, dek: def.es.dek, statusNote: def.es.statusNote },
    en: { title: def.en.title, dek: def.en.dek, statusNote: def.en.statusNote },
    total: row?.total ?? 0,
    count: row?.count ?? 0,
  }
}

export default defineEventHandler(async () => {
  if (cache && Date.now() - cache.at < TTL_MS) {
    return { success: true, data: cache.data }
  }

  await connectToDatabase()
  if (mongoose.connection.readyState !== 1) {
    throw createError({ statusCode: 503, statusMessage: 'Database connection not ready' })
  }

  const items = await Promise.all(listCurroDefs().map(summarize))
  const data = { items, count: items.length }
  cache = { data, at: Date.now() }
  return { success: true, data }
})
