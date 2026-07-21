// src/jobs/enrich/types.ts
import type { EmailSource, FieldSource, ISocialLink, WebsiteSource } from "../../../shared/models/supplier_contacts";

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
  /** Provenance of `website`: "webSearch" (crawl4ai-verified), "dei"/"rupe" (registry), "googleMaps" (Places, ToS-restricted). Lets the orchestrator rank a verified site over a stale unverified one. */
  websiteSource?: WebsiteSource | null;
  phone?: string | null;
  /** Provenance of `phone`, so the orchestrator can tag it on the record. */
  phoneSource?: FieldSource | null;
  websitePhone?: string | null;
  websiteAddress?: string | null;
  contactFormUrl?: string | null;
  socialLinks?: ISocialLink[];
  place?: PlaceInfo | null;
}
export interface ResolverInput { supplierId: string; rut: string; name: string; website?: string | null }
export interface ContactResolver { name: EmailSource; resolve(input: ResolverInput): Promise<ResolverResult> }
