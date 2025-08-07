// Data Models and Types
export interface IRelease {
  _id: string
  initiationType: string
  parties: IParty[]
  tag: string[]
  date: string
  ocid: string
  id: string
  tender?: ITender
  buyer?: IBuyer
  awards?: IAward[]
  sourceFileName?: string
  sourceYear?: number
}

export interface IParty {
  id: string
  roles: string[]
  name: string
  contactPoint?: IContactPoint
}

export interface IContactPoint {
  name?: string
  telephone?: string
  faxNumber?: string
  email?: string
}

export interface IBuyer {
  id: string
  name: string
}

export interface ITender {
  id: string
  hasEnquiries: boolean
  procurementMethodDetails: string
  procurementMethod?: string
  title: string
  description: string
  tenderPeriod: {
    endDate: string
    startDate: string
  }
  procuringEntity: {
    id: string
    name: string
  }
  submissionMethodDetails: string
  items?: ITenderItem[]
  submissionMethod?: string[]
  enquiryPeriod?: {
    startDate: string
    endDate: string
  }
  documents?: ITenderDocument[]
  status?: string
}

export interface ITenderItem {
  id: string
  description: string
  quantity: number
  classification: {
    id: string
    description: string
    scheme: string
  }
  unit: {
    name: string
    id: string
  }
}

export interface ITenderDocument {
  id: string
  documentType: string
  description: string
  datePublished: string
  url: string
  language: string
  format: string
}

export interface IAward {
  id: string
  title: string
  date: string
  status: string
  items: IAwardItem[]
  suppliers: ISupplier[]
  documents?: IAwardDocument[]
}

export interface IAwardItem {
  id: number
  description?: string
  quantity: number
  classification: {
    id: string
    description: string
    scheme: string
  }
  unit: {
    id: string
    name: string
    value?: {
      amount: number
      currency: string
    }
  }
}

export interface ISupplier {
  id: string
  name: string
}

export interface IAwardDocument {
  id: string
  documentType: string
  url: string
  language: string
  datePublished: string
  format: string
}

// Analytics Models
export interface ISupplierPattern {
  _id: string
  supplierId: string
  name: string
  totalContracts: number
  years: number[]
  yearCount: number
  buyers: string[]
  buyerCount: number
  avgContractValue: number
  totalValue: number
  items: IAnalyticsItem[]
  topCategories: IAnalyticsCategory[]
  lastUpdated: string
  createdAt: string
  updatedAt: string
}

export interface IBuyerPattern {
  _id: string
  buyerId: string
  name: string
  totalContracts: number
  years: number[]
  yearCount: number
  suppliers: string[]
  supplierCount: number
  totalSpending: number
  avgContractValue: number
  items: IAnalyticsItem[]
  topCategories: IAnalyticsCategory[]
  lastUpdated: string
  createdAt: string
  updatedAt: string
}

export interface IAnalyticsItem {
  description: string
  category?: string
  totalAmount: number
  totalQuantity: number
  contractCount: number
  avgPrice: number
  currency?: string
  unitName?: string
  date?: string
  sourceFile?: string
  year?: number
}

export interface IAnalyticsCategory {
  category: string
  totalAmount: number
  contractCount: number
}

export interface IExpenseInsight {
  _id: string
  year: number
  month?: number
  totalAmount: number
  totalTransactions: number
  averageAmount: number
  currency: string
  topSuppliers: ITopEntity[]
  topBuyers: ITopEntity[]
  topCategories: ITopCategory[]
  createdAt: string
  updatedAt: string
}

export interface ITopEntity {
  id: string
  name: string
  totalAmount: number
  transactionCount: number
}

export interface ITopCategory {
  description: string
  totalAmount: number
  transactionCount: number
}

export interface IAnomaly {
  _id: string
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
  createdAt: string
  detectedAt?: string
}

// API Response Types
export interface ApiResponse<T> {
  success: boolean
  data: T
  message?: string
  error?: string
}

export interface PaginatedResponse<T> {
  success: boolean
  data: T[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
    hasNext: boolean
    hasPrev: boolean
  }
  message?: string
}

// Dashboard Types
export interface DashboardMetrics {
  totalContracts: number
  totalSpending: number
  totalSuppliers: number
  totalBuyers: number
  avgContractValue: number
  currentYearGrowth: number
  recentAnomalies: number
}

export interface TimeSeriesData {
  date: string
  value: number
  label?: string
}

export interface ChartData {
  labels: string[]
  datasets: ChartDataset[]
}

export interface ChartDataset {
  label: string
  data: number[]
  backgroundColor?: string | string[]
  borderColor?: string | string[]
  borderWidth?: number
  fill?: boolean
}

// Filter Types
export interface ContractFilters {
  search?: string
  dateFrom?: string
  dateTo?: string
  amountFrom?: number
  amountTo?: number
  suppliers?: string[]
  buyers?: string[]
  categories?: string[]
  status?: string[]
  years?: number[]
}

export interface SortOptions {
  field: string
  order: 'asc' | 'desc'
}

export interface PaginationOptions {
  page: number
  limit: number
}

// Navigation Types
export interface NavigationItem {
  title: string
  icon: string
  to?: string
  children?: NavigationItem[]
  exact?: boolean
  disabled?: boolean
}

// Form Types
export interface FormField {
  name: string
  label: string
  type: 'text' | 'number' | 'select' | 'date' | 'autocomplete' | 'textarea'
  required?: boolean
  placeholder?: string
  options?: SelectOption[]
  validation?: ValidationRule[]
}

export interface SelectOption {
  value: string | number
  text: string
  disabled?: boolean
}

export interface ValidationRule {
  type: 'required' | 'min' | 'max' | 'email' | 'pattern'
  value?: number | string
  message: string
}

// State Management Types
export interface RootState {
  dashboard: DashboardState
  contracts: ContractsState
  suppliers: SuppliersState
  buyers: BuyersState
  ui: UIState
}

export interface DashboardState {
  metrics: DashboardMetrics | null
  timeSeriesData: TimeSeriesData[]
  loading: boolean
  error: string | null
}

export interface ContractsState {
  contracts: IRelease[]
  selectedContract: IRelease | null
  filters: ContractFilters
  pagination: PaginationOptions
  totalCount: number
  loading: boolean
  error: string | null
}

export interface SuppliersState {
  suppliers: ISupplierPattern[]
  selectedSupplier: ISupplierPattern | null
  pagination: PaginationOptions
  totalCount: number
  loading: boolean
  error: string | null
}

export interface BuyersState {
  buyers: IBuyerPattern[]
  selectedBuyer: IBuyerPattern | null
  pagination: PaginationOptions
  totalCount: number
  loading: boolean
  error: string | null
}

export interface UIState {
  theme: 'light' | 'dark'
  navigationDrawer: boolean
  loading: boolean
  notifications: Notification[]
}

export interface Notification {
  id: string
  type: 'success' | 'error' | 'warning' | 'info'
  title: string
  message: string
  timeout?: number
  persistent?: boolean
}

// Utility Types
export type DateString = string
export type CurrencyCode = 'UYU' | 'USD'
export type Timestamp = string | Date
