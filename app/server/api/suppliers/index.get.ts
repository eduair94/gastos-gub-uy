import { createError, defineEventHandler, getQuery } from 'h3'
import { connectToDatabase } from '../../utils/database'
import { SupplierPatternModel } from '../../utils/models'

export default defineEventHandler(async (event) => {
  try {
    await connectToDatabase()

    const query = getQuery(event)
    const {
      page = 1,
      limit = 20,
      search,
      sortBy = 'totalValue',
      sortOrder = 'desc',
    } = query

    // Build query filter
    const filter: Record<string, unknown> = {}

    if (search) {
      filter.name = { $regex: search, $options: 'i' }
    }

    // Build sort options
    const sortField = sortBy === 'totalValue'
      ? 'totalValue'
      : sortBy === 'totalContracts'
        ? 'totalContracts'
        : sortBy === 'name'
          ? 'name'
          : 'totalValue'
    const sortDirection = sortOrder === 'desc' ? -1 : 1
    const sortOptions: Record<string, 1 | -1> = { [sortField]: sortDirection as 1 | -1 }

    // Calculate pagination
    const skip = (Number(page) - 1) * Number(limit)

    // Execute query
    const [suppliers, total] = await Promise.all([
      SupplierPatternModel.find(filter)
        .sort(sortOptions)
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      SupplierPatternModel.countDocuments(filter),
    ])

    return {
      success: true,
      data: {
        suppliers,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          totalPages: Math.ceil(total / Number(limit)),
        },
      },
    }
  }
  catch (error) {
    console.error('Error fetching suppliers:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch suppliers',
    })
  }
})
