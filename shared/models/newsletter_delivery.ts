import { Schema } from "mongoose";
import type { Model } from "mongoose";
import { mongoose } from "../connection/database";
import type { INewsletterDelivery } from "../types/newsletter";

const NewsletterDeliverySchema = new Schema<INewsletterDelivery>(
  {
    issueId: { type: String, required: true },
    userId: { type: String, required: true },
    channel: { type: String, enum: ["email", "push"], required: true },
    status: { type: String, enum: ["pending", "sent", "failed", "skipped"], default: "pending" },
    attempts: { type: Number, default: 0 },
    providerMessageId: { type: String },
    lastError: { type: String },
    sentAt: { type: Date },
  },
  { timestamps: true, collection: "newsletter_deliveries" },
);

NewsletterDeliverySchema.index({ issueId: 1, userId: 1, channel: 1 }, { unique: true });
NewsletterDeliverySchema.index({ issueId: 1, status: 1, channel: 1 });

export const NewsletterDeliveryModel: Model<INewsletterDelivery> =
  (mongoose.models.NewsletterDelivery as Model<INewsletterDelivery>)
  || mongoose.model<INewsletterDelivery>("NewsletterDelivery", NewsletterDeliverySchema);
