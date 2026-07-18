import { Schema } from "mongoose";
import type { Model } from "mongoose";
import { mongoose } from "../connection/database";
import { IAnomalyFeedback } from "../types/monitor";

// A logged-in user's verdict on a single price-anomaly flag: whether it is a real
// anomaly (vote = 1) or a false positive (vote = -1), with an optional comment
// justifying the call. One document per (userId, anomalyId) — the unique index
// makes the upsert idempotent, so re-voting updates in place rather than piling up.
//
// The anomalyType / releaseId / awardId / supplierName snapshots are copied from the
// anomaly on first insert so the feedback can be analysed (e.g. which suppliers or
// types draw the most false-positive votes, to feed back into detector quality)
// without a join to the `anomalies` collection.
//
// Feedback is keyed on the anomaly's Mongo _id (the route param). That _id is stable
// while the flag keeps reproducing (the detector upserts on {releaseId, awardId,
// type}). The one gap: if reconcile deletes a flag whose price got corrected and the
// SAME release+award later re-spikes, the new flag gets a NEW _id and the old votes
// don't reattach — a rare, accepted loss. The releaseId+awardId snapshot is what a
// future re-association job would use if that ever needs fixing.
const AnomalyFeedbackSchema = new Schema<IAnomalyFeedback>(
  {
    userId: { type: String, required: true },
    anomalyId: { type: String, required: true },
    vote: { type: Number, required: true, enum: [1, -1] },
    comment: { type: String },
    anomalyType: { type: String },
    releaseId: { type: String },
    awardId: { type: String },
    supplierName: { type: String },
  },
  { timestamps: true, collection: "anomaly_feedback" }
);

AnomalyFeedbackSchema.index({ userId: 1, anomalyId: 1 }, { unique: true });
// Compound {anomalyId, vote} so the per-anomaly up/down count aggregate is served
// straight from the index (both grouped fields present) without fetching each vote
// doc. Its {anomalyId} prefix still serves the plain by-anomaly lookups.
AnomalyFeedbackSchema.index({ anomalyId: 1, vote: 1 });
AnomalyFeedbackSchema.index({ userId: 1, createdAt: -1 });

export const AnomalyFeedbackModel: Model<IAnomalyFeedback> =
  (mongoose.models.AnomalyFeedback as Model<IAnomalyFeedback>)
  || mongoose.model<IAnomalyFeedback>("AnomalyFeedback", AnomalyFeedbackSchema);
