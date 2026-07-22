
import { Schema } from "mongoose";
import type { Model } from "mongoose";
import { mongoose } from "../connection/database";

export type EmailSource = "dei" | "website" | "webSearch" | "impo" | "rupe" | "manual" | "googleMaps";
export type EmailStatus = "candidate" | "valid" | "invalid" | "suppressed";
export type ContactStatus = "pending" | "enriched" | "no_contact" | "error" | "registry";
/** Provenance for phone/place fields, surfaced beside each contact value. */
export type FieldSource = "dei" | "googleMaps" | "rupe" | "website";
/**
 * Provenance for `website`. Adds `webSearch` — a domain confirmed to be the
 * supplier's own by the crawl4ai discovery + verification path (match-score +
 * Gemini judge) — so a VERIFIED site is distinguishable from an official
 * registry one (dei/rupe) or a Places one (googleMaps).
 */
export type WebsiteSource = FieldSource | "webSearch";
/** Resolver paths attempted for a supplier, even when a path finds no match. */
export type EnrichmentMethod = "crawl4ai" | "googleMaps" | "dei" | "rupe" | "impo";

export interface IEmailEntry {
  email: string;
  source: EmailSource;
  /** Exact page/document where the address was observed, when available. */
  sourceUrl: string | null;
  confidence: number;
  isRoleAccount: boolean;
  mxValid: boolean;
  status: EmailStatus;
}
export interface IPhoneEntry {
  phone: string;
  source: FieldSource;
  /** Exact page/record where the number was observed, when available. */
  sourceUrl: string | null;
  confidence: number;
}
export interface IRubro {
  classificationId: string;
  label: string;
  itemCount: number;
  share: number;
}
export type SocialPlatform =
  | "instagram" | "facebook" | "linkedin" | "x" | "youtube" | "tiktok"
  | "whatsapp" | "threads" | "pinterest" | "telegram" | "bluesky"
  | "github" | "discord" | "twitch" | "vimeo" | "snapchat" | "linktree"
  | "reddit" | "medium" | "mastodon";
export interface ISocialLink {
  platform: SocialPlatform;
  url: string;
  label: string;
  source: WebsiteSource;
  /** Supplier page that linked to the social profile. */
  sourceUrl: string | null;
}
export interface ISupplierContact {
  supplierId: string;
  rut: string;
  name: string;
  emails: IEmailEntry[];
  primaryEmail: string | null;
  website: string | null;
  /** Provenance of `website`; googleMaps = Places-listed and `webSearch` = Crawl4AI-verified. */
  websiteSource: WebsiteSource | null;
  phone: string | null;
  /** Provenance of `phone`. */
  phoneSource: FieldSource | null;
  /** All observed phone numbers with independent provenance. */
  phones: IPhoneEntry[];
  /** Phone published on the supplier's own website (kept even when an official phone also exists). */
  websitePhone: string | null;
  /** Address published on the supplier's own website; supplementary to the registry address. */
  websiteAddress: string | null;
  /** Page/anchor containing a first-party contact form. */
  contactFormUrl: string | null;
  /** First-party social profiles found on the supplier's website. */
  socialLinks: ISocialLink[];
  /** Enrichment paths attempted in the latest/additive runs (for method chips). */
  enrichmentMethods: EnrichmentMethod[];
  // Knowledge-panel location data (from DEI open data or the Google Maps proxy).
  address: string | null;
  locality: string | null;
  lat: number | null;
  lng: number | null;
  hours: string | null;
  mapsUrl: string | null;
  /** Google place_id — the only Places field safe to cache indefinitely per ToS. */
  placeId: string | null;
  /** Provenance of the location block; dei = displayable, googleMaps = live-refetch/embed only. */
  placeSource: FieldSource | null;
  rubros: IRubro[];
  status: ContactStatus;
  priorityScore: number;
  enrichedAt: Date | null;
  /** True when this row was seeded from RUPE because the company never won an award — see seed-rupe-only-contacts.ts. Orthogonal to `status`. */
  neverAwarded: boolean;
  /** RUPE registry state verbatim (ACTIVO / EN INGRESO / …) when this row is RUPE-sourced; null otherwise. */
  rupeEstado: string | null;
  /** Extractor contract version, used to reprocess rows after enrichment improves. */
  enrichmentVersion: number;
}

const EmailEntrySchema = new Schema<IEmailEntry>({
  email: { type: String, required: true, lowercase: true, trim: true },
  source: { type: String, required: true },
  sourceUrl: { type: String, default: null, trim: true },
  confidence: { type: Number, default: 0 },
  isRoleAccount: { type: Boolean, default: false },
  mxValid: { type: Boolean, default: false },
  status: { type: String, default: "candidate" },
}, { _id: false });

const PhoneEntrySchema = new Schema<IPhoneEntry>({
  phone: { type: String, required: true, trim: true },
  source: { type: String, required: true },
  sourceUrl: { type: String, default: null, trim: true },
  confidence: { type: Number, default: 0 },
}, { _id: false });

const RubroSchema = new Schema<IRubro>({
  classificationId: { type: String, required: true },
  label: { type: String, default: "" },
  itemCount: { type: Number, default: 0 },
  share: { type: Number, default: 0 },
}, { _id: false });

const SocialLinkSchema = new Schema<ISocialLink>({
  platform: { type: String, required: true },
  url: { type: String, required: true, trim: true },
  label: { type: String, default: "", trim: true },
  source: { type: String, default: "website" },
  sourceUrl: { type: String, default: null, trim: true },
}, { _id: false });

const SupplierContactSchema = new Schema<ISupplierContact>({
  supplierId: { type: String, required: true },
  rut: { type: String, default: "" },
  name: { type: String, default: "" },
  emails: { type: [EmailEntrySchema], default: [] },
  primaryEmail: { type: String, default: null },
  website: { type: String, default: null },
  websiteSource: { type: String, default: null },
  phone: { type: String, default: null },
  phoneSource: { type: String, default: null },
  phones: { type: [PhoneEntrySchema], default: [] },
  websitePhone: { type: String, default: null },
  websiteAddress: { type: String, default: null },
  contactFormUrl: { type: String, default: null },
  socialLinks: { type: [SocialLinkSchema], default: [] },
  enrichmentMethods: { type: [String], default: [] },
  address: { type: String, default: null },
  locality: { type: String, default: null },
  lat: { type: Number, default: null },
  lng: { type: Number, default: null },
  hours: { type: String, default: null },
  mapsUrl: { type: String, default: null },
  placeId: { type: String, default: null },
  placeSource: { type: String, default: null },
  rubros: { type: [RubroSchema], default: [] },
  status: { type: String, default: "pending" },
  priorityScore: { type: Number, default: 0 },
  enrichedAt: { type: Date, default: null },
  neverAwarded: { type: Boolean, default: false },
  rupeEstado: { type: String, default: null },
  enrichmentVersion: { type: Number, default: 0 },
}, { timestamps: true, collection: "supplier_contacts" });

// Declared for parity; BUILT by scripts/ensure-indexes.ts (autoIndex is off).
SupplierContactSchema.index({ supplierId: 1 }, { unique: true });
SupplierContactSchema.index({ rut: 1 });
SupplierContactSchema.index({ status: 1, priorityScore: -1 });
SupplierContactSchema.index({ name: 1 });
SupplierContactSchema.index({ "rubros.classificationId": 1 });
SupplierContactSchema.index({ placeSource: 1 });
SupplierContactSchema.index({ locality: 1 });
SupplierContactSchema.index({ neverAwarded: 1, priorityScore: -1 });
SupplierContactSchema.index({ neverAwarded: 1, enrichedAt: 1 });

export const SupplierContactModel: Model<ISupplierContact> =
  (mongoose.models.SupplierContact as Model<ISupplierContact>) ||
  mongoose.model<ISupplierContact>("SupplierContact", SupplierContactSchema);
