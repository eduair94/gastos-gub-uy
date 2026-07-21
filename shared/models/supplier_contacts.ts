import { Schema } from "mongoose";
import type { Model } from "mongoose";
import { mongoose } from "../connection/database";

export type EmailSource = "dei" | "website" | "webSearch" | "impo" | "rupe" | "manual" | "googleMaps";
export type EmailStatus = "candidate" | "valid" | "invalid" | "suppressed";
export type ContactStatus = "pending" | "enriched" | "no_contact" | "error";
/** Provenance for phone/place fields → gates public display (dei/rupe = official open data, freely displayable; googleMaps = ToS-restricted). */
export type FieldSource = "dei" | "googleMaps" | "rupe";

export interface IEmailEntry {
  email: string;
  source: EmailSource;
  confidence: number;
  isRoleAccount: boolean;
  mxValid: boolean;
  status: EmailStatus;
}
export interface IRubro {
  classificationId: string;
  label: string;
  itemCount: number;
  share: number;
}
export interface ISupplierContact {
  supplierId: string;
  rut: string;
  name: string;
  emails: IEmailEntry[];
  primaryEmail: string | null;
  website: string | null;
  /** Provenance of `website`; googleMaps (a Places-listed site) is ToS-restricted like phone. */
  websiteSource: FieldSource | null;
  phone: string | null;
  /** Provenance of `phone`. */
  phoneSource: FieldSource | null;
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
}

const EmailEntrySchema = new Schema<IEmailEntry>({
  email: { type: String, required: true, lowercase: true, trim: true },
  source: { type: String, required: true },
  confidence: { type: Number, default: 0 },
  isRoleAccount: { type: Boolean, default: false },
  mxValid: { type: Boolean, default: false },
  status: { type: String, default: "candidate" },
}, { _id: false });

const RubroSchema = new Schema<IRubro>({
  classificationId: { type: String, required: true },
  label: { type: String, default: "" },
  itemCount: { type: Number, default: 0 },
  share: { type: Number, default: 0 },
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
}, { timestamps: true, collection: "supplier_contacts" });

// Declared for parity; BUILT by scripts/ensure-indexes.ts (autoIndex is off).
SupplierContactSchema.index({ supplierId: 1 }, { unique: true });
SupplierContactSchema.index({ rut: 1 });
SupplierContactSchema.index({ status: 1, priorityScore: -1 });
SupplierContactSchema.index({ name: 1 });
SupplierContactSchema.index({ "rubros.classificationId": 1 });
SupplierContactSchema.index({ placeSource: 1 });
SupplierContactSchema.index({ locality: 1 });

export const SupplierContactModel: Model<ISupplierContact> =
  (mongoose.models.SupplierContact as Model<ISupplierContact>) ||
  mongoose.model<ISupplierContact>("SupplierContact", SupplierContactSchema);
