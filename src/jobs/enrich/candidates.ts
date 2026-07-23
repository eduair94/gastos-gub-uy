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

export const CONTACT_ENRICHMENT_VERSION = 5;

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

export function registryContactToSupplier(row: unknown): EnrichmentSupplier {
  const contact = row as { supplierId?: unknown; name?: unknown };
  return {
    supplierId: String(contact.supplierId ?? ""),
    name: String(contact.name ?? ""),
    totalValue: 0,
    totalContracts: 0,
  };
}

/** Keep already-stored official RUPE/DEI fields when an external resolver has no replacement. */
export function mergeStoredPlace(place: PlaceInfo | null, stored: StoredPlace) {
  return {
    address: place?.address ?? stored.address ?? null,
    locality: place?.locality ?? stored.locality ?? null,
    lat: place?.lat ?? stored.lat ?? null,
    lng: place?.lng ?? stored.lng ?? null,
    hours: place?.hours ?? stored.hours ?? null,
    mapsUrl: place?.mapsUrl ?? stored.mapsUrl ?? null,
    placeId: place?.placeId ?? stored.placeId ?? null,
    placeSource: place?.source ?? stored.placeSource ?? null,
  };
}
