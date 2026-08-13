import { Schema } from "mongoose";
import { mongoose } from "../connection/database";

/**
 * Resoluciones del Tribunal de Cuentas — el auditor del propio Estado pronunciándose
 * sobre compras concretas. Una fila por ficha (`resoluciones_busqueda.php?id=N`).
 *
 * Escrito por src/jobs/scrape-tcr-resolutions.ts. Ver shared/tcr-resolution.ts para el
 * límite que manda sobre cómo se publica esto: la ficha HTML trae SÓLO el VISTO, no el
 * fallo. De acá se puede decir "el TC se pronunció sobre esta compra" y nada más fuerte;
 * si el gasto fue observado y por cuánto está en el PDF, que se enlaza siempre.
 *
 * Se guarda TODA ficha sondeada, incluidas las que no son de contrataciones y las que no
 * existen (`exists:false`), para que el recorrido de ids sea resumible sin re-bajar.
 */
export interface ITcrResolution {
  tcrId: number;
  exists: boolean;
  probedAt: Date;
  date: string | null;
  /** Fecha parseada, para ordenar y filtrar. */
  resolvedAt: Date | null;
  organismPath: string | null;
  organism: string | null;
  subject: string | null;
  expediente: string | null;
  visto: string | null;
  pdfUrl: string | null;
  sourceUrl: string;
  isProcurement: boolean;
  /** Cómo la resolución nombra la compra. Null si no la nombra. */
  procurementMethod: string | null;
  procurementNumber: string | null;
  procurementYear: number | null;
  /** "Licitación Pública 5/2021" — la forma exacta de `tender.title` en el corpus. */
  procurementTitle: string | null;
  /** Compra del corpus a la que se pudo atar, si el cruce fue inequívoco. */
  matchedOcid: string | null;
  matchedCompraId: string | null;
  matchedBuyerName: string | null;
  /** Cuántas compras del corpus comparten la clave. >1 = ambiguo y NO se ata. */
  matchCandidates: number;
}

const TcrResolutionSchema = new Schema<ITcrResolution>(
  {
    tcrId: { type: Number, required: true },
    exists: { type: Boolean, required: true, default: false },
    probedAt: { type: Date, required: true },
    date: { type: String, default: null },
    resolvedAt: { type: Date, default: null },
    organismPath: { type: String, default: null },
    organism: { type: String, default: null },
    subject: { type: String, default: null },
    expediente: { type: String, default: null },
    visto: { type: String, default: null },
    pdfUrl: { type: String, default: null },
    sourceUrl: { type: String, required: true },
    isProcurement: { type: Boolean, required: true, default: false },
    procurementMethod: { type: String, default: null },
    procurementNumber: { type: String, default: null },
    procurementYear: { type: Number, default: null },
    procurementTitle: { type: String, default: null },
    matchedOcid: { type: String, default: null },
    matchedCompraId: { type: String, default: null },
    matchedBuyerName: { type: String, default: null },
    matchCandidates: { type: Number, required: true, default: 0 },
  },
  { collection: "tcr_resolutions" }
);

// Construidos sólo por scripts/ensure-indexes.ts.
TcrResolutionSchema.index({ tcrId: 1 }, { unique: true });
// El panel de la ficha del contrato: "¿el TC dijo algo de esta compra?".
TcrResolutionSchema.index({ matchedOcid: 1 });
// El listado público: contrataciones, más nuevas primero.
TcrResolutionSchema.index({ isProcurement: 1, resolvedAt: -1 });

export const TcrResolutionModel =
  mongoose.models.TcrResolution || mongoose.model<ITcrResolution>("TcrResolution", TcrResolutionSchema);
