import { defineEventHandler, getQuery } from 'h3'
import { connectToDatabase } from '../utils/database'
import { ProductAnalyticsModel } from '../../../shared/models/product_analytics'
import { escapeRegex, toInt } from '../utils/query'

// Catalogue taxonomy for the watch builder: classification codes + their modal
// description, sourced from the precomputed product_analytics. Supports a search
// query; defaults to the most-used codes (lowest rankByLines).
export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  await connectToDatabase()

  const q = typeof query.q === 'string' ? query.q.trim().slice(0, 80) : ''
  const limit = toInt(query.limit, 30, 1, 100)

  const filter: Record<string, unknown> = {}
  if (q) filter.description = new RegExp(escapeRegex(q), 'i')

  const rows = await ProductAnalyticsModel.find(filter)
    .select('code description lineCount contractCount')
    .sort({ rankByLines: 1 })
    .limit(limit)
    .lean()

  const data = rows.map(r => ({ code: r.code, description: r.description, lineCount: r.lineCount, contractCount: r.contractCount }))
  return { success: true, data }
})
