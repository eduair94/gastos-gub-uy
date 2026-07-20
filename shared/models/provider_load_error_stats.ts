import type { Model } from "mongoose";
import { Schema } from "mongoose";
import { mongoose } from "../connection/database";

// Provider × data-load-error cross-reference.
//
// Answers "which providers (and buyers/organisms) concentrate the LOAD ERRORS — the flags the AI
// triaged as a data-entry mistake, not a real overprice — and is a load error recurring for the same
// provider or organism". The sibling of provider_anomaly_stats, but scoped to the load-error bucket:
//   aiVerdict.explainable === 'yes' AND aiVerdict.category ∈ {error-carga, moneda-erronea}
// (the same set /analytics/errores-carga surfaces). Populated by src/jobs/cross-provider-load-errors.ts
// every 24h (compute-then-swap by dataVersion). Read by /api/analytics/provider-load-errors.
//
// One doc per provider (grouped by metadata.supplierName, the only supplier key an anomaly carries —
// anomalies do NOT store the supplier RUT, and the same name maps to several id-scheme variants in
// supplier_patterns, so a stable RUT cannot be resolved reliably; `supplierId` is therefore usually
// absent and the page links back to the errores-carga alerts BY NAME).
//
// The "overprice" fields here are NOT a real overprice: a load error inflates the reported figure, so
// they measure the DISTORTION the bad data injected (max(0, paid - rangeTop) × qty, in today's pesos).
// The page renders it in celeste, not gold — it is a data-quality magnitude, not money the provider
// billed. Field names mirror provider_anomaly_stats so the read endpoint/page reuse the same shape.

/** Distortion accumulated per currency (UYU and USD amounts are never summed together). */
export interface ILoadErrorOverpriceEntry {
  currency: string;
  amount: number;
}

export interface ILoadErrorRubroCount {
  rubro: string;
  count: number;
}

export interface ILoadErrorBuyerCount {
  buyerName: string;
  count: number;
}

/** Distribution of load-error types (error-carga / moneda-erronea) for this provider. */
export interface ILoadErrorCategoryCount {
  category: string;
  count: number;
}

export interface IProviderLoadErrorStats {
  /** Group key: the supplier name as stored on the anomaly (metadata.supplierName). */
  supplierName: string;
  /** Best-effort RUT, only set when the name resolves to a single distinct supplier_patterns id.
   *  Usually absent (the name is ambiguous across id-scheme variants). */
  supplierId?: string | undefined;
  /** Number of load-error flags for this provider. */
  flagCount: number;
  /** Estimated distortion per currency: sum of max(0, paid - rangeTop) * quantity. */
  overprice: ILoadErrorOverpriceEntry[];
  /** Distortion re-expressed in TODAY's pesos: each flag converted to UYU at the contract month's
   *  BCU rate, then inflation-adjusted via the Unidad Indexada (shared/utils/real-value toTodayUyu).
   *  A single comparable figure across currencies AND years — the default distortion sort/display. */
  overpriceUyuToday: number;
  /** Dominant currency (the one carrying the most flags) — for default display + sort. */
  primaryCurrency: string;
  /** Distortion amount in the primary currency (denormalised for indexed sorting). */
  primaryOverprice: number;
  /** Worst robust price divergence (z-score) across this provider's flags. */
  worstZ: number;
  /** Mean AI confidence over the scored flags, or null if none carried a confidence. */
  avgConfidence: number | null;
  /** Rubro (SICE top level) distribution, most frequent first. */
  rubros: ILoadErrorRubroCount[];
  /** Load-error type distribution (error-carga / moneda-erronea), most frequent first. */
  categories: ILoadErrorCategoryCount[];
  /** The single most frequent load-error type for this provider. */
  topCategory?: string | undefined;
  /** Buyers behind the flags, most frequent first. */
  buyers: ILoadErrorBuyerCount[];
  /** Distinct buyers behind the flags. */
  buyerCount: number;
  /** The single most frequent buyer (label) + its count. */
  topBuyer?: string | undefined;
  topBuyerCount: number;
  /** True when EVERY flag comes from one buyer — the strongest "recurring at one organism" signal. */
  captive: boolean;
  currencies: string[];
  /** Contract years the flags span (sourceYear). */
  years: number[];
  firstYear?: number | undefined;
  lastYear?: number | undefined;
  dataVersion: string;
  calculatedAt: Date;
}

/** Top provider→buyer pair (a supplier whose load errors recur at one buyer). */
export interface ILoadErrorPair {
  supplierName: string;
  buyerName: string;
  count: number;
}

/** A buyer/organism that concentrates load errors across several providers. */
export interface ILoadErrorBuyerRollup {
  buyerName: string;
  count: number;
  providerCount: number;
}

/** A top provider for the concentration panel (stable/global, independent of the table's paging). */
export interface ILoadErrorTop {
  supplierName: string;
  flagCount: number;
  captive: boolean;
}

export interface ILoadErrorYearCount {
  year: number;
  count: number;
}

/** One rollup doc for the page's pattern panels — avoids live aggregation. */
export interface IProviderLoadErrorSummary {
  providerCount: number;
  flagTotal: number;
  captiveCount: number;
  /** Flags whose raw distortion exceeded the plausibility ceiling (quantity/data artifacts) and were
   *  capped. Surfaced as a footnote so the distortion figures are honest about the clamp. */
  clampedFlags: number;
  overpriceTotals: ILoadErrorOverpriceEntry[];
  /** Total distortion across all providers in today's pesos (see stats.overpriceUyuToday). */
  overpriceUyuTodayTotal: number;
  rubroTotals: ILoadErrorRubroCount[];
  /** Global load-error type split (error-carga vs moneda-erronea). */
  categoryTotals: ILoadErrorCategoryCount[];
  yearTotals: ILoadErrorYearCount[];
  topProviders: ILoadErrorTop[];
  topPairs: ILoadErrorPair[];
  topBuyers: ILoadErrorBuyerRollup[];
  dataVersion: string;
  calculatedAt: Date;
}

const OverpriceSchema = new Schema<ILoadErrorOverpriceEntry>(
  { currency: { type: String, required: true }, amount: { type: Number, default: 0 } },
  { _id: false }
);
const RubroCountSchema = new Schema<ILoadErrorRubroCount>(
  { rubro: { type: String, required: true }, count: { type: Number, default: 0 } },
  { _id: false }
);
const BuyerCountSchema = new Schema<ILoadErrorBuyerCount>(
  { buyerName: { type: String, required: true }, count: { type: Number, default: 0 } },
  { _id: false }
);
const CategoryCountSchema = new Schema<ILoadErrorCategoryCount>(
  { category: { type: String, required: true }, count: { type: Number, default: 0 } },
  { _id: false }
);

const ProviderLoadErrorStatsSchema = new Schema<IProviderLoadErrorStats>(
  {
    supplierName: { type: String, required: true },
    supplierId: { type: String },
    flagCount: { type: Number, required: true, default: 0 },
    overprice: { type: [OverpriceSchema], default: [] },
    overpriceUyuToday: { type: Number, default: 0 },
    primaryCurrency: { type: String, default: "UYU" },
    primaryOverprice: { type: Number, default: 0 },
    worstZ: { type: Number, default: 0 },
    avgConfidence: { type: Number, default: null },
    rubros: { type: [RubroCountSchema], default: [] },
    categories: { type: [CategoryCountSchema], default: [] },
    topCategory: { type: String },
    buyers: { type: [BuyerCountSchema], default: [] },
    buyerCount: { type: Number, default: 0 },
    topBuyer: { type: String },
    topBuyerCount: { type: Number, default: 0 },
    captive: { type: Boolean, default: false },
    currencies: { type: [String], default: [] },
    years: { type: [Number], default: [] },
    firstYear: { type: Number },
    lastYear: { type: Number },
    dataVersion: { type: String, required: true },
    calculatedAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true, collection: "provider_load_error_stats" }
);

ProviderLoadErrorStatsSchema.index({ supplierName: 1 }, { unique: true });
ProviderLoadErrorStatsSchema.index({ flagCount: -1 });
ProviderLoadErrorStatsSchema.index({ primaryOverprice: -1 });
ProviderLoadErrorStatsSchema.index({ overpriceUyuToday: -1 });
ProviderLoadErrorStatsSchema.index({ worstZ: -1 });
ProviderLoadErrorStatsSchema.index({ dataVersion: 1 });

const PairSchema = new Schema<ILoadErrorPair>(
  { supplierName: { type: String, required: true }, buyerName: { type: String, required: true }, count: { type: Number, default: 0 } },
  { _id: false }
);
const BuyerRollupSchema = new Schema<ILoadErrorBuyerRollup>(
  { buyerName: { type: String, required: true }, count: { type: Number, default: 0 }, providerCount: { type: Number, default: 0 } },
  { _id: false }
);
const TopProviderSchema = new Schema<ILoadErrorTop>(
  { supplierName: { type: String, required: true }, flagCount: { type: Number, default: 0 }, captive: { type: Boolean, default: false } },
  { _id: false }
);
const YearCountSchema = new Schema<ILoadErrorYearCount>(
  { year: { type: Number, required: true }, count: { type: Number, default: 0 } },
  { _id: false }
);

const ProviderLoadErrorSummarySchema = new Schema<IProviderLoadErrorSummary>(
  {
    providerCount: { type: Number, default: 0 },
    flagTotal: { type: Number, default: 0 },
    captiveCount: { type: Number, default: 0 },
    clampedFlags: { type: Number, default: 0 },
    overpriceTotals: { type: [OverpriceSchema], default: [] },
    overpriceUyuTodayTotal: { type: Number, default: 0 },
    rubroTotals: { type: [RubroCountSchema], default: [] },
    categoryTotals: { type: [CategoryCountSchema], default: [] },
    yearTotals: { type: [YearCountSchema], default: [] },
    topProviders: { type: [TopProviderSchema], default: [] },
    topPairs: { type: [PairSchema], default: [] },
    topBuyers: { type: [BuyerRollupSchema], default: [] },
    dataVersion: { type: String, required: true },
    calculatedAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true, collection: "provider_load_error_summary" }
);

ProviderLoadErrorSummarySchema.index({ calculatedAt: -1 });

// HMR-safe registration (the Nuxt dev server re-imports models on hot reload).
export const ProviderLoadErrorStatsModel =
  (mongoose.models.ProviderLoadErrorStats as Model<IProviderLoadErrorStats>)
  || mongoose.model<IProviderLoadErrorStats>("ProviderLoadErrorStats", ProviderLoadErrorStatsSchema);

export const ProviderLoadErrorSummaryModel =
  (mongoose.models.ProviderLoadErrorSummary as Model<IProviderLoadErrorSummary>)
  || mongoose.model<IProviderLoadErrorSummary>("ProviderLoadErrorSummary", ProviderLoadErrorSummarySchema);
