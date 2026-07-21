import { createError, defineEventHandler, getRouterParam } from 'h3'
import { connectToDatabase } from '../../../utils/database'
import { OpenCallModel } from '../../../../../shared/models/open_call'

// Read-only cached AI pliego summary. Generation runs on the cron/root side
// (eager for matched calls + the pliego-summary job), which keeps the PDF
// extraction + Gemini call out of the request path. Returns available:false when
// no summary has been produced yet.
export default defineEventHandler(async (event) => {
  const compraId = getRouterParam(event, 'compraId')
  if (!compraId) {
    throw createError({ statusCode: 400, statusMessage: 'Falta compraId' })
  }
  await connectToDatabase()
  const call = await OpenCallModel.findOne({ compraId }).select('aiSummary documents pliegoDocsSignature').lean()
  if (!call) {
    throw createError({ statusCode: 404, statusMessage: 'Llamado no encontrado' })
  }

  if (call.aiSummary) {
    // Stale = the pliego was modified after this summary was generated. The cached
    // summary is still returned (better than nothing); the UI can offer to refresh.
    const sig = call.aiSummary.docsSignature
    const stale = sig !== undefined && sig !== call.pliegoDocsSignature
    return { success: true, data: { available: true, summary: call.aiSummary, stale } }
  }
  const hasPliego = (call.documents ?? []).length > 0
  return { success: true, data: { available: false, hasPliego } }
})
