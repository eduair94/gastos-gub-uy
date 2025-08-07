import { Schema } from "mongoose";
import { mongoose } from '../connection/database';
import { IAward, IAwardDocument, IAwardItem, IBuyer, IContactPoint, IParty, IRelease, ISupplier, ITender, ITenderDocument, ITenderItem } from "../types/database";

// Release Schema Components
const ContactPointSchema = new Schema<IContactPoint>({
  name: { type: String },
  telephone: { type: String },
  faxNumber: { type: String },
  email: { type: String },
});

const PartySchema = new Schema<IParty>({
  id: { type: String, required: true },
  roles: [{ type: String, required: true }],
  name: { type: String, required: true },
  contactPoint: { type: ContactPointSchema },
});

const BuyerSchema = new Schema<IBuyer>({
  id: { type: String, required: true },
  name: { type: String, required: true },
});

const TenderItemSchema = new Schema<ITenderItem>({
  id: { type: String, required: true },
  description: { type: String, required: true },
  quantity: { type: Number, required: true },
  classification: {
    id: { type: String, required: true },
    description: { type: String, required: true },
    scheme: { type: String, required: true },
  },
  unit: {
    name: { type: String, required: true },
    id: { type: String, required: true },
  },
});

const TenderDocumentSchema = new Schema<ITenderDocument>({
  id: { type: String, required: true },
  documentType: { type: String, required: true },
  description: { type: String, required: true },
  datePublished: { type: Date, required: true },
  url: { type: String, required: true },
  language: { type: String, required: true },
  format: { type: String, required: true },
});

const AwardItemSchema = new Schema<IAwardItem>({
  id: { type: Number, required: true },
  description: { type: String },
  quantity: { type: Number, required: true },
  classification: {
    id: { type: String, required: true },
    description: { type: String, required: true },
    scheme: { type: String, required: true },
  },
  unit: {
    id: { type: String, required: true },
    name: { type: String, required: true },
    value: {
      amount: { type: Number },
      currency: { type: String },
    },
  },
});

const SupplierSchema = new Schema<ISupplier>({
  id: { type: String, required: true },
  name: { type: String, required: true },
});

const AwardDocumentSchema = new Schema<IAwardDocument>({
  id: { type: String, required: true },
  documentType: { type: String, required: true },
  url: { type: String, required: true },
  language: { type: String, required: true },
  datePublished: { type: Date, required: true },
  format: { type: String, required: true },
});

const AwardSchema = new Schema<IAward>({
  id: { type: String, required: true },
  title: { type: String, required: true },
  date: { type: Date, required: true },
  status: { type: String, required: true },
  items: [AwardItemSchema],
  suppliers: [SupplierSchema],
  documents: [AwardDocumentSchema],
});

const TenderSchema = new Schema<ITender>({
  id: { type: String, required: true },
  hasEnquiries: { type: Boolean, required: true },
  procurementMethodDetails: { type: String, required: true },
  procurementMethod: { type: String },
  title: { type: String, required: true },
  description: { type: String, required: true },
  tenderPeriod: {
    endDate: { type: Date, required: true },
    startDate: { type: Date, required: true },
  },
  procuringEntity: {
    id: { type: String, required: true },
    name: { type: String, required: true },
  },
  submissionMethodDetails: { type: String, required: true },
  items: [TenderItemSchema],
  submissionMethod: [{ type: String }],
  enquiryPeriod: {
    startDate: { type: Date },
    endDate: { type: Date },
  },
  documents: [TenderDocumentSchema],
  status: { type: String },
});


const ReleaseSchema = new Schema<IRelease>(
  {
    id: { type: String, required: true, unique: true },
    initiationType: { type: String, required: true },
    parties: [PartySchema],
    tag: [{ type: String, required: true }],
    //date: { type: Date, required: true },
    ocid: { type: String, required: true },
    tender: { type: TenderSchema },
    buyer: { type: BuyerSchema },
    awards: [AwardSchema],
    // Metadata fields for tracking data source
    sourceFileName: { type: String },
    sourceYear: { type: Number },
  },
  {
    strict: false,
  }
);

// Release Schema indexes for optimal query performance
ReleaseSchema.index({ date: -1 }); // Primary sort field
ReleaseSchema.index({ sourceYear: 1 }); // Year filtering
ReleaseSchema.index({ "tender.status": 1 }); // Status filtering
ReleaseSchema.index({ "tender.procurementMethod": 1 }); // Procurement method filtering
ReleaseSchema.index({ "buyer.name": 1 }); // Buyer filtering
ReleaseSchema.index({ "awards.suppliers.name": 1 }); // Supplier filtering
ReleaseSchema.index({ "awards.items.unit.value.amount": 1 }); // Amount filtering
ReleaseSchema.index({ ocid: 1 }); // OCID lookup
ReleaseSchema.index({ "tender.title": "text", "tender.description": "text", "buyer.name": "text", "awards.suppliers.name": "text" }); // Text search
// Compound indexes for common query patterns
ReleaseSchema.index({ sourceYear: 1, date: -1 }); // Year + date sorting
ReleaseSchema.index({ "tender.status": 1, date: -1 }); // Status + date sorting
ReleaseSchema.index({ "buyer.name": 1, date: -1 }); // Buyer + date sorting

export const ReleaseModel = mongoose.model<IRelease>("Release", ReleaseSchema);
