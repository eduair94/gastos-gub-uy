import { Schema } from "mongoose";
import { mongoose } from "../connection/database";
import { IAnomaly } from "../types/database";

// Anomaly Schema
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
    // Numeric mirror of `severity` (1=low .. 4=critical). Sorting on the
    // `severity` STRING orders critical < high < low < medium, so 'low'
    // outranks 'high'. Sort on severityRank instead.
    severityRank: { type: Number },
    releaseId: { type: String, required: true },
    awardId: { type: String },
    description: { type: String, required: true },
    detectedValue: { type: Number, required: true },
    expectedRange: {
      min: { type: Number, required: true },
      max: { type: Number, required: true },
    },
    confidence: { type: Number, required: true, min: 0, max: 1 },
    // Currency of detectedValue/expectedRange. Never assume UYU.
    currency: { type: String },
    sourceYear: { type: Number },
    dataVersion: { type: String },
    // When the detector LAST confirmed this finding. Restamped on every run, so it answers
    // "is this still true?" — not "is this new?". Previously declared on IAnomaly but absent from
    // this schema, so mongoose strict mode silently stripped it on every write.
    detectedAt: { type: Date },
    // When this finding was FIRST seen. Written via $setOnInsert and never updated, which is what
    // makes "recent anomalies" mean newly discovered ones. Keying that off detectedAt reported
    // every anomaly as recent, because a full rescan restamps them all.
    firstDetectedAt: { type: Date },
    metadata: {
      supplierName: { type: String },
      buyerName: { type: String },
      itemDescription: { type: String },
      itemClassification: {
        id: { type: String },
        description: { type: String },
        scheme: { type: String },
      },
      itemUnit: {
        id: { type: String },
        name: { type: String },
      },
      itemQuantity: { type: Number },
      baselineN: { type: Number },
      zScore: { type: Number },
      year: { type: Number },
      amount: { type: Number },
      currency: { type: String },
      sourceFileName: { type: String },
    },
  },
  {
    timestamps: true,
    collection: "anomalies",
  }
);

AnomalySchema.index({ type: 1, severity: 1 });
AnomalySchema.index({ releaseId: 1 });
AnomalySchema.index({ createdAt: -1 });
AnomalySchema.index({ confidence: -1 });
AnomalySchema.index({ sourceYear: 1, severityRank: -1 });
AnomalySchema.index({ "metadata.supplierName": 1 });
AnomalySchema.index({ detectedAt: -1 });
AnomalySchema.index({ firstDetectedAt: -1 });



// Export models - use singleton pattern to avoid recompilation issues
export const AnomalyModel = mongoose.model<IAnomaly>("Anomaly", AnomalySchema);
