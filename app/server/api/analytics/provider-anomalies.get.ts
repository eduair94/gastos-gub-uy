import { createError, defineEventHandler, getQuery } from 'h3'
import { connectToDatabase } from '../../utils/database'
import { ProviderAnomalyStatsModel, ProviderAnomalySummaryModel } from '../../utils/models'

/**
 * Provider × unexplained-anomaly cross-reference — the read side.
 *
 * Serves the precomputed `provider_anomaly_stats` (one doc per provider) plus the single
 * `provider_anomaly_summary` rollup that powers the page's pattern panels. Both are rebuilt every
 * 24h by src/jobs/cross-provider-anomalies.ts; nothing is aggregated on the request path.
 *
 * "Unexplained" == anomalies with aiVerdict.explainable === 'no' (the same set as
 * /analytics/anomalies?ai=unexplained). Provider rows link back to that list BY NAME.
 */
export default defineEventHandler(async (event) => {
  try {
    await connectToDatabase()

    const query = getQuery(event)
    const {
      page = 1,
      limit = 20,
      sortBy = 'flags',
      sortOrder = 'desc',
      minFlags,
      rubro,
      currency,
      captive,
    } = query

    // The rollup is required: its absence means the job has never run. An EMPTY provider set with a
    // present summary is a legitimate "no unexplained flags right now" state, handled by the page.
    const summary = await ProviderAnomalySummaryModel.findOne().sort({ calculatedAt: -1 }).lean()
    if (!summary) {
      throw createError({ statusCode: 404, statusMessage: 'Provider anomaly cross-reference not computed yet. Run the cross-provider-anomalies job.' })
    }

    const filter: Record<string, unknown> = {}

    // Minimum flag count — isolate the providers that repeat.
    const minFlagsNum = Number(minFlags)
    if (Number.isFinite(minFlagsNum) && minFlagsNum > 0) {
      filter.flagCount = { $gte: minFlagsNum }
    }

    // SICE top-level rubro (e.g. "MATERIALES Y SUMINISTROS"); matches any of the provider's rubros.
    if (typeof rubro === 'string' && rubro) {
      filter['rubros.rubro'] = rubro
    }

    // Currency the provider has flags in (each row still labels its own primary currency).
    if (typeof currency === 'string' && currency) {
      filter.currencies = currency.toUpperCase()
    }

    // Only the captive providers — every flag from a single buyer (the strongest pattern signal).
    if (captive === 'true' || captive === '1') {
      filter.captive = true
    }

    // Sort. Default: most unexplained flags first — the point of the page is "who repeats".
    const SORT_FIELDS: Record<string, string> = {
      flags: 'flagCount',
      flagCount: 'flagCount',
      overprice: 'primaryOverprice',
      worstZ: 'worstZ',
      divergence: 'worstZ',
    }
    const sortField = SORT_FIELDS[sortBy as string] ?? 'flagCount'
    const sortDirection = sortOrder === 'asc' ? 1 : -1
    const sortOptions: Record<string, 1 | -1> = { [sortField]: sortDirection as 1 | -1 }
    // Deterministic tie-break so pagination cannot repeat or skip a provider.
    if (sortField !== 'flagCount') sortOptions.flagCount = -1
    if (sortField !== 'worstZ') sortOptions.worstZ = -1
    sortOptions.supplierName = 1

    const pageNum = Math.max(1, Number(page))
    const limitNum = Math.min(100, Math.max(1, Number(limit)))
    const skip = (pageNum - 1) * limitNum

    const [providers, total] = await Promise.all([
      ProviderAnomalyStatsModel.find(filter).sort(sortOptions).skip(skip).limit(limitNum).lean(),
      ProviderAnomalyStatsModel.countDocuments(filter),
    ])

    return {
      success: true,
      data: {
        providers,
        summary,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.max(1, Math.ceil(total / limitNum)),
        },
      },
    }
  }
  catch (error: any) {
    if (error?.statusCode) throw error
    console.error('Error fetching provider anomalies:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch provider anomalies' })
  }
})
