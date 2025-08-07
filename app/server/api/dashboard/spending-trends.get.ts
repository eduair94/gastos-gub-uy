import { createError, defineEventHandler, getQuery } from 'h3'
import { connectToDatabase } from '../../utils/database'
import { SpendingTrendsModel } from '../../utils/precalculated-models'

export default defineEventHandler(async (event) => {
  try {
    // Connect to database
    await connectToDatabase()

    const query = getQuery(event)
    const { years, groupBy = 'year' } = query

    console.log('Fetching pre-calculated spending trends')

    // Build query filter
    const filter: Record<string, any> = {
      groupBy: groupBy,
    }

    // Filter by years if specified
    if (years) {
      const yearArray = Array.isArray(years) ? years.map(Number) : [Number(years)]
      filter.year = { $in: yearArray }
    }

    // Get the latest pre-calculated spending trends
    const spendingTrends = await SpendingTrendsModel.find(filter)
      .sort({ date: 1 })
      .lean()

    if (!spendingTrends || spendingTrends.length === 0) {
      throw createError({
        statusCode: 404,
        statusMessage: 'No pre-calculated spending trends found. Please run the pre-calculation script first.',
      })
    }

    // Transform data to match the expected format
    const data = spendingTrends.map(trend => ({
      date: trend.date,
      value: trend.value,
      count: trend.count,
    }))

    return {
      success: true,
      data,
    }
  }
  catch (error) {
    console.error('Error fetching spending trends:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch spending trends',
    })
  }
})
