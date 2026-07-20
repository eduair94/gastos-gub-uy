// src/jobs/enrich/types.ts
import type { EmailSource, FieldSource } from "../../../shared/models/supplier_contacts";

export interface ContactCandidate { email: string; source: EmailSource; confidence: number }

/** Knowledge-panel location data a resolver can supply (Google Places / DEI). */
export interface PlaceInfo {
  address?: string | null;
  locality?: string | null;
  lat?: number | null;
  lng?: number | null;
  hours?: string | null;
  mapsUrl?: string | null;
  placeId?: string | null;
  /** Provenance — gates public display (dei = free, googleMaps = ToS-restricted). */
  source: FieldSource;
}

export interface ResolverResult {
  emails: ContactCandidate[];
  website?: string | null;
  phone?: string | null;
  /** Provenance of `phone`, so the orchestrator can tag it on the record. */
  phoneSource?: FieldSource | null;
  place?: PlaceInfo | null;
}
export interface ResolverInput { supplierId: string; rut: string; name: string; website?: string | null }
export interface ContactResolver { name: EmailSource; resolve(input: ResolverInput): Promise<ResolverResult> }
