import { Schema } from "mongoose"; import type { Model } from "mongoose";
import { mongoose } from "../connection/database";
// "sending" is the in-flight claim state between "queued" and a terminal status:
// the dispatcher flips a row queued->sending atomically before emailing it, so
// two concurrent dispatchers can never pick up the same row. A row only stays
// "sending" if a dispatcher died mid-send; the next run reclaims it (see
// buildStaleReclaimFilter / STALE_CLAIM_MS in src/jobs/campaign/send.ts).
export type SendStatus = "queued"|"sending"|"sent"|"delivered"|"opened"|"clicked"|"bounced"|"complained"|"unsubscribed"|"failed";
export interface ICampaignSend {
  campaignId: string; supplierId: string; email: string; rubroKey: string; token: string;
  status: SendStatus; providerMessageId?: string; error?: string; name?: string;
  queuedAt?: Date; claimedAt?: Date; sentAt?: Date; updatedAt?: Date;
}
const S = new Schema<ICampaignSend>({
  campaignId: { type: String, required: true },
  supplierId: { type: String, required: true },
  email: { type: String, required: true, lowercase: true, trim: true },
  rubroKey: { type: String, default: "" },
  token: { type: String, required: true },
  status: { type: String, default: "queued" },
  providerMessageId: { type: String },
  name: { type: String },
  error: { type: String },
  queuedAt: { type: Date, default: Date.now },
  claimedAt: { type: Date },
  sentAt: { type: Date },
}, { timestamps: true, collection: "campaign_sends" });
S.index({ campaignId: 1, email: 1 }, { unique: true });
S.index({ token: 1 }, { unique: true });
S.index({ status: 1, campaignId: 1 });
S.index({ providerMessageId: 1 });
export const CampaignSendModel: Model<ICampaignSend> =
  (mongoose.models.CampaignSend as Model<ICampaignSend>) || mongoose.model<ICampaignSend>("CampaignSend", S);
