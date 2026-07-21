import type { Model } from 'mongoose'
import { Schema } from 'mongoose'
import { mongoose } from '../connection/database'

/**
 * Precomputed directory of contracting-unit purchasing contacts, one per
 * organism (buyer.id). Built by src/jobs/refresh-contacts.ts from the
 * parties[].contactPoint on tender releases. Public data (comprasestatales).
 */
export interface IContactVariant {
  name?: string | undefined
  email?: string | undefined
  telephone?: string | undefined
}

export interface IProcurementContact {
  organismId: string
  organismName: string
  contactName?: string
  email?: string
  telephone?: string
  faxNumber?: string
  variants: IContactVariant[]
  llamadosCount: number
  lastSeenAt?: Date | null
  sampleReleaseId?: string
  searchText?: string
  dataVersion: string
  calculatedAt: Date
}

const VariantSchema = new Schema<IContactVariant>(
  {
    name: { type: String },
    email: { type: String },
    telephone: { type: String },
  },
  { _id: false }
)

const ProcurementContactSchema = new Schema<IProcurementContact>(
  {
    organismId: { type: String, required: true },
    organismName: { type: String, required: true },
    contactName: { type: String },
    email: { type: String },
    telephone: { type: String },
    faxNumber: { type: String },
    variants: { type: [VariantSchema], default: [] },
    llamadosCount: { type: Number, required: true },
    lastSeenAt: { type: Date, default: null },
    sampleReleaseId: { type: String },
    // Concatenated searchable text (organism + name + email); the $text index
    // is built in scripts/ensure-indexes.ts.
    searchText: { type: String, default: '' },
    dataVersion: { type: String, required: true },
    calculatedAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true, collection: 'procurement_contacts' }
)

ProcurementContactSchema.index({ organismId: 1 }, { unique: true })
ProcurementContactSchema.index({ llamadosCount: -1 })
ProcurementContactSchema.index({ dataVersion: 1 })

export const ProcurementContactModel =
  (mongoose.models.ProcurementContact as Model<IProcurementContact>)
  || mongoose.model<IProcurementContact>('ProcurementContact', ProcurementContactSchema)
