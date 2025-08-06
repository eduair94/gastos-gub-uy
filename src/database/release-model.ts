import mongoose, { Document, Schema } from 'mongoose';

export interface IContactPoint {
  name?: string;
  telephone?: string;
  faxNumber?: string;
  email?: string;
}

export interface IParty {
  id: string;
  roles: string[];
  name: string;
  contactPoint?: IContactPoint;
}

export interface IBuyer {
  id: string;
  name: string;
}

export interface ITenderItem {
  id: string;
  description: string;
  quantity: number;
  classification: {
    id: string;
    description: string;
    scheme: string;
  };
  unit: {
    name: string;
    id: string;
  };
}

export interface ITenderDocument {
  id: string;
  documentType: string;
  description: string;
  datePublished: string;
  url: string;
  language: string;
  format: string;
}

export interface IAwardItem {
  id: number;
  description?: string;
  quantity: number;
  classification: {
    id: string;
    description: string;
    scheme: string;
  };
  unit: {
    id: string;
    name: string;
    value?: {
      amount: number;
      currency: string;
    };
  };
}

export interface ISupplier {
  id: string;
  name: string;
}

export interface IAwardDocument {
  id: string;
  documentType: string;
  url: string;
  language: string;
  datePublished: string;
  format: string;
}

export interface IAward {
  id: string;
  title: string;
  date: string;
  status: string;
  items: IAwardItem[];
  suppliers: ISupplier[];
  documents?: IAwardDocument[];
}

export interface ITender {
  id: string;
  hasEnquiries: boolean;
  procurementMethodDetails: string;
  procurementMethod?: string;
  title: string;
  description: string;
  tenderPeriod: {
    endDate: string;
    startDate: string;
  };
  procuringEntity: {
    id: string;
    name: string;
  };
  submissionMethodDetails: string;
  items?: ITenderItem[];
  submissionMethod?: string[];
  enquiryPeriod?: {
    startDate: string;
    endDate: string;
  };
  documents?: ITenderDocument[];
  status?: string;
}

export interface IRelease extends Document {
  initiationType: string;
  parties: IParty[];
  tag: string[];
  date: string;
  ocid: string;
  id: string;
  tender?: ITender;
  buyer?: IBuyer;
  awards?: IAward[];
  // Metadata fields for tracking data source
  sourceFileName?: string;
  sourceYear?: number;
}

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
  datePublished: { type: String, required: true },
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
  datePublished: { type: String, required: true },
  format: { type: String, required: true },
});

const AwardSchema = new Schema<IAward>({
  id: { type: String, required: true },
  title: { type: String, required: true },
  date: { type: String, required: true },
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
    endDate: { type: String, required: true },
    startDate: { type: String, required: true },
  },
  procuringEntity: {
    id: { type: String, required: true },
    name: { type: String, required: true },
  },
  submissionMethodDetails: { type: String, required: true },
  items: [TenderItemSchema],
  submissionMethod: [{ type: String }],
  enquiryPeriod: {
    startDate: { type: String },
    endDate: { type: String },
  },
  documents: [TenderDocumentSchema],
  status: { type: String },
});

const ReleaseSchema = new Schema<IRelease>({
  initiationType: { type: String, required: true },
  parties: [PartySchema],
  tag: [{ type: String, required: true }],
  date: { type: String, required: true },
  ocid: { type: String, required: true },
  id: { type: String, required: true, unique: true },
  tender: { type: TenderSchema },
  buyer: { type: BuyerSchema },
  awards: [AwardSchema],
  // Metadata fields for tracking data source
  sourceFileName: { type: String },
  sourceYear: { type: Number },
}, { strict: true });

export const ReleaseModel = mongoose.model<IRelease>('Release', ReleaseSchema);
