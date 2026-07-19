import { createError, defineEventHandler } from 'h3'
import { connectToDatabase } from '../../../utils/database'
import { AnomalyModel } from '../../../utils/models'
import { LOAD_ERROR_CATEGORIES } from '../../../../../shared/utils/anomaly-categories'

/**
 * Where the load errors concentrate — the "franja de concentración" on
 * /analytics/errores-carga. One $facet over the load-error flags
 * (aiVerdict.category ∈ {error-carga, moneda-erronea}, explainable=yes) so a
 * reporter can see which ORGANISMS entered the most bad data (whom to contact
 * first), which suppliers recur, and how the errors spread across years.
 *
 * Read-only, cheap: a single grouped aggregation, no request-path per-row work.
 * The category/explainable match is the same scope the list page uses, so the
 * totals reconcile with the list's pagination total.
 */
export default defineEventHandler(async () => {
  try {
    await connectToDatabase()

    const match = {
      'aiVerdict.explainable': 'yes',
      'aiVerdict.category': { $in: [...LOAD_ERROR_CATEGORIES] },
    }

    const [res] = await AnomalyModel.aggregate([
      { $match: match },
      {
        $facet: {
          total: [{ $count: 'n' }],
          byOrganism: [
            { $group: { _id: '$metadata.buyerName', n: { $sum: 1 } } },
            { $sort: { n: -1, _id: 1 } },
            { $limit: 8 },
          ],
          bySupplier: [
            { $group: { _id: '$metadata.supplierName', n: { $sum: 1 } } },
            { $sort: { n: -1, _id: 1 } },
            { $limit: 6 },
          ],
          byYear: [
            { $match: { sourceYear: { $type: 'number' } } },
            { $group: { _id: '$sourceYear', n: { $sum: 1 } } },
            { $sort: { _id: 1 } },
          ],
        },
      },
    ])

    const clean = (rows: { _id: unknown, n: number }[]) =>
      (rows ?? [])
        .filter(r => r._id != null && String(r._id).trim() !== '')
        .map(r => ({ name: String(r._id).trim(), count: r.n }))

    return {
      success: true,
      data: {
        total: res?.total?.[0]?.n ?? 0,
        byOrganism: clean(res?.byOrganism),
        bySupplier: clean(res?.bySupplier),
        byYear: (res?.byYear ?? []).map((r: { _id: number, n: number }) => ({ year: r._id, count: r.n })),
      },
    }
  }
  catch (error) {
    console.error('Error fetching load-error stats:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch load-error stats' })
  }
})
