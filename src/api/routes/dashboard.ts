import { Router } from 'express'
import { AnomalyModel, BuyerPatternModel, SupplierPatternModel } from '../../database/analytics-models'
import { ReleaseModel } from '../../database/release-model'
import { Logger } from '../../services/logger-service'

const router = Router()
const logger = new Logger()

// GET /api/dashboard/metrics
router.get('/metrics', async (req, res) => {
  try {
    logger.info('Fetching dashboard metrics')

    const [
      totalContracts,
      totalSuppliers,
      totalBuyers,
      totalSpendingResult,
      avgContractResult
    ] = await Promise.all([
      ReleaseModel.countDocuments(),
      SupplierPatternModel.countDocuments(),
      BuyerPatternModel.countDocuments(),
      ReleaseModel.aggregate([
        { $unwind: '$awards' },
        { $unwind: '$awards.items' },
        {
          $group: {
            _id: null,
            totalSpending: { $sum: '$awards.items.unit.value.amount' }
          }
        }
      ]),
      ReleaseModel.aggregate([
        { $unwind: '$awards' },
        { $unwind: '$awards.items' },
        {
          $group: {
            _id: null,
            avgAmount: { $avg: '$awards.items.unit.value.amount' }
          }
        }
      ])
    ])

    const totalSpending = totalSpendingResult[0]?.totalSpending || 0
    const avgContractValue = avgContractResult[0]?.avgAmount || 0

    // Calculate year-over-year growth (simplified)
    const currentYear = new Date().getFullYear()
    const currentYearSpending = await ReleaseModel.aggregate([
      {
        $match: {
          sourceYear: currentYear
        }
      },
      { $unwind: '$awards' },
      { $unwind: '$awards.items' },
      {
        $group: {
          _id: null,
          totalSpending: { $sum: '$awards.items.unit.value.amount' }
        }
      }
    ])

    const previousYearSpending = await ReleaseModel.aggregate([
      {
        $match: {
          sourceYear: currentYear - 1
        }
      },
      { $unwind: '$awards' },
      { $unwind: '$awards.items' },
      {
        $group: {
          _id: null,
          totalSpending: { $sum: '$awards.items.unit.value.amount' }
        }
      }
    ])

    const currentYearTotal = currentYearSpending[0]?.totalSpending || 0
    const previousYearTotal = previousYearSpending[0]?.totalSpending || 0
    const currentYearGrowth = previousYearTotal > 0 
      ? ((currentYearTotal - previousYearTotal) / previousYearTotal) * 100 
      : 0

    // Count recent anomalies
    const recentAnomalies = await AnomalyModel.countDocuments({
      createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } // Last 30 days
    })

    const metrics = {
      totalContracts,
      totalSpending,
      totalSuppliers,
      totalBuyers,
      avgContractValue,
      currentYearGrowth,
      recentAnomalies
    }

    res.json({
      success: true,
      data: metrics
    })

  } catch (error) {
    logger.error('Error fetching dashboard metrics:', error as Error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch dashboard metrics'
    })
  }
})

// GET /api/dashboard/spending-trends
router.get('/spending-trends', async (req, res) => {
  try {
    const { years, groupBy = 'year' } = req.query

    let matchStage: any = {}
    if (years) {
      const yearArray = Array.isArray(years) ? years.map(Number) : [Number(years)]
      matchStage.sourceYear = { $in: yearArray }
    }

    const pipeline = [
      { $match: matchStage },
      { $unwind: '$awards' },
      { $unwind: '$awards.items' },
      {
        $addFields: {
          year: '$sourceYear',
          month: { $month: { $dateFromString: { dateString: '$date' } } }
        }
      }
    ]

    // Group by year or month
    if (groupBy === 'month') {
      pipeline.push({
        $group: {
          _id: {
            year: '$year',
            month: '$month'
          },
          value: { $sum: '$awards.items.unit.value.amount' },
          count: { $sum: 1 }
        }
      })
      pipeline.push({
        $project: {
          _id: 0,
          date: {
            $dateToString: {
              format: '%Y-%m-01',
              date: {
                $dateFromParts: {
                  year: '$_id.year',
                  month: '$_id.month',
                  day: 1
                }
              }
            }
          },
          value: 1,
          count: 1
        }
      })
    } else {
      pipeline.push({
        $group: {
          _id: '$year',
          value: { $sum: '$awards.items.unit.value.amount' },
          count: { $sum: 1 }
        }
      })
      pipeline.push({
        $project: {
          _id: 0,
          date: { $concat: [{ $toString: '$_id' }, '-01-01'] },
          value: 1,
          count: 1
        }
      })
    }

    pipeline.push({ $sort: { date: 1 } })

    const trends = await ReleaseModel.aggregate(pipeline)

    res.json({
      success: true,
      data: trends
    })

  } catch (error) {
    logger.error('Error fetching spending trends:', error as Error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch spending trends'
    })
  }
})

export default router
