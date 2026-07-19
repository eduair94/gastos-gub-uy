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
  /**
   * Numeric mirror of `severity` (1=low, 2=medium, 3=high, 4=critical).
   * Exists because sorting on the `severity` STRING orders
   * critical < high < low < medium, i.e. 'low' outranks 'high'.
   * Always sort on this instead.
   */
  severityRank?: number
  releaseId: string
  awardId?: string
  description: string
  detectedValue: number
  expectedRange: {
    min: number
    max: number
  }
  confidence: number // 0-1
  /** Currency of `detectedValue` / `expectedRange`. Never assume UYU. */
  currency?: string
  sourceYear?: number
  dataVersion?: string
  metadata: {
    supplierName?: string
    buyerName?: string
    itemDescription?: string
    itemClassification?: {
      id?: string
      description?: string
      scheme?: string
      canonicalName?: string
      rubroPath?: string
      rubro?: string
      subrubro?: string
    }
    itemUnit?: {
      id?: string
      name?: string
      officialUnit?: string
      mismatch?: boolean
    }
    itemQuantity?: number
    /** Number of observations in the baseline this finding was scored against. */
    baselineN?: number
    /** Log-space modified z-score (Iglewicz-Hoaglin) that produced this finding. */
    zScore?: number
    year?: number
    amount?: number
    currency?: string
    sourceFileName?: string
  }
  createdAt: Date
  /** When the detector LAST confirmed this finding. Restamped every run: "is this still true?" */
  detectedAt?: Date
  /** When this finding was FIRST seen. Written once via $setOnInsert: "is this new?" */
  firstDetectedAt?: Date
  /**
   * Second-stage LLM triage of this statistical flag. ADVISORY ONLY — the
   * statistical detector remains the source of truth. Written by
   * src/jobs/score-anomalies-ai.ts, which reads the item description and the
   * surrounding contract (basket, subject, procedure, buyer) and judges whether
   * the price gap is EXPLAINABLE (small lot, different real product, brand,
   * urgency, bundled service, data error) or genuinely unexplained. The
   * unexplained flags (`explainable: 'no'`) are the real signal.
   */
  aiVerdict?: {
    /** 'yes' = a plausible legitimate explanation exists; 'no' = none found (the real signal); 'uncertain' = not enough context to decide. */
    explainable: 'yes' | 'no' | 'uncertain'
    /** Coarse reason bucket. `sin-explicacion` pairs with `explainable: 'no'`. */
    category:
      | 'cantidad-baja'
      | 'producto-distinto'
      | 'marca-especializado'
      | 'urgencia'
      | 'servicio-incluido'
      | 'error-carga'
      | 'moneda-erronea'
      | 'sin-explicacion'
      | 'otro'
    /** One-line summary rationale in Spanish, shown in the list. */
    reason: string
    /**
     * Detailed factual analysis in Spanish (2-4 sentences), written for journalists and researchers
     * auditing state spending: what was paid, against what norm, and why it is or is not explainable.
     */
    analysis: string
    /** Specific, individually-checkable factual points supporting the verdict. */
    evidence: string[]
    /** The model's self-reported confidence in this verdict, 0-1. */
    confidence: number
    /** Gemini model id that produced the verdict. */
    model: string
    /**
     * The anomaly `dataVersion` this verdict was scored against. The job
     * re-triages a flag only when this differs from the anomaly's current
     * `dataVersion`, so a stable finding is never re-charged to the API.
     */
    dataVersion?: string
    /** When this verdict was produced. */
    scoredAt: Date
    /**
     * Provenance — the extra context the verdict was based on beyond the OCDS fields, so a reader
     * can see (and re-check) exactly what informed the AI.
     */
    /** Number of scraped "Características del Ítem" rows fed to the model (0 = none available). */
    usedFeatures?: number
    /** Attached contract documents (resolutions, pliegos) — links a journalist can open. */
    documents?: { type?: string, url: string, format?: string }[]
  }
}

/**
 * Frozen price baseline for one {classificationId, currency, unitName} bucket,
 * computed over a trailing window of award item unit prices.
 *
 * All of `medianLn` / `madLn` are in LOG space (natural log of unit price);
 * `p25`/`p50`/`p75`/`p95`/`min`/`max` are in raw currency units.
 */
export interface IItemPriceBaseline extends Document {
  classificationId: string
  currency: string
  unitName: string
  /** Number of award items observed in the window. */
  n: number
  /** Median of ln(unitPrice). */
  medianLn: number
  /** Median absolute deviation of ln(unitPrice) around `medianLn`. May be 0. */
  madLn: number
  p25: number
  p50: number
  p75: number
  p95: number
  min: number
  max: number
  /** Number of distinct unit prices (histogram bins) behind this baseline. */
  distinctPrices: number
  /** Tariff/list prices (count >= RECURRING_PRICE_MIN_COUNT, above p50). Never flagged. */
  recurringPrices?: number[]
  /** The most-frequently-observed unit price (tallest histogram bin). */
  modePrice?: number
  /** modeCount / n — concentration on that one price. Drives deviation-from-mode scoring. */
  modeShare?: number
  windowStart: Date
  windowEnd: Date
  dataVersion: string
  calculatedAt: Date
  createdAt: Date
  updatedAt: Date
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
  id: string  // Changed from number to string to match OCDS spec
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
  // One-shot marker for the "reiteración del gasto" probe (see src/jobs/releases/reiteracion-probe.ts)
  reiteracionProbedAt?: Date
  // Calculated amount field with multicurrency support
  amount?: {
    totalAmounts: Record<string, number> // e.g., { "UYU": 15000, "USD": 500 }
    totalItems: number
    currencies: string[]
    hasAmounts: boolean
    primaryAmount: number // Main amount in UYU for sorting/filtering
    primaryCurrency: string
  }
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
