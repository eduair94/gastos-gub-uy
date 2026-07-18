import { Schema } from 'mongoose'
import type { Model } from 'mongoose'
import { mongoose } from '../connection/database'
import { IApiKey } from '../types/monitor'

// A user-issued API credential. Only the sha256 `hash` + public `prefix` are
// stored; the full secret is shown once at creation. `revokedAt` soft-revokes —
// keys are never un-revoked, the user creates a new one instead.
const ApiKeySchema = new Schema<IApiKey>(
  {
    userId: { type: String, required: true },
    label: { type: String, required: true, trim: true },
    prefix: { type: String, required: true, unique: true },
    hash: { type: String, required: true },
    scopes: { type: [String], enum: ['read', 'write'], default: ['read'] },
    lastUsedAt: { type: Date },
    requestCount: { type: Number, default: 0 },
    revokedAt: { type: Date },
  },
  { timestamps: true, collection: 'api_keys' },
)

ApiKeySchema.index({ userId: 1, createdAt: -1 })
// `prefix` is already unique via its field option.

export const API_KEY_CAP = Number(process.env.API_KEY_CAP || 10)

export const ApiKeyModel: Model<IApiKey>
  = (mongoose.models.ApiKey as Model<IApiKey>) || mongoose.model<IApiKey>('ApiKey', ApiKeySchema)
