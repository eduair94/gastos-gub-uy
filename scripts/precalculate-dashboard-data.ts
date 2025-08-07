#!/usr/bin/env tsx

import { connectToDatabase } from '../app/server/utils/database'
import {
  AnomalyModel,
  BuyerPatternModel,
  ReleaseModel,
  SupplierPatternModel
} from '../app/server/utils/models'
import {
  CategoryDistributionModel,
  DashboardMetricsModel,
  SpendingTrendsModel,
  TopEntitiesModel,
  type ICategoryDistribution,
  type IDashboardMetrics,
  type ISpendingTrend,
  type ITopEntity,
} from '../app/server/utils/precalculated-models'

class DashboardDataPreCalculator {
  private dataVersion: string

  constructor() {
    this.dataVersion = `v${Date.now()}`
  }

  async connectToDatabase() {
    try {
      await connectToDatabase()
      console.log('✓ Connected to MongoDB')
    } catch (error) {
      console.error('❌ Failed to connect to MongoDB:', error)
      process.exit(1)
    }
  }

  async calculateDashboardMetrics(): Promise<IDashboardMetrics> {
    console.log('📊 Calculating dashboard metrics...')

    const [
      totalContracts,
      totalSuppliers,
      totalBuyers,
      totalSpendingResult,
      avgContractResult,
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
            totalSpending: { $sum: '$awards.items.unit.value.amount' },
          },
        },
      ]),
      ReleaseModel.aggregate([
        { $unwind: '$awards' },
        { $unwind: '$awards.items' },
        {
          $group: {
            _id: null,
            avgAmount: { $avg: '$awards.items.unit.value.amount' },
          },
        },
      ]),
    ])

    const totalSpending = totalSpendingResult[0]?.totalSpending || 0
    const avgContractValue = avgContractResult[0]?.avgAmount || 0

    // Calculate year-over-year growth
    const currentYear = new Date().getFullYear()
    const [currentYearSpending, previousYearSpending] = await Promise.all([
      ReleaseModel.aggregate([
        { $match: { sourceYear: currentYear } },
        { $unwind: '$awards' },
        { $unwind: '$awards.items' },
        {
          $group: {
            _id: null,
            totalSpending: { $sum: '$awards.items.unit.value.amount' },
          },
        },
      ]),
      ReleaseModel.aggregate([
        { $match: { sourceYear: currentYear - 1 } },
        { $unwind: '$awards' },
        { $unwind: '$awards.items' },
        {
          $group: {
            _id: null,
            totalSpending: { $sum: '$awards.items.unit.value.amount' },
          },
        },
      ]),
    ])

    const currentYearTotal = currentYearSpending[0]?.totalSpending || 0
    const previousYearTotal = previousYearSpending[0]?.totalSpending || 0
    const currentYearGrowth = previousYearTotal > 0
      ? ((currentYearTotal - previousYearTotal) / previousYearTotal) * 100
      : 0

    // Count recent anomalies
    const recentAnomalies = await AnomalyModel.countDocuments({
      createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
    })

    const metrics: IDashboardMetrics = {
      totalContracts,
      totalSpending,
      totalSuppliers,
      totalBuyers,
      avgContractValue,
      currentYearGrowth,
      recentAnomalies,
      calculatedAt: new Date(),
      dataVersion: this.dataVersion,
    }

    console.log(`✓ Dashboard metrics calculated:`, {
      totalContracts,
      totalSpending: Math.round(totalSpending / 1000000) + 'M',
      currentYearGrowth: Math.round(currentYearGrowth * 100) / 100,
    })

    return metrics
  }

  async calculateSpendingTrends(): Promise<ISpendingTrend[]> {
    console.log('📈 Calculating spending trends...')

    const trends: ISpendingTrend[] = []

    // Calculate yearly trends
    const yearlyTrends = await ReleaseModel.aggregate([
      { $unwind: '$awards' },
      { $unwind: '$awards.items' },
      {
        $addFields: {
          year: '$sourceYear',
        },
      },
      {
        $group: {
          _id: '$year',
          value: { $sum: '$awards.items.unit.value.amount' },
          count: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          year: '$_id',
          date: { $concat: [{ $toString: '$_id' }, '-01-01'] },
          value: 1,
          count: 1,
        },
      },
      { $sort: { year: 1 } },
    ])

    for (const trend of yearlyTrends) {
      trends.push({
        year: trend.year,
        date: trend.date,
        value: trend.value,
        count: trend.count,
        groupBy: 'year',
        calculatedAt: new Date(),
        dataVersion: this.dataVersion,
      })
    }

    // Calculate monthly trends for the last 2 years
    const twoYearsAgo = new Date().getFullYear() - 2
    const monthlyTrends = await ReleaseModel.aggregate([
      { $match: { sourceYear: { $gte: twoYearsAgo } } },
      { $unwind: '$awards' },
      { $unwind: '$awards.items' },
      {
        $addFields: {
          year: '$sourceYear',
          month: { $month: { $dateFromString: { dateString: '$date' } } },
        },
      },
      {
        $group: {
          _id: {
            year: '$year',
            month: '$month',
          },
          value: { $sum: '$awards.items.unit.value.amount' },
          count: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          year: '$_id.year',
          month: '$_id.month',
          date: {
            $dateToString: {
              format: '%Y-%m-01',
              date: {
                $dateFromParts: {
                  year: '$_id.year',
                  month: '$_id.month',
                  day: 1,
                },
              },
            },
          },
          value: 1,
          count: 1,
        },
      },
      { $sort: { year: 1, month: 1 } },
    ])

    for (const trend of monthlyTrends) {
      trends.push({
        year: trend.year,
        month: trend.month,
        date: trend.date,
        value: trend.value,
        count: trend.count,
        groupBy: 'month',
        calculatedAt: new Date(),
        dataVersion: this.dataVersion,
      })
    }

    console.log(`✓ Calculated ${trends.length} spending trend records`)
    return trends
  }

  async calculateTopEntities(): Promise<ITopEntity[]> {
    console.log('🏆 Calculating top entities...')

    const entities: ITopEntity[] = []

    // Top suppliers overall
    const topSuppliers = await SupplierPatternModel.find({})
      .sort({ totalValue: -1 })
      .limit(50)
      .select('supplierId name totalContracts totalValue avgContractValue')
      .lean()

    topSuppliers.forEach((supplier, index) => {
      entities.push({
        entityType: 'supplier',
        entityId: supplier.supplierId,
        name: supplier.name,
        totalAmount: supplier.totalValue,
        totalContracts: supplier.totalContracts,
        avgContractValue: supplier.avgContractValue,
        rank: index + 1,
        calculatedAt: new Date(),
        dataVersion: this.dataVersion,
      })
    })

    // Top buyers overall
    const topBuyers = await BuyerPatternModel.find({})
      .sort({ totalSpending: -1 })
      .limit(50)
      .select('buyerId name totalContracts totalSpending avgContractValue')
      .lean()

    topBuyers.forEach((buyer, index) => {
      entities.push({
        entityType: 'buyer',
        entityId: buyer.buyerId,
        name: buyer.name,
        totalAmount: buyer.totalSpending,
        totalContracts: buyer.totalContracts,
        avgContractValue: buyer.avgContractValue,
        rank: index + 1,
        calculatedAt: new Date(),
        dataVersion: this.dataVersion,
      })
    })

    // Top suppliers by recent years
    const recentYears = [2023, 2024, 2025]
    for (const year of recentYears) {
      const yearlyTopSuppliers = await SupplierPatternModel.find({
        years: { $in: [year] },
      })
        .sort({ totalValue: -1 })
        .limit(20)
        .select('supplierId name totalContracts totalValue avgContractValue')
        .lean()

      yearlyTopSuppliers.forEach((supplier, index) => {
        entities.push({
          entityType: 'supplier',
          entityId: supplier.supplierId,
          name: supplier.name,
          totalAmount: supplier.totalValue,
          totalContracts: supplier.totalContracts,
          avgContractValue: supplier.avgContractValue,
          rank: index + 1,
          year,
          calculatedAt: new Date(),
          dataVersion: this.dataVersion,
        })
      })

      const yearlyTopBuyers = await BuyerPatternModel.find({
        years: { $in: [year] },
      })
        .sort({ totalSpending: -1 })
        .limit(20)
        .select('buyerId name totalContracts totalSpending avgContractValue')
        .lean()

      yearlyTopBuyers.forEach((buyer, index) => {
        entities.push({
          entityType: 'buyer',
          entityId: buyer.buyerId,
          name: buyer.name,
          totalAmount: buyer.totalSpending,
          totalContracts: buyer.totalContracts,
          avgContractValue: buyer.avgContractValue,
          rank: index + 1,
          year,
          calculatedAt: new Date(),
          dataVersion: this.dataVersion,
        })
      })
    }

    console.log(`✓ Calculated ${entities.length} top entity records`)
    return entities
  }

  async calculateCategoryDistribution(): Promise<ICategoryDistribution[]> {
    console.log('🏷️ Calculating category distribution...')

    const categories: ICategoryDistribution[] = []

    // Overall category distribution
    const overallCategories = await ReleaseModel.aggregate([
      { $unwind: '$awards' },
      { $unwind: '$awards.items' },
      {
        $group: {
          _id: '$awards.items.classification.description',
          totalAmount: { $sum: '$awards.items.unit.value.amount' },
          contractCount: { $sum: 1 },
        },
      },
      { $sort: { totalAmount: -1 } },
      { $limit: 30 },
    ])

    const totalOverallAmount = overallCategories.reduce((sum, cat) => sum + cat.totalAmount, 0)

    overallCategories.forEach((category, index) => {
      categories.push({
        category: category._id || 'Unknown',
        totalAmount: category.totalAmount,
        contractCount: category.contractCount,
        percentage: (category.totalAmount / totalOverallAmount) * 100,
        rank: index + 1,
        calculatedAt: new Date(),
        dataVersion: this.dataVersion,
      })
    })

    // Category distribution by recent years
    const recentYears = [2023, 2024, 2025]
    for (const year of recentYears) {
      const yearlyCategories = await ReleaseModel.aggregate([
        { $match: { sourceYear: year } },
        { $unwind: '$awards' },
        { $unwind: '$awards.items' },
        {
          $group: {
            _id: '$awards.items.classification.description',
            totalAmount: { $sum: '$awards.items.unit.value.amount' },
            contractCount: { $sum: 1 },
          },
        },
        { $sort: { totalAmount: -1 } },
        { $limit: 20 },
      ])

      const totalYearlyAmount = yearlyCategories.reduce((sum, cat) => sum + cat.totalAmount, 0)

      yearlyCategories.forEach((category, index) => {
        categories.push({
          category: category._id || 'Unknown',
          totalAmount: category.totalAmount,
          contractCount: category.contractCount,
          percentage: totalYearlyAmount > 0 ? (category.totalAmount / totalYearlyAmount) * 100 : 0,
          rank: index + 1,
          year,
          calculatedAt: new Date(),
          dataVersion: this.dataVersion,
        })
      })
    }

    console.log(`✓ Calculated ${categories.length} category distribution records`)
    return categories
  }

  async clearOldData(): Promise<void> {
    console.log('🧹 Clearing old pre-calculated data...')

    await Promise.all([
      DashboardMetricsModel.deleteMany({}),
      SpendingTrendsModel.deleteMany({}),
      TopEntitiesModel.deleteMany({}),
      CategoryDistributionModel.deleteMany({}),
    ])

    console.log('✓ Old data cleared')
  }

  async saveData(
    metrics: IDashboardMetrics,
    trends: ISpendingTrend[],
    entities: ITopEntity[],
    categories: ICategoryDistribution[]
  ): Promise<void> {
    console.log('💾 Saving pre-calculated data to MongoDB...')

    await Promise.all([
      DashboardMetricsModel.create(metrics),
      SpendingTrendsModel.insertMany(trends),
      TopEntitiesModel.insertMany(entities),
      CategoryDistributionModel.insertMany(categories),
    ])

    console.log('✓ All data saved successfully')
  }

  async generateDashboardData(): Promise<void> {
    console.log('🚀 Starting dashboard data pre-calculation...')
    const startTime = Date.now()

    try {
      await this.connectToDatabase()

      console.log(`📋 Data version: ${this.dataVersion}`)

      // Clear old data
      await this.clearOldData()

      // Calculate all data
      const [metrics, trends, entities, categories] = await Promise.all([
        this.calculateDashboardMetrics(),
        this.calculateSpendingTrends(),
        this.calculateTopEntities(),
        this.calculateCategoryDistribution(),
      ])

      // Save all data
      await this.saveData(metrics, trends, entities, categories)

      const duration = ((Date.now() - startTime) / 1000).toFixed(2)
      console.log(`🎉 Dashboard data pre-calculation completed in ${duration}s`)
      console.log(`📊 Summary:`)
      console.log(`   - Dashboard metrics: 1 record`)
      console.log(`   - Spending trends: ${trends.length} records`)
      console.log(`   - Top entities: ${entities.length} records`)
      console.log(`   - Category distribution: ${categories.length} records`)
      console.log(`   - Data version: ${this.dataVersion}`)

    } catch (error) {
      console.error('❌ Error during pre-calculation:', error)
      process.exit(1)
    }
  }
}

// Run the script if executed directly
if (require.main === module) {
  const calculator = new DashboardDataPreCalculator()
  calculator.generateDashboardData()
    .then(() => {
      console.log('✅ Pre-calculation script completed successfully')
      process.exit(0)
    })
    .catch((error) => {
      console.error('❌ Pre-calculation script failed:', error)
      process.exit(1)
    })
}

export { DashboardDataPreCalculator }
