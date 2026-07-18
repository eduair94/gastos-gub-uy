import { Schema } from "mongoose";
import type { Model } from "mongoose";
import { mongoose } from "../connection/database";
import { INotification } from "../types/monitor";

// Unified transactional-email outbox: alerts, deadline reminders, and award
// notices. `dedupeKey` is unique, which makes enqueue idempotent — a resync or
// a double cron tick can never produce two emails for the same (type,user,call).
const NotificationSchema = new Schema<INotification>(
  {
    type: { type: String, required: true, enum: ["alert", "reminder", "award"] },
    userId: { type: String, required: true },
    compraId: { type: String, required: true },
    // Which of the user's watches matched (alert type) — for the email body.
    watchIds: { type: [String], default: [] },
    matchedOn: {
      categories: { type: [String], default: undefined },
      keywords: { type: [String], default: undefined },
    },
    dedupeKey: { type: String, required: true },
    channel: { type: String, enum: ["email"], default: "email" },
    status: { type: String, required: true, enum: ["pending", "sent", "failed", "skipped"], default: "pending" },
    // Groups the calls that went out in one batched email.
    batchId: { type: String },
    attempts: { type: Number, default: 0 },
    lastError: { type: String },
    // Reminders: the day the reminder should fire.
    scheduledFor: { type: Date },
    sentAt: { type: Date },
  },
  { timestamps: true, collection: "notifications" }
);

NotificationSchema.index({ dedupeKey: 1 }, { unique: true });
NotificationSchema.index({ status: 1, type: 1 });
NotificationSchema.index({ userId: 1, createdAt: -1 });
NotificationSchema.index({ status: 1, scheduledFor: 1 });

export const NotificationModel: Model<INotification> =
  (mongoose.models.Notification as Model<INotification>)
  || mongoose.model<INotification>("Notification", NotificationSchema);
