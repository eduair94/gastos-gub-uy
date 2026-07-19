import type { Model } from "mongoose";
import { Schema } from "mongoose";
import { mongoose } from "../connection/database";

/**
 * Precomputed procurement indicators per department × year, for the party comparison
 * page (/analytics/partidos). One document per (buyerId, year); the 19 Intendencias
 * only (buyer.id 80-1 … 98-1). Rebuilt monthly by src/jobs/refresh-dept-indicators.ts
 * (compute-then-swap by dataVersion). The read endpoint only `.find()` by index —
 * nothing is aggregated on the request path (buyer.id is unindexed on releases).
 *
 * These are DESCRIPTIVE indicators. Denominators matter (see field notes); the page
 * frames them as context grouped by the governing party, never as a party performance
 * score. See shared/political-mandates.ts for the party join.
 */
export interface IDeptIndicatorYear {
  buyerId: string; // '80-1' … '98-1'
  year: number; // sourceYear

  // --- volume (priced + capped, mirrors organism_group_stats gating) ---
  total: number; // Σ amount.primaryAmount, >0 && <= cap
  contracts: number; // priced records (== pricedRecords)

  // --- transparency: share of records that carry a price ---
  totalRecords: number; // ALL records of the dept/year (priced or not)
  pricedRecords: number; // records with amount.hasAmounts (numerator; == contracts)

  // --- competitiveness: procurement-method mix ---
  directCount: number; // methodClass === 'direct'
  tenderCount: number; // methodClass === 'tender'
  otherMethodCount: number; // methodClass === 'other'
  methodKnown: number; // direct + tender + other (denominator of % directa)

  // --- supplier concentration (UPPER BOUND — release amount not apportioned) ---
  top5Share: number | null; // Σtop5 supplier spend / total, in [0,1]
  supplierCount: number;

  // --- anomaly density (⚠ statistical, descriptive) ---
  anomalyCountRank3: number; // flags with severityRank >= 3 whose release ∈ this dept/year

  dataVersion: string;
  calculatedAt: Date;
}

const DeptIndicatorSchema = new Schema<IDeptIndicatorYear>(
  {
    buyerId: { type: String, required: true },
    year: { type: Number, required: true },
    total: { type: Number, required: true, default: 0 },
    contracts: { type: Number, required: true, default: 0 },
    totalRecords: { type: Number, required: true, default: 0 },
    pricedRecords: { type: Number, required: true, default: 0 },
    directCount: { type: Number, required: true, default: 0 },
    tenderCount: { type: Number, required: true, default: 0 },
    otherMethodCount: { type: Number, required: true, default: 0 },
    methodKnown: { type: Number, required: true, default: 0 },
    top5Share: { type: Number, default: null },
    supplierCount: { type: Number, required: true, default: 0 },
    anomalyCountRank3: { type: Number, required: true, default: 0 },
    dataVersion: { type: String, required: true },
    calculatedAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true, collection: "dept_indicators" }
);

DeptIndicatorSchema.index({ buyerId: 1, year: 1 }, { unique: true });
DeptIndicatorSchema.index({ dataVersion: 1 });
DeptIndicatorSchema.index({ year: 1 });

// HMR-safe registration (Nuxt dev re-imports models on hot reload).
export const DeptIndicatorModel =
  (mongoose.models.DeptIndicator as Model<IDeptIndicatorYear>)
  || mongoose.model<IDeptIndicatorYear>("DeptIndicator", DeptIndicatorSchema);
