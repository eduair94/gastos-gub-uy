// Shared database model interfaces for both root and app
import type { Document } from 'mongoose'

export interface IExpenseInsight extends Document {
  year: number
  month?: number
  totalAmount: number
  totalTransactions: number
  averageAmount: number
  currency: string
  topSuppliers: Array<{
    id: string
    name: string
    totalAmount: number
    transactionCount: number
  }>
  topBuyers: Array<{
    id: string
    name: string
    totalAmount: number
    transactionCount: number
  }>
  topCategories: Array<{
    description: string
    totalAmount: number
    transactionCount: number
  }>
  createdAt: Date
  updatedAt: Date
}

export interface ISupplierPattern extends Document {
  supplierId: string
  name: string
  totalContracts: number
  years: number[]
  yearCount: number
  buyers: string[]
  buyerCount: number
  avgContractValue: number
  totalValue: number
  items: Array<{
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
  }>
  topCategories: Array<{
    category: string
    totalAmount: number
    contractCount: number
  }>
  lastUpdated: Date
  createdAt: Date
  updatedAt: Date
}

export interface IBuyerPattern extends Document {
  buyerId: string
  name: string
  totalContracts: number
  years: number[]
  yearCount: number
  suppliers: string[]
  supplierCount: number
  totalSpending: number
  avgContractValue: number
  items: Array<{
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
  }>
  topCategories: Array<{
    category: string
    totalAmount: number
    contractCount: number
  }>
  lastUpdated: Date
  createdAt: Date
  updatedAt: Date
}

export interface IAnomaly extends Document {
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
  confidence: number // 0-1
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

export interface IContactPoint {
  name?: string
  telephone?: string
  faxNumber?: string
  email?: string
}

export interface IParty {
  id: string
  roles: string[]
  name: string
  contactPoint?: IContactPoint
}

export interface IBuyer {
  id: string
  name: string
  roles: string[]
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
  datePublished: Date
  url: string
  language: string
  format: string
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
  roles: string[]
}

export interface IAwardDocument {
  id: string
  documentType: string;
  description?:string;
  url: string
  language: string
  datePublished: Date
  format: string
}

export interface IAward {
  id: string
  title: string
  date: Date
  status: string
  items: IAwardItem[]
  suppliers: ISupplier[]
  documents?: IAwardDocument[]
}

export interface ITender {
  id: string
  hasEnquiries: boolean
  procurementMethodDetails: string
  procurementMethod?: string
  title: string
  description: string
  tenderPeriod: {
    endDate: Date
    startDate: Date
  }
  procuringEntity: {
    id: string
    name: string
  }
  submissionMethodDetails: string
  items?: ITenderItem[]
  submissionMethod?: string[]
  enquiryPeriod?: {
    startDate: Date
    endDate: Date
  }
  documents?: ITenderDocument[]
  status?: string
}

export interface IRelease extends Document {
  initiationType: string
  parties: IParty[]
  tag: string[]
  date: Date
  ocid: string
  id: string
  tender?: ITender
  buyer?: IBuyer
  supplier?: ISupplier,
  awards?: IAward[]
  // Metadata fields for tracking data source
  sourceFileName?: string
  sourceYear?: number
}

export interface IFilterData {
  _id?: string
  type: 'years' | 'statuses' | 'procurementMethods' | 'suppliers' | 'buyers'
  data: Array<{
    value: string | number
    label: string
    count: number
  }>
  lastUpdated: Date
  generatedFromReleases: number
}
