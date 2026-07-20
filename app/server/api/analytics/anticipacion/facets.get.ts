import { createError, defineEventHandler } from 'h3'
import { connectToDatabase } from '../../../utils/database'
import { TenderForecastModel } from '../../../utils/models'
import { DISPLAY_THRESHOLD } from '../../../../../shared/forecast/constants'

/**
 * Facets for the "Anticipación de llamados" page's Organismo/Rubro filters.
 *
 * Returns the distinct buyers and rubros that ACTUALLY have an upcoming
 * forecast right now, so no dropdown option is a dead end. Uses the SAME
 * base filter the main endpoint (anticipacion.get.ts) applies by default —
 * confidence >= DISPLAY_THRESHOLD and expectedWindow.end >= now — so the
 * options offered here always match what the table would show with no
 * filter applied. If that base filter ever drifts from the read endpoint's,
 * this list would start offering options that silently return nothing.
 *
 * tender_forecast is small (~19k docs) and indexed on confidence and
 * expectedWindow.end, so a $match + $group + $sort + $limit here is a cheap
 * request-path aggregate — nothing to precompute.
 */
export default defineEventHandler(async (event) => {
  try {
    await connectToDatabase()

    const match = {
      confidence: { $gte: DISPLAY_THRESHOLD },
      'expectedWindow.end': { $gte: new Date() },
    }

    const [buyerRows, rubroRows] = await Promise.all([
      TenderForecastModel.aggregate([
        { $match: match },
        { $group: { _id: { id: '$buyerId', name: '$buyerName' }, count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 1000 },
      ]),
      TenderForecastModel.aggregate([
        { $match: match },
        { $group: { _id: { id: '$rubroNodeId', label: '$rubroLabel' }, count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 2000 },
      ]),
    ])

    const buyers = buyerRows
      .filter(r => r._id?.id)
      .map(r => ({ value: String(r._id.id), label: String(r._id.name || r._id.id), count: r.count as number }))

    const rubros = rubroRows
      .filter(r => r._id?.id)
      .map(r => ({ value: String(r._id.id), label: String(r._id.label || r._id.id), count: r.count as number }))

    return { success: true, data: { buyers, rubros } }
  }
  catch (error: any) {
    if (error?.statusCode) throw error
    console.error('Error fetching anticipacion facets:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch anticipacion facets' })
  }
})
