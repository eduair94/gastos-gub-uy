import { createError, defineEventHandler, getQuery } from 'h3'
import { connectToDatabase } from '../../utils/database'
import { BuyerPatternModel } from '../../utils/models'

export default defineEventHandler(async (event) => {
  try {
    await connectToDatabase()

    const query = getQuery(event)
    const {
      page = 1,
      limit = 20,
      search,
      sortBy = 'totalSpending',
      sortOrder = 'desc',
    } = query

    // Build query filter
    const filter: Record<string, unknown> = {}

    if (search) {
      filter.name = { $regex: search, $options: 'i' }
    }

    // Build sort options
    const sortField = sortBy === 'totalSpending'
      ? 'totalSpending'
      : sortBy === 'totalContracts'
        ? 'totalContracts'
        : sortBy === 'name'
          ? 'name'
          : 'totalSpending'
    const sortDirection = sortOrder === 'asc' ? 1 : 1
    const sortOptions: Record<string, 1 | -1> = { [sortField]: sortDirection as 1 | -1 }

    // Calculate pagination
    const skip = (Number(page) - 1) * Number(limit)

    // Execute query
    const [buyers, total] = await Promise.all([
      BuyerPatternModel.find(filter)
        .sort(sortOptions)
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      BuyerPatternModel.countDocuments(filter),
    ])

    return {
      success: true,
      data: {
        buyers,
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
    console.error('Error fetching buyers:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch buyers',
    })
  }
})
