import { defineEventHandler, readBody } from 'h3'
import { connectToDatabase } from '../../utils/database'
import { OpenCallModel } from '../../../../shared/models/open_call'
import { requireWrite } from '../../utils/auth'
import { parseWatchPayload } from '../../utils/watch-input'
import { watchMatchesCall } from '../../../../shared/matching/match'
import type { WatchInput } from '../../../../shared/matching/match'

// Dry-run: how many CURRENTLY-OPEN calls would a draft watch match? Powers the
// "coincide con N llamados" preview in the watch builder. Read-only.
const SCAN_LIMIT = 5000
const SAMPLE_SIZE = 8

export default defineEventHandler(async (event) => {
  requireWrite(event)
  const body = await readBody<Record<string, unknown>>(event)
  const payload = parseWatchPayload(body)

  await connectToDatabase()
  const calls = await OpenCallModel.find({ status: { $in: ['open', 'clarification', 'amended'] } })
    .select('compraId title buyer classificationSet searchText estimatedValue procurementMethodDetails tenderPeriod')
    .limit(SCAN_LIMIT)
    .lean()

  const watch: WatchInput = {
    categories: payload.categories,
    keywords: payload.keywords,
    keywordMode: payload.keywordMode,
    buyers: payload.buyers,
    minValue: payload.minValue,
    maxValue: payload.maxValue,
    procurementMethods: payload.procurementMethods,
  }

  let total = 0
  const sample: Array<{ compraId: string, title: string, endDate: Date | null }> = []
  for (const call of calls) {
    const reason = watchMatchesCall(watch, {
      classificationSet: call.classificationSet ?? [],
      searchText: call.searchText ?? '',
      buyerId: call.buyer?.id,
      estimatedValue: call.estimatedValue,
      procurementMethodDetails: call.procurementMethodDetails,
    })
    if (!reason) continue
    total++
    if (sample.length < SAMPLE_SIZE) {
      sample.push({ compraId: call.compraId, title: call.title, endDate: call.tenderPeriod?.endDate ?? null })
    }
  }

  return { success: true, data: { total, sample, scanned: calls.length, capped: calls.length >= SCAN_LIMIT } }
})
