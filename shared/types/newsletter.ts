import type { Document } from "mongoose";

export type NewsletterIssueStatus = "draft" | "published";
export type NewsletterDeliveryChannel = "email" | "push";
export type NewsletterDeliveryStatus = "pending" | "sent" | "failed" | "skipped";

export interface INewsletterExpense {
  rank: number;
  releaseId: string;
  ocid: string;
  title: string;
  buyerName?: string | undefined;
  supplierNames: string[];
  amountUyu: number;
  publishedAt: Date;
}

export interface INewsletterAnomalyFinding {
  anomalyId: string;
  releaseId: string;
  type: string;
  severity: "low" | "medium" | "high" | "critical";
  severityRank: number;
  description: string;
  buyerName?: string | undefined;
  supplierName?: string | undefined;
  itemDescription?: string | undefined;
  detectedValue: number;
  expectedMin: number;
  expectedMax: number;
  currency?: string | undefined;
  zScore?: number | undefined;
  aiExplainable?: "yes" | "no" | "uncertain" | undefined;
  aiCategory?: string | undefined;
}

/**
 * A spending topic's movement inside the week (shared/spending-topics.ts). Optional:
 * an issue from before the topics existed, or a quiet week, simply has none, and the
 * renderers skip the block rather than print a zero.
 */
export interface INewsletterTopicHighlight {
  topicKey: string;
  slug: string;
  label: string;
  /** Contracts whose `firstSeenAt` falls inside the issue's week. */
  newContracts: number;
  newTotalUyu: number;
  items: Array<{
    ocid: string;
    releaseId?: string | undefined;
    title: string;
    buyerName?: string | undefined;
    amountUyu: number;
    hasAmount: boolean;
  }>;
}

export interface INewsletterAnomalySummary {
  total: number;
  highCritical: number;
  unexplained: number;
  dataErrors: number;
  pendingAiReview: number;
  bySeverity: {
    low: number;
    medium: number;
    high: number;
    critical: number;
  };
}

export interface INewsletterAiAnalysis {
  headline: string;
  overview: string[];
  spendingPatterns: string[];
  cautions: string[];
}

export interface INewsletterIssue extends Document {
  weekKey: string;
  slug: string;
  locale: "es";
  status: NewsletterIssueStatus;
  title: string;
  excerpt: string;
  periodStart: Date;
  periodEnd: Date;
  publishedAt?: Date | undefined;
  eligibleExpenseCount: number;
  totalAmountUyu: number;
  topExpenses: INewsletterExpense[];
  anomalySummary: INewsletterAnomalySummary;
  anomalyFindings: INewsletterAnomalyFinding[];
  topicHighlights?: INewsletterTopicHighlight[] | undefined;
  analysis: INewsletterAiAnalysis;
  ai: {
    provider: "gemini";
    model: string;
    generatedAt: Date;
    promptTokens: number;
    candidatesTokens: number;
    totalTokens: number;
  };
  methodology: {
    amountField: "amount.primaryAmount";
    expenseScope: string;
    anomalyDateField: "firstDetectedAt";
    anomalyDisclaimer: string;
  };
  deliveryEnqueuedAt?: Date | undefined;
  createdAt: Date;
  updatedAt: Date;
}

export interface INewsletterDelivery extends Document {
  issueId: string;
  userId: string;
  channel: NewsletterDeliveryChannel;
  status: NewsletterDeliveryStatus;
  attempts: number;
  providerMessageId?: string | undefined;
  lastError?: string | undefined;
  sentAt?: Date | undefined;
  createdAt: Date;
  updatedAt: Date;
}
