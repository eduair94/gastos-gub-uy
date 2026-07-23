import type { FieldSource } from "../../../shared/models/supplier_contacts";
import type { PlaceInfo } from "./types";

export interface EnrichmentSupplier {
  supplierId: string;
  name: string;
  totalValue: number;
  totalContracts: number;
}

export interface StoredPlace {
  address?: string | null;
  locality?: string | null;
  lat?: number | null;
  lng?: number | null;
  hours?: string | null;
  mapsUrl?: string | null;
  placeId?: string | null;
  placeSource?: FieldSource | null;
}

export const CONTACT_ENRICHMENT_VERSION = 7;
export const MAPS_ENRICHMENT_VERSION = 1;

export function registryContactQuery(staleBefore: Date, enrichmentVersion = CONTACT_ENRICHMENT_VERSION) {
  return {
    neverAwarded: true,
    $or: [
      { enrichmentVersion: { $ne: enrichmentVersion } },
      { enrichedAt: null },
      { enrichedAt: { $exists: false } },
      { enrichedAt: { $lt: staleBefore } },
    ],
  };
}

export function mapsContactQuery(staleBefore: Date, mapsVersion = MAPS_ENRICHMENT_VERSION) {
  return {
    $or: [
      { mapsEnrichmentVersion: { $ne: mapsVersion } },
      { mapsEnrichedAt: null },
      { mapsEnrichedAt: { $exists: false } },
      { mapsEnrichedAt: { $lt: staleBefore } },
    ],
  };
}

export function registryContactToSupplier(row: unknown): EnrichmentSupplier {
  const contact = row as { supplierId?: unknown; name?: unknown };
  return {
    supplierId: String(contact.supplierId ?? ""),
    name: String(contact.name ?? ""),
    totalValue: 0,
    totalContracts: 0,
  };
}

/**
 * Keep the official RUPE/DEI address provenance while applying coordinates and
 * contact evidence from a separately verified Google Maps listing.
 */
export function mergeStoredPlace(
  place: PlaceInfo | null,
  stored: StoredPlace,
  mapsEvidence: PlaceInfo | null = null,
) {
  return {
    address: place?.address ?? stored.address ?? null,
    locality: place?.locality ?? stored.locality ?? null,
    lat: mapsEvidence?.lat ?? place?.lat ?? stored.lat ?? null,
    lng: mapsEvidence?.lng ?? place?.lng ?? stored.lng ?? null,
    hours: mapsEvidence?.hours ?? place?.hours ?? stored.hours ?? null,
    mapsUrl: mapsEvidence?.mapsUrl ?? place?.mapsUrl ?? stored.mapsUrl ?? null,
    placeId: mapsEvidence?.placeId ?? place?.placeId ?? stored.placeId ?? null,
    placeSource: place?.source ?? stored.placeSource ?? null,
  };
}
