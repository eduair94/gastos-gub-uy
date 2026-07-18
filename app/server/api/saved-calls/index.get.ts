import { defineEventHandler } from 'h3'
import { connectToDatabase } from '../../utils/database'
import { SavedCallModel } from '../../../../shared/models/saved_call'
import { OpenCallModel } from '../../../../shared/models/open_call'
import { sourceUrl } from '../../utils/query'
import { requireUser } from '../../utils/auth'

// The current user's saved calls, each joined with a light call summary.
export default defineEventHandler(async (event) => {
  const user = requireUser(event)
  await connectToDatabase()

  const saved = await SavedCallModel.find({ userId: user.uid }).sort({ createdAt: -1 }).lean()
  const compraIds = saved.map(s => s.compraId)
  const calls = await OpenCallModel.find({ compraId: { $in: compraIds } })
    .select('compraId ocid title buyer status tenderPeriod procurementMethodDetails')
    .lean()
  const callMap = new Map(calls.map(c => [c.compraId, c]))

  const data = saved.map((s) => {
    const call = callMap.get(s.compraId)
    return { ...s, call: call ? { ...call, sourceUrl: sourceUrl(call.ocid) } : null }
  })
  return { success: true, data }
})
