import { createError, defineEventHandler, getQuery } from 'h3'
import { connectToDatabase } from '../../utils/database'
import { TopEntitiesModel } from '../../utils/precalculated-models'

export default defineEventHandler(async (event) => {
  try {
    await connectToDatabase()

    const query = getQuery(event)
    const { limit = 10, year } = query

    console.log('Fetching pre-calculated top suppliers')

    // Build query filter for suppliers
    const filter: Record<string, unknown> = {
      entityType: 'supplier',
    }

    if (year) {
      filter.year = Number(year)
    }

    // Get top suppliers from pre-calculated data
    const suppliers = await TopEntitiesModel.find(filter)
      .sort({ rank: 1 })
      .limit(Number(limit) * 3) // Get more to account for duplicates
      .lean()

    if (!suppliers || suppliers.length === 0) {
      throw createError({
        statusCode: 404,
        statusMessage: 'No pre-calculated supplier data found. Please run the pre-calculation script first.',
      })
    }

    // Remove duplicates by entityId and keep the best rank
    const uniqueSuppliers = new Map()
    suppliers.forEach((supplier) => {
      const existingSupplier = uniqueSuppliers.get(supplier.entityId)
      if (!existingSupplier || supplier.rank < existingSupplier.rank) {
        uniqueSuppliers.set(supplier.entityId, supplier)
      }
    })

    // Convert back to array and sort by rank, then limit
    const filteredSuppliers = Array.from(uniqueSuppliers.values())
      .sort((a, b) => a.rank - b.rank)
      .slice(0, Number(limit))

    // Format the response to match expected interface
    const formattedSuppliers = filteredSuppliers.map((supplier, index) => ({
      id: supplier.entityId,
      name: supplier.name,
      totalAmount: supplier.totalAmount,
      totalContracts: supplier.totalContracts,
      avgContractValue: supplier.avgContractValue,
      rank: index + 1, // Re-rank based on filtered order
    }))

    return {
      success: true,
      data: formattedSuppliers,
    }
  }
  catch (error) {
    console.error('Error fetching top suppliers:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch top suppliers',
    })
  }
})
