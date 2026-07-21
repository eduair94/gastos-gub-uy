import type { Model } from "mongoose";
import { Schema } from "mongoose";
import { mongoose } from "../connection/database";

// A registered state supplier from ARCE's Registro Único de Proveedores del
// Estado (RUPE) — Uruguay open data, updated monthly:
//   https://catalogodatos.gub.uy/dataset/arce-registro-unico-de-proveedores-del-estado-rupe-2026
//
// Loaded by src/jobs/load-rupe.ts from the published monthly CSVs. Keyed by
// `rut` (digits only), the join key to supplier_patterns: a supplier's
// `supplierId` is a RUT-based id (`R/210002980010`), so `digits(supplierId) ===
// rut` is an exact, false-positive-free match. Measured 2026-07-20: 39,020 /
// 42,530 suppliers (91.7%) match a RUPE record — by far the widest structured
// coverage available.
//
// This is a FACT OF RECORD (official gov open data), so its address/name/estado
// are freely displayable and persistable (unlike ToS-restricted Google Places
// fields). RUPE carries a verified address but NO coordinates; geocode-rupe.ts
// fills the geocode block below via the Google Maps proxy /geocode endpoint and
// writes it back onto the same doc.

/** How the geocode step left this row. */
export type GeocodeStatus = "pending" | "ok" | "zero_results" | "error" | "out_of_country";

export interface IRupeRegistry {
  /** RUT / identificación, digits only — the join key (equals digits(supplierId)). */
  rut: string;
  /** Country, verbatim (mostly "URUGUAY"; some foreign providers). */
  pais: string;
  /** Legal name (razón social / denominación social). */
  denominacionSocial: string;
  /** `normalizeText(denominacionSocial)` — the exact-equality fallback join key. */
  normalizedName: string;
  /** Fiscal domicile, verbatim (null when "Sin dato"). */
  domicilioFiscal?: string | null;
  /** Locality/city (null when "Sin dato"). */
  localidad?: string | null;
  /** Department (null when "Sin dato"). */
  departamento?: string | null;
  /** Registry state, verbatim: "ACTIVO" / "EN INGRESO" / … */
  estado: string;
  /** Which monthly snapshot this record was taken from, `YYYY-MM` (latest wins on dedup). */
  sourceMonth: string;

  // --- geocode block (written by geocode-rupe.ts, NOT by load-rupe.ts) ---
  /** WGS84 latitude (null / out-of-Uruguay-bounds dropped). */
  lat?: number | null;
  /** WGS84 longitude. */
  lng?: number | null;
  /** Google place_id — cacheable indefinitely per ToS. */
  placeId?: string | null;
  /** Google geocoder `location_type` (ROOFTOP > RANGE_INTERPOLATED > GEOMETRIC_CENTER > APPROXIMATE). */
  geocodeConfidence?: string | null;
  /** Outcome of the last geocode attempt. */
  geocodeStatus: GeocodeStatus;
  /** The exact address string that was geocoded (used to detect address changes → re-geocode). */
  geocodedAddress?: string | null;
  /** When the geocode block was last written. */
  geocodedAt?: Date | null;

  /** When load-rupe last wrote this row's source fields. */
  loadedAt: Date;
}

const RupeRegistrySchema = new Schema<IRupeRegistry>(
  {
    rut: { type: String, required: true },
    pais: { type: String, default: "" },
    denominacionSocial: { type: String, default: "" },
    normalizedName: { type: String, default: "" },
    domicilioFiscal: { type: String, default: null },
    localidad: { type: String, default: null },
    departamento: { type: String, default: null },
    estado: { type: String, default: "" },
    sourceMonth: { type: String, default: "" },
    lat: { type: Number, default: null },
    lng: { type: Number, default: null },
    placeId: { type: String, default: null },
    geocodeConfidence: { type: String, default: null },
    geocodeStatus: { type: String, default: "pending" },
    geocodedAddress: { type: String, default: null },
    geocodedAt: { type: Date, default: null },
    loadedAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true, collection: "rupe_registry" }
);

// Declared for parity; BUILT by scripts/ensure-indexes.ts (autoIndex is off).
RupeRegistrySchema.index({ rut: 1 }, { unique: true });
RupeRegistrySchema.index({ normalizedName: 1 });
RupeRegistrySchema.index({ estado: 1 });
RupeRegistrySchema.index({ geocodeStatus: 1 });
RupeRegistrySchema.index({ departamento: 1 });

// HMR-safe registration (the Nuxt dev server re-imports models on hot reload).
export const RupeRegistryModel =
  (mongoose.models.RupeRegistry as Model<IRupeRegistry>)
  || mongoose.model<IRupeRegistry>("RupeRegistry", RupeRegistrySchema);
