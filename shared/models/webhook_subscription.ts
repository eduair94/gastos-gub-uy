import { Schema } from 'mongoose'
import type { Model } from 'mongoose'
import { mongoose } from '../connection/database'
import { IWebhookSubscription } from '../types/monitor'

// A user's HTTPS endpoint subscribed to push events (REST Hooks style). The
// `secret` signs deliveries (HMAC) and is returned only once at creation.
const WebhookSubscriptionSchema = new Schema<IWebhookSubscription>(
  {
    userId: { type: String, required: true },
    apiKeyId: { type: String },
    url: { type: String, required: true },
    events: { type: [String], enum: ['tender.matched', 'anomaly.detected', 'award.created'], default: [] },
    filters: {
      type: new Schema({
        categories: { type: [String], default: undefined },
        keywords: { type: [String], default: undefined },
        buyers: { type: [String], default: undefined },
        minAmount: { type: Number },
        minZ: { type: Number },
        severity: { type: String },
        supplierId: { type: String },
      }, { _id: false }),
      default: undefined,
    },
    secret: { type: String, required: true },
    active: { type: Boolean, default: true },
    failureCount: { type: Number, default: 0 },
    lastDeliveryAt: { type: Date },
  },
  { timestamps: true, collection: 'webhook_subscriptions' },
)

WebhookSubscriptionSchema.index({ userId: 1, createdAt: -1 })
WebhookSubscriptionSchema.index({ active: 1, events: 1 })

export const WEBHOOK_SUBSCRIPTION_CAP = Number(process.env.WEBHOOK_SUBSCRIPTION_CAP || 10)

export const WebhookSubscriptionModel: Model<IWebhookSubscription>
  = (mongoose.models.WebhookSubscription as Model<IWebhookSubscription>)
    || mongoose.model<IWebhookSubscription>('WebhookSubscription', WebhookSubscriptionSchema)
