import mongoose, { Document, Schema } from "mongoose";

export interface IExpenseInsight extends Document {
  year: number;
  month?: number;
  totalAmount: number;
  totalTransactions: number;
  averageAmount: number;
  currency: string;
  topSuppliers: Array<{
    id: string;
    name: string;
    totalAmount: number;
    transactionCount: number;
  }>;
  topBuyers: Array<{
    id: string;
    name: string;
    totalAmount: number;
    transactionCount: number;
  }>;
  topCategories: Array<{
    description: string;
    totalAmount: number;
    transactionCount: number;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

export interface ISupplierPattern extends Document {
  supplierId: string;
  name: string;
  totalContracts: number;
  years: number[];
  yearCount: number;
  buyers: string[];
  buyerCount: number;
  avgContractValue: number;
  totalValue: number;
  items: Array<{
    description: string;
    category?: string;
    totalAmount: number;
    totalQuantity: number;
    contractCount: number;
    avgPrice: number;
    currency?: string;
    unitName?: string;
    date?: string;
    sourceFile?: string;
    year?: number;
  }>;
  topCategories: Array<{
    category: string;
    totalAmount: number;
    contractCount: number;
  }>;
  lastUpdated: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IBuyerPattern extends Document {
  buyerId: string;
  name: string;
  totalContracts: number;
  years: number[];
  yearCount: number;
  suppliers: string[];
  supplierCount: number;
  totalSpending: number;
  avgContractValue: number;
  items: Array<{
    description: string;
    category?: string;
    totalAmount: number;
    totalQuantity: number;
    contractCount: number;
    avgPrice: number;
    currency?: string;
    unitName?: string;
    date?: string;
    sourceFile?: string;
    year?: number;
  }>;
  topCategories: Array<{
    category: string;
    totalAmount: number;
    contractCount: number;
  }>;
  lastUpdated: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IAnomaly extends Document {
  type: "price_spike" | "unusual_supplier" | "high_frequency" | "suspicious_amount" | "outlier_quantity";
  severity: "low" | "medium" | "high" | "critical";
  releaseId: string;
  awardId?: string;
  description: string;
  detectedValue: number;
  expectedRange: {
    min: number;
    max: number;
  };
  confidence: number; // 0-1
  metadata: {
    supplierName?: string;
    buyerName?: string;
    itemDescription?: string;
    itemClassification?: {
      description?: string;
      scheme?: string;
      id?: string;
    };
    itemUnit?: {
      name?: string;
      currency?: string;
    };
    itemQuantity?: number;
    year?: number;
    amount?: number;
    currency?: string;
    sourceFileName?: string;
  };
  createdAt: Date;
  detectedAt?: Date;
}

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
    collection: "expense_insights",
  }
);

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
    collection: "supplier_patterns",
  }
);

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
    collection: "buyer_patterns",
  }
);

const AnomalySchema = new Schema<IAnomaly>(
  {
    type: {
      type: String,
      required: true,
      enum: ["price_spike", "unusual_supplier", "high_frequency", "suspicious_amount", "outlier_quantity"],
    },
    severity: {
      type: String,
      required: true,
      enum: ["low", "medium", "high", "critical"],
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
      itemClassification: {
        description: { type: String },
        scheme: { type: String },
        id: { type: String }
      },
      itemUnit: {
        name: { type: String },
        currency: { type: String }
      },
      itemQuantity: { type: Number },
      year: { type: Number },
      amount: { type: Number },
      currency: { type: String },
    },
  },
  {
    strict: false,
    timestamps: true,
    collection: "anomalies",
  }
);

// Create indexes for better query performance
ExpenseInsightSchema.index({ year: 1, month: 1 });
ExpenseInsightSchema.index({ currency: 1 });
ExpenseInsightSchema.index({ totalAmount: -1 });

// Note: supplierId already has unique index from schema definition
SupplierPatternSchema.index({ name: 1 });
SupplierPatternSchema.index({ totalContracts: -1 });
SupplierPatternSchema.index({ totalValue: -1 });
SupplierPatternSchema.index({ lastUpdated: -1 });

// Note: buyerId already has unique index from schema definition
BuyerPatternSchema.index({ name: 1 });
BuyerPatternSchema.index({ totalSpending: -1 });
BuyerPatternSchema.index({ totalContracts: -1 });
BuyerPatternSchema.index({ lastUpdated: -1 });

AnomalySchema.index({ type: 1, severity: 1 });
AnomalySchema.index({ releaseId: 1 });
AnomalySchema.index({ createdAt: -1 });
AnomalySchema.index({ confidence: -1 });

export const ExpenseInsightModel = mongoose.model<IExpenseInsight>("ExpenseInsight", ExpenseInsightSchema);
export const SupplierPatternModel = mongoose.model<ISupplierPattern>("SupplierPattern", SupplierPatternSchema);
export const BuyerPatternModel = mongoose.model<IBuyerPattern>("BuyerPattern", BuyerPatternSchema);
export const AnomalyModel = mongoose.model<IAnomaly>("Anomaly", AnomalySchema);
