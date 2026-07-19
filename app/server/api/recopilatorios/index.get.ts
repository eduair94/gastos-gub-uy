import { createError, defineEventHandler } from 'h3'
import { ReleaseModel } from '../../../../shared/models/release'
import { connectToDatabase, mongoose } from '../../utils/database'
import { listRecopDefs, recopToQueryParams } from '../../utils/recopilatorios'
import { buildContractFilters, toMatchDocument } from '../contracts/index.get'

/**
 * The recopilatorios index: one card per compilation with its live headline
 * total and contract count. Each event is a small, tightly-scoped set (tens of
 * contracts), so a count + capped sum per def is cheap; cached for an hour so
 * the listing never re-scans on every visit.
 */
const IMPLAUSIBLE_UYU = 1e11
const TTL_MS = 60 * 60 * 1000

let cache: { data: unknown, at: number } | null = null

async function summarize(def: ReturnType<typeof listRecopDefs>[number]) {
  const filters = buildContractFilters(recopToQueryParams(def.query))
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
    es: def.es,
    en: def.en,
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

  const items = await Promise.all(listRecopDefs().map(summarize))
  const data = { items }
  cache = { data, at: Date.now() }
  return { success: true, data }
})
