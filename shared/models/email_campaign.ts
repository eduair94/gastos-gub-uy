import { Schema } from "mongoose"; import type { Model } from "mongoose";
import { mongoose } from "../connection/database";
export type CampaignStatus = "draft" | "sending" | "paused" | "done";
export interface IEmailCampaign {
  key: string; name: string; subjectTemplate: string;
  status: CampaignStatus; segmentRubros?: string[]; createdAt?: Date; updatedAt?: Date;
}
const S = new Schema<IEmailCampaign>({
  key: { type: String, required: true },
  name: { type: String, required: true },
  subjectTemplate: { type: String, required: true },
  status: { type: String, default: "draft" },
  segmentRubros: { type: [String], default: undefined },
}, { timestamps: true, collection: "email_campaigns" });
S.index({ key: 1 }, { unique: true });
export const EmailCampaignModel: Model<IEmailCampaign> =
  (mongoose.models.EmailCampaign as Model<IEmailCampaign>) || mongoose.model<IEmailCampaign>("EmailCampaign", S);
