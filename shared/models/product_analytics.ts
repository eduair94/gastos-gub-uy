import { Schema } from "mongoose";
import { mongoose } from "../connection/database";

// Per catalogue-code (classification.id) analytics.
//
// Answers "what does the state buy, who buys it, from whom, at what scale" grouped by the
// procurement catalogue CODE rather than the free-text description — because the description is
// unnormalised ('Papel A4' / 'PAPEL A4' / 'Papel A-4' all fragment one economic category) while
// classification.id is canonical (the same key item_price_baselines and the anomaly detector use).
//
// Counts (lines/contracts/buyers/suppliers/rank lists/byYear) are computed over EVERY award item
// line with a real code — how often and by how many institutions a thing is bought is meaningful
// with or without a money figure. SPEND is gated: a line contributes UYU only when its release
// carries a plausible amount.primaryAmount (see src/jobs/analytics-pipeline.ts). So a code with no
// priced releases still ranks by activity instead of vanishing.
//
// Populated by src/jobs/refresh-product-analytics.ts (compute-then-swap by dataVersion). Live
// group-by-code over the 2.2M releases collection is ~15s, so this is never done on the request
// path — the API reads these ~20k precomputed docs by index.
export interface IProductRankEntry {
  id: string;
  name: string;
  spendUYU: number;
  lines: number;
}

export interface IProductYear {
  year: number;
  spendUYU: number;
  lines: number;
}

export interface IProductAnalytics {
  /** classification.id, e.g. "1879". The junk sentinel "0"/""/null is excluded at build time. */
  code: string;
  /** Modal (most frequent) description seen for this code. */
  description: string;
  lineCount: number;
  contractCount: number;
  buyerCount: number;
  supplierCount: number;
  totalUYU: number;
  topBuyers: IProductRankEntry[];
  topSuppliers: IProductRankEntry[];
  byYear: IProductYear[];
  firstYear?: number | undefined;
  lastYear?: number | undefined;
  currencies: string[];
  rankBySpend: number;
  rankByLines: number;
  calculatedAt: Date;
  dataVersion: string;
  // SICE catalog enrichment (left-joined by code in refresh-product-analytics).
  // Absent when the code is not in the catalog; the page falls back to `description`.
  canonicalName?: string | undefined;
  rubroPath?: string | undefined;
  famiName?: string | undefined;
  subfName?: string | undefined;
  clasName?: string | undefined;
  subcName?: string | undefined;
  unitName?: string | undefined;
  isService?: boolean | undefined;
}

const RankEntrySchema = new Schema<IProductRankEntry>(
  {
    id: { type: String, default: "" },
    name: { type: String, default: "" },
    spendUYU: { type: Number, default: 0 },
    lines: { type: Number, default: 0 },
  },
  { _id: false }
);

const YearSchema = new Schema<IProductYear>(
  {
    year: { type: Number, required: true },
    spendUYU: { type: Number, default: 0 },
    lines: { type: Number, default: 0 },
  },
  { _id: false }
);

const ProductAnalyticsSchema = new Schema<IProductAnalytics>(
  {
    code: { type: String, required: true },
    description: { type: String, default: "" },
    lineCount: { type: Number, required: true, default: 0 },
    contractCount: { type: Number, required: true, default: 0 },
    buyerCount: { type: Number, required: true, default: 0 },
    supplierCount: { type: Number, required: true, default: 0 },
    totalUYU: { type: Number, required: true, default: 0 },
    topBuyers: { type: [RankEntrySchema], default: [] },
    topSuppliers: { type: [RankEntrySchema], default: [] },
    byYear: { type: [YearSchema], default: [] },
    firstYear: { type: Number },
    lastYear: { type: Number },
    currencies: { type: [String], default: [] },
    rankBySpend: { type: Number, required: true, default: 0 },
    rankByLines: { type: Number, required: true, default: 0 },
    calculatedAt: { type: Date, required: true, default: Date.now },
    dataVersion: { type: String, required: true },
    canonicalName: { type: String },
    rubroPath: { type: String },
    famiName: { type: String },
    subfName: { type: String },
    clasName: { type: String },
    subcName: { type: String },
    unitName: { type: String },
    isService: { type: Boolean },
  },
  {
    timestamps: true,
    collection: "product_analytics",
  }
);

ProductAnalyticsSchema.index({ code: 1 }, { unique: true });
ProductAnalyticsSchema.index({ rankBySpend: 1 });
ProductAnalyticsSchema.index({ rankByLines: 1 });
ProductAnalyticsSchema.index({ dataVersion: 1 });

export const ProductAnalyticsModel = mongoose.model<IProductAnalytics>(
  "ProductAnalytics",
  ProductAnalyticsSchema
);
