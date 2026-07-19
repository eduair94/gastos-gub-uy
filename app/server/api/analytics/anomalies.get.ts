import { createError, defineEventHandler, getQuery } from 'h3'
import { connectToDatabase } from '../../utils/database'
import { AnomalyModel } from '../../utils/models'
import { escapeRegex } from '../../utils/query'
import { feedbackSummaries } from '../../utils/anomaly-feedback'
import { parseToken } from '../../../../shared/utils/rubro-tokens'

/**
 * Normalise a query value that may be a single string or a repeated param into a
 * clean string[]. The advanced filters (supplier/buyer/rubro) are multi-select
 * and send repeated params rather than a comma-joined string, because supplier
 * and buyer NAMES contain commas — a comma-join would split one name into two.
 */
function toStrArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string' && x.trim() !== '')
  if (typeof v === 'string' && v.trim() !== '') return [v]
  return []
}

/** An exact match for one value, an `$in` for several, or null for none. */
function exactOrIn(values: string[]): string | { $in: string[] } | null {
  if (values.length === 1) return values[0]!
  if (values.length > 1) return { $in: values }
  return null
}

export default defineEventHandler(async (event) => {
  try {
    await connectToDatabase()

    const query = getQuery(event)
    const {
      page = 1,
      limit = 20,
      type,
      severity,
      ai,
      releaseId,
      minZ,
      currency,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = query

    // Build query filter
    const filter: Record<string, unknown> = {}

    if (type) {
      filter.type = type
    }

    if (severity) {
      filter.severity = severity
    }

    // Currency filter. Prices in different currencies are NEVER comparable by
    // magnitude (a USD unit price and a UYU one for the same item differ ~40×),
    // and we hold no historical FX rate to convert them safely. The detector
    // already baselines per-currency, so a flag's z-score is sound; this lets
    // the reader keep the LIST and the amount sort within one currency too.
    if (typeof currency === 'string' && currency) {
      filter.currency = currency.toUpperCase()
    }

    // Anomalies for one contract (release) — used by the contract detail page to show the AI review.
    if (typeof releaseId === 'string' && releaseId) {
      filter.releaseId = releaseId
    }

    // Provider flags — matches metadata.supplierName (anomalies carry the NAME, never the RUT,
    // the same key the cross-reference groups on). Now multi-select from the advanced-filters
    // panel: one value is an exact match, several an `$in`. A single ?supplier=NAME inbound link
    // from /analytics/proveedores-anomalias still works — it normalises to a one-element array.
    const supplierFilter = exactOrIn(toStrArray(query.supplier))
    if (supplierFilter !== null) filter['metadata.supplierName'] = supplierFilter

    // Buyer flags — "a quién le suministran". Same multi-select shape, exact match on the buyer
    // name the anomaly carries. Single ?buyer=NAME inbound links (the "compradores que concentran"
    // panel) still work via the one-element-array normalisation.
    const buyerFilter = exactOrIn(toStrArray(query.buyer))
    if (buyerFilter !== null) filter['metadata.buyerName'] = buyerFilter

    // SICE top-level rubro by its human NAME (e.g. "MATERIALES Y SUMINISTROS"). Distinct from the
    // `rubro` token filter below (a rubroPath prefix): this matches the enriched
    // itemClassification.rubro exactly. Multi-select, same shape as supplier/buyer.
    const rubroNameFilter = exactOrIn(toStrArray(query.rubroName))
    if (rubroNameFilter !== null) filter['metadata.itemClassification.rubro'] = rubroNameFilter

    // Product / catalogue code — the specific article a flag is on. Anomalies carry
    // it as metadata.itemClassification.id (the same code space as /contracts'
    // `categoryId` and the product pages); the advanced panel completes it by NAME.
    // Multi-select, same exact-or-$in shape as the filters above.
    const productFilter = exactOrIn(toStrArray(query.product))
    if (productFilter !== null) filter['metadata.itemClassification.id'] = productFilter

    // One contract year — the drill-down from the recurrence-by-year chart. sourceYear is the
    // contract's year; legacy rows without it are excluded once this is set, which is correct.
    const yearNum = Number(query.year)
    if (Number.isInteger(yearNum) && yearNum > 1900) {
      filter.sourceYear = yearNum
    }

    // SICE rubro filter: a node token (F/SF/C/SC) narrows to anomalies whose item
    // sits under that rubro (prefix on the enriched itemClassification.rubroPath).
    // Rows detected before the catalog enrichment have no rubroPath and so are
    // excluded once this is set — correct, the field only exists post-enrichment.
    const rubro = query.rubro
    if (typeof rubro === 'string' && rubro) {
      const { path } = parseToken(rubro)
      if (path) filter['metadata.itemClassification.rubroPath'] = new RegExp('^' + escapeRegex(path) + '(\\.|$)')
    }

    // Second-stage AI triage filter (see src/jobs/score-anomalies-ai.ts). Lets the
    // UI isolate the genuinely unexplained flags — the real signal — from the ones
    // the LLM found a legitimate explanation for.
    //   unexplained → aiVerdict.explainable = 'no'   (the actionable view)
    //   explainable → 'yes'      uncertain → 'uncertain'
    //   scored → has any verdict      unscored → not yet triaged
    const AI_VERDICT: Record<string, string> = { unexplained: 'no', explainable: 'yes', uncertain: 'uncertain' }
    if (ai === 'scored') {
      filter['aiVerdict.explainable'] = { $exists: true }
    }
    else if (ai === 'unscored') {
      filter['aiVerdict.explainable'] = { $exists: false }
    }
    else if (typeof ai === 'string' && AI_VERDICT[ai]) {
      filter['aiVerdict.explainable'] = AI_VERDICT[ai]
    }

    // Minimum price divergence — the robust z-score of the unit price against
    // its category baseline (`metadata.zScore`). Lets the reader isolate the
    // most extreme overprices (e.g. ≥25× the robust deviation), which is how
    // you find the worst flags rather than merely the most expensive. Legacy
    // rows have no zScore and so are excluded once this is set, which is
    // correct — this measure only exists for the current detector.
    const minZNum = Number(minZ)
    if (Number.isFinite(minZNum) && minZNum > 0) {
      filter['metadata.zScore'] = { $gte: minZNum }
    }

    // Build sort options.
    //
    // `severity` is a STRING, so sorting on it orders alphabetically —
    // critical, high, low, medium — which puts "low" third and is not
    // what any caller asking for severity means. The current detector
    // stores a numeric `severityRank` (4=critical … 1=low); map the
    // `severity` sort onto it, keeping `severity` as an accepted alias
    // so existing callers get the ordering they actually wanted.
    const SORT_FIELDS: Record<string, string> = {
      createdAt: 'createdAt',
      confidence: 'confidence',
      severity: 'severityRank',
      severityRank: 'severityRank',
      detectedValue: 'detectedValue',
      amount: 'detectedValue', // alias — the price paid
      // Price divergence: how far above its baseline the unit price sits. This
      // is the "worst first" ordering a reader hunting overprices actually wants.
      divergence: 'metadata.zScore',
      zScore: 'metadata.zScore',
    }
    const sortField = SORT_FIELDS[sortBy as string] ?? 'createdAt'
    const sortDirection = sortOrder === 'desc' ? -1 : 1
    const sortOptions: Record<string, 1 | -1> = { [sortField]: sortDirection as 1 | -1 }

    // Break ties with severity then divergence, and finally a stable key, so
    // ordering is deterministic (pagination cannot repeat or skip rows) and,
    // within one divergence/severity, the worse flag still leads.
    if (sortField !== 'severityRank') sortOptions.severityRank = -1
    if (sortField !== 'metadata.zScore') sortOptions['metadata.zScore'] = -1
    if (sortField !== 'createdAt') sortOptions.createdAt = -1

    // Calculate pagination
    const skip = (Number(page) - 1) * Number(limit)

    // How many in-scope flags are not yet AI-triaged. The verdict-typed views (unexplained /
    // explainable / uncertain / scored) are computed over TRIAGED flags only, so when a fresh
    // detector run adds flags faster than the triage clears them, those views under-report until
    // the queue drains. Surfacing this count lets the UI say the number is still settling rather
    // than present a partial figure as final. Same non-ai scope as the main query.
    //
    // Scoped to severityRank >= 3 to MATCH what the triage actually processes: score-anomalies-ai
    // runs with DEFAULT_MIN_RANK=3 (high + critical only), so medium/low price_spike flags are
    // never triaged by design and would otherwise sit here as a permanent, misleading "pending"
    // that never drains. A verdict-typed view can only ever contain triaged (high/critical) flags
    // anyway, so this is the count that truly settles to 0.
    const TRIAGE_MIN_RANK = 3
    const VERDICT_VIEWS = new Set(['unexplained', 'explainable', 'uncertain', 'scored'])
    const wantPending = typeof ai === 'string' && VERDICT_VIEWS.has(ai)
    const pendingFilter: Record<string, unknown> = {
      ...filter,
      'type': 'price_spike',
      'severityRank': { $gte: TRIAGE_MIN_RANK },
      'aiVerdict.explainable': { $exists: false },
    }

    // Execute query
    const [anomalies, total, pendingTriage] = await Promise.all([
      AnomalyModel.find(filter)
        .sort(sortOptions)
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      AnomalyModel.countDocuments(filter),
      wantPending ? AnomalyModel.countDocuments(pendingFilter) : Promise.resolve(0),
    ])

    // Attach community feedback (public up/down counts + the requesting user's own
    // vote/comment) to each row so the list can render the vote widget without a
    // per-row round-trip. Anonymous callers still get the public counts.
    const summaries = await feedbackSummaries(event, anomalies.map((a: any) => String(a._id)))
    const anomaliesWithFeedback = anomalies.map((a: any) => ({
      ...a,
      feedback: summaries.get(String(a._id)) ?? { up: 0, down: 0, myVote: null, myComment: null },
    }))

    return {
      success: true,
      data: {
        anomalies: anomaliesWithFeedback,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          totalPages: Math.ceil(total / Number(limit)),
        },
        // Flags still awaiting AI triage within the same scope (0 unless a verdict-typed view).
        // The UI uses it to signal the count is still settling; see the pendingFilter note above.
        triage: { pending: pendingTriage },
      },
    }
  }
  catch (error) {
    console.error('Error fetching anomalies:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch anomalies',
    })
  }
})
