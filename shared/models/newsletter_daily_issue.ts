import type { Document, Model } from "mongoose";
import { Schema } from "mongoose";
import { mongoose } from "../connection/database";

/**
 * La edición diaria del newsletter.
 *
 * POR QUÉ NO REUSA `newsletter_issues`. La edición semanal es un resumen del período: ranking
 * de adjudicaciones, conteo de alertas y análisis del modelo, con ocho campos obligatorios que
 * describen esa semana. La diaria es otra cosa: lleva la nota del día y las adjudicaciones de
 * ese día. Meterla en el mismo esquema obligaría a aflojar esos ocho campos, y el trabajo
 * semanal —que funciona hace meses— depende de que estén.
 *
 * LO QUE SÍ COMPARTEN, que es lo que el lector percibe como «el newsletter»:
 *   - la suscripción            `user.newsletter.subscribed`
 *   - la cola de entrega        `newsletter_deliveries`, por `issueId`
 *   - el token de baja          `user.unsubscribeToken`
 *   - el archivo público        /blog
 *
 * `newsletter_deliveries` indexa por `{issueId, userId, channel}`. Los ids de las dos
 * colecciones son ObjectId distintos, así que nunca chocan.
 */

export interface IDailyIssueNote {
  slug: string;
  title: string;
  dek: string;
  lane: string;
  subjectLabel: string;
  amountUyu: number;
  /** El hecho medido, para que el correo lo muestre sin obligar al clic. */
  measured: string;
}

export interface IDailyIssueExpense {
  rank: number;
  ocid: string;
  title: string;
  buyerName?: string | undefined;
  supplierNames: string[];
  amountUyu: number;
}

export interface INewsletterDailyIssue extends Document {
  /** YYYY-MM-DD en América/Montevideo. */
  dayKey: string;
  slug: string;
  locale: "es";
  status: "draft" | "published";
  title: string;
  excerpt: string;
  periodStart: Date;
  periodEnd: Date;
  publishedAt?: Date | undefined;
  /** Las notas que el motor publicó ese día. Puede estar vacío: entonces no se manda nada. */
  notes: IDailyIssueNote[];
  topExpenses: IDailyIssueExpense[];
  eligibleExpenseCount: number;
  totalAmountUyu: number;
  newAnomalies: number;
  deliveryEnqueuedAt?: Date | undefined;
  createdAt: Date;
  updatedAt: Date;
}

const NoteSchema = new Schema<IDailyIssueNote>(
  {
    slug: { type: String, required: true },
    title: { type: String, required: true },
    dek: { type: String, required: true },
    lane: { type: String, required: true },
    subjectLabel: { type: String, required: true },
    amountUyu: { type: Number, default: 0 },
    measured: { type: String, required: true },
  },
  { _id: false },
);

const ExpenseSchema = new Schema<IDailyIssueExpense>(
  {
    rank: { type: Number, required: true },
    ocid: { type: String, required: true },
    title: { type: String, required: true },
    buyerName: { type: String },
    supplierNames: { type: [String], default: [] },
    amountUyu: { type: Number, required: true },
  },
  { _id: false },
);

const NewsletterDailyIssueSchema = new Schema<INewsletterDailyIssue>(
  {
    dayKey: { type: String, required: true },
    slug: { type: String, required: true },
    locale: { type: String, enum: ["es"], default: "es" },
    status: { type: String, enum: ["draft", "published"], default: "draft" },
    title: { type: String, required: true },
    excerpt: { type: String, required: true },
    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true },
    publishedAt: { type: Date },
    notes: { type: [NoteSchema], default: [] },
    topExpenses: { type: [ExpenseSchema], default: [] },
    eligibleExpenseCount: { type: Number, default: 0 },
    totalAmountUyu: { type: Number, default: 0 },
    newAnomalies: { type: Number, default: 0 },
    deliveryEnqueuedAt: { type: Date },
  },
  { timestamps: true, collection: "newsletter_daily_issues" },
);

// Construidos sólo por scripts/ensure-indexes.ts. `autoIndex` está apagado.
NewsletterDailyIssueSchema.index({ dayKey: 1 }, { unique: true });
NewsletterDailyIssueSchema.index({ slug: 1 }, { unique: true });
NewsletterDailyIssueSchema.index({ status: 1, publishedAt: -1 });

export const NewsletterDailyIssueModel: Model<INewsletterDailyIssue> =
  (mongoose.models.NewsletterDailyIssue as Model<INewsletterDailyIssue>)
  || mongoose.model<INewsletterDailyIssue>("NewsletterDailyIssue", NewsletterDailyIssueSchema);
