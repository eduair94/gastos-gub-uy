import { createError, defineEventHandler, getQuery } from 'h3'
import { connectToDatabase } from '../../utils/database'
import { ProductAnalyticsModel } from '../../utils/models'
import { escapeRegex, toInt } from '../../utils/query'

/**
 * The product-analytics list: what the state buys, by catalogue code.
 *
 * Reads the precomputed `product_analytics` collection (~40k docs, one per real catalogue code),
 * so this never scans the 2.2M releases collection on the request path. Sorting uses the
 * precomputed ranks where possible so paging is index-ordered.
 */

const SORTS: Record<string, Record<string, 1 | -1>> = {
  spend: { rankBySpend: 1 },
  lines: { rankByLines: 1 },
  contracts: { contractCount: -1, rankBySpend: 1 },
  buyers: { buyerCount: -1, rankBySpend: 1 },
  suppliers: { supplierCount: -1, rankBySpend: 1 },
}

export default defineEventHandler(async (event) => {
  try {
    await connectToDatabase()

    const query = getQuery(event)
    const limit = toInt(query.limit, 25, 1, 100)
    const page = toInt(query.page, 1, 1, 400)
    const sortKey = typeof query.sort === 'string' && SORTS[query.sort] ? query.sort : 'spend'
    const sort = SORTS[sortKey]!

    // Free-text narrowing on the code's description or the code itself. The
    // collection is small enough that a case-insensitive regex is fine; input
    // is escaped so a hostile pattern can't ReDoS an unauthenticated endpoint.
    const search = typeof query.search === 'string' ? query.search.trim() : ''
    const filter: Record<string, unknown> = {}
    if (search) {
      const rx = new RegExp(escapeRegex(search), 'i')
      filter.$or = [{ description: rx }, { code: search }]
    }

    const skip = (page - 1) * limit

    const [products, total, totalProducts] = await Promise.all([
      ProductAnalyticsModel.find(filter)
        .select('code description lineCount contractCount buyerCount supplierCount totalUYU currencies rankBySpend rankByLines lastYear')
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .maxTimeMS(8000)
        .lean(),
      ProductAnalyticsModel.countDocuments(filter).maxTimeMS(8000),
      search ? ProductAnalyticsModel.estimatedDocumentCount() : Promise.resolve(0),
    ])

    return {
      success: true,
      data: {
        products,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / limit)),
        },
        meta: {
          sort: sortKey,
          totalProducts: search ? totalProducts : total,
        },
      },
    }
  }
  catch (error) {
    console.error('Error fetching product analytics:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch product analytics' })
  }
})
