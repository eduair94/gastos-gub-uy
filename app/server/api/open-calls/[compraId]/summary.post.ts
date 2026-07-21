import { createError, defineEventHandler, getRouterParam, setResponseStatus } from 'h3'
import { connectToDatabase } from '../../../utils/database'
import { OpenCallModel } from '../../../../../shared/models/open_call'
import { enforcePliegoSummaryLimit } from '../../../utils/aiRateLimit'
import { isSupportedPliegoDocument } from '../../../../../shared/services/pliego-extractor'
import { pliegoDocsSignature } from '../../../../../shared/pliego/docs-signature'
import { isPliegoGenerationRunning, startPliegoSummaryGeneration } from '../../../utils/pliegoSummaryGeneration'

// Enqueues one on-demand generation and returns immediately. A Mongo lease makes
// every tab/request for this compraId join the same background run; clients poll
// GET /summary instead of holding a proxy connection through the model ladder.
export default defineEventHandler(async (event) => {
  const compraId = getRouterParam(event, 'compraId')
  if (!compraId) {
    throw createError({ statusCode: 400, statusMessage: 'Falta compraId' })
  }

  await connectToDatabase()

  const call = await OpenCallModel.findOne({ compraId }).select('documents aiSummary aiSummaryGeneration').lean()
  if (!call) {
    throw createError({ statusCode: 404, statusMessage: 'Llamado no encontrado' })
  }
  const hasPliego = (call.documents ?? []).some(isSupportedPliegoDocument)
  if (!hasPliego) {
    return { success: true, data: { available: false, hasPliego: false } }
  }

  const currentSignature = pliegoDocsSignature(call.documents)
  const fresh = call.aiSummary
    && (call.aiSummary.docsSignature === undefined || call.aiSummary.docsSignature === currentSignature)
  if (fresh) {
    return { success: true, data: { available: true, summary: call.aiSummary, stale: false, generating: false } }
  }

  // Joining an existing lease is free: repeated clicks/tabs must not consume the
  // per-IP generation budget or start another provider ladder.
  if (isPliegoGenerationRunning(call.aiSummaryGeneration)) {
    setResponseStatus(event, 202)
    return {
      success: true,
      data: { available: Boolean(call.aiSummary), summary: call.aiSummary, stale: Boolean(call.aiSummary), generating: true, started: false },
    }
  }

  enforcePliegoSummaryLimit(event)
  const generation = await startPliegoSummaryGeneration(compraId)
  if (generation.promise) event.waitUntil(generation.promise)
  setResponseStatus(event, 202)
  return {
    success: true,
    data: { available: Boolean(call.aiSummary), summary: call.aiSummary, stale: Boolean(call.aiSummary), generating: true, started: generation.started },
  }
})
