import type { Model } from "mongoose";
import { Schema } from "mongoose";
import { mongoose } from "../connection/database";

// A registered industrial company from MIEM's Directorio de Empresas
// Industriales (DEI) — Uruguay open data, https://catalogodatos.gub.uy/dataset/miem-dei.
//
// Loaded by src/jobs/load-dei.ts from the published CSV. Keyed by `rut`
// (digits only), which is the join key to supplier_patterns: a supplier's
// `supplierId` is a RUT-based id (`R/210002980010` or `R213382910014`), so
// `digits(supplierId) === rut` is an exact, false-positive-free match. Read on
// the request path (app/server/utils/dei.ts) to annotate suppliers with a
// verified "registered industrial company" panel + badge.
//
// Unlike supplier_enrichment (advisory AI context), this is a FACT OF RECORD:
// official government open data. Consumers cite the source + snapshot date but
// don't hedge it as a guess.
//
// Coverage is partial by nature: DEI lists only certified *industrial* firms,
// so most state suppliers (services, commerce, persons, public bodies) have no
// DEI record — that is expected, not missing data.

export interface IDeiCompany {
  /** RUT, digits only — the join key (equals digits(supplierId)). */
  rut: string;
  /** Certification status, verbatim: "Aprobado" / "Vencido". */
  estado: string;
  /** Legal name (razón social). */
  denominacionSocial: string;
  /** Trade name (may equal the legal name). */
  nombreComercial: string;
  /** Company size, verbatim: "Micro Empresa" / "Pequeña Empresa" / "Mediana Empresa" / "Gran Empresa". */
  tamano: string;
  /** Activity types (Industrial / Comercial / Servicios). */
  tiposActividad: string[];
  /** Free-text description of what the company does. */
  descripcionActividad: string;
  /** Primary CIIU (ISIC) activity code. */
  ciiuPrincipal: string;
  /** Primary CIIU description. */
  ciiuPrincipalDesc: string;
  /** Secondary CIIU codes. */
  ciiuSecundarios: string[];
  /** Department of the primary establishment. */
  departamento: string;
  /** Locality/city of the primary establishment. */
  localidad: string;
  /** Composed street address of the primary establishment (null when unknown). */
  direccion?: string | null;
  /** WGS84 latitude of the primary establishment (null / out-of-bounds dropped). */
  lat?: number | null;
  /** WGS84 longitude of the primary establishment. */
  lng?: number | null;
  email?: string | null;
  sitioWeb?: string | null;
  telefono?: string | null;
  /** Registration date, ISO `YYYY-MM-DD` (source is date-only). */
  fechaRegistro?: string | null;
  /** Certificate expiry date, ISO `YYYY-MM-DD`. */
  fechaVencimiento?: string | null;
  /** When this row was last written by the loader. */
  loadedAt: Date;
}

const DeiCompanySchema = new Schema<IDeiCompany>(
  {
    rut: { type: String, required: true },
    estado: { type: String, default: "" },
    denominacionSocial: { type: String, default: "" },
    nombreComercial: { type: String, default: "" },
    tamano: { type: String, default: "" },
    tiposActividad: { type: [String], default: [] },
    descripcionActividad: { type: String, default: "" },
    ciiuPrincipal: { type: String, default: "" },
    ciiuPrincipalDesc: { type: String, default: "" },
    ciiuSecundarios: { type: [String], default: [] },
    departamento: { type: String, default: "" },
    localidad: { type: String, default: "" },
    direccion: { type: String, default: null },
    lat: { type: Number, default: null },
    lng: { type: Number, default: null },
    email: { type: String, default: null },
    sitioWeb: { type: String, default: null },
    telefono: { type: String, default: null },
    fechaRegistro: { type: String, default: null },
    fechaVencimiento: { type: String, default: null },
    loadedAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true, collection: "dei_companies" }
);

DeiCompanySchema.index({ rut: 1 }, { unique: true });
DeiCompanySchema.index({ departamento: 1 });
DeiCompanySchema.index({ tamano: 1 });
DeiCompanySchema.index({ ciiuPrincipal: 1 });

// HMR-safe registration (the Nuxt dev server re-imports models on hot reload).
export const DeiCompanyModel =
  (mongoose.models.DeiCompany as Model<IDeiCompany>)
  || mongoose.model<IDeiCompany>("DeiCompany", DeiCompanySchema);
