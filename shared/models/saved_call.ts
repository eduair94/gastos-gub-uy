import { Schema } from "mongoose";
import type { Model } from "mongoose";
import { mongoose } from "../connection/database";
import { ISavedCall } from "../types/monitor";

// A user's bookmark of an open call — powers the deadline calendar and the
// N-days-before reminders. `reminderSentAt` guards against re-sending.
const SavedCallSchema = new Schema<ISavedCall>(
  {
    userId: { type: String, required: true },
    compraId: { type: String, required: true },
    note: { type: String },
    reminderDaysBefore: { type: Number },
    reminderSentAt: { type: Date },
  },
  { timestamps: true, collection: "saved_calls" }
);

SavedCallSchema.index({ userId: 1, compraId: 1 }, { unique: true });
SavedCallSchema.index({ userId: 1, createdAt: -1 });

export const SavedCallModel: Model<ISavedCall> =
  (mongoose.models.SavedCall as Model<ISavedCall>)
  || mongoose.model<ISavedCall>("SavedCall", SavedCallSchema);
