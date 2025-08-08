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

    // Build search filter
    const filter: Record<string, unknown> = {}

    // If there's a search term, apply regex search on name
    if (search && typeof search === 'string' && search.trim().length > 0) {
      filter.name = { $regex: search.trim(), $options: 'i' }
    }

    // Get suppliers with search filtering, sorted by total value
    const suppliers = await SupplierPatternModel.find(filter)
      .select('supplierId name totalValue totalContracts')
      .sort({ totalValue: -1 })
      .limit(Number(limit))
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
