import { createError, defineEventHandler, getQuery } from 'h3'
import { connectToDatabase } from '../../utils/database'
import { SupplierPatternModel } from '../../utils/models'

export default defineEventHandler(async (event) => {
  try {
    await connectToDatabase()

    const query = getQuery(event)
    const {
      search = '',
      limit = 10,
    } = query

    // Resolve mode: `ids=<id1,id2>` returns the {value,label} for those exact
    // supplierIds — so a filter loaded from a URL (e.g. a supplier profile link)
    // can show the supplier NAME in its chip instead of the raw id.
    const idsRaw = typeof query.ids === 'string' ? query.ids : ''
    const ids = idsRaw.split(',').map(s => s.trim()).filter(Boolean)

    // Build search filter
    const filter: Record<string, unknown> = {}
    if (ids.length) {
      filter.supplierId = { $in: ids.slice(0, 100) }
    }
    // If there's a search term, apply regex search on name
    else if (search && typeof search === 'string' && search.trim().length > 0) {
      filter.name = { $regex: search.trim(), $options: 'i' }
    }

    // Get suppliers with search filtering, sorted by total value
    const suppliers = await SupplierPatternModel.find(filter)
      .select('supplierId name totalValue totalContracts')
      .sort({ totalValue: -1 })
      .limit(ids.length ? 100 : Number(limit))
      .lean()

    // Transform to autocomplete format
    const autocompleteData = suppliers.map(supplier => ({
      value: supplier.supplierId,
      label: supplier.name,
      meta: {
        totalValue: supplier.totalValue,
        totalContracts: supplier.totalContracts,
      },
    }))

    return {
      success: true,
      data: autocompleteData,
      meta: {
        searchTerm: search,
        resultsCount: autocompleteData.length,
        hasMore: suppliers.length === Number(limit),
      },
    }
  }
  catch (error) {
    console.error('Error fetching supplier autocomplete:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch supplier suggestions',
    })
  }
})
