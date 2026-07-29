import { Schema } from "mongoose";
import type { Model } from "mongoose";
import { mongoose } from "../connection/database";
import type { INewsletterIssue } from "../types/newsletter";

const ExpenseSchema = new Schema(
  {
    rank: { type: Number, required: true },
    releaseId: { type: String, required: true },
    ocid: { type: String, required: true },
    title: { type: String, required: true },
    buyerName: { type: String },
    supplierNames: { type: [String], default: [] },
    amountUyu: { type: Number, required: true },
    publishedAt: { type: Date, required: true },
  },
  { _id: false },
);

const AnomalyFindingSchema = new Schema(
  {
    anomalyId: { type: String, required: true },
    releaseId: { type: String, required: true },
    type: { type: String, required: true },
    severity: { type: String, enum: ["low", "medium", "high", "critical"], required: true },
    severityRank: { type: Number, required: true },
    description: { type: String, required: true },
    buyerName: { type: String },
    supplierName: { type: String },
    itemDescription: { type: String },
    detectedValue: { type: Number, required: true },
    expectedMin: { type: Number, required: true },
    expectedMax: { type: Number, required: true },
    currency: { type: String },
    zScore: { type: Number },
    aiExplainable: { type: String, enum: ["yes", "no", "uncertain"] },
    aiCategory: { type: String },
  },
  { _id: false },
);

const NewsletterIssueSchema = new Schema<INewsletterIssue>(
  {
    weekKey: { type: String, required: true },
    slug: { type: String, required: true },
    locale: { type: String, enum: ["es"], default: "es" },
    status: { type: String, enum: ["draft", "published"], default: "draft" },
    title: { type: String, required: true },
    excerpt: { type: String, required: true },
    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true },
    publishedAt: { type: Date },
    eligibleExpenseCount: { type: Number, required: true },
    totalAmountUyu: { type: Number, required: true },
    topExpenses: { type: [ExpenseSchema], default: [] },
    anomalySummary: {
      total: { type: Number, required: true },
      highCritical: { type: Number, required: true },
      unexplained: { type: Number, required: true },
      dataErrors: { type: Number, required: true },
      pendingAiReview: { type: Number, required: true },
      bySeverity: {
        low: { type: Number, required: true },
        medium: { type: Number, required: true },
        high: { type: Number, required: true },
        critical: { type: Number, required: true },
      },
    },
    anomalyFindings: { type: [AnomalyFindingSchema], default: [] },
    analysis: {
      headline: { type: String, required: true },
      overview: { type: [String], default: [] },
      spendingPatterns: { type: [String], default: [] },
      cautions: { type: [String], default: [] },
    },
    ai: {
      provider: { type: String, enum: ["gemini"], required: true },
      model: { type: String, required: true },
      generatedAt: { type: Date, required: true },
      promptTokens: { type: Number, default: 0 },
      candidatesTokens: { type: Number, default: 0 },
      totalTokens: { type: Number, default: 0 },
    },
    methodology: {
      amountField: { type: String, enum: ["amount.primaryAmount"], required: true },
      expenseScope: { type: String, required: true },
      anomalyDateField: { type: String, enum: ["firstDetectedAt"], required: true },
      anomalyDisclaimer: { type: String, required: true },
    },
    deliveryEnqueuedAt: { type: Date },
  },
  { timestamps: true, collection: "newsletter_issues" },
);

NewsletterIssueSchema.index({ weekKey: 1 }, { unique: true });
NewsletterIssueSchema.index({ slug: 1 }, { unique: true });
NewsletterIssueSchema.index({ status: 1, publishedAt: -1 });

export const NewsletterIssueModel: Model<INewsletterIssue> =
  (mongoose.models.NewsletterIssue as Model<INewsletterIssue>)
  || mongoose.model<INewsletterIssue>("NewsletterIssue", NewsletterIssueSchema);
