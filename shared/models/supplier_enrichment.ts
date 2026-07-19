import type { Model } from "mongoose";
import { Schema } from "mongoose";
import { mongoose } from "../connection/database";

// AI-written context for a state supplier: what it is, and a filterable category.
//
// Populated by src/jobs/enrich-suppliers.ts (Gemini structured output). One doc
// per supplier NAME (the key that rankings and anomalies carry — a stable RUT is
// often unresolvable, same as provider_anomaly_stats). Read on the request path
// to annotate rankings (pauta recipients, top suppliers) with a category chip and
// a one-line description.
//
// It is AI-generated context, NOT a fact of record: every consumer must label it
// as such and keep the confidence visible. Individuals (personal names) are
// tagged `persona` and left without a biography on purpose (privacy + it is not
// this product's job to profile people).

/** Filterable category enum. Kept broad so it generalises past the pauta pilot. */
export const SUPPLIER_CATEGORIES = [
  "medio-tv",
  "medio-radio",
  "medio-prensa",
  "medio-digital",
  "medio-via-publica",
  "agencia-publicidad",
  "productora",
  "organismo-publico",
  "empresa",
  "cooperativa",
  "persona",
  "otro",
] as const;

export type SupplierCategory = (typeof SUPPLIER_CATEGORIES)[number];

export interface ISupplierEnrichment {
  /** Supplier name as stored on the source records (the join key). */
  name: string;
  /** Supplier id (R/…) when it maps to a single one; usually absent. */
  supplierId?: string | undefined;
  category: SupplierCategory;
  /** One-line description in Spanish. Empty for `persona`. */
  description: string;
  /** One-line description in English. */
  descriptionEn?: string | undefined;
  /** 0–1 self-reported model confidence; low values are hidden by consumers. */
  confidence: number;
  /** Whether grounded against web search (false = model knowledge only). */
  grounded: boolean;
  model: string;
  enrichedAt: Date;
}

const SupplierEnrichmentSchema = new Schema<ISupplierEnrichment>(
  {
    name: { type: String, required: true },
    supplierId: { type: String },
    category: { type: String, required: true, enum: SUPPLIER_CATEGORIES as unknown as string[], default: "otro" },
    description: { type: String, default: "" },
    descriptionEn: { type: String, default: "" },
    confidence: { type: Number, default: 0 },
    grounded: { type: Boolean, default: false },
    model: { type: String, required: true },
    enrichedAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true, collection: "supplier_enrichment" }
);

SupplierEnrichmentSchema.index({ name: 1 }, { unique: true });
SupplierEnrichmentSchema.index({ category: 1 });

// HMR-safe registration (the Nuxt dev server re-imports models on hot reload).
export const SupplierEnrichmentModel =
  (mongoose.models.SupplierEnrichment as Model<ISupplierEnrichment>)
  || mongoose.model<ISupplierEnrichment>("SupplierEnrichment", SupplierEnrichmentSchema);
