import { createError, defineEventHandler, getQuery } from 'h3'
import type { PipelineStage } from 'mongoose'
import { ReleaseModel } from '../../../../shared/models/release'
import { connectToDatabase, mongoose } from '../../utils/database'
import { escapeRegex, safeRegex, sanitizeSearch, sourceUrl, toArray, toInt, toNumberOrNull } from '../../utils/query'

/** Fields that may be sorted on. All are indexed except `title`. */
const SORT_FIELDS: Record<string, string> = {
  date: 'date',
  year: 'sourceYear',
  status: 'tender.status',
  ocid: 'ocid',
  title: 'tender.title',
  buyer: 'buyer.name',
  supplier: 'awards.suppliers.name',
  amount: 'amount.primaryAmount',
  totalAmount: 'amount.primaryAmount', // Alias for amount
  // Only valid in single-product focus mode, where the `focusItem` projection
  // (below) surfaces the matched line's own unit price / quantity. Guarded so a
  // request without a single categoryId falls back to date (see the handler).
  itemUnitPrice: 'focusItem.unitAmount',
  itemQuantity: 'focusItem.quantity',
}

function getSortField(sortBy: string): string {
  return SORT_FIELDS[sortBy] || 'date'
}

/**
 * Builds a name filter that prefers an exact, index-backed `$in`.
 *
 * `filter_data` — the source for /api/contracts/filters, and therefore for
 * every value the UI sends back — stores full, exact names. Matching those
 * exactly lets Mongo use `buyer.name_1` / `awards.suppliers.name_1` directly.
 *
 * Partial matching is opt-in via a `*` wildcard rather than implicit, because
 * an implicit case-insensitive regex can never use the index and would turn
 * every buyer filter into a 2.1M-document scan. `foo*` anchors at the start;
 * `*foo` matches anywhere (slowest — no index).
 *
 * Every pattern is escaped through `safeRegex`/`escapeRegex`, so a hostile
 * value like `(a+)+$` becomes a literal instead of a ReDoS against an
 * unauthenticated endpoint.
 */
function nameFilter(field: string, values: string[]): Record<string, unknown> | null {
  const exact: string[] = []
  const partial: RegExp[] = []

  for (const v of values) {
    if (v.includes('*')) {
      const bare = v.replace(/\*/g, '').trim()
      if (!bare) continue
      // `foo*` -> anchored prefix; `*foo` / `*foo*` -> contains.
      partial.push(v.startsWith('*') ? safeRegex(bare) : new RegExp(`^${escapeRegex(bare)}`, 'i'))
    }
    else {
      exact.push(v)
    }
  }

  const clauses: Record<string, unknown>[] = []
  if (exact.length) clauses.push({ [field]: { $in: exact } })
  if (partial.length) clauses.push({ [field]: { $in: partial } })

  if (!clauses.length) return null
  return clauses.length === 1 ? clauses[0]! : { $or: clauses }
}

/** Wraps sibling clauses in `$or`, or returns the single clause unwrapped. */
function anyOf(clauses: Record<string, unknown>[]): Record<string, unknown> | null {
  if (!clauses.length) return null
  return clauses.length === 1 ? clauses[0]! : { $or: clauses }
}

export interface ContractFilters {
  /** `$and` clauses. Composed with `$and` rather than merged into one object
   *  so that two filters both needing `$or` cannot clobber each other. */
  and: Record<string, unknown>[]
  /** The `$text` clause, which MongoDB requires in the FIRST `$match` stage. */
  text: Record<string, unknown> | null
  /** Sanitised full search phrase, used for the regex refinement pass. */
  searchPhrase: string | null
  /** True when any filter at all narrows the collection. */
  hasFilters: boolean
}

/**
 * Translates public query params into MongoDB clauses.
 *
 * Exported so that `stats.get.ts` derives the *identical* match from the
 * *identical* params — if the two ever drifted, the result-summary strip
 * would describe a different set of contracts than the list below it.
 * (Natural home is `server/utils/`; kept here while that file is owned by
 * a parallel change.)
 */
export function buildContractFilters(query: Record<string, unknown>): ContractFilters {
  const and: Record<string, unknown>[] = []

  // --- Full-text search -----------------------------------------------------
  // Hybrid strategy: the text index narrows the candidate set fast on the
  // first token, then a regex re-checks the full phrase. `default_language`
  // is 'none' on this index, so tokens are matched without stemming.
  const searchPhrase = sanitizeSearch(query.search)
  let text: Record<string, unknown> | null = null

  if (searchPhrase) {
    const firstWord = searchPhrase.split(' ')[0]!
    text = {
      $text: {
        $search: firstWord,
        $caseSensitive: false,
        $diacriticSensitive: false,
      },
    }

    // Only worth a second pass when the phrase has more than the token we
    // already matched via the index.
    const fullSearchRegex = safeRegex(searchPhrase)
    and.push({
      $or: [
        { 'tender.title': fullSearchRegex },
        { 'tender.description': fullSearchRegex },
        { 'awards.items.description': fullSearchRegex },
        { 'awards.items.title': fullSearchRegex },
        { 'awards.items.classification.description': fullSearchRegex },
        { 'buyer.name': fullSearchRegex },
        { 'awards.suppliers.name': fullSearchRegex },
      ],
    })
  }

  // --- Year (indexed: sourceYear_1, sourceYear_1_date_-1) -------------------
  // `sourceYear` is the reliable year field. `date` is a real BSON Date here
  // (a migration already converted it), so no $dateFromString is needed.
  const year = toNumberOrNull(query.year)
  const yearFrom = toNumberOrNull(query.yearFrom)
  const yearTo = toNumberOrNull(query.yearTo)

  if (year !== null) {
    and.push({ sourceYear: year })
  }
  else if (yearFrom !== null || yearTo !== null) {
    const range: Record<string, number> = {}
    if (yearFrom !== null) range.$gte = yearFrom
    if (yearTo !== null) range.$lte = yearTo
    and.push({ sourceYear: range })
  }

  // --- Status (indexed, but null on ~94% of documents) ----------------------
  // Supported, but deliberately never used to lead an index hint.
  const status = toArray(query.status)
  if (status.length) and.push({ 'tender.status': { $in: status } })

  // --- Procurement method ---------------------------------------------------
  // `procurementMethod` is the English OCDS enum (open/direct/limited).
  const procurementMethod = toArray(query.procurementMethod)
  if (procurementMethod.length) and.push({ 'tender.procurementMethod': { $in: procurementMethod } })

  // `procurementMethodDetails` holds the real Uruguayan procedure names users
  // actually search by ("Compra Directa", "Licitación Abreviada", ...). Exact
  // `$in` only — these are a closed set of ~4 values, so regex buys nothing
  // and would only cost a scan.
  const procurementMethodDetails = toArray(query.procurementMethodDetails)
  if (procurementMethodDetails.length) {
    and.push({ 'tender.procurementMethodDetails': { $in: procurementMethodDetails } })
  }

  // --- Buyers (by name and/or id) -------------------------------------------
  // Both params narrow the same concept ("which buyer"), so they OR together
  // and enter `and` as a single clause — this is what stops one filter's `$or`
  // from overwriting another's.
  const buyerClauses: Record<string, unknown>[] = []
  const buyerNameFilter = nameFilter('buyer.name', toArray(query.buyers))
  if (buyerNameFilter) buyerClauses.push(buyerNameFilter)

  const buyerIds = toArray(query.buyerIds)
  if (buyerIds.length) buyerClauses.push({ 'buyer.id': { $in: buyerIds } })

  const buyerClause = anyOf(buyerClauses)
  if (buyerClause) and.push(buyerClause)

  // --- Suppliers (by name and/or id) ----------------------------------------
  const supplierClauses: Record<string, unknown>[] = []
  const rawSuppliers = toArray(query.suppliers)

  // Explicit id param — the supported way to filter by supplier id.
  const supplierIds = toArray(query.supplierIds)

  // Backward compatibility: callers used to pass ids inside `suppliers`, and
  // this endpoint sniffed them out with `includes('/')`. Real ids look like
  // `R/211203010017`, so the sniff mostly worked, but a company name with a
  // slash would be misrouted. Kept only as a legacy fallback; `supplierIds`
  // is the explicit path.
  const legacySupplierIds = rawSuppliers.filter(s => /^[A-Z]\/\d+$/i.test(s))
  const supplierNames = rawSuppliers.filter(s => !/^[A-Z]\/\d+$/i.test(s))

  const supplierNameFilter = nameFilter('awards.suppliers.name', supplierNames)
  if (supplierNameFilter) supplierClauses.push(supplierNameFilter)

  const allSupplierIds = [...supplierIds, ...legacySupplierIds]
  if (allSupplierIds.length) supplierClauses.push({ 'awards.suppliers.id': { $in: allSupplierIds } })

  const supplierClause = anyOf(supplierClauses)
  if (supplierClause) and.push(supplierClause)

  // --- Amount (indexed: amount.primaryAmount_1) -----------------------------
  // Pre-normalised to UYU at ingest, so one range works across currencies.
  const amountFrom = toNumberOrNull(query.amountFrom)
  const amountTo = toNumberOrNull(query.amountTo)
  if (amountFrom !== null || amountTo !== null) {
    const range: Record<string, number> = {}
    if (amountFrom !== null) range.$gte = amountFrom
    if (amountTo !== null) range.$lte = amountTo
    and.push({ 'amount.primaryAmount': range })
  }

  if (query.hasAmount === 'true' || query.hasAmount === true) {
    and.push({ 'amount.hasAmounts': true })
  }

  // --- Currency (indexed: amount.currencies_1) ------------------------------
  const currency = toArray(query.currency).map(c => c.toUpperCase())
  if (currency.length) and.push({ 'amount.currencies': { $in: currency } })

  // --- Category (by free-text description) -----------------------------------
  // Maps to the award item classification description. NOT indexed, so this is
  // a refinement filter: cheap alongside a year/buyer filter, expensive alone.
  // Prefer `categoryId` below wherever the exact catalogue code is known — the
  // description is unnormalised and frequently contains commas, which the list
  // parsing splits into bogus fragments.
  const categoryFilter = nameFilter('awards.items.classification.description', toArray(query.category))
  if (categoryFilter) and.push(categoryFilter)

  // --- Category by catalogue code (classification.id) ------------------------
  // The canonical product key: exact, comma-safe, and index-backed by
  // `awards.items.classification.id_1_date_-1` (see scripts/ensure-indexes.ts).
  // This is what the product pages and the price-reference "comparables" link
  // use, so a code like "8172" selects exactly the population its baseline was
  // computed from — unlike the description, which is many-to-many with codes.
  const categoryIds = toArray(query.categoryId)
  if (categoryIds.length) and.push({ 'awards.items.classification.id': { $in: categoryIds } })

  // --- Minimum item count ---------------------------------------------------
  const minItems = toNumberOrNull(query.minItems)
  if (minItems !== null && minItems > 0) and.push({ 'amount.totalItems': { $gte: minItems } })

  // --- Lifecycle stage ------------------------------------------------------
  // One OCID spans several releases: llamado -> aclaraciones -> adjudicación.
  // Only `award`/`awardUpdate` carry money, so a default sort by date leads
  // with `tenderUpdate` rows that have no supplier and no amount — which reads
  // as missing data. Letting callers filter the stage is the fix; we do not
  // silently exclude anything.
  const tag = toArray(query.tag)
  if (tag.length) and.push({ tag: { $in: tag } })

  return {
    and,
    text,
    searchPhrase,
    hasFilters: and.length > 0 || text !== null,
  }
}

/** Assembles the `$match` document (text clause first) for count/aggregate. */
export function toMatchDocument(filters: ContractFilters): Record<string, unknown> {
  const match: Record<string, unknown> = {}
  if (filters.text) Object.assign(match, filters.text)
  if (filters.and.length) match.$and = filters.and
  return match
}

/**
 * Counts matching documents without ever letting the count hang the request.
 *
 * - No filters at all -> `estimatedDocumentCount` reads collection metadata
 *   (~175ms) instead of scanning 2.1M documents.
 * - Otherwise -> a real count capped at 10001, so the worst case is bounded
 *   work rather than a full scan. `total > 10000` reports as capped and the
 *   UI shows "10,000+".
 * - On timeout/error -> null, and the caller falls back to `hasMore`.
 */
async function countContracts(
  filters: ContractFilters,
  match: Record<string, unknown>,
  skip = false,
): Promise<{ total: number | null, totalIsCapped: boolean }> {
  // `count=false` — for callers that render a fixed-size teaser and never
  // paginate. With a non-selective filter like `tag` in the match, the
  // count stops being an index-only COUNT_SCAN and starts fetching up to
  // 10001 whole releases, which is more work than the rows themselves.
  if (skip) return { total: null, totalIsCapped: false }

  try {
    if (!filters.hasFilters) {
      return { total: await ReleaseModel.estimatedDocumentCount(), totalIsCapped: false }
    }

    const total = await ReleaseModel.countDocuments(match, { maxTimeMS: 4000, limit: 10001 })
    return { total, totalIsCapped: total > 10000 }
  }
  catch (error) {
    // A slow count must degrade the pagination hint, not the whole response.
    console.warn('[contracts] count failed, falling back to hasMore:', (error as Error).message)
    return { total: null, totalIsCapped: false }
  }
}

export default defineEventHandler(async (event) => {
  const startTime = Date.now()

  // Rate limiting is handled once, correctly, by server/middleware/rateLimit.ts
  // (real client IP, and never throttling internal SSR render traffic). The
  // previous inline limiter here keyed on socket.remoteAddress — the shared
  // proxy IP behind Cloudflare — so it throttled every visitor as one client
  // and 429'd our own SSR fetches. Removed in favour of the single source.

  try {
    await connectToDatabase()

    if (mongoose.connection.readyState !== 1) {
      throw new Error('Database connection not ready')
    }

    const query = getQuery(event)

    const limit = toInt(query.limit, 25, 1, 50)
    const page = toInt(query.page, 1, 1, Number.MAX_SAFE_INTEGER)

    // Deep pagination forces Mongo to walk every skipped document; cap it.
    const maxPage = 100
    if (page > maxPage) {
      throw createError({
        statusCode: 400,
        statusMessage: `Page number too high. Maximum allowed page is ${maxPage}`,
      })
    }

    const sortBy = typeof query.sortBy === 'string' ? query.sortBy : 'date'
    const sortOrder = query.sortOrder === 'asc' ? 'asc' : 'desc'

    const filters = buildContractFilters(query)
    const match = toMatchDocument(filters)

    // Single-product focus: when the user filtered to EXACTLY one catalogue
    // code, surface that line's own specifics (its description, quantity, unit
    // price) so the table can show and sort by them. With zero or several codes
    // there is no single "matched item", so this is skipped entirely and the
    // explorer behaves exactly as before.
    const focusCode = (() => {
      const ids = toArray(query.categoryId)
      return ids.length === 1 ? ids[0]! : null
    })()

    const pipeline: PipelineStage[] = []

    // MongoDB requires $text in the first stage; the rest of the match follows.
    if (filters.text) {
      pipeline.push({ $match: filters.text })
      if (filters.and.length) pipeline.push({ $match: { $and: filters.and } })
    }
    else if (filters.and.length) {
      pipeline.push({ $match: { $and: filters.and } })
    }

    if (focusCode) {
      pipeline.push({
        $addFields: {
          // ocid without its `ocds-<prefix>-` head — the gov id_compra, used to
          // batch-fetch the scraped características for this page of rows.
          compraId: {
            $let: {
              vars: { parts: { $split: ['$ocid', '-'] } },
              in: {
                $reduce: {
                  input: { $slice: ['$$parts', 2, { $size: '$$parts' }] },
                  initialValue: '',
                  in: { $cond: [{ $eq: ['$$value', ''] }, '$$this', { $concat: ['$$value', '-', '$$this'] }] },
                },
              },
            },
          },
          focusItem: {
            $let: {
              vars: {
                matched: {
                  $first: {
                    $filter: {
                      input: {
                        $reduce: {
                          input: { $ifNull: ['$awards', []] },
                          initialValue: [],
                          in: { $concatArrays: ['$$value', { $ifNull: ['$$this.items', []] }] },
                        },
                      },
                      cond: { $eq: ['$$this.classification.id', focusCode] },
                    },
                  },
                },
              },
              in: {
                $cond: [
                  { $eq: ['$$matched', null] },
                  null,
                  {
                    nro: { $convert: { input: { $arrayElemAt: [{ $split: [{ $ifNull: [{ $toString: '$$matched.id' }, ''] }, '-'] }, 0] }, to: 'int', onError: null, onNull: null } },
                    description: { $ifNull: ['$$matched.classification.description', ''] },
                    quantity: '$$matched.quantity',
                    unitName: '$$matched.unit.name',
                    unitAmount: '$$matched.unit.value.amount',
                    currency: '$$matched.unit.value.currency',
                    lineAmount: {
                      $cond: [
                        { $and: [{ $ne: ['$$matched.quantity', null] }, { $ne: ['$$matched.unit.value.amount', null] }] },
                        { $multiply: ['$$matched.quantity', '$$matched.unit.value.amount'] },
                        null,
                      ],
                    },
                  },
                ],
              },
            },
          },
        },
      })
    }

    // Sort. `relevance` is the only mode that uses textScore — previously the
    // score was computed on every search and then never sorted on.
    const sortByRelevance = sortBy === 'relevance' && filters.text !== null
    // The item-price/qty sorts read the `focusItem` projection, which only
    // exists in single-product focus mode. Without it, fall back to date so the
    // request never sorts on a missing field.
    const sortField = ((sortBy === 'itemUnitPrice' || sortBy === 'itemQuantity') && !focusCode)
      ? 'date'
      : getSortField(sortBy)
    const sortDirection = sortOrder === 'desc' ? -1 : 1

    if (sortByRelevance) {
      pipeline.push({ $addFields: { textScore: { $meta: 'textScore' } } })
      pipeline.push({ $sort: { textScore: -1, date: -1 } })
    }
    else {
      pipeline.push({ $sort: { [sortField]: sortDirection } })
    }

    const skip = (page - 1) * limit
    pipeline.push({ $skip: skip })
    pipeline.push({ $limit: limit })

    // `slim=true` — the fields a compact contract row needs, and nothing
    // else. A release carries every award line with its unit, quantity and
    // classification; a related-contracts teaser shows a title, a date, a
    // supplier and an amount. Without this the whole payload is serialised
    // into the SSR page for rows that never display it.
    if (query.slim === 'true') {
      pipeline.push({
        $project: {
          'id': 1,
          'ocid': 1,
          'date': 1,
          'sourceYear': 1,
          'tag': 1,
          'buyer.id': 1,
          'buyer.name': 1,
          'tender.id': 1,
          'tender.title': 1,
          'tender.description': 1,
          'tender.procurementMethodDetails': 1,
          'awards.suppliers.id': 1,
          'awards.suppliers.name': 1,
          // `contractTitle` falls back through the item descriptions when
          // the tender has no title of its own, so the row would be
          // unnamed without these two.
          'awards.items.description': 1,
          'awards.items.classification.description': 1,
          'amount.primaryAmount': 1,
          'amount.primaryCurrency': 1,
          'amount.currencies': 1,
          'amount.hasAmounts': 1,
          'amount.totalItems': 1,
          // No-ops unless single-product focus mode added them above.
          'compraId': 1,
          'focusItem': 1,
        },
      })
    }

    const aggregationOptions: Record<string, unknown> = {
      allowDiskUse: false, // Keep queries in memory; fail fast rather than thrash.
      maxTimeMS: filters.text ? 8000 : 15000,
    }

    // Hints are deliberately near-absent:
    //  - MongoDB rejects a hint combined with $text.
    //  - A hint must name an index that exists. The previous `{ sourceYear: -1 }`
    //    hint matched no index (only `sourceYear_1` exists) and errored.
    //  - Hinting `{ date: -1 }` while a year filter is active is actively
    //    harmful: it walks the whole date index instead of using the
    //    `sourceYear_1_date_-1` compound index the planner would pick.
    // So hint only the one case where it is provably right, and otherwise
    // trust the planner.
    if (!filters.text && !filters.and.length && sortField === 'date') {
      aggregationOptions.hint = { date: -1 }
    }

    const [rawContracts, { total, totalIsCapped }] = await Promise.all([
      ReleaseModel.aggregate(pipeline, aggregationOptions),
      countContracts(filters, match, query.count === 'false'),
    ])

    // `sourceUrl` is derived, not stored — see server/utils/query.ts.
    const contracts = rawContracts.map(doc => ({
      ...doc,
      // Keyed on ocid: `id` points at a different contract on
      // adjustment/cancellation records. See utils/query.ts#sourceUrl.
      sourceUrl: sourceUrl(doc.ocid),
    }))

    const hasMore = total !== null
      ? skip + contracts.length < total
      : contracts.length === limit

    const estimatedTotalPages = total !== null
      ? Math.max(1, Math.ceil(total / limit))
      : (hasMore ? page + 1 : page)

    return {
      success: true,
      data: {
        contracts,
        pagination: {
          page,
          limit,
          total,
          totalIsCapped,
          hasMore,
          estimatedTotalPages,
          currentCount: contracts.length,
        },
        meta: {
          searchPerformed: filters.searchPhrase !== null,
          filtersApplied: filters.hasFilters,
          sortBy: sortByRelevance ? 'relevance' : sortBy,
          sortOrder,
          executionTimeMs: Date.now() - startTime,
        },
      },
    }
  }
  catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error

    console.error('Error fetching contracts:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch contracts',
    })
  }
})
