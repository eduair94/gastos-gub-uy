import { Schema } from "mongoose";
import { mongoose } from "../connection/database";

/**
 * State suppliers that UDECO has sanctioned — one document per firm, precomputed.
 *
 * Written by src/jobs/refresh-udeco-crossref.ts (compute-then-swap by dataVersion) and read by
 * /api/analytics/sanciones with a plain indexed find.
 *
 * It is precomputed because the join cannot use an index: `supplier_patterns.supplierId` stores the
 * same RUT as "R/214803890012", "R/214803890012 " (trailing space), "R211003420017" (no slash) and
 * bare, so only a 12-digit normalisation matches them all — an `$in` of exact strings found 379 of
 * the 530 firms, a 28% miss.
 *
 * FRAMING: a UDECO sanction concerns the firm's conduct toward CONSUMERS. It is not a finding about
 * any public contract and does not make one irregular. `sanctionedFirmsTotal` rides on every row so
 * a page can never quote the headline without its denominator.
 */
export interface IUdecoSupplierStats {
  rut: string;
  razonSocial: string;
  nombreComercial: string | null;
  departamento: string | null;

  /** As the procurement corpus names it, which often differs from the UDECO razón social. */
  supplierName: string | null;
  /** Every id shape that folded into this firm — the audit trail for the join. */
  supplierIds: string[];
  totalUyu: number;
  contracts: number;
  buyers: number;
  onlyDirectAward: boolean;

  sanctions: number;
  /** Sanctions carrying a fine above 0 UR. */
  fines: number;
  totalUr: number;
  firstSanctionAt: Date | null;
  lastSanctionAt: Date | null;
  motivos: string[];
  tipos: string[];

  /** Every sanctioned firm, not just those selling to the State. The denominator. */
  sanctionedFirmsTotal: number;
  dataVersion: string;
  calculatedAt: Date;
}

const UdecoSupplierStatsSchema = new Schema<IUdecoSupplierStats>(
  {
    rut: { type: String, required: true },
    razonSocial: { type: String, required: true },
    nombreComercial: { type: String, default: null },
    departamento: { type: String, default: null },
    supplierName: { type: String, default: null },
    supplierIds: { type: [String], default: [] },
    totalUyu: { type: Number, default: 0 },
    contracts: { type: Number, default: 0 },
    buyers: { type: Number, default: 0 },
    onlyDirectAward: { type: Boolean, default: false },
    sanctions: { type: Number, default: 0 },
    fines: { type: Number, default: 0 },
    totalUr: { type: Number, default: 0 },
    firstSanctionAt: { type: Date, default: null },
    lastSanctionAt: { type: Date, default: null },
    motivos: { type: [String], default: [] },
    tipos: { type: [String], default: [] },
    sanctionedFirmsTotal: { type: Number, default: 0 },
    dataVersion: { type: String, required: true },
    calculatedAt: { type: Date, required: true },
  },
  { collection: "udeco_supplier_stats" }
);

// Built by scripts/ensure-indexes.ts only — autoIndex is off.
UdecoSupplierStatsSchema.index({ rut: 1 }, { unique: true });
UdecoSupplierStatsSchema.index({ totalUyu: -1 });
UdecoSupplierStatsSchema.index({ sanctions: -1 });
UdecoSupplierStatsSchema.index({ dataVersion: 1 });

export const UdecoSupplierStatsModel =
  mongoose.models.UdecoSupplierStats || mongoose.model<IUdecoSupplierStats>("UdecoSupplierStats", UdecoSupplierStatsSchema);
