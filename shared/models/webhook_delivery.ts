import { Schema } from 'mongoose'
import type { Model } from 'mongoose'
import { mongoose } from '../connection/database'
import { IWebhookDelivery } from '../types/monitor'

// Idempotent outbox for webhook deliveries — mirrors the `notifications` pattern.
// The unique `dedupeKey` means a producer that re-runs (a cron re-tick, a resync)
// never enqueues the same event to the same subscription twice. Drained by
// src/jobs/webhooks/dispatch.ts with signed POSTs and exponential backoff.
const WebhookDeliverySchema = new Schema<IWebhookDelivery>(
  {
    subscriptionId: { type: String, required: true },
    event: { type: String, required: true },
    dedupeKey: { type: String, required: true, unique: true },
    payload: { type: Schema.Types.Mixed, required: true },
    status: { type: String, enum: ['pending', 'sent', 'failed'], default: 'pending' },
    attempts: { type: Number, default: 0 },
    lastError: { type: String },
    nextAttemptAt: { type: Date },
    sentAt: { type: Date },
  },
  { timestamps: true, collection: 'webhook_deliveries' },
)

WebhookDeliverySchema.index({ status: 1, nextAttemptAt: 1 })

export const WEBHOOK_MAX_ATTEMPTS = Number(process.env.WEBHOOK_MAX_ATTEMPTS || 6)

export const WebhookDeliveryModel: Model<IWebhookDelivery>
  = (mongoose.models.WebhookDelivery as Model<IWebhookDelivery>)
    || mongoose.model<IWebhookDelivery>('WebhookDelivery', WebhookDeliverySchema)
