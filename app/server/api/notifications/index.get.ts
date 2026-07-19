import { defineEventHandler, getQuery } from 'h3'
import { connectToDatabase } from '../../utils/database'
import { NotificationModel } from '../../../../shared/models/notification'
import { OpenCallModel } from '../../../../shared/models/open_call'
import { sourceUrl } from '../../utils/query'
import { requireUser } from '../../utils/auth'

// The in-app notification inbox: the user's matched-llamado events (the always-on
// `inapp` channel rows), newest first, each joined to a light call summary, plus
// the unread count for the header badge.
export default defineEventHandler(async (event) => {
  const user = requireUser(event)
  const q = getQuery(event)
  const limit = Math.min(Math.max(Number(q.limit) || 20, 1), 50)
  const skip = Math.max(Number(q.skip) || 0, 0)

  await connectToDatabase()
  const filter = { userId: user.uid, type: 'alert', channel: 'inapp' } as const

  const [rows, unread, total] = await Promise.all([
    NotificationModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    // In Mongo, `{ readAt: null }` matches both explicit null AND missing → unread.
    NotificationModel.countDocuments({ ...filter, readAt: null }),
    NotificationModel.countDocuments(filter),
  ])

  const compraIds = rows.map(r => r.compraId)
  const calls = await OpenCallModel.find({ compraId: { $in: compraIds } })
    .select('compraId ocid title buyer status tenderPeriod procurementMethodDetails estimatedValue currency')
    .lean()
  const callMap = new Map(calls.map(c => [c.compraId, c]))

  const items = rows.map((r) => {
    const call = callMap.get(r.compraId)
    return {
      id: String(r._id),
      compraId: r.compraId,
      matchedOn: r.matchedOn ?? null,
      readAt: r.readAt ?? null,
      createdAt: r.createdAt,
      call: call ? { ...call, sourceUrl: sourceUrl(call.ocid) } : null,
    }
  })

  return { success: true, data: { items, unread, total, hasMore: skip + rows.length < total } }
})
