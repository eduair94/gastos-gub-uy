import type { Model } from "mongoose";
import { Schema } from "mongoose";
import { mongoose } from "../connection/database";

// Provider × unexplained-anomaly cross-reference.
//
// Answers "which providers concentrate the flags the AI could not explain, and is there a pattern".
// One doc per provider (grouped by metadata.supplierName, the only supplier key an anomaly carries —
// anomalies do NOT store the supplier RUT, and the same name maps to several id-scheme variants in
// supplier_patterns, so a stable RUT cannot be resolved reliably; `supplierId` is therefore usually
// absent and the page links back to the anomalies list BY NAME).
//
// "Unexplained" == anomalies where aiVerdict.explainable === 'no' (the same set the site surfaces at
// /analytics/anomalies?ai=unexplained). Populated by src/jobs/cross-provider-anomalies.ts every 24h
// (compute-then-swap by dataVersion). Read on the request path by /api/analytics/provider-anomalies.

/** Overprice accumulated per currency (UYU and USD amounts are never summed together). */
export interface IOverpriceEntry {
  currency: string;
  amount: number;
}

export interface IProviderRubroCount {
  rubro: string;
  count: number;
}

export interface IProviderBuyerCount {
  buyerName: string;
  count: number;
}

export interface IProviderAnomalyStats {
  /** Group key: the supplier name as stored on the anomaly (metadata.supplierName). */
  supplierName: string;
  /** Best-effort RUT, only set when the name resolves to a single distinct supplier_patterns id.
   *  Usually absent (the name is ambiguous across id-scheme variants). */
  supplierId?: string | undefined;
  /** Number of unexplained flags for this provider. */
  flagCount: number;
  /** Estimated overprice per currency: sum of max(0, paid - rangeTop) * quantity. */
  overprice: IOverpriceEntry[];
  /** Dominant currency (the one carrying the most flags) — for default display + sort. */
  primaryCurrency: string;
  /** Overprice amount in the primary currency (denormalised for indexed sorting). */
  primaryOverprice: number;
  /** Worst robust price divergence (z-score) across this provider's flags. */
  worstZ: number;
  /** Mean AI confidence over the scored flags, or null if none carried a confidence. */
  avgConfidence: number | null;
  /** Rubro (SICE top level) distribution, most frequent first. */
  rubros: IProviderRubroCount[];
  /** Buyers behind the flags, most frequent first. */
  buyers: IProviderBuyerCount[];
  /** Distinct buyers behind the flags. */
  buyerCount: number;
  /** The single most frequent buyer (label) + its count. */
  topBuyer?: string | undefined;
  topBuyerCount: number;
  /** True when EVERY flag comes from one buyer — the strongest "captive pair" signal. */
  captive: boolean;
  currencies: string[];
  /** Contract years the flags span (sourceYear). */
  years: number[];
  firstYear?: number | undefined;
  lastYear?: number | undefined;
  dataVersion: string;
  calculatedAt: Date;
}

/** Top provider→buyer pair (a supplier repeatedly overpriced by one buyer). */
export interface IProviderPair {
  supplierName: string;
  buyerName: string;
  count: number;
}

/** A buyer that concentrates flags across several providers. */
export interface IProviderBuyerRollup {
  buyerName: string;
  count: number;
  providerCount: number;
}

/** A top provider for the concentration panel (stable/global, independent of the table's paging). */
export interface IProviderTop {
  supplierName: string;
  flagCount: number;
  captive: boolean;
}

export interface IProviderYearCount {
  year: number;
  count: number;
}

/** One rollup doc for the page's pattern panels — avoids live aggregation. */
export interface IProviderAnomalySummary {
  providerCount: number;
  flagTotal: number;
  captiveCount: number;
  /** Flags whose raw overprice exceeded the plausibility ceiling (quantity/data artifacts) and were
   *  capped. Surfaced as a footnote so the overprice figures are honest about the clamp. */
  clampedFlags: number;
  overpriceTotals: IOverpriceEntry[];
  rubroTotals: IProviderRubroCount[];
  yearTotals: IProviderYearCount[];
  topProviders: IProviderTop[];
  topPairs: IProviderPair[];
  topBuyers: IProviderBuyerRollup[];
  dataVersion: string;
  calculatedAt: Date;
}

const OverpriceSchema = new Schema<IOverpriceEntry>(
  { currency: { type: String, required: true }, amount: { type: Number, default: 0 } },
  { _id: false }
);
const RubroCountSchema = new Schema<IProviderRubroCount>(
  { rubro: { type: String, required: true }, count: { type: Number, default: 0 } },
  { _id: false }
);
const BuyerCountSchema = new Schema<IProviderBuyerCount>(
  { buyerName: { type: String, required: true }, count: { type: Number, default: 0 } },
  { _id: false }
);

const ProviderAnomalyStatsSchema = new Schema<IProviderAnomalyStats>(
  {
    supplierName: { type: String, required: true },
    supplierId: { type: String },
    flagCount: { type: Number, required: true, default: 0 },
    overprice: { type: [OverpriceSchema], default: [] },
    primaryCurrency: { type: String, default: "UYU" },
    primaryOverprice: { type: Number, default: 0 },
    worstZ: { type: Number, default: 0 },
    avgConfidence: { type: Number, default: null },
    rubros: { type: [RubroCountSchema], default: [] },
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
  { timestamps: true, collection: "provider_anomaly_stats" }
);

ProviderAnomalyStatsSchema.index({ supplierName: 1 }, { unique: true });
ProviderAnomalyStatsSchema.index({ flagCount: -1 });
ProviderAnomalyStatsSchema.index({ primaryOverprice: -1 });
ProviderAnomalyStatsSchema.index({ worstZ: -1 });
ProviderAnomalyStatsSchema.index({ dataVersion: 1 });

const PairSchema = new Schema<IProviderPair>(
  { supplierName: { type: String, required: true }, buyerName: { type: String, required: true }, count: { type: Number, default: 0 } },
  { _id: false }
);
const BuyerRollupSchema = new Schema<IProviderBuyerRollup>(
  { buyerName: { type: String, required: true }, count: { type: Number, default: 0 }, providerCount: { type: Number, default: 0 } },
  { _id: false }
);
const TopProviderSchema = new Schema<IProviderTop>(
  { supplierName: { type: String, required: true }, flagCount: { type: Number, default: 0 }, captive: { type: Boolean, default: false } },
  { _id: false }
);
const YearCountSchema = new Schema<IProviderYearCount>(
  { year: { type: Number, required: true }, count: { type: Number, default: 0 } },
  { _id: false }
);

const ProviderAnomalySummarySchema = new Schema<IProviderAnomalySummary>(
  {
    providerCount: { type: Number, default: 0 },
    flagTotal: { type: Number, default: 0 },
    captiveCount: { type: Number, default: 0 },
    clampedFlags: { type: Number, default: 0 },
    overpriceTotals: { type: [OverpriceSchema], default: [] },
    rubroTotals: { type: [RubroCountSchema], default: [] },
    yearTotals: { type: [YearCountSchema], default: [] },
    topProviders: { type: [TopProviderSchema], default: [] },
    topPairs: { type: [PairSchema], default: [] },
    topBuyers: { type: [BuyerRollupSchema], default: [] },
    dataVersion: { type: String, required: true },
    calculatedAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true, collection: "provider_anomaly_summary" }
);

ProviderAnomalySummarySchema.index({ calculatedAt: -1 });

// HMR-safe registration (the Nuxt dev server re-imports models on hot reload).
export const ProviderAnomalyStatsModel =
  (mongoose.models.ProviderAnomalyStats as Model<IProviderAnomalyStats>)
  || mongoose.model<IProviderAnomalyStats>("ProviderAnomalyStats", ProviderAnomalyStatsSchema);

export const ProviderAnomalySummaryModel =
  (mongoose.models.ProviderAnomalySummary as Model<IProviderAnomalySummary>)
  || mongoose.model<IProviderAnomalySummary>("ProviderAnomalySummary", ProviderAnomalySummarySchema);
