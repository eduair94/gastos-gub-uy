import { Schema } from "mongoose";
import type { Model } from "mongoose";
import { mongoose } from "../connection/database";
import { IOpenCall } from "../types/monitor";

// The merged, live view of a tender call ("llamado"), keyed by `compraId`
// (= id_compra). Projected from the already-ingested `releases` collection by
// src/jobs/sync-open-calls.ts — a small, hot, purpose-indexed surface for the
// matching + browse + calendar workloads, decoupled from the 2.17M `releases`.
//
// NEVER derive the government source link from `id`; use ocid via
// server/utils/query.sourceUrl(ocid) — ids diverge on aclaración/ajuste records.

const ItemSchema = new Schema(
  {
    description: { type: String },
    classificationId: { type: String },
    classificationLabel: { type: String },
    quantity: { type: Number },
    unit: {
      id: { type: String },
      name: { type: String },
    },
  },
  { _id: false }
);

const DocumentSchema = new Schema(
  {
    title: { type: String },
    url: { type: String, required: true },
    format: { type: String },
    datePublished: { type: Date },
    documentType: { type: String },
  },
  { _id: false }
);

const PliegoSummarySchema = new Schema(
  {
    objeto: { type: String },
    requisitosClave: { type: [String], default: undefined },
    plazos: {
      recepcionOfertas: { type: String },
      aperturaOfertas: { type: String },
      consultas: { type: String },
    },
    garantias: { type: String },
    criteriosEvaluacion: { type: [String], default: undefined },
    montoReferencia: { type: String },
    observaciones: { type: [String], default: undefined },
    model: { type: String },
    generatedAt: { type: Date },
    sourceDocs: { type: [String], default: undefined },
    disclaimer: { type: String },
  },
  { _id: false }
);

const OpenCallSchema = new Schema<IOpenCall>(
  {
    compraId: { type: String, required: true, unique: true },
    ocid: { type: String, required: true },
    latestReleaseId: { type: String },
    sourceReleaseIds: { type: [String], default: [] },

    title: { type: String, required: true },
    description: { type: String },
    buyer: {
      id: { type: String },
      name: { type: String },
    },
    procuringEntity: {
      id: { type: String },
      name: { type: String },
    },
    // OCDS enum — internal only, never displayed (DESIGN.md). Show
    // procurementMethodDetails (the Spanish name) instead.
    procurementMethod: { type: String },
    procurementMethodDetails: { type: String },

    status: {
      type: String,
      required: true,
      enum: ["open", "clarification", "amended", "closed", "awarded", "cancelled"],
      default: "open",
    },
    publishDate: { type: Date },
    tenderPeriod: {
      startDate: { type: Date },
      endDate: { type: Date }, // reception deadline
    },
    enquiryPeriod: {
      startDate: { type: Date },
      endDate: { type: Date },
    },

    items: { type: [ItemSchema], default: [] },
    // Deduped classification ids — the category match key (multikey index).
    classificationSet: { type: [String], default: [] },
    // Normalized concat(title, description, item descriptions, labels) for the
    // keyword text index. default_language 'none' (built in ensure-indexes).
    searchText: { type: String, default: "" },
    estimatedValue: { type: Number },
    currency: { type: String },

    documents: { type: [DocumentSchema], default: [] },
    aiSummary: { type: PliegoSummarySchema, default: undefined },
    awardRef: {
      releaseId: { type: String },
      ocid: { type: String },
      awardedAt: { type: Date },
    },

    firstSeenAt: { type: Date },
    lastSyncedAt: { type: Date },
  },
  { timestamps: true, collection: "open_calls" }
);

// Ensured by scripts/ensure-indexes.ts. The text index name is fixed so the
// script and any future migration stay in sync (one text index per collection).
OpenCallSchema.index({ compraId: 1 }, { unique: true });
OpenCallSchema.index({ classificationSet: 1 });
OpenCallSchema.index({ "tenderPeriod.endDate": 1 });
OpenCallSchema.index({ "buyer.id": 1 });
OpenCallSchema.index({ status: 1, "tenderPeriod.endDate": 1 });
OpenCallSchema.index({ firstSeenAt: -1 });

export const OpenCallModel: Model<IOpenCall> =
  (mongoose.models.OpenCall as Model<IOpenCall>) || mongoose.model<IOpenCall>("OpenCall", OpenCallSchema);
