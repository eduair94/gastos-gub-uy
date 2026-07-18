import { createError, defineEventHandler, getQuery } from 'h3'
import { connectToDatabase } from '../../utils/database'
import { ProductAnalyticsModel } from '../../utils/models'
import { escapeRegex, toInt } from '../../utils/query'
import { parseToken } from '../../../../shared/utils/rubro-tokens'

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
      filter.$or = [{ description: rx }, { canonicalName: rx }, { code: search }]
    }

    // Resolve mode: turn a set of bare codes back into product docs so a UI that
    // received codes via the URL (the contracts product filter) can label its
    // chips. Bounded, exact, index-backed; short-circuits the list query.
    const codesParam = typeof query.codes === 'string' ? query.codes.trim() : ''
    if (codesParam) {
      const codes = codesParam.split(',').map(c => c.trim()).filter(Boolean).slice(0, 100)
      const docs = codes.length
        ? await ProductAnalyticsModel.find({ code: { $in: codes } })
            .select('code description canonicalName contractCount lineCount buyerCount supplierCount totalUYU currencies')
            .maxTimeMS(8000)
            .lean()
        : []
      return {
        success: true,
        data: {
          products: docs,
          pagination: { page: 1, limit: docs.length, total: docs.length, totalPages: 1 },
          meta: { sort: 'codes', totalProducts: docs.length },
        },
      }
    }

    // Rubro filter: a SICE node token (F/SF/C/SC) narrows to product docs whose
    // rubroPath sits under that node (prefix match on the numeric dotted path).
    const rubro = typeof query.rubro === 'string' ? query.rubro.trim() : ''
    if (rubro) {
      const { path } = parseToken(rubro)
      if (path) filter.rubroPath = new RegExp('^' + escapeRegex(path) + '(\\.|$)')
    }

    const skip = (page - 1) * limit

    const [products, total, totalProducts] = await Promise.all([
      ProductAnalyticsModel.find(filter)
        .select('code description canonicalName rubroPath famiName subfName clasName subcName unitName isService lineCount contractCount buyerCount supplierCount totalUYU currencies rankBySpend rankByLines lastYear')
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
