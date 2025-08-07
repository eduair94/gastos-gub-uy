import mongoose, { Schema } from 'mongoose'
import paginate from 'mongoose-paginate-v2'
import type {
    IAnomaly,
    IAward,
    IAwardDocument,
    IAwardItem,
    IBuyer,
    IBuyerPattern,
    IContactPoint,
    IExpenseInsight,
    IFilterData,
    IParty,
    IRelease,
    ISupplier,
    ISupplierPattern,
    ITender,
    ITenderDocument,
    ITenderItem,
} from '../types/database'

// Expense Insights Schema
const ExpenseInsightSchema = new Schema<IExpenseInsight>(
  {
    year: { type: Number, required: true },
    month: { type: Number },
    totalAmount: { type: Number, required: true },
    totalTransactions: { type: Number, required: true },
    averageAmount: { type: Number, required: true },
    currency: { type: String, required: true },
    topSuppliers: [
      {
        id: { type: String, required: true },
        name: { type: String, required: true },
        totalAmount: { type: Number, required: true },
        transactionCount: { type: Number, required: true },
      },
    ],
    topBuyers: [
      {
        id: { type: String, required: true },
        name: { type: String, required: true },
        totalAmount: { type: Number, required: true },
        transactionCount: { type: Number, required: true },
      },
    ],
    topCategories: [
      {
        description: { type: String, required: true },
        totalAmount: { type: Number, required: true },
        transactionCount: { type: Number, required: true },
      },
    ],
  },
  {
    timestamps: true,
    collection: 'expense_insights',
  },
)

// Supplier Pattern Schema
const SupplierPatternSchema = new Schema<ISupplierPattern>(
  {
    supplierId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    totalContracts: { type: Number, required: true, default: 0 },
    years: [{ type: Number }],
    yearCount: { type: Number, required: true, default: 0 },
    buyers: [{ type: String }],
    buyerCount: { type: Number, required: true, default: 0 },
    avgContractValue: { type: Number, required: true, default: 0 },
    totalValue: { type: Number, required: true, default: 0 },
    items: [
      {
        description: { type: String, required: true },
        category: { type: String },
        totalAmount: { type: Number, required: true, default: 0 },
        totalQuantity: { type: Number, required: true, default: 0 },
        contractCount: { type: Number, required: true, default: 0 },
        avgPrice: { type: Number, required: true, default: 0 },
        currency: { type: String },
        unitName: { type: String },
        date: { type: String },
        sourceFile: { type: String },
        year: { type: Number },
      },
    ],
    topCategories: [
      {
        category: { type: String, required: true },
        totalAmount: { type: Number, required: true, default: 0 },
        contractCount: { type: Number, required: true, default: 0 },
      },
    ],
    lastUpdated: { type: Date, required: true, default: Date.now },
  },
  {
    timestamps: true,
    collection: 'supplier_patterns',
  },
)

// Buyer Pattern Schema
const BuyerPatternSchema = new Schema<IBuyerPattern>(
  {
    buyerId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    totalContracts: { type: Number, required: true, default: 0 },
    years: [{ type: Number }],
    yearCount: { type: Number, required: true, default: 0 },
    suppliers: [{ type: String }],
    supplierCount: { type: Number, required: true, default: 0 },
    totalSpending: { type: Number, required: true, default: 0 },
    avgContractValue: { type: Number, required: true, default: 0 },
    items: [
      {
        description: { type: String, required: true },
        category: { type: String },
        totalAmount: { type: Number, required: true, default: 0 },
        totalQuantity: { type: Number, required: true, default: 0 },
        contractCount: { type: Number, required: true, default: 0 },
        avgPrice: { type: Number, required: true, default: 0 },
        currency: { type: String },
        unitName: { type: String },
        date: { type: String },
        sourceFile: { type: String },
        year: { type: Number },
      },
    ],
    topCategories: [
      {
        category: { type: String, required: true },
        totalAmount: { type: Number, required: true, default: 0 },
        contractCount: { type: Number, required: true, default: 0 },
      },
    ],
    lastUpdated: { type: Date, required: true, default: Date.now },
  },
  {
    timestamps: true,
    collection: 'buyer_patterns',
  },
)

// Anomaly Schema
const AnomalySchema = new Schema<IAnomaly>(
  {
    type: {
      type: String,
      required: true,
      enum: ['price_spike', 'unusual_supplier', 'high_frequency', 'suspicious_amount', 'outlier_quantity'],
    },
    severity: {
      type: String,
      required: true,
      enum: ['low', 'medium', 'high', 'critical'],
    },
    releaseId: { type: String, required: true },
    awardId: { type: String },
    description: { type: String, required: true },
    detectedValue: { type: Number, required: true },
    expectedRange: {
      min: { type: Number, required: true },
      max: { type: Number, required: true },
    },
    confidence: { type: Number, required: true, min: 0, max: 1 },
    metadata: {
      supplierName: { type: String },
      buyerName: { type: String },
      itemDescription: { type: String },
      year: { type: Number },
      amount: { type: Number },
      currency: { type: String },
      sourceFileName: { type: String },
    },
  },
  {
    timestamps: true,
    collection: 'anomalies',
  },
)

// Release Schema Components
const ContactPointSchema = new Schema<IContactPoint>({
  name: { type: String },
  telephone: { type: String },
  faxNumber: { type: String },
  email: { type: String },
})

const PartySchema = new Schema<IParty>({
  id: { type: String, required: true },
  roles: [{ type: String, required: true }],
  name: { type: String, required: true },
  contactPoint: { type: ContactPointSchema },
})

const BuyerSchema = new Schema<IBuyer>({
  id: { type: String, required: true },
  name: { type: String, required: true },
})

const TenderItemSchema = new Schema<ITenderItem>({
  id: { type: String, required: true },
  description: { type: String, required: true },
  quantity: { type: Number, required: true },
  classification: {
    id: { type: String, required: true },
    description: { type: String, required: true },
    scheme: { type: String, required: true },
  },
  unit: {
    name: { type: String, required: true },
    id: { type: String, required: true },
  },
})

const TenderDocumentSchema = new Schema<ITenderDocument>({
  id: { type: String, required: true },
  documentType: { type: String, required: true },
  description: { type: String, required: true },
  datePublished: { type: Date, required: true },
  url: { type: String, required: true },
  language: { type: String, required: true },
  format: { type: String, required: true },
})

const AwardItemSchema = new Schema<IAwardItem>({
  id: { type: Number, required: true },
  description: { type: String },
  quantity: { type: Number, required: true },
  classification: {
    id: { type: String, required: true },
    description: { type: String, required: true },
    scheme: { type: String, required: true },
  },
  unit: {
    id: { type: String, required: true },
    name: { type: String, required: true },
    value: {
      amount: { type: Number },
      currency: { type: String },
    },
  },
})

const SupplierSchema = new Schema<ISupplier>({
  id: { type: String, required: true },
  name: { type: String, required: true },
})

const AwardDocumentSchema = new Schema<IAwardDocument>({
  id: { type: String, required: true },
  documentType: { type: String, required: true },
  url: { type: String, required: true },
  language: { type: String, required: true },
  datePublished: { type: Date, required: true },
  format: { type: String, required: true },
})

const AwardSchema = new Schema<IAward>({
  id: { type: String, required: true },
  title: { type: String, required: true },
  date: { type: Date, required: true },
  status: { type: String, required: true },
  items: [AwardItemSchema],
  suppliers: [SupplierSchema],
  documents: [AwardDocumentSchema],
})

const TenderSchema = new Schema<ITender>({
  id: { type: String, required: true },
  hasEnquiries: { type: Boolean, required: true },
  procurementMethodDetails: { type: String, required: true },
  procurementMethod: { type: String },
  title: { type: String, required: true },
  description: { type: String, required: true },
  tenderPeriod: {
    endDate: { type: Date, required: true },
    startDate: { type: Date, required: true },
  },
  procuringEntity: {
    id: { type: String, required: true },
    name: { type: String, required: true },
  },
  submissionMethodDetails: { type: String, required: true },
  items: [TenderItemSchema],
  submissionMethod: [{ type: String }],
  enquiryPeriod: {
    startDate: { type: Date },
    endDate: { type: Date },
  },
  documents: [TenderDocumentSchema],
  status: { type: String },
})

// Release Schema
const ReleaseSchema = new Schema<IRelease>(
  {
    initiationType: { type: String, required: true },
    parties: [PartySchema],
    tag: [{ type: String, required: true }],
    date: { type: Date, required: true },
    ocid: { type: String, required: true },
    id: { type: String, required: true, unique: true },
    tender: { type: TenderSchema },
    buyer: { type: BuyerSchema },
    awards: [AwardSchema],
    // Metadata fields for tracking data source
    sourceFileName: { type: String },
    sourceYear: { type: Number },
  },
  { strict: true },
)

// Filter Data Schema for pre-computed filter options
const FilterDataSchema = new Schema<IFilterData>(
  {
    type: {
      type: String,
      required: true,
      enum: ['years', 'statuses', 'procurementMethods', 'suppliers', 'buyers'],
      unique: true,
    },
    data: [
      {
        value: { type: Schema.Types.Mixed, required: true },
        label: { type: String, required: true },
        count: { type: Number, required: true, default: 0 },
      },
    ],
    lastUpdated: { type: Date, required: true, default: Date.now },
    generatedFromReleases: { type: Number, required: true, default: 0 },
  },
  {
    timestamps: true,
    collection: 'filter_data',
  },
)

// Add pagination plugin to Release schema
ReleaseSchema.plugin(paginate)

// Create indexes for better query performance
ExpenseInsightSchema.index({ year: 1, month: 1 })
ExpenseInsightSchema.index({ currency: 1 })
ExpenseInsightSchema.index({ totalAmount: -1 })

SupplierPatternSchema.index({ name: 1 })
SupplierPatternSchema.index({ totalContracts: -1 })
SupplierPatternSchema.index({ totalValue: -1 })
SupplierPatternSchema.index({ lastUpdated: -1 })

BuyerPatternSchema.index({ name: 1 })
BuyerPatternSchema.index({ totalSpending: -1 })
BuyerPatternSchema.index({ totalContracts: -1 })
BuyerPatternSchema.index({ lastUpdated: -1 })

AnomalySchema.index({ type: 1, severity: 1 })
AnomalySchema.index({ releaseId: 1 })
AnomalySchema.index({ createdAt: -1 })
AnomalySchema.index({ confidence: -1 })

FilterDataSchema.index({ lastUpdated: -1 })

// Export models - use singleton pattern to avoid recompilation issues
export const ExpenseInsightModel = mongoose.models.ExpenseInsight || mongoose.model<IExpenseInsight>('ExpenseInsight', ExpenseInsightSchema)
export const SupplierPatternModel = mongoose.models.SupplierPattern || mongoose.model<ISupplierPattern>('SupplierPattern', SupplierPatternSchema)
export const BuyerPatternModel = mongoose.models.BuyerPattern || mongoose.model<IBuyerPattern>('BuyerPattern', BuyerPatternSchema)
export const AnomalyModel = mongoose.models.Anomaly || mongoose.model<IAnomaly>('Anomaly', AnomalySchema)
export const ReleaseModel = mongoose.models.Release || mongoose.model<IRelease>('Release', ReleaseSchema)
export const FilterDataModel = mongoose.models.FilterData || mongoose.model<IFilterData>('FilterData', FilterDataSchema)
