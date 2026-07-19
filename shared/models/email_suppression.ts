import { Schema } from "mongoose"; import type { Model } from "mongoose";
import { mongoose } from "../connection/database";
export type SuppressionReason = "unsubscribe" | "bounce" | "complaint" | "manual";
export interface IEmailSuppression { email: string; reason: SuppressionReason; source: string; at: Date }
const S = new Schema<IEmailSuppression>({
  email: { type: String, required: true, lowercase: true, trim: true },
  reason: { type: String, required: true },
  source: { type: String, default: "" },
  at: { type: Date, default: Date.now },
}, { collection: "email_suppressions" });
S.index({ email: 1 }, { unique: true });
export const EmailSuppressionModel: Model<IEmailSuppression> =
  (mongoose.models.EmailSuppression as Model<IEmailSuppression>) || mongoose.model<IEmailSuppression>("EmailSuppression", S);
