import { defineEventHandler } from 'h3'
import { connectToDatabase } from '../../utils/database'
import { SavedCallModel } from '../../../../shared/models/saved_call'
import { OpenCallModel } from '../../../../shared/models/open_call'
import { WatchModel } from '../../../../shared/models/watch'
import { sourceUrl } from '../../utils/query'
import { requireUser } from '../../utils/auth'
import { watchMatchesCall } from '../../../../shared/matching/match'
import type { WatchInput } from '../../../../shared/matching/match'

// Upcoming deadlines for the user: the union of saved calls and live calls that
// match the user's active watches, sorted by soonest close.
const LIVE = ['open', 'clarification', 'amended']
const CAL_FIELDS = 'compraId ocid title buyer status tenderPeriod procurementMethodDetails classificationSet searchText estimatedValue'
const SCAN_LIMIT = 3000

export default defineEventHandler(async (event) => {
  const user = requireUser(event)
  await connectToDatabase()
  const now = new Date()

  const [saved, watches] = await Promise.all([
    SavedCallModel.find({ userId: user.uid }).lean(),
    WatchModel.find({ userId: user.uid, active: true }).lean(),
  ])
  const savedIds = new Set(saved.map(s => s.compraId))

  const liveCalls = await OpenCallModel.find({ 'status': { $in: LIVE }, 'tenderPeriod.endDate': { $gte: now } })
    .select(CAL_FIELDS)
    .sort({ 'tenderPeriod.endDate': 1 })
    .limit(SCAN_LIMIT)
    .lean()

  const matchInputs: WatchInput[] = watches.map(w => ({
    categories: w.categories ?? [],
    keywords: w.keywords ?? [],
    keywordMode: w.keywordMode ?? 'any',
    buyers: w.buyers ?? [],
    minValue: w.minValue,
    maxValue: w.maxValue,
    procurementMethods: w.procurementMethods,
  }))

  const items: Array<Record<string, unknown>> = []
  for (const call of liveCalls) {
    const isSaved = savedIds.has(call.compraId)
    let isMatch = false
    if (matchInputs.length) {
      const view = {
        classificationSet: call.classificationSet ?? [],
        searchText: call.searchText ?? '',
        buyerId: call.buyer?.id,
        estimatedValue: call.estimatedValue,
        procurementMethodDetails: call.procurementMethodDetails,
      }
      isMatch = matchInputs.some(w => watchMatchesCall(w, view) !== null)
    }
    if (!isSaved && !isMatch) continue
    items.push({
      compraId: call.compraId,
      title: call.title,
      buyer: call.buyer,
      status: call.status,
      endDate: call.tenderPeriod?.endDate ?? null,
      procurementMethodDetails: call.procurementMethodDetails,
      sourceUrl: sourceUrl(call.ocid),
      saved: isSaved,
      matched: isMatch,
    })
  }

  return { success: true, data: { items } }
})
