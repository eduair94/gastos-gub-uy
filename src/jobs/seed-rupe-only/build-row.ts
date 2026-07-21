// src/jobs/seed-rupe-only/build-row.ts
//
// Pure transform: one rupe_registry row → the supplier_contacts $set fields for
// a "registered, never awarded" seed row. No I/O — testable without a DB.
import type { ISupplierContact, FieldSource } from "../../../shared/models/supplier_contacts";

export interface RupeSeedInput {
  rut: string;
  denominacionSocial: string;
  domicilioFiscal?: string | null;
  localidad?: string | null;
  departamento?: string | null;
  estado: string;
  lat?: number | null;
  lng?: number | null;
  placeId?: string | null;
  geocodeStatus?: string;
}

/** `R/<rut>` — matches the `candidateIds()` shape supplier_patterns ids use. */
export function synthesizeSupplierId(rut: string): string {
  return `R/${rut}`;
}

export type RegistryRowSet = Pick<
  ISupplierContact,
  "supplierId" | "rut" | "name" | "address" | "locality" | "placeSource"
  | "lat" | "lng" | "placeId" | "rupeEstado" | "neverAwarded"
>;

/**
 * Builds the $set fields for a RUPE-only seed row. Geocode fields are only
 * copied when geocode-rupe.ts marked the row "ok" — a pending/error/zero_results
 * status means lat/lng are stale or absent, so they are left null rather than
 * plotting a wrong pin.
 */
export function buildRegistryRow(input: RupeSeedInput): RegistryRowSet {
  const locality = [input.localidad, input.departamento]
    .map(v => (v ? String(v).trim() : ""))
    .filter(Boolean)
    .join(", ") || null;
  const geocoded = input.geocodeStatus === "ok";
  const placeSource: FieldSource = "rupe";

  return {
    supplierId: synthesizeSupplierId(input.rut),
    rut: input.rut,
    name: input.denominacionSocial,
    address: input.domicilioFiscal ?? null,
    locality,
    placeSource,
    lat: geocoded ? (input.lat ?? null) : null,
    lng: geocoded ? (input.lng ?? null) : null,
    placeId: geocoded ? (input.placeId ?? null) : null,
    rupeEstado: input.estado,
    neverAwarded: true,
  };
}
