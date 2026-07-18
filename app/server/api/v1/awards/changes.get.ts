import { defineEventHandler, getQuery } from 'h3'
import { connectToDatabase } from '../../../utils/database'
import { ReleaseModel } from '../../../../../shared/models/release'
import { decodeCursor, encodeCursor } from '../../../utils/cursor'
import { awardUrl, toInt, toNumberOrNull } from '../../../utils/query'

// Keyset "changes since" feed of award releases (tag: 'award'), newest-first by
// award date. Powers "notify when supplier Z wins a new award". This is the
// heaviest changes feed (2.2M releases), so it sorts on `date` ALONE to ride the
// tag_1_date_-1 index — adding an `_id` tiebreak would force a blocking in-memory
// sort over every award and time out. Consequence: awards that share the exact
// same `date` at a page boundary can be skipped. For a new-award notifier this is
// acceptable; poll frequently and treat `date` granularity as the resolution.
const PROJECTION = 'id ocid date sourceYear buyer awards.suppliers awards.date awards.title amount.primaryAmount amount.primaryCurrency tender.title'

export default defineEventHandler(async (event) => {
  const q = getQuery(event)
  const limit = toInt(q.limit, 25, 1, 50)
  const cursor = typeof q.since === 'string' ? decodeCursor(q.since) : null

  const filter: Record<string, unknown> = { tag: 'award' }
  if (typeof q.supplierId === 'string' && q.supplierId) filter['awards.suppliers.id'] = q.supplierId
  if (typeof q.buyerId === 'string' && q.buyerId) filter['buyer.id'] = q.buyerId
  const minAmount = toNumberOrNull(q.minAmount)
  if (minAmount !== null) filter['amount.primaryAmount'] = { $gte: minAmount }

  // Keyset on `date` desc only, served directly by the tag_1_date_-1 index.
  if (cursor) filter.date = { $lt: new Date(cursor.t) }

  await connectToDatabase()
  const rows = await ReleaseModel.find(filter)
    .select(PROJECTION)
    .sort({ date: -1 })
    .limit(limit)
    .lean()

  const data = rows.map(r => ({ ...r, sourceUrl: (r as { ocid?: string }).ocid ? awardUrl((r as { ocid?: string }).ocid) : null }))
  const last = rows[rows.length - 1] as { date?: Date, _id: unknown } | undefined
  const nextCursor = last && last.date
    ? encodeCursor({ t: new Date(last.date).getTime(), id: String(last._id) })
    : null

  return { success: true, data, nextCursor, hasMore: rows.length === limit }
})
