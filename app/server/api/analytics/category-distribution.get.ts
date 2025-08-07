import { createError, defineEventHandler, getQuery } from 'h3'
import { connectToDatabase } from '../../utils/database'
import { CategoryDistributionModel } from '../../utils/models'

export default defineEventHandler(async (event) => {
  try {
    await connectToDatabase()

    const query = getQuery(event)
    const { year, limit = 15 } = query

    console.log('Fetching pre-calculated category distribution')

    // Build query filter
    const filter: Record<string, unknown> = {}

    if (year) {
      filter.year = Number(year)
    }

    // Get category distribution from pre-calculated data
    const categories = await CategoryDistributionModel.find(filter)
      .sort({ rank: 1 })
      .limit(Number(limit) * 2) // Get more to account for duplicates
      .lean()

    if (!categories || categories.length === 0) {
      throw createError({
        statusCode: 404,
        statusMessage: 'No pre-calculated category distribution data found. Please run the pre-calculation script first.',
      })
    }

    // Remove duplicates by category name and keep the best rank
    const uniqueCategories = new Map()
    categories.forEach((category) => {
      const existingCategory = uniqueCategories.get(category.category)
      if (!existingCategory || category.rank < existingCategory.rank) {
        uniqueCategories.set(category.category, category)
      }
    })

    // Convert back to array and sort by rank, then limit
    const filteredCategories = Array.from(uniqueCategories.values())
      .sort((a, b) => a.rank - b.rank)
      .slice(0, Number(limit))

    // Format the response to match expected interface
    const formattedCategories = filteredCategories.map((category, index) => ({
      category: category.category,
      description: category.category,
      totalAmount: category.totalAmount,
      contractCount: category.contractCount,
      percentage: category.percentage,
      rank: index + 1, // Re-rank based on filtered order
    }))

    return {
      success: true,
      data: formattedCategories,
    }
  }
  catch (error) {
    console.error('Error fetching category distribution:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch category distribution',
    })
  }
})
