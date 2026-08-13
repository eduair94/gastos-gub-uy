import { Schema } from "mongoose";
import { mongoose } from "../connection/database";

/**
 * Cuánta competencia hay en las compras de cada organismo — precomputado desde
 * `call_bidders` por src/jobs/refresh-bidder-competition.ts.
 *
 * LO QUE HACE PUBLICABLE ESTE INDICADOR ES LA COBERTURA, no el porcentaje. El corpus
 * tiene ~1,1M de compras y el scraper avanza de a tandas por noche, así que lo mirado
 * es parcial y desigual entre organismos. Un "% de oferente único" sin denominador
 * repetiría exactamente la trampa ya documentada del "% de compra directa", donde el
 * organismo que no etiqueta puntúa limpio.
 *
 * Por eso cada fila lleva tres números distintos y la UI los muestra juntos:
 *   - `universe`: adjudicaciones del organismo en el corpus (lo que HABRÍA que mirar)
 *   - `probed`:   cuántas de esas se sondearon
 *   - `withBidders`: de las sondeadas, cuántas publicaron el bloque
 * El porcentaje de oferente único se calcula SOBRE `withBidders`, y se marca como no
 * concluyente cuando la muestra es chica (ver MIN_* en el job).
 */
export interface IBidderCompetition {
  buyerId: string;
  buyerName: string | null;
  /** Adjudicaciones del organismo en el corpus. Denominador honesto. */
  universe: number;
  /** Compras sondeadas (con y sin bloque publicado). */
  probed: number;
  /** Sondeadas que publicaron oferentes. */
  withBidders: number;
  /**
   * De `withBidders`, cuántas publicaron algún oferente que NO fue adjudicado.
   *
   * Es el control de artefacto del indicador. Algunos organismos alimentan el bloque
   * "Proveedores participantes" con la lista de ADJUDICATARIOS y no con la de ofertas
   * recibidas: en las 65 compras sondeadas de la Intendencia de Montevideo (ids `i…`) el
   * bloque nunca contiene un perdedor, y leer eso como "se presentó una sola empresa"
   * fabricaría un 94% de oferente único que no dice nada sobre la competencia real.
   * Con `withLosers === 0` el organismo es INMEDIBLE, no limpio ni sospechoso.
   */
  withLosers: number;
  /** De `withBidders`, cuántas tuvieron exactamente uno. */
  soleBidder: number;
  /** soleBidder / withBidders, 0..1. Null si la muestra no alcanza. */
  soleRate: number | null;
  /** Promedio de oferentes sobre las que publicaron. */
  avgBidders: number | null;
  /** probed / universe, 0..1 — cuánto de este organismo llegamos a mirar. */
  coverage: number;
  /** ¿La muestra alcanza para publicar un porcentaje? */
  conclusive: boolean;
  calculatedAt: Date;
  dataVersion: string;
}

const BidderCompetitionSchema = new Schema<IBidderCompetition>(
  {
    buyerId: { type: String, required: true },
    buyerName: { type: String, default: null },
    universe: { type: Number, required: true, default: 0 },
    probed: { type: Number, required: true, default: 0 },
    withBidders: { type: Number, required: true, default: 0 },
    withLosers: { type: Number, required: true, default: 0 },
    soleBidder: { type: Number, required: true, default: 0 },
    soleRate: { type: Number, default: null },
    avgBidders: { type: Number, default: null },
    coverage: { type: Number, required: true, default: 0 },
    conclusive: { type: Boolean, required: true, default: false },
    calculatedAt: { type: Date, required: true },
    dataVersion: { type: String, required: true },
  },
  { collection: "bidder_competition" }
);

// Construidos sólo por scripts/ensure-indexes.ts.
BidderCompetitionSchema.index({ buyerId: 1 }, { unique: true });
BidderCompetitionSchema.index({ conclusive: 1, soleRate: -1 });
BidderCompetitionSchema.index({ dataVersion: 1 });

export const BidderCompetitionModel =
  mongoose.models.BidderCompetition ||
  mongoose.model<IBidderCompetition>("BidderCompetition", BidderCompetitionSchema);
