import mongoose, { Schema } from 'mongoose'

// Dashboard Metrics Pre-calculated Data
export interface IDashboardMetrics {
  _id?: string
  totalContracts: number
  totalSpending: number
  totalSuppliers: number
  totalBuyers: number
  avgContractValue: number
  currentYearGrowth: number
  recentAnomalies: number
  calculatedAt: Date
  dataVersion: string
}

// Spending Trends Pre-calculated Data
export interface ISpendingTrend {
  _id?: string
  year?: number
  month?: number
  date: string
  value: number
  count: number
  groupBy: 'year' | 'month'
  calculatedAt: Date
  dataVersion: string
}

// Top Entities (Suppliers/Buyers) Pre-calculated Data
export interface ITopEntity {
  _id?: string
  entityType: 'supplier' | 'buyer'
  entityId: string
  name: string
  totalAmount: number
  totalContracts: number
  avgContractValue: number
  rank: number
  year?: number
  calculatedAt: Date
  dataVersion: string
}

// Category Distribution Pre-calculated Data
export interface ICategoryDistribution {
  _id?: string
  category: string
  totalAmount: number
  contractCount: number
  percentage: number
  rank: number
  year?: number
  calculatedAt: Date
  dataVersion: string
}

// Dashboard Metrics Schema
const DashboardMetricsSchema = new Schema<IDashboardMetrics>(
  {
    totalContracts: { type: Number, required: true },
    totalSpending: { type: Number, required: true },
    totalSuppliers: { type: Number, required: true },
    totalBuyers: { type: Number, required: true },
    avgContractValue: { type: Number, required: true },
    currentYearGrowth: { type: Number, required: true },
    recentAnomalies: { type: Number, required: true },
    calculatedAt: { type: Date, required: true, default: Date.now },
    dataVersion: { type: String, required: true },
  },
  {
    collection: 'dashboard_metrics',
    timestamps: true,
  },
)

// Spending Trends Schema
const SpendingTrendsSchema = new Schema<ISpendingTrend>(
  {
    year: { type: Number },
    month: { type: Number },
    date: { type: String, required: true },
    value: { type: Number, required: true },
    count: { type: Number, required: true },
    groupBy: { type: String, enum: ['year', 'month'], required: true },
    calculatedAt: { type: Date, required: true, default: Date.now },
    dataVersion: { type: String, required: true },
  },
  {
    collection: 'spending_trends',
    timestamps: true,
  },
)

// Top Entities Schema
const TopEntitiesSchema = new Schema<ITopEntity>(
  {
    entityType: { type: String, enum: ['supplier', 'buyer'], required: true },
    entityId: { type: String, required: true },
    name: { type: String, required: true },
    totalAmount: { type: Number, required: true },
    totalContracts: { type: Number, required: true },
    avgContractValue: { type: Number, required: true },
    rank: { type: Number, required: true },
    year: { type: Number },
    calculatedAt: { type: Date, required: true, default: Date.now },
    dataVersion: { type: String, required: true },
  },
  {
    collection: 'top_entities',
    timestamps: true,
  },
)

// Category Distribution Schema
const CategoryDistributionSchema = new Schema<ICategoryDistribution>(
  {
    category: { type: String, required: true },
    totalAmount: { type: Number, required: true },
    contractCount: { type: Number, required: true },
    percentage: { type: Number, required: true },
    rank: { type: Number, required: true },
    year: { type: Number },
    calculatedAt: { type: Date, required: true, default: Date.now },
    dataVersion: { type: String, required: true },
  },
  {
    collection: 'category_distribution',
    timestamps: true,
  },
)

// Create indexes for performance
DashboardMetricsSchema.index({ dataVersion: 1, calculatedAt: -1 })
SpendingTrendsSchema.index({ groupBy: 1, year: 1, month: 1 })
SpendingTrendsSchema.index({ dataVersion: 1, calculatedAt: -1 })
TopEntitiesSchema.index({ entityType: 1, year: 1, rank: 1 })
TopEntitiesSchema.index({ dataVersion: 1, calculatedAt: -1 })
CategoryDistributionSchema.index({ year: 1, rank: 1 })
CategoryDistributionSchema.index({ dataVersion: 1, calculatedAt: -1 })

// Export models using singleton pattern
export const DashboardMetricsModel = mongoose.model<IDashboardMetrics>('DashboardMetrics', DashboardMetricsSchema)
export const SpendingTrendsModel = mongoose.model<ISpendingTrend>('SpendingTrends', SpendingTrendsSchema)
export const TopEntitiesModel = mongoose.model<ITopEntity>('TopEntities', TopEntitiesSchema)
export const CategoryDistributionModel = mongoose.model<ICategoryDistribution>('CategoryDistribution', CategoryDistributionSchema)
