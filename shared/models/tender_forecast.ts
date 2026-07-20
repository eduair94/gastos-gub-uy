import type { Model } from "mongoose";
import { Schema } from "mongoose";
import { mongoose } from "../connection/database";

/**
 * Precomputed recurrence forecast per (buyer.id × mid-level SICE rubro node).
 * "Este organismo suele licitar este rubro cada ~N meses; próximo esperado ~ventana."
 * Rebuilt monthly by src/jobs/refresh-tender-forecast.ts (compute-then-swap by
 * dataVersion). DESCRIPTIVE / derived — the OCDS feed carries no pre-publication
 * signal (0 planning, 91% status null); this is a pattern estimate, never a fact.
 * Read path only .find() by index (buyer.id is unindexed on releases).
 */
export interface ITenderForecast {
  buyerId: string;
  buyerName: string;
  rubroNodeId: string;        // SICE node token, e.g. "C2.6.5"
  rubroLabel: string;
  rubroLevel: number;         // 3 = clase (fallback 2 = subfamilia)
  rubroAncestors: string[];   // node token + ancestors + evidence leaf codes (watch-match key)
  evidenceItems: { classificationId: string; label: string; count: number }[];
  cadence: {
    medianDays: number;
    cvDays: number;           // coefficient of variation of inter-event intervals
    seasonalMonths: number[]; // 1..12 dominant
    eventCount: number;
  };
  lastEventDate: Date;
  expectedWindow: { start: Date; end: Date };
  confidence: number;         // 0..1
  incumbentSupplier?: { id?: string; name?: string };
  // p25/p50 come from an item_price_baselines bucket keyed {classificationId, currency,
  // unitName} — they are UNIT prices. Without the unit "UYU 25" reads as a tender's
  // expected amount when it is the price of one button battery, so the unit travels with
  // the number and the read path must render "p50 por <unidad>". Optional: pre-fix
  // documents and buckets with no unitName simply omit it.
  expectedAmount?: { currency: string; p25: number; p50: number; unitName?: string };
  basis: "recurrence";        // extensible: "expiry" | "recurrence+expiry"
  dataVersion: string;
  generatedAt: Date;
}

const TenderForecastSchema = new Schema<ITenderForecast>(
  {
    buyerId: { type: String, required: true },
    buyerName: { type: String, required: true, default: "" },
    rubroNodeId: { type: String, required: true },
    rubroLabel: { type: String, required: true, default: "" },
    rubroLevel: { type: Number, required: true, default: 3 },
    rubroAncestors: { type: [String], default: [] },
    evidenceItems: {
      type: [{ classificationId: String, label: String, count: Number }],
      default: [],
    },
    cadence: {
      medianDays: { type: Number, required: true },
      cvDays: { type: Number, required: true, default: 0 },
      seasonalMonths: { type: [Number], default: [] },
      eventCount: { type: Number, required: true, default: 0 },
    },
    lastEventDate: { type: Date, required: true },
    expectedWindow: {
      start: { type: Date, required: true },
      end: { type: Date, required: true },
    },
    confidence: { type: Number, required: true, default: 0 },
    incumbentSupplier: { id: { type: String }, name: { type: String } },
    expectedAmount: {
      currency: { type: String }, p25: { type: Number }, p50: { type: Number },
      unitName: { type: String },
    },
    basis: { type: String, required: true, default: "recurrence" },
    dataVersion: { type: String, required: true },
    generatedAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true, collection: "tender_forecast" }
);

TenderForecastSchema.index({ buyerId: 1, rubroNodeId: 1 }, { unique: true });
TenderForecastSchema.index({ dataVersion: 1 });
TenderForecastSchema.index({ "expectedWindow.start": 1 });
// Backs the read endpoint's default filter (expectedWindow.end >= now, the
// "still-open window" recency cut) — without this the query walks the
// expectedWindow.start index and fetches ~2/3 of the collection (elapsed
// docs sort first) before paging. See app/server/api/analytics/anticipacion.get.ts.
TenderForecastSchema.index({ "expectedWindow.end": 1 });
TenderForecastSchema.index({ rubroAncestors: 1 });
TenderForecastSchema.index({ confidence: -1 });

// HMR-safe registration (Nuxt dev re-imports models on hot reload).
export const TenderForecastModel: Model<ITenderForecast> =
  (mongoose.models.TenderForecast as Model<ITenderForecast>)
  || mongoose.model<ITenderForecast>("TenderForecast", TenderForecastSchema);
