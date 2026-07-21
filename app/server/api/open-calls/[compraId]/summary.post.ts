import { createError, defineEventHandler, getRouterParam } from 'h3'
import { connectToDatabase } from '../../../utils/database'
import { OpenCallModel } from '../../../../../shared/models/open_call'
import { summarizeOpenCall } from '../../../../../shared/pliego/summarize'
import { enforcePliegoSummaryLimit } from '../../../utils/aiRateLimit'
import { isSupportedPliegoDocument } from '../../../../../shared/services/pliego-extractor'

// On-demand pliego summary generation. Runs PDF/Word extraction + the free-tier model
// ladder (Gemini → Groq) in the request path, so it is tightly rate-limited per
// IP (aiRateLimit) on top of the global limiter to protect the shared daily quota.
// Idempotent: if a fresh summary already exists it is returned without spending
// budget; a modified pliego (signature changed) is regenerated.
export default defineEventHandler(async (event) => {
  const compraId = getRouterParam(event, 'compraId')
  if (!compraId) {
    throw createError({ statusCode: 400, statusMessage: 'Falta compraId' })
  }

  enforcePliegoSummaryLimit(event)
  await connectToDatabase()

  const call = await OpenCallModel.findOne({ compraId }).select('documents').lean()
  if (!call) {
    throw createError({ statusCode: 404, statusMessage: 'Llamado no encontrado' })
  }
  const hasPliego = (call.documents ?? []).some(isSupportedPliegoDocument)
  if (!hasPliego) {
    return { success: true, data: { available: false, hasPliego: false } }
  }

  const summary = await summarizeOpenCall(compraId)
  if (!summary) {
    // Reachable when no provider key is set, the PDF had no extractable text, or
    // the whole model ladder was rate-limited. Not a server error — a soft miss.
    return { success: true, data: { available: false, hasPliego: true, error: 'generation-failed' } }
  }

  return { success: true, data: { available: true, summary } }
})
