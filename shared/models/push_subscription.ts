import { Schema } from "mongoose";
import type { Model } from "mongoose";
import { mongoose } from "../connection/database";
import { IPushSubscription } from "../types/monitor";

// One Web Push endpoint per browser/device. A user can have several. The push
// dispatcher deactivates a row (active:false) on a 404/410 from the push service
// (the browser dropped the subscription), so a stale endpoint stops being retried.
// `endpoint` is unique so re-subscribing the same browser is an idempotent upsert.
const PushSubscriptionSchema = new Schema<IPushSubscription>(
  {
    userId: { type: String, required: true },
    endpoint: { type: String, required: true },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },
    userAgent: { type: String },
    active: { type: Boolean, default: true },
    failureCount: { type: Number, default: 0 },
    lastSuccessAt: { type: Date },
  },
  { timestamps: true, collection: "push_subscriptions" }
);

// Indexes are BUILT by scripts/ensure-indexes.ts (autoIndex is off globally).
PushSubscriptionSchema.index({ endpoint: 1 }, { unique: true });
PushSubscriptionSchema.index({ userId: 1 });

export const PushSubscriptionModel: Model<IPushSubscription> =
  (mongoose.models.PushSubscription as Model<IPushSubscription>)
  || mongoose.model<IPushSubscription>("PushSubscription", PushSubscriptionSchema);
