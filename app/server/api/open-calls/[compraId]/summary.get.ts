import { createError, defineEventHandler, getRouterParam } from 'h3'
import { connectToDatabase } from '../../../utils/database'
import { OpenCallModel } from '../../../../../shared/models/open_call'
import { isSupportedPliegoDocument } from '../../../../../shared/services/pliego-extractor'
import { pliegoDocsSignature } from '../../../../../shared/pliego/docs-signature'
import { isPliegoGenerationRunning } from '../../../utils/pliegoSummaryGeneration'

// Read-only cached AI pliego summary plus shared background-generation state.
// The cron may pre-generate summaries; on-demand requests run behind a Mongo
// lease and expose progress here while clients poll.
export default defineEventHandler(async (event) => {
  const compraId = getRouterParam(event, 'compraId')
  if (!compraId) {
    throw createError({ statusCode: 400, statusMessage: 'Falta compraId' })
  }
  await connectToDatabase()
  const call = await OpenCallModel.findOne({ compraId }).select('aiSummary documents aiSummaryGeneration').lean()
  if (!call) {
    throw createError({ statusCode: 404, statusMessage: 'Llamado no encontrado' })
  }

  const generationRunning = isPliegoGenerationRunning(call.aiSummaryGeneration)
  const generation = generationRunning
    ? {
        model: call.aiSummaryGeneration.model,
        lastActivityAt: call.aiSummaryGeneration.lastActivityAt,
        receivedChars: call.aiSummaryGeneration.receivedChars ?? 0,
      }
    : undefined

  if (call.aiSummary) {
    // Stale = the pliego was modified after this summary was generated. The cached
    // summary is still returned (better than nothing); the UI can offer to refresh.
    const sig = call.aiSummary.docsSignature
    const stale = sig !== undefined && sig !== pliegoDocsSignature(call.documents)
    const generating = generationRunning
    const error = !generating && call.aiSummaryGeneration?.status === 'failed' && stale
      ? 'generation-failed'
      : undefined
    return { success: true, data: { available: true, summary: call.aiSummary, stale, generating, generation, error } }
  }
  const hasPliego = (call.documents ?? []).some(isSupportedPliegoDocument)
  const generating = generationRunning
  const error = !generating && call.aiSummaryGeneration?.status === 'failed'
    ? 'generation-failed'
    : undefined
  return { success: true, data: { available: false, hasPliego, generating, generation, error } }
})
