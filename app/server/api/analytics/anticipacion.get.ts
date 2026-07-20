import { createError, defineEventHandler, getQuery } from 'h3'
import { connectToDatabase } from '../../utils/database'
import { TenderForecastModel } from '../../utils/models'
import { escapeRegex, sanitizeSearch } from '../../utils/query'
import { DISPLAY_THRESHOLD } from '../../../../shared/forecast/constants'

/**
 * Public read endpoint for "Próximos llamados probables" — serves the
 * precomputed `tender_forecast` collection (one doc per buyer × mid-level
 * rubro node), rebuilt monthly by src/jobs/refresh-tender-forecast.ts.
 *
 * Read path is .find() + .lean() by index only — no aggregation, no COLLSCAN.
 * releases.buyer.id has no index, but this collection is small (≈19k docs)
 * and indexed on expectedWindow.start, expectedWindow.end, rubroAncestors
 * and confidence.
 *
 * Of the 19,352 forecasts in the collection, ~12,245 have an expectedWindow
 * that has already elapsed (window.end < now). A page whose whole promise is
 * "próximos llamados" must not surface those by default — sorting ascending
 * on expectedWindow.start with no recency filter would put the stalest
 * predictions first. So the default filter requires expectedWindow.end >= now;
 * ?includeElapsed=1 opts back into the full (unfiltered-by-recency) set for
 * debugging/analysis.
 */
export default defineEventHandler(async (event) => {
  try {
    await connectToDatabase()
    const q = getQuery(event)

    // Clamp skip/limit into sane, non-negative ranges. `Number(...) || default`
    // alone isn't enough: negative numbers and NaN are both truthy inputs that
    // can slip past a bare `||` (NaN || default DOES fall through, but a
    // negative like -5 does not), and Mongo either rejects a negative .skip()
    // (uncaught 500) or reinterprets a negative .limit() as batch-closing
    // semantics rather than the intended cap.
    const rawLimit = Number(q.limit)
    const limit = Math.max(1, Math.min(200, Number.isFinite(rawLimit) && rawLimit ? rawLimit : 50))
    const rawSkip = Number(q.skip)
    const skip = Math.max(0, Number.isFinite(rawSkip) ? rawSkip : 0)

    const rawMinConfidence = q.minConfidence != null ? Number(q.minConfidence) : NaN
    const minConfidence = Number.isFinite(rawMinConfidence) ? rawMinConfidence : DISPLAY_THRESHOLD
    const includeElapsed = q.includeElapsed === '1' || q.includeElapsed === 'true'

    const filter: Record<string, unknown> = { confidence: { $gte: minConfidence } }
    if (q.buyer) filter.buyerId = String(q.buyer)
    if (q.rubro) filter.rubroAncestors = String(q.rubro)

    // Free-text search over the WHOLE eligible set (not just the fetched page) —
    // for the public page's Organismo/Rubro boxes, where a citizen types a name
    // fragment rather than the exact buyerId/rubroAncestors token the params
    // above expect. Case-insensitive; input is escaped before it reaches the
    // regex engine so `.`/`(`/`*` etc. can't break the query or ReDoS this
    // unauthenticated endpoint. Distinct from `buyer`/`rubro` above (exact-match,
    // used by Task 8's card and Fase-2 surfaces) — both sets are additive (AND).
    // KNOWN LIMITATION: plain `$regex 'i'` folds case but not accents
    // (`atencion` won't match `Atención`), since tender_forecast has no
    // normalized search field. A fast-follow, not solved here.
    const buyerText = sanitizeSearch(q.buyerText)
    const rubroText = sanitizeSearch(q.rubroText)
    if (buyerText) filter.buyerName = { $regex: escapeRegex(buyerText), $options: 'i' }
    if (rubroText) filter.rubroLabel = { $regex: escapeRegex(rubroText), $options: 'i' }

    if (q.before) {
      const before = new Date(String(q.before))
      if (!Number.isNaN(before.getTime())) filter['expectedWindow.start'] = { $lte: before }
    }
    if (!includeElapsed) filter['expectedWindow.end'] = { $gte: new Date() }

    // Distinguish "rollup never ran" (empty collection → 503, retry-able once the
    // job runs) from "this filter simply matches nothing" (empty rows, total: 0,
    // still a 200 — the collection exists and is populated).
    const collectionIsEmpty = (await TenderForecastModel.estimatedDocumentCount()) === 0
    if (collectionIsEmpty) {
      throw createError({ statusCode: 503, statusMessage: 'Forecast not ready. Run the refresh-tender-forecast job.' })
    }

    const [rows, total] = await Promise.all([
      TenderForecastModel.find(filter)
        .sort({ 'expectedWindow.start': 1 })
        .skip(skip)
        .limit(limit)
        .maxTimeMS(8000)
        .lean(),
      TenderForecastModel.countDocuments(filter).maxTimeMS(8000),
    ])

    const calculatedAt = rows[0]?.generatedAt ?? null

    return { success: true, data: { rows, total, calculatedAt } }
  }
  catch (error: any) {
    if (error?.statusCode) throw error
    console.error('Error reading tender forecasts:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to read tender forecasts' })
  }
})
