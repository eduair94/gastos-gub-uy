import { Schema } from "mongoose";
import { mongoose } from "../connection/database";

/**
 * Sanctions applied to companies by the Unidad de Defensa del Consumidor (UDECO, MEF) for breaches
 * of consumer-protection law — apercibimientos, multas and instrucciones, 2017-2024.
 *
 * Published by UDECO as open data on catalogodatos.gub.uy. This mirrors that roster and nothing
 * else.
 *
 * WHAT IT MEANS, AND WHAT IT DOES NOT. A sanction here is about how the firm treated CONSUMERS. It
 * is not a finding about any public contract, and it does not make a contract irregular. What makes
 * it worth publishing next to procurement is narrower and factual: the State's own consumer agency
 * fined this firm, and the State keeps buying from it. Measured on the live corpus, 530 of the 1,103
 * sanctioned firms are state suppliers — 48.1% — holding 17.3B UYU in awards.
 *
 * The join to suppliers is RUT equality on TWELVE DIGITS. `supplier_patterns.supplierId` carries a
 * prefix (`C/25093646`, `X/USA351167154`), so a digits-only comparison can collapse different
 * identifiers onto one key; a Uruguayan RUT is 12 digits and an 8-digit id is a cédula, so requiring
 * the full 12 keeps the join honest.
 */
export interface IUdecoSanction {
  /** Natural key: rut + resolution date + motive. The source has no id of its own. */
  sanctionKey: string;
  /** 12-digit RUT as published. */
  rut: string;
  razonSocial: string;
  nombreComercial: string | null;
  departamento: string | null;
  fechaResolucion: Date | null;
  /** Free text, 32 distinct values in the source (e.g. "Publicidad engañosa"). */
  motivo: string | null;
  /** "Apercibimiento" | "Multa" | "Instrucción". */
  tipo: string | null;
  /** Fine in Unidades Reajustables. 0 for an apercibimiento. */
  montoUr: number;
  sourceUrl: string;
  loadedAt: Date;
}

const UdecoSanctionSchema = new Schema<IUdecoSanction>(
  {
    sanctionKey: { type: String, required: true },
    rut: { type: String, required: true },
    razonSocial: { type: String, required: true },
    nombreComercial: { type: String, default: null },
    departamento: { type: String, default: null },
    fechaResolucion: { type: Date, default: null },
    motivo: { type: String, default: null },
    tipo: { type: String, default: null },
    montoUr: { type: Number, default: 0 },
    sourceUrl: { type: String, required: true },
    loadedAt: { type: Date, required: true },
  },
  { collection: "udeco_sanctions" }
);

// Built by scripts/ensure-indexes.ts only — autoIndex is off.
UdecoSanctionSchema.index({ sanctionKey: 1 }, { unique: true });
UdecoSanctionSchema.index({ rut: 1 });
UdecoSanctionSchema.index({ fechaResolucion: -1 });
UdecoSanctionSchema.index({ tipo: 1 });

export const UdecoSanctionModel =
  mongoose.models.UdecoSanction || mongoose.model<IUdecoSanction>("UdecoSanction", UdecoSanctionSchema);
