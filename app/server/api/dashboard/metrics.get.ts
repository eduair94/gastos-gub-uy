import { createError, defineEventHandler } from 'h3'
import { ensureConnection } from '../../utils/database'
import { DashboardMetricsModel, type IDashboardMetrics } from '../../utils/precalculated-models'

export default defineEventHandler(async (_event) => {
  try {
    // Ensure database connection
    await ensureConnection()

    console.log('Fetching pre-calculated dashboard metrics')

    // Get the latest pre-calculated metrics
    const metrics = await DashboardMetricsModel.findOne()
      .sort({ calculatedAt: -1 })
      .lean() as IDashboardMetrics | null

    if (!metrics) {
      throw createError({
        statusCode: 404,
        statusMessage: 'No pre-calculated metrics found. Please run the pre-calculation script first.',
      })
    }

    // Remove MongoDB internal fields and return clean data
    const cleanMetrics = {
      totalContracts: metrics.totalContracts,
      totalSpending: metrics.totalSpending,
      totalSuppliers: metrics.totalSuppliers,
      totalBuyers: metrics.totalBuyers,
      avgContractValue: metrics.avgContractValue,
      currentYearGrowth: metrics.currentYearGrowth,
      recentAnomalies: metrics.recentAnomalies,
      calculatedAt: metrics.calculatedAt,
      dataVersion: metrics.dataVersion,
    }

    return {
      success: true,
      data: cleanMetrics,
    }
  }
  catch (error) {
    console.error('Error fetching dashboard metrics:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch dashboard metrics',
    })
  }
})
