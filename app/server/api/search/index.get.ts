import { createError, defineEventHandler, getQuery } from 'h3'
import { connectToDatabase } from '../../utils/database'
import { BuyerPatternModel, ReleaseModel, SupplierPatternModel } from '../../utils/models'
import { safeRegex, sanitizeSearch, sourceUrl, toInt } from '../../utils/query'

/** Below this length a regex scan matches most of the collection for no
 *  user benefit, so short queries return empty rather than erroring. */
const MIN_QUERY_LENGTH = 2

/** Ceiling on server time per query. This endpoint is public and unauthenticated,
 *  so a slow query must fail rather than pin a connection. */
const MAX_TIME_MS = 5000

const DEFAULT_LIMIT = 10
const MAX_LIMIT = 50

export default defineEventHandler(async (event) => {
  try {
    await connectToDatabase()

    const query = getQuery(event)
    const { type = 'all' } = query

    if (!query.q) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Search query is required',
      })
    }

    const results: Record<string, unknown> = {}

    // Anonymous input reaches a regex here, so it is escaped and length-capped
    // before it ever gets near the engine — an unescaped `(a+)+$` against 2.1M
    // documents is a ReDoS.
    const q = sanitizeSearch(query.q)

    if (!q || q.length < MIN_QUERY_LENGTH) {
      // Not an error: the frontend types into this endpoint character by
      // character, and a 400 on the first keystroke would be noise.
      if (type === 'all' || type === 'contracts') results.contracts = []
      if (type === 'all' || type === 'suppliers') results.suppliers = []
      if (type === 'all' || type === 'buyers') results.buyers = []
      return { success: true, data: results }
    }

    const searchRegex = { $regex: safeRegex(q) }
    const limit = toInt(query.limit, DEFAULT_LIMIT, 1, MAX_LIMIT)

    // Search contracts
    if (type === 'all' || type === 'contracts') {
      const contracts = await ReleaseModel.find({
        $or: [
          { 'tender.title': searchRegex },
          { 'tender.description': searchRegex },
          { 'buyer.name': searchRegex },
          { ocid: searchRegex },
        ],
      })
        .limit(limit)
        .select('id ocid tender.title buyer.name date')
        .maxTimeMS(MAX_TIME_MS)
        .lean()

      results.contracts = contracts.map(doc => ({
        ...doc,
        sourceUrl: sourceUrl(doc.id),
      }))
    }

    // Search suppliers
    if (type === 'all' || type === 'suppliers') {
      const suppliers = await SupplierPatternModel.find({
        name: searchRegex,
      })
        .limit(limit)
        .select('supplierId name totalContracts totalValue')
        .maxTimeMS(MAX_TIME_MS)
        .lean()

      results.suppliers = suppliers
    }

    // Search buyers
    if (type === 'all' || type === 'buyers') {
      const buyers = await BuyerPatternModel.find({
        name: searchRegex,
      })
        .limit(limit)
        .select('buyerId name totalContracts totalSpending')
        .maxTimeMS(MAX_TIME_MS)
        .lean()

      results.buyers = buyers
    }

    return {
      success: true,
      data: results,
    }
  }
  catch (error: any) {
    // Deliberate client errors are thrown from inside this try — without
    // this guard the catch-all re-wrapped the 400 for a missing `q` as a
    // 500, telling callers we broke when in fact they did.
    if (error?.statusCode) throw error

    console.error('Error performing search:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Search failed',
    })
  }
})
