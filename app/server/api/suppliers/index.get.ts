import { createError, defineEventHandler, getQuery } from 'h3'
import { connectToDatabase } from '../../utils/database'
import { attachDei } from '../../utils/dei'
import { attachEnrichment, fetchNamesByCategory } from '../../utils/enrichment'
import { DeiCompanyModel, SupplierPatternModel } from '../../utils/models'

/** The `sup.cat.*` values a supplier can actually be filtered by (mirrors SupplierChip; excludes 'otro', which `fetchEnrichment` always nulls out). */
const CATEGORIES = new Set([
  'medio-tv', 'medio-radio', 'medio-prensa', 'medio-digital', 'medio-via-publica',
  'agencia-publicidad', 'productora', 'organismo-publico', 'empresa', 'cooperativa', 'persona',
])

/** Size-token → the regex that matches the DEI `tamano` free text. */
const TAMANO_RX: Record<string, RegExp> = {
  micro: /micro/i,
  pequena: /pequeñ/i,
  mediana: /median/i,
  gran: /gran/i,
}

/**
 * The DEI `rut` is digits only; a supplier's `supplierId` carries an `R` and a
 * slash in one of two known shapes. Reconstruct both (plus the bare rut) so a
 * `$in` on the indexed `supplierId` matches whatever shape the snapshot used.
 */
function candidateIds(ruts: string[]): string[] {
  const out: string[] = []
  for (const r of ruts) out.push(`R/${r}`, `R${r}`, r)
  return out
}

export default defineEventHandler(async (event) => {
  try {
    await connectToDatabase()

    const query = getQuery(event)
    const {
      page = 1,
      limit = 20,
      search,
      sortBy = 'totalValue',
      sortOrder = 'desc',
      dei,
      tamano,
      departamento,
      categoria,
    } = query

    // Build query filter
    const filter: Record<string, unknown> = {}

    // `search` and `categoria` both constrain `name`; assigning both to
    // `filter.name` directly would let the second silently clobber the first
    // (same trap as two dotted-key filters), so combine them with `$and`
    // whenever more than one `name` condition is in play.
    const nameConditions: Record<string, unknown>[] = []
    if (search) {
      nameConditions.push({ name: { $regex: search, $options: 'i' } })
    }

    if (categoria && CATEGORIES.has(String(categoria))) {
      const names = await fetchNamesByCategory(String(categoria))
      // No enriched supplier carries this category → no rows can match.
      if (!names.length) {
        return {
          success: true,
          data: {
            suppliers: [],
            pagination: { page: Number(page), limit: Number(limit), total: 0, totalPages: 0 },
          },
        }
      }
      nameConditions.push({ name: { $in: names } })
    }

    if (nameConditions.length === 1) Object.assign(filter, nameConditions[0])
    else if (nameConditions.length > 1) filter.$and = nameConditions

    // ---- DEI cross-reference filters ----
    // "Only registered industrial companies", optionally narrowed by size or
    // department. Resolve the matching RUTs from dei_companies first, then
    // constrain the supplier list to the ids those RUTs map to.
    const deiFilterActive = dei === '1' || dei === 'true' || !!tamano || !!departamento
    if (deiFilterActive) {
      const deiQuery: Record<string, unknown> = {}
      const rx = tamano ? TAMANO_RX[String(tamano)] : undefined
      if (rx) deiQuery.tamano = { $regex: rx }
      if (departamento) deiQuery.departamento = { $regex: `^${String(departamento)}$`, $options: 'i' }

      const deiRows = await DeiCompanyModel.find(deiQuery, { rut: 1, _id: 0 }).lean()
      const ruts = deiRows.map(r => (r as { rut: string }).rut)
      // No matching registry rows → no suppliers can match. Return empty page.
      if (!ruts.length) {
        return {
          success: true,
          data: {
            suppliers: [],
            pagination: { page: Number(page), limit: Number(limit), total: 0, totalPages: 0 },
          },
        }
      }
      filter.supplierId = { $in: candidateIds(ruts) }
    }

    // Build sort options — only fields indexed on SupplierPattern (see
    // scripts/ensure-indexes.ts) are accepted; anything else falls back to total.
    const SORT_FIELDS = new Set(['totalValue', 'totalContracts', 'buyerCount', 'avgContractValue', 'name'])
    const sortField = SORT_FIELDS.has(String(sortBy)) ? String(sortBy) : 'totalValue'
    const sortDirection = sortOrder === 'desc' ? -1 : 1
    const sortOptions: Record<string, 1 | -1> = { [sortField]: sortDirection as 1 | -1 }

    // Calculate pagination
    const skip = (Number(page) - 1) * Number(limit)

    // Execute query
    const [suppliers, total] = await Promise.all([
      SupplierPatternModel.find(filter)
        .sort(sortOptions)
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      SupplierPatternModel.countDocuments(filter),
    ])

    // AI category chip + DEI registry badge, both keyed off the page rows only.
    const enriched = await attachEnrichment(suppliers, (s: { name?: string }) => s.name ?? '')
    const withDei = await attachDei(enriched, (s: { supplierId?: string }) => s.supplierId ?? '')

    return {
      success: true,
      data: {
        suppliers: withDei,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          totalPages: Math.ceil(total / Number(limit)),
        },
      },
    }
  }
  catch (error) {
    console.error('Error fetching suppliers:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch suppliers',
    })
  }
})
