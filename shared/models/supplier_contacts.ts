import { Schema } from "mongoose";
import type { Model } from "mongoose";
import { mongoose } from "../connection/database";

export type EmailSource = "dei" | "website" | "webSearch" | "impo" | "rupe" | "manual";
export type EmailStatus = "candidate" | "valid" | "invalid" | "suppressed";
export type ContactStatus = "pending" | "enriched" | "no_contact" | "error";

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
  phone: string | null;
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
  phone: { type: String, default: null },
  rubros: { type: [RubroSchema], default: [] },
  status: { type: String, default: "pending" },
  priorityScore: { type: Number, default: 0 },
  enrichedAt: { type: Date, default: null },
}, { timestamps: true, collection: "supplier_contacts" });

// Declared for parity; BUILT by scripts/ensure-indexes.ts (autoIndex is off).
SupplierContactSchema.index({ supplierId: 1 }, { unique: true });
SupplierContactSchema.index({ rut: 1 });
SupplierContactSchema.index({ status: 1, priorityScore: -1 });
SupplierContactSchema.index({ "rubros.classificationId": 1 });

export const SupplierContactModel: Model<ISupplierContact> =
  (mongoose.models.SupplierContact as Model<ISupplierContact>) ||
  mongoose.model<ISupplierContact>("SupplierContact", SupplierContactSchema);
