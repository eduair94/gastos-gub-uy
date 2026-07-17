import { createError, defineEventHandler, getQuery } from 'h3'
import { connectToDatabase } from '../../utils/database'
import { TopEntitiesModel } from '../../utils/models'

export default defineEventHandler(async (event) => {
  try {
    await connectToDatabase()

    const query = getQuery(event)
    const { limit = 10, year } = query

    console.log('Fetching pre-calculated top suppliers')

    // Build query filter for suppliers.
    //
    // top_entities holds two families of rows: the all-time ranking (no `year` field) and a
    // per-year ranking for every year in the data (`year` set). Both rank from 1, so they are
    // separate scales and must never be mixed. Without the `$exists: false` branch a year-less
    // request matched BOTH, and the de-dupe below — which keeps the lowest rank number — would
    // let a supplier that placed #1 in some quiet year outrank one that is #2 of all time.
    // Live symptom before this fix: rank 2 at 4.95B UYU sitting above rank 3 at 19.0B.
    const filter: Record<string, unknown> = {
      entityType: 'supplier',
      year: year ? Number(year) : { $exists: false },
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
      transactionCount: supplier.totalContracts,
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
