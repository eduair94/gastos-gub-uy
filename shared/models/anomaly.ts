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
    collection: "anomalies",
  }
);

AnomalySchema.index({ type: 1, severity: 1 });
AnomalySchema.index({ releaseId: 1 });
AnomalySchema.index({ createdAt: -1 });
AnomalySchema.index({ confidence: -1 });



// Export models - use singleton pattern to avoid recompilation issues
export const AnomalyModel = mongoose.model<IAnomaly>("Anomaly", AnomalySchema);
