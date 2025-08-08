export * from './database'

// API Response Types
export interface ApiResponse<T = any> {
  success: boolean
  data: T
  message?: string
  error?: string
}

export interface PaginatedResponse<T = any> {
  success: boolean
  data: T[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
    hasNextPage: boolean
    hasPrevPage: boolean
  }
  message?: string
  error?: string
}

export interface NavigationItem {
  title: string
  icon: string
  to: string
  exact?: boolean
  disabled?: boolean
  external?: boolean
}

export interface Notification {
  id: string
  title: string
  message: string
  type: 'success' | 'error' | 'warning' | 'info'
  timeout?: number
  persistent?: boolean
}

export interface DashboardMetrics {
  totalContracts: number
  totalSpending: number
  totalSuppliers: number
  totalBuyers: number
  avgContractValue: number
  currentYearGrowth: number
  recentAnomalies: number
  calculatedAt?: Date
  dataVersion?: string
}

export interface TimeSeriesData {
  date: string
  value: number
  count: number
}

export interface ITopEntity {
  entityId: string
  name: string
  totalAmount: number
  totalContracts: number
  avgContractValue: number
  rank: number
}

export interface ITopCategory {
  category: string
  description?: string
  totalAmount: number
  contractCount: number
  percentage: number
  rank: number
}

export interface IAnomaly {
  type: 'price_spike' | 'unusual_supplier' | 'high_frequency' | 'suspicious_amount' | 'outlier_quantity'
  severity: 'low' | 'medium' | 'high' | 'critical'
  releaseId: string
  awardId?: string
  description: string
  detectedValue: number
  expectedRange: {
    min: number
    max: number
  }
  confidence: number
  metadata: {
    supplierName?: string
    buyerName?: string
    itemDescription?: string
    year?: number
    amount?: number
    currency?: string
    sourceFileName?: string
  }
  createdAt: Date
  detectedAt?: Date
}
