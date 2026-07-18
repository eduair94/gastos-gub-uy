import { defineEventHandler, getQuery } from 'h3'
import { Types } from 'mongoose'
import { connectToDatabase } from '../../../utils/database'
import { AnomalyModel } from '../../../../../shared/models/anomaly'
import { decodeCursor, encodeCursor } from '../../../utils/cursor'
import { toInt, toNumberOrNull } from '../../../utils/query'

// Keyset "changes since" feed of detected anomalies, newest-first by first-seen.
// Powers a "New anomaly over $Y / z ≥ Z" polling trigger.
const PROJECTION = 'type severity severityRank releaseId awardId detectedValue currency confidence description metadata.supplierName metadata.buyerName metadata.zScore metadata.itemDescription aiVerdict.explainable firstDetectedAt'

export default defineEventHandler(async (event) => {
  const q = getQuery(event)
  const limit = toInt(q.limit, 25, 1, 50)
  const cursor = typeof q.since === 'string' ? decodeCursor(q.since) : null

  const filter: Record<string, unknown> = { firstDetectedAt: { $exists: true } }
  const minZ = toNumberOrNull(q.minZ)
  if (minZ !== null) filter['metadata.zScore'] = { $gte: minZ }
  const minAmount = toNumberOrNull(q.minAmount)
  if (minAmount !== null) filter.detectedValue = { $gte: minAmount }
  if (typeof q.severity === 'string' && q.severity) filter.severity = q.severity
  if (typeof q.currency === 'string' && q.currency) filter.currency = q.currency.toUpperCase()

  if (cursor) {
    const t = new Date(cursor.t)
    const keyset: Record<string, unknown>[] = [{ firstDetectedAt: { $lt: t } }]
    if (Types.ObjectId.isValid(cursor.id)) {
      keyset.push({ firstDetectedAt: t, _id: { $lt: new Types.ObjectId(cursor.id) } })
    }
    // Combine the keyset OR with the existing field filters via $and.
    filter.$and = [{ $or: keyset }]
  }

  await connectToDatabase()
  const rows = await AnomalyModel.find(filter)
    .select(PROJECTION)
    .sort({ firstDetectedAt: -1, _id: -1 })
    .limit(limit)
    .lean()

  const last = rows[rows.length - 1]
  const nextCursor = last && (last as { firstDetectedAt?: Date }).firstDetectedAt
    ? encodeCursor({ t: new Date((last as { firstDetectedAt: Date }).firstDetectedAt).getTime(), id: String(last._id) })
    : null

  return { success: true, data: rows, nextCursor, hasMore: rows.length === limit }
})
