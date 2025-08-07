import { createError, defineEventHandler, getQuery, getRouterParam } from 'h3'
import type { IBuyerPattern } from '../../../types'
import { BuyerPatternModel } from '../../utils/models'

export default defineEventHandler(async (event) => {
  try {
    const buyerId = getRouterParam(event, 'id')
    const query = getQuery(event)

    // Pagination parameters
    const page = parseInt(query.page as string) || 1
    const limit = parseInt(query.limit as string) || 20

    if (!buyerId) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Buyer ID is required',
      })
    }

    // Get buyer information from BuyerPatternModel (primary source)
    const buyerPattern = await BuyerPatternModel.findOne({ buyerId }).lean() as IBuyerPattern | null

    if (!buyerPattern) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Buyer not found',
      })
    }

    // Calculate analytics from BuyerPattern data and current page contracts
    const spendingByYear: Record<string, number> = {}
    const categoryDistribution: Record<string, number> = {}
    const supplierDistribution: Record<string, number> = {}

    // Calculate first and last contract dates from years array
    const firstYear = Math.min(...buyerPattern.years)
    const lastYear = Math.max(...buyerPattern.years)

    return {
      buyerId: buyerPattern.buyerId,
      name: buyerPattern.name,
      totalContracts: buyerPattern.totalContracts,
      totalSpending: buyerPattern.totalSpending,
      avgContractValue: buyerPattern.avgContractValue,
      yearCount: buyerPattern.yearCount,
      years: buyerPattern.years,
      supplierCount: buyerPattern.supplierCount,
      firstContractDate: `${firstYear}-01-01`,
      lastContractDate: `${lastYear}-12-31`,
      lastUpdated: buyerPattern.lastUpdated,
      pagination: {
        page,
        limit,
        total: buyerPattern.totalContracts,
        hasMore: (page * limit) < buyerPattern.totalContracts,
      },
      analytics: {
        spendingByYear,
        categoryDistribution,
        supplierDistribution,
      },
    }
  }
  catch (error: any) {
    if (error.statusCode) {
      throw error
    }

    console.error('Error fetching buyer details:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Internal server error',
    })
  }
})
