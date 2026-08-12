import { Schema } from "mongoose";
import { mongoose } from "../connection/database";

/**
 * Quiénes se presentaron a una compra, leídos del bloque "Proveedores participantes"
 * de la ficha del gobierno. Un documento por COMPRA (`ocid`) — los oferentes son
 * propiedad del llamado, no de la adjudicación.
 *
 * Distinto de `acta_bidders` a propósito: aquél sale del acta en PDF, sólo trae nombres
 * y enumera en ~8% de los casos. Éste sale del HTML, trae documento + RUT y en la
 * medición del 2026-08-12 apareció en 30 de 30 adjudicaciones de cinco años distintos.
 * Esa diferencia de cobertura es la que habilita el indicador de oferente único.
 *
 * TODA compra sondeada guarda documento, incluidas las que no publican el bloque
 * (`found:false`). Eso hace el job resumible sin volver a bajar la página, y sobre todo
 * permite que la UI y los agregados distingan "no publicó" de "no lo miramos todavía".
 * Nunca deben contarse igual: una compra abierta todavía no muestra oferentes, y leer
 * ese silencio como "sin competencia" fabricaría el hallazgo.
 *
 * Escrito por src/jobs/scrape-call-bidders.ts.
 */
export interface ICallBidder {
  docType: string;
  docNumber: string;
  name: string;
  /** 12 dígitos exactos, o null (extranjero / cédula). Clave de cruce con proveedores. */
  rut: string | null;
}

export interface ICallBidders {
  ocid: string;
  compraId: string;
  sourceUrl: string;
  probedAt: Date;
  /** ¿La ficha publicó el bloque con al menos un oferente? */
  found: boolean;
  /** Cantidad de oferentes. Null cuando no publicó — NUNCA 0. */
  count: number | null;
  bidders: ICallBidder[];
  /** Año de la compra, para poder agregar por período sin volver a `releases`. */
  sourceYear: number | null;
  /** buyer.id del organismo comprador, para el indicador por organismo. */
  buyerId: string | null;
  buyerName: string | null;
}

const CallBidderSchema = new Schema<ICallBidder>(
  {
    docType: { type: String, required: true },
    docNumber: { type: String, required: true },
    name: { type: String, required: true },
    rut: { type: String, default: null },
  },
  { _id: false }
);

const CallBiddersSchema = new Schema<ICallBidders>(
  {
    ocid: { type: String, required: true },
    compraId: { type: String, required: true },
    sourceUrl: { type: String, required: true },
    probedAt: { type: Date, required: true },
    found: { type: Boolean, required: true, default: false },
    count: { type: Number, default: null },
    bidders: { type: [CallBidderSchema], default: [] },
    sourceYear: { type: Number, default: null },
    buyerId: { type: String, default: null },
    buyerName: { type: String, default: null },
  },
  { collection: "call_bidders" }
);

// Construidos sólo por scripts/ensure-indexes.ts — autoIndex está apagado.
CallBiddersSchema.index({ ocid: 1 }, { unique: true });
CallBiddersSchema.index({ found: 1, probedAt: -1 });
// El indicador por organismo: filtra found + agrupa por buyerId dentro de un año.
CallBiddersSchema.index({ buyerId: 1, sourceYear: -1, count: 1 });
// Reverso: en qué llamados se presentó una empresa (y cuáles perdió).
CallBiddersSchema.index({ "bidders.rut": 1 });

export const CallBiddersModel =
  mongoose.models.CallBidders || mongoose.model<ICallBidders>("CallBidders", CallBiddersSchema);
