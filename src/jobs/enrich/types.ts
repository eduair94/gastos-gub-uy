// src/jobs/enrich/types.ts
import type { EmailSource, FieldSource, ISocialLink, WebsiteSource } from "../../../shared/models/supplier_contacts";

export interface ContactCandidate {
  email: string;
  source: EmailSource;
  confidence: number;
  sourceUrl?: string | null;
}
export interface PhoneCandidate {
  phone: string;
  source: FieldSource;
  confidence: number;
  sourceUrl?: string | null;
}

/** Knowledge-panel location data a resolver can supply (Google Places / DEI). */
export interface PlaceInfo {
  address?: string | null;
  locality?: string | null;
  lat?: number | null;
  lng?: number | null;
  hours?: string | null;
  mapsUrl?: string | null;
  placeId?: string | null;
  /** Provenance displayed beside the location and its evidence link. */
  source: FieldSource;
}

export interface ResolverResult {
  emails: ContactCandidate[];
  website?: string | null;
  /** Provenance of `website`: "webSearch" (crawl4ai-verified), "dei"/"rupe" (registry), or "googleMaps" (Places). Lets the orchestrator rank a verified site over a stale unverified one. */
  websiteSource?: WebsiteSource | null;
  phone?: string | null;
  /** Provenance of `phone`, so the orchestrator can tag it on the record. */
  phoneSource?: FieldSource | null;
  phones?: PhoneCandidate[];
  websitePhone?: string | null;
  websiteAddress?: string | null;
  contactFormUrl?: string | null;
  socialLinks?: ISocialLink[];
  place?: PlaceInfo | null;
  /** Literal ARCE RUPE CSV registration state, when the RUT matched. */
  rupeEstado?: string | null;
}
export interface ResolverInput {
  supplierId: string;
  rut: string;
  name: string;
  website?: string | null;
  /** Best official/stored address known before external lookup (DEI/RUPE first). */
  knownAddress?: string | null;
  /** Best official/stored locality/department known before external lookup. */
  knownLocality?: string | null;
}
export interface ContactResolver { name: EmailSource; resolve(input: ResolverInput): Promise<ResolverResult> }
