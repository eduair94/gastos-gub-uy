import { createError, defineEventHandler } from 'h3'
import { connectToDatabase } from '../../../utils/database'
import { AnomalyModel } from '../../../utils/models'

export default defineEventHandler(async (_event) => {
  try {
    await connectToDatabase()

    // Get current date for time-based calculations
    const now = new Date()
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

    // Parallel queries for efficiency
    const [
      totalCount,
      criticalCount,
      highCount,
      recentCount,
      severityDistribution,
      typeDistribution,
      dailyTrend,
      confidenceStats,
    ] = await Promise.all([
      // Total anomalies count
      AnomalyModel.countDocuments(),

      // Critical severity count
      AnomalyModel.countDocuments({ severity: 'critical' }),

      // High severity count
      AnomalyModel.countDocuments({ severity: 'high' }),

      // Recent anomalies (last 24 hours)
      AnomalyModel.countDocuments({ createdAt: { $gte: oneDayAgo } }),

      // Severity distribution
      AnomalyModel.aggregate([
        {
          $group: {
            _id: '$severity',
            count: { $sum: 1 },
          },
        },
        {
          $sort: { count: -1 },
        },
      ]),

      // Type distribution
      AnomalyModel.aggregate([
        {
          $group: {
            _id: '$type',
            count: { $sum: 1 },
            avgConfidence: { $avg: '$confidence' },
          },
        },
        {
          $sort: { count: -1 },
        },
      ]),

      // Daily trend (last 7 days)
      AnomalyModel.aggregate([
        {
          $match: {
            createdAt: { $gte: oneWeekAgo },
          },
        },
        {
          $group: {
            _id: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: '$createdAt',
              },
            },
            count: { $sum: 1 },
            criticalCount: {
              $sum: {
                $cond: [{ $eq: ['$severity', 'critical'] }, 1, 0],
              },
            },
          },
        },
        {
          $sort: { _id: 1 },
        },
      ]),

      // Confidence statistics
      AnomalyModel.aggregate([
        {
          $group: {
            _id: null,
            avgConfidence: { $avg: '$confidence' },
            minConfidence: { $min: '$confidence' },
            maxConfidence: { $max: '$confidence' },
            highConfidenceCount: {
              $sum: {
                $cond: [{ $gte: ['$confidence', 0.8] }, 1, 0],
              },
            },
            mediumConfidenceCount: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $gte: ['$confidence', 0.6] },
                      { $lt: ['$confidence', 0.8] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            lowConfidenceCount: {
              $sum: {
                $cond: [{ $lt: ['$confidence', 0.6] }, 1, 0],
              },
            },
          },
        },
      ]),
    ])

    // Calculate week-over-week and month-over-month changes
    const [weeklyChange, monthlyChange] = await Promise.all([
      // Week-over-week change
      Promise.all([
        AnomalyModel.countDocuments({
          createdAt: { $gte: oneWeekAgo },
        }),
        AnomalyModel.countDocuments({
          createdAt: {
            $gte: new Date(oneWeekAgo.getTime() - 7 * 24 * 60 * 60 * 1000),
            $lt: oneWeekAgo,
          },
        }),
      ]).then(([thisWeek, lastWeek]) => {
        if (lastWeek === 0) return thisWeek > 0 ? 100 : 0
        return ((thisWeek - lastWeek) / lastWeek) * 100
      }),

      // Month-over-month change
      Promise.all([
        AnomalyModel.countDocuments({
          createdAt: { $gte: oneMonthAgo },
        }),
        AnomalyModel.countDocuments({
          createdAt: {
            $gte: new Date(oneMonthAgo.getTime() - 30 * 24 * 60 * 60 * 1000),
            $lt: oneMonthAgo,
          },
        }),
      ]).then(([thisMonth, lastMonth]) => {
        if (lastMonth === 0) return thisMonth > 0 ? 100 : 0
        return ((thisMonth - lastMonth) / lastMonth) * 100
      }),
    ])

    return {
      success: true,
      data: {
        summary: {
          total: totalCount,
          critical: criticalCount,
          high: highCount,
          recent: recentCount,
          weeklyChange: Math.round(weeklyChange * 10) / 10,
          monthlyChange: Math.round(monthlyChange * 10) / 10,
        },
        distributions: {
          severity: severityDistribution,
          type: typeDistribution,
        },
        trends: {
          daily: dailyTrend,
        },
        confidence: confidenceStats[0] || {
          avgConfidence: 0,
          minConfidence: 0,
          maxConfidence: 0,
          highConfidenceCount: 0,
          mediumConfidenceCount: 0,
          lowConfidenceCount: 0,
        },
      },
    }
  }
  catch (error) {
    console.error('Error fetching anomaly statistics:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch anomaly statistics',
    })
  }
})
