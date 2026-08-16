import { Schema } from "mongoose";
import { mongoose } from "../connection/database";
import type { ParsedReiteracion } from "../reiteracion";

/**
 * El documento de reiteración del gasto, bajado y parseado una sola vez.
 *
 * Escrito por src/jobs/fetch-reiteracion-docs.ts. Se guarda TODA descarga, también la que no
 * dio texto (`hasText:false`, que es lo que devuelve un PDF escaneado). Así el recorrido es
 * resumible y el sitio del Estado no recibe dos veces el mismo pedido.
 *
 * Los campos del comprador y del proveedor se copian del release al bajar. De esa forma el
 * armador de fichas agrupa sin volver a tocar `releases`, que tiene 2,18 millones de
 * documentos y ningún índice por `buyer.id`.
 */
export interface IReiteracionDoc extends ParsedReiteracion {
  ocid: string;
  url: string;
  fetchedAt: Date;
  httpStatus: number;
  hasText: boolean;
  textChars: number;
  text: string | null;
  buyerId: string | null;
  buyerName: string | null;
  supplierIds: string[];
  supplierNames: string[];
  sourceYear: number | null;
  primaryAmount: number | null;
}

const ReiteracionDocSchema = new Schema<IReiteracionDoc>(
  {
    ocid: { type: String, required: true },
    url: { type: String, required: true },
    fetchedAt: { type: Date, required: true },
    httpStatus: { type: Number, required: true, default: 0 },
    hasText: { type: Boolean, required: true, default: false },
    textChars: { type: Number, required: true, default: 0 },
    text: { type: String, default: null },
    buyerId: { type: String, default: null },
    buyerName: { type: String, default: null },
    supplierIds: { type: [String], default: [] },
    supplierNames: { type: [String], default: [] },
    sourceYear: { type: Number, default: null },
    primaryAmount: { type: Number, default: null },
    observed: { type: Boolean, required: true, default: false },
    reason: { type: String, default: null },
    resolutionNumber: { type: String, default: null },
    resolutionDate: { type: String, default: null },
    tocafArticle: { type: String, default: null },
    observedBy: { type: String, default: null },
  },
  { collection: "reiteracion_docs" }
);

// Construidos sólo por scripts/ensure-indexes.ts. `autoIndex` está apagado.
ReiteracionDocSchema.index({ ocid: 1 }, { unique: true });
ReiteracionDocSchema.index({ observed: 1, reason: 1 });
ReiteracionDocSchema.index({ buyerId: 1 });

export const ReiteracionDocModel =
  mongoose.models.ReiteracionDoc ||
  mongoose.model<IReiteracionDoc>("ReiteracionDoc", ReiteracionDocSchema);
