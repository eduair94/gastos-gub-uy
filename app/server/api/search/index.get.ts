import { createError, defineEventHandler, getQuery } from 'h3'
import { connectToDatabase } from '../../utils/database'
import { BuyerPatternModel, ReleaseModel, SupplierPatternModel } from '../../utils/models'

export default defineEventHandler(async (event) => {
  try {
    await connectToDatabase()

    const query = getQuery(event)
    const { q, type = 'all', limit = 10 } = query

    if (!q) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Search query is required',
      })
    }

    const searchRegex = { $regex: q, $options: 'i' }
    const results: Record<string, unknown> = {}

    // Search contracts
    if (type === 'all' || type === 'contracts') {
      const contracts = await ReleaseModel.find({
        $or: [
          { 'tender.title': searchRegex },
          { 'tender.description': searchRegex },
          { 'buyer.name': searchRegex },
          { ocid: searchRegex },
        ],
      })
        .limit(Number(limit))
        .select('ocid tender.title buyer.name date')
        .lean()

      results.contracts = contracts
    }

    // Search suppliers
    if (type === 'all' || type === 'suppliers') {
      const suppliers = await SupplierPatternModel.find({
        name: searchRegex,
      })
        .limit(Number(limit))
        .select('supplierId name totalContracts totalValue')
        .lean()

      results.suppliers = suppliers
    }

    // Search buyers
    if (type === 'all' || type === 'buyers') {
      const buyers = await BuyerPatternModel.find({
        name: searchRegex,
      })
        .limit(Number(limit))
        .select('buyerId name totalContracts totalSpending')
        .lean()

      results.buyers = buyers
    }

    return {
      success: true,
      data: results,
    }
  }
  catch (error) {
    console.error('Error performing search:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Search failed',
    })
  }
})
