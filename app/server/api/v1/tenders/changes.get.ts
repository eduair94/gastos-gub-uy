import { defineEventHandler, getQuery } from 'h3'
import { Types } from 'mongoose'
import { connectToDatabase } from '../../../utils/database'
import { OpenCallModel } from '../../../../../shared/models/open_call'
import { decodeCursor, encodeCursor } from '../../../utils/cursor'
import { sourceUrl, toArray, toInt } from '../../../utils/query'

// Keyset "changes since" feed of open calls, newest first — built for polling
// triggers (Zapier "New Tender", etc.). Pass the previous response's `nextCursor`
// back as `since` and you get only rows newer than the last one you saw, with no
// gaps or duplicates. Without `since`, returns the most recent page + a cursor to
// store as the starting point.
const PROJECTION = 'compraId ocid title buyer procuringEntity procurementMethodDetails status publishDate tenderPeriod classificationSet estimatedValue currency firstSeenAt'

export default defineEventHandler(async (event) => {
  const q = getQuery(event)
  const limit = toInt(q.limit, 25, 1, 50)
  const cursor = typeof q.since === 'string' ? decodeCursor(q.since) : null

  const filter: Record<string, unknown> = {}
  const statuses = toArray(q.status)
  if (statuses.length) filter.status = { $in: statuses }
  const categories = toArray(q.category)
  if (categories.length) filter.classificationSet = { $in: categories }
  const buyers = toArray(q.buyer)
  if (buyers.length) filter['buyer.id'] = { $in: buyers }

  // Keyset: (firstSeenAt, _id) strictly older than the cursor, newest first.
  if (cursor) {
    const t = new Date(cursor.t)
    const keyset: Record<string, unknown>[] = [{ firstSeenAt: { $lt: t } }]
    if (Types.ObjectId.isValid(cursor.id)) {
      keyset.push({ firstSeenAt: t, _id: { $lt: new Types.ObjectId(cursor.id) } })
    }
    filter.$or = keyset
  }

  await connectToDatabase()
  const rows = await OpenCallModel.find(filter)
    .select(PROJECTION)
    .sort({ firstSeenAt: -1, _id: -1 })
    .limit(limit)
    .lean()

  const data = rows.map(r => ({ ...r, sourceUrl: r.ocid ? sourceUrl(r.ocid) : null }))
  const last = rows[rows.length - 1]
  const nextCursor = last && last.firstSeenAt
    ? encodeCursor({ t: new Date(last.firstSeenAt).getTime(), id: String(last._id) })
    : null

  return { success: true, data, nextCursor, hasMore: rows.length === limit }
})
