import { defineEventHandler, getQuery } from 'h3'
import { connectToDatabase } from '../../utils/database'
import { OpenCallModel } from '../../../../shared/models/open_call'
import { normalizeText } from '../../../../shared/utils/text'
import { escapeRegex, toArray, toInt } from '../../utils/query'

// Public browser of open tender calls. Filters: category (classification id),
// keyword (q), buyer (id), status, closes-before. Sorted by soonest deadline.
// By default only still-biddable calls are shown (deadline not yet passed) — see
// the expired filter below.
const LIVE_STATUS = ['open', 'clarification', 'amended']
const LIST_FIELDS = 'compraId ocid title buyer procuringEntity procurementMethodDetails status publishDate tenderPeriod classificationSet estimatedValue currency firstSeenAt'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  await connectToDatabase()

  const and: Record<string, unknown>[] = []

  // Status: default to the live set (open/clarification/amended).
  const statusParam = toArray(query.status)
  if (statusParam.length && !statusParam.includes('all')) {
    and.push({ status: { $in: statusParam } })
  }
  else if (!statusParam.includes('all')) {
    and.push({ status: { $in: LIVE_STATUS } })
  }

  const categories = toArray(query.category)
  if (categories.length) and.push({ classificationSet: { $in: categories } })

  const buyers = toArray(query.buyer)
  if (buyers.length) and.push({ 'buyer.id': { $in: buyers } })

  const method = toArray(query.method)
  if (method.length) and.push({ procurementMethodDetails: { $in: method } })

  // Keyword: substring over the normalized searchText (small hot collection).
  const q = typeof query.q === 'string' ? normalizeText(query.q).slice(0, 120) : ''
  if (q) and.push({ searchText: new RegExp(escapeRegex(q)) })

  const endsBefore = typeof query.endsBefore === 'string' ? new Date(query.endsBefore) : null
  if (endsBefore && !Number.isNaN(endsBefore.getTime())) {
    and.push({ 'tenderPeriod.endDate': { $lte: endsBefore } })
  }

  // Hide already-closed calls by default. Status transitions lag the sync, so an
  // expired call can still read status:'open'; combined with the deadline-asc sort
  // that floated expired calls to the TOP of the list. Exclude anything whose
  // reception deadline has passed (calls with no endDate are still shown). Opt back
  // in with ?includeExpired=1 or the explicit status=all. A separate $and entry, so
  // it never collides with the endsBefore filter on the same dotted key.
  const includeExpired = query.includeExpired === '1' || query.includeExpired === 'true' || statusParam.includes('all')
  if (!includeExpired) {
    and.push({
      $or: [
        { 'tenderPeriod.endDate': { $gte: new Date() } },
        { 'tenderPeriod.endDate': { $exists: false } },
      ],
    })
  }

  const page = toInt(query.page, 1, 1, 200)
  const limit = toInt(query.limit, 24, 1, 50)
  const skip = (page - 1) * limit

  const sortParam = typeof query.sort === 'string' ? query.sort : 'deadline'
  const sort: Record<string, 1 | -1> = sortParam === 'newest'
    ? { firstSeenAt: -1 }
    : { 'tenderPeriod.endDate': 1 }

  const match = and.length ? { $and: and } : {}

  const [calls, total] = await Promise.all([
    OpenCallModel.find(match).select(LIST_FIELDS).sort(sort).skip(skip).limit(limit).lean(),
    OpenCallModel.countDocuments(match).then(n => n).catch(() => null),
  ])

  return {
    success: true,
    data: {
      calls,
      pagination: {
        page,
        limit,
        total,
        hasMore: total !== null ? skip + calls.length < total : calls.length === limit,
      },
    },
  }
})
