import { createError, defineEventHandler, getQuery } from 'h3'
import { connectToDatabase } from '../../../utils/database'
import { AnomalyModel } from '../../../utils/models'
import { escapeRegex } from '../../../utils/query'

/**
 * Typeahead facets for the anomalies advanced filters.
 *
 * Returns the suppliers / buyers / rubros that ACTUALLY carry a flag — a
 * distinct-with-count over the anomalies collection — so a reader is offered
 * only values that return rows, each with its flag count. Every option is the
 * exact string the /api/analytics/anomalies `supplier` / `buyer` / `rubroName`
 * filters match on, so selecting one filters cleanly.
 *
 * The collection is small (~6.4k docs), so a regex-match → group → sort → limit
 * runs in ~200ms on the live set (measured) — there is nothing to precompute.
 * `field` is whitelisted to a fixed set of metadata paths; the search term is
 * escaped so a value like `(a+)+` cannot ReDoS this unauthenticated endpoint.
 */
const FIELDS: Record<string, string> = {
  supplierName: 'metadata.supplierName',
  buyerName: 'metadata.buyerName',
  rubroName: 'metadata.itemClassification.rubro',
}

const PRODUCT_ID = 'metadata.itemClassification.id'
const PRODUCT_DESC = 'metadata.itemClassification.description'

export default defineEventHandler(async (event) => {
  try {
    await connectToDatabase()

    const query = getQuery(event)
    const fieldKey = typeof query.field === 'string' ? query.field : ''
    // Product is the one facet whose value ≠ label: the value is the catalogue CODE
    // (classification.id) the anomalies `product` filter matches on, but the option
    // must read as the human article NAME (classification.description). It groups on
    // the id, carries a representative description, and matches either on search.
    const isProduct = fieldKey === 'product'
    const path = FIELDS[fieldKey]
    if (!isProduct && !path) {
      throw createError({ statusCode: 400, statusMessage: 'Unknown facet field' })
    }

    const search = typeof query.search === 'string' ? query.search.trim() : ''
    const limit = Math.min(30, Math.max(1, Number(query.limit) || 15))

    let data: { value: string, label: string, count: number }[]

    if (isProduct) {
      // Only rows enriched with a catalogue code.
      const match: Record<string, unknown> = { [PRODUCT_ID]: { $nin: [null, ''] } }
      if (search.length >= 2) {
        const rx = { $regex: escapeRegex(search), $options: 'i' }
        // A code is a heterogeneous bucket of descriptions, so search NAME or CODE.
        match.$or = [{ [PRODUCT_DESC]: rx }, { [PRODUCT_ID]: rx }]
      }
      const rows = await AnomalyModel.aggregate([
        { $match: match },
        // $min gives a deterministic label per code (a code maps to many descriptions),
        // so the same option renders the same name across calls.
        { $group: { _id: `$${PRODUCT_ID}`, label: { $min: `$${PRODUCT_DESC}` }, count: { $sum: 1 } } },
        { $sort: { count: -1, _id: 1 } },
        { $limit: limit },
      ])
      data = rows
        .filter(r => typeof r._id === 'string' && r._id)
        .map(r => ({
          value: r._id as string,
          label: typeof r.label === 'string' && r.label.trim() ? r.label as string : r._id as string,
          count: r.count as number,
        }))
    }
    else {
      // Only rows that carry a non-empty value for this dimension.
      const match: Record<string, unknown> = { [path!]: { $nin: [null, ''] } }
      if (search.length >= 2) {
        match[path!] = { $nin: [null, ''], $regex: escapeRegex(search), $options: 'i' }
      }
      const rows = await AnomalyModel.aggregate([
        { $match: match },
        { $group: { _id: `$${path}`, count: { $sum: 1 } } },
        // Most-flagged first; name as a deterministic tie-break so paging is stable.
        { $sort: { count: -1, _id: 1 } },
        { $limit: limit },
      ])
      data = rows
        .filter(r => typeof r._id === 'string' && r._id)
        .map(r => ({ value: r._id as string, label: r._id as string, count: r.count as number }))
    }

    return { success: true, data }
  }
  catch (error: any) {
    if (error?.statusCode) throw error
    console.error('Error fetching anomaly facets:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch anomaly facets' })
  }
})
