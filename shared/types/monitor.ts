// Monitor de Llamados + auth — shared model interfaces.
// Kept separate from database.ts so the large OCDS types file stays focused.
//
// Optional properties are declared `?: T | undefined` (not just `?: T`) because
// the repo compiles with `exactOptionalPropertyTypes`, and these docs are built
// by projecting possibly-undefined OCDS fields — an explicitly-undefined value
// must be assignable.
import type { Document } from 'mongoose'

export type NotificationFrequency = 'instant' | 'daily'

export interface IUser extends Document {
  uid: string
  email: string
  emailVerified: boolean
  displayName?: string | undefined
  photoURL?: string | undefined
  providers: string[]
  role: 'user' | 'admin'
  locale: 'es' | 'en'
  status: 'active' | 'disabled'
  notificationPrefs: {
    enabled: boolean
    frequency: NotificationFrequency
  }
  unsubscribeToken: string
  watchCount: number
  lastLoginAt?: Date | undefined
  createdAt: Date
  updatedAt: Date
}

export type KeywordMode = 'any' | 'all'

export interface IWatch extends Document {
  userId: string
  name: string
  active: boolean
  categories: string[]
  keywords: string[]
  keywordMode: KeywordMode
  buyers: string[]
  minValue?: number | undefined
  maxValue?: number | undefined
  procurementMethods?: string[] | undefined
  lastMatchedAt?: Date | undefined
  createdAt: Date
  updatedAt: Date
}

export type OpenCallStatus = 'open' | 'clarification' | 'amended' | 'closed' | 'awarded' | 'cancelled'

export interface IOpenCallItem {
  description?: string | undefined
  classificationId?: string | undefined
  classificationLabel?: string | undefined
  quantity?: number | undefined
  unit?: { id?: string | undefined, name?: string | undefined } | undefined
}

export interface IOpenCallDocument {
  title?: string | undefined
  url: string
  format?: string | undefined
  datePublished?: Date | undefined
  documentType?: string | undefined
}

// Cached AI pliego summary. Advisory only — the disclaimer is always shown and
// the deadline shown to users comes from the OCDS tenderPeriod, never from here.
export interface IPliegoSummary {
  objeto: string
  requisitosClave: string[]
  plazos: {
    recepcionOfertas?: string | undefined
    aperturaOfertas?: string | undefined
    consultas?: string | undefined
  }
  garantias?: string | undefined
  criteriosEvaluacion: string[]
  montoReferencia?: string | undefined
  observaciones: string[]
  model: string
  generatedAt: Date
  sourceDocs: string[]
  disclaimer: string
}

export interface IOpenCall extends Document {
  compraId: string
  ocid: string
  latestReleaseId?: string | undefined
  sourceReleaseIds: string[]
  title: string
  description?: string | undefined
  buyer: { id?: string | undefined, name?: string | undefined }
  procuringEntity: { id?: string | undefined, name?: string | undefined }
  procurementMethod?: string | undefined
  procurementMethodDetails?: string | undefined
  status: OpenCallStatus
  publishDate?: Date | undefined
  tenderPeriod?: { startDate?: Date | undefined, endDate?: Date | undefined } | undefined
  enquiryPeriod?: { startDate?: Date | undefined, endDate?: Date | undefined } | undefined
  items: IOpenCallItem[]
  classificationSet: string[]
  searchText: string
  estimatedValue?: number | undefined
  currency?: string | undefined
  documents: IOpenCallDocument[]
  // When the deterministic pliego URL was last HEAD-probed to fill a feed that
  // carried no documents. Set once (success or miss) so re-syncs don't re-probe
  // a call that has no pliego. See src/jobs/open-calls/pliego-probe.ts.
  documentsProbedAt?: Date | undefined
  aiSummary?: IPliegoSummary | undefined
  awardRef?: { releaseId: string, ocid: string, awardedAt?: Date | undefined } | undefined
  // $setOnInsert only — "is this NEW?" (drives alerts). Never updated on resync.
  firstSeenAt: Date
  // Restamped every sync — "still current?".
  lastSyncedAt: Date
  createdAt: Date
  updatedAt: Date
}

export type NotificationType = 'alert' | 'reminder' | 'award'
export type NotificationStatus = 'pending' | 'sent' | 'failed' | 'skipped'

export interface INotification extends Document {
  type: NotificationType
  userId: string
  compraId: string
  watchIds: string[]
  matchedOn?: { categories?: string[] | undefined, keywords?: string[] | undefined } | undefined
  // Unique — makes enqueue idempotent so a resync never double-notifies.
  dedupeKey: string
  channel: 'email'
  status: NotificationStatus
  batchId?: string | undefined
  attempts: number
  lastError?: string | undefined
  scheduledFor?: Date | undefined
  sentAt?: Date | undefined
  createdAt: Date
  updatedAt: Date
}

export interface ISavedCall extends Document {
  userId: string
  compraId: string
  note?: string | undefined
  reminderDaysBefore?: number | undefined
  reminderSentAt?: Date | undefined
  createdAt: Date
  updatedAt: Date
}

// A user's verdict on one price-anomaly flag. `vote` is the true-positive signal:
// 1 = real anomaly, -1 = false positive. The snapshot fields (anomalyType/
// releaseId/supplierName) are copied from the anomaly on insert for offline analysis.
export type AnomalyVote = 1 | -1

export interface IAnomalyFeedback extends Document {
  userId: string
  anomalyId: string
  vote: AnomalyVote
  comment?: string | undefined
  anomalyType?: string | undefined
  releaseId?: string | undefined
  awardId?: string | undefined
  supplierName?: string | undefined
  createdAt: Date
  updatedAt: Date
}

export type WebhookEvent = 'tender.matched' | 'anomaly.detected' | 'award.created'
export type WebhookDeliveryStatus = 'pending' | 'sent' | 'failed'

// Optional narrowing per subscription. For `tender.matched` these are fed to the
// same watchMatchesCall matcher used by email alerts; for the others they apply
// as simple thresholds.
export interface IWebhookFilters {
  categories?: string[] | undefined
  keywords?: string[] | undefined
  buyers?: string[] | undefined
  minAmount?: number | undefined
  minZ?: number | undefined
  severity?: string | undefined
  supplierId?: string | undefined
}

export interface IWebhookSubscription extends Document {
  userId: string
  apiKeyId?: string | undefined
  url: string
  events: WebhookEvent[]
  filters?: IWebhookFilters | undefined
  // HMAC signing secret. Returned once at creation, then only used server-side.
  secret: string
  active: boolean
  // Consecutive delivery failures; auto-disabled past a cap.
  failureCount: number
  lastDeliveryAt?: Date | undefined
  createdAt: Date
  updatedAt: Date
}

export interface IWebhookDelivery extends Document {
  subscriptionId: string
  event: WebhookEvent
  // `${event}:${subscriptionId}:${resourceId}` — unique, makes enqueue idempotent.
  dedupeKey: string
  payload: Record<string, unknown>
  status: WebhookDeliveryStatus
  attempts: number
  lastError?: string | undefined
  nextAttemptAt?: Date | undefined
  sentAt?: Date | undefined
  createdAt: Date
  updatedAt: Date
}

export type ApiKeyScope = 'read' | 'write'

// A user-issued API credential. Only the sha256 `hash` + public `prefix` are
// stored; the full secret is shown once at creation. `revokedAt` soft-revokes.
export interface IApiKey extends Document {
  userId: string
  label: string
  prefix: string
  hash: string
  scopes: ApiKeyScope[]
  lastUsedAt?: Date | undefined
  requestCount: number
  revokedAt?: Date | undefined
  createdAt: Date
  updatedAt: Date
}
