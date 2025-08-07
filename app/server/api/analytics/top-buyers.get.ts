import { createError, defineEventHandler, getQuery } from 'h3'
import { connectToDatabase } from '../../utils/database'
import { TopEntitiesModel } from '../../utils/models'

export default defineEventHandler(async (event) => {
  try {
    await connectToDatabase()

    const query = getQuery(event)
    const { limit = 10, year } = query

    console.log('Fetching pre-calculated top buyers')

    // Build query filter for buyers
    const filter: Record<string, unknown> = {
      entityType: 'buyer',
    }

    if (year) {
      filter.year = Number(year)
    }

    // Get top buyers from pre-calculated data
    const buyers = await TopEntitiesModel.find(filter)
      .sort({ rank: 1 })
      .limit(Number(limit) * 3) // Get more to account for duplicates
      .lean()

    if (!buyers || buyers.length === 0) {
      throw createError({
        statusCode: 404,
        statusMessage: 'No pre-calculated buyer data found. Please run the pre-calculation script first.',
      })
    }

    // Remove duplicates by entityId and keep the best rank
    const uniqueBuyers = new Map()
    buyers.forEach((buyer) => {
      const existingBuyer = uniqueBuyers.get(buyer.entityId)
      if (!existingBuyer || buyer.rank < existingBuyer.rank) {
        uniqueBuyers.set(buyer.entityId, buyer)
      }
    })

    // Convert back to array and sort by rank, then limit
    const filteredBuyers = Array.from(uniqueBuyers.values())
      .sort((a, b) => a.rank - b.rank)
      .slice(0, Number(limit))

    // Format the response to match expected interface
    const formattedBuyers = filteredBuyers.map((buyer, index) => ({
      id: buyer.entityId,
      name: buyer.name,
      totalAmount: buyer.totalAmount,
      transactionCount: buyer.totalContracts,
      totalContracts: buyer.totalContracts,
      avgContractValue: buyer.avgContractValue,
      rank: index + 1, // Re-rank based on filtered order
    }))

    return {
      success: true,
      data: formattedBuyers,
    }
  }
  catch (error) {
    console.error('Error fetching top buyers:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch top buyers',
    })
  }
})
