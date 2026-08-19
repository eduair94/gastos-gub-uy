import { Schema } from "mongoose";
import { mongoose } from "../connection/database";
import type { IDailyInvestigation } from "../types/daily-investigation";

/**
 * `daily_investigations` — las notas que arma `src/jobs/daily-investigation.ts`.
 *
 * VIVEN EN MONGO Y NO EN TS por lo mismo que las fichas derivadas: son muchas y crecen todos
 * los días. Un módulo estático las cargaría enteras en cada worker de pm2.
 *
 * EL RECHAZO SE GUARDA. Una nota que no pasa el verificador queda con `status:'rejected'` y
 * sus motivos. No se borra: es el registro de qué intentó publicar el trabajo y por qué no
 * se pudo, y es lo primero que se mira cuando el carril deja de producir.
 */
const DailyFactSchema = new Schema(
  {
    label: { type: String, required: true },
    value: { type: String, required: true },
    raw: { type: Number },
    provenance: { type: String, required: true },
  },
  { _id: false },
);

const DailySourceSchema = new Schema(
  {
    outlet: { type: String, required: true },
    title: { type: String, required: true },
    url: { type: String, required: true },
    date: { type: String },
    checkedAt: { type: Date, required: true },
    httpStatus: { type: Number, required: true },
  },
  { _id: false },
);

const DailyTextSchema = new Schema(
  {
    title: { type: String, required: true },
    dek: { type: String, required: true },
    measured: { type: String, required: true },
    contexto: { type: String, required: true },
    norm: { type: String, required: true },
    normCite: { type: String, required: true },
    missing: { type: String, required: true },
    answers: { type: String, required: true },
  },
  { _id: false },
);

const DailyInvestigationSchema = new Schema<IDailyInvestigation>(
  {
    slug: { type: String, required: true },
    dayKey: { type: String, required: true },
    lane: { type: String, required: true },
    subjectKey: { type: String, required: true },
    subjectLabel: { type: String, required: true },
    status: { type: String, required: true, default: "draft" },
    rejectedReasons: { type: [String], default: [] },
    publishedAt: { type: Date },
    amountUyu: { type: Number, required: true, default: 0 },
    contractCount: { type: Number, required: true, default: 0 },
    periodFrom: { type: Date, required: true },
    periodTo: { type: Date, required: true },
    facts: { type: [DailyFactSchema], default: [] },
    query: { type: Schema.Types.Mixed, default: {} },
    ocids: { type: [String], default: [] },
    sources: { type: [DailySourceSchema], default: [] },
    reproduce: { type: String, required: true },
    measuredOn: { type: String, required: true },
    es: { type: DailyTextSchema, required: true },
    en: { type: DailyTextSchema, required: true },
    ai: {
      provider: { type: String, required: true },
      model: { type: String, required: true },
      generatedAt: { type: Date, required: true },
      promptTokens: { type: Number, default: 0 },
      candidatesTokens: { type: Number, default: 0 },
      totalTokens: { type: Number, default: 0 },
    },
  },
  { collection: "daily_investigations", timestamps: true },
);

// Construidos sólo por scripts/ensure-indexes.ts. `autoIndex` está apagado.
DailyInvestigationSchema.index({ slug: 1 }, { unique: true });
DailyInvestigationSchema.index({ status: 1, publishedAt: -1 });
DailyInvestigationSchema.index({ dayKey: -1 });
// El índice de deduplicación: «¿este sujeto ya salió?» es la consulta que corre en cada corrida.
DailyInvestigationSchema.index({ subjectKey: 1, publishedAt: -1 });
DailyInvestigationSchema.index({ lane: 1, publishedAt: -1 });

export const DailyInvestigationModel =
  mongoose.models.DailyInvestigation ||
  mongoose.model<IDailyInvestigation>("DailyInvestigation", DailyInvestigationSchema);
