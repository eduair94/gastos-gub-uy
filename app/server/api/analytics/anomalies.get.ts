import { createError, defineEventHandler, getQuery } from 'h3'
import { connectToDatabase } from '../../utils/database'
import { AnomalyModel } from '../../utils/models'
import { escapeRegex } from '../../utils/query'
import { parseToken } from '../../../../shared/utils/rubro-tokens'

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

    // Execute query
    const [anomalies, total] = await Promise.all([
      AnomalyModel.find(filter)
        .sort(sortOptions)
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      AnomalyModel.countDocuments(filter),
    ])

    return {
      success: true,
      data: {
        anomalies,
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
    console.error('Error fetching anomalies:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch anomalies',
    })
  }
})
