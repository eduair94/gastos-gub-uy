import { createError, defineEventHandler } from 'h3'
import { connectToDatabase } from '../../utils/database'
import { SupplierContactModel } from '../../utils/models'

/**
 * Rubro facet for the contact directory's industry `<select>`: the rubros held
 * by contactable (enriched + valid-email) providers, with how many providers
 * each covers. Scoped to the deliverable default so the filter never offers a
 * rubro that yields an empty deliverable list.
 */
export default defineEventHandler(async () => {
  try {
    await connectToDatabase()

    const rows = await SupplierContactModel.aggregate([
      { $match: { status: 'enriched', emails: { $elemMatch: { mxValid: true, status: 'valid' } } } },
      { $unwind: '$rubros' },
      { $group: { _id: '$rubros.classificationId', label: { $first: '$rubros.label' }, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 150 },
      { $project: { _id: 0, classificationId: '$_id', label: 1, count: 1 } },
    ]).option({ maxTimeMS: 15_000 })

    return { success: true, data: { rubros: rows } }
  }
  catch (error) {
    console.error('Error fetching contact rubros:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch rubros' })
  }
})
