import { createError, defineEventHandler } from 'h3'
import { connectToDatabase } from '../../utils/database'
import { SpendingTrendModel } from '../../utils/models'
import { MACRO_SOURCE } from '../../../../shared/macro-uruguay'

/**
 * Year-over-year spending analysis — the data behind /analytics/evolucion-gasto.
 *
 * Serves the precomputed `spending_trend` collection (one document per year,
 * rebuilt monthly by src/jobs/refresh-spending-trend.ts). 25 documents, so the
 * whole series ships at once and the page switches lens, year and view
 * client-side without refetching. Nothing is aggregated on the request path.
 *
 * The `method` block travels with the data on purpose: the artefact ceiling and
 * the deflator are the two decisions that make this series differ from a naive
 * SUM, and the page has to be able to state them.
 */
export default defineEventHandler(async () => {
  try {
    await connectToDatabase()

    const years = await SpendingTrendModel.find({}).sort({ year: 1 }).lean()
    if (!years.length) {
      throw createError({
        statusCode: 503,
        statusMessage: 'Spending trend not computed yet. Run the refresh-spending-trend job.',
      })
    }

    const rows = years.map((y: any) => ({
      year: y.year,
      partial: !!y.partial,
      nominalUyu: y.nominalUyu,
      realUyu: y.realUyu,
      usd: y.usd,
      rawNominalUyu: y.rawNominalUyu,
      releases: y.releases,
      buyers: y.buyers,
      suppliers: y.suppliers,
      uiAvg: y.uiAvg ?? null,
      usdAvg: y.usdAvg ?? null,
      gdpNominalUyu: y.gdpNominalUyu ?? null,
      pctOfGdp: y.pctOfGdp ?? null,
      centralGovExpenseUyu: y.centralGovExpenseUyu ?? null,
      pctOfCentralGovExpense: y.pctOfCentralGovExpense ?? null,
      population: y.population ?? null,
      realPerCapita: y.realPerCapita ?? null,
      usdPerCapita: y.usdPerCapita ?? null,
      exclusions: y.exclusions ?? [],
      excludedCount: y.excludedCount ?? 0,
      excludedNominalUyu: y.excludedNominalUyu ?? 0,
      unconvertibleCount: y.unconvertibleCount ?? 0,
      bridge: y.bridge ?? null,
      priceQuantity: y.priceQuantity ?? null,
      topBuyers: y.topBuyers ?? [],
      topCategories: y.topCategories ?? [],
      events: y.events ?? [],
      narrativeEs: y.narrativeEs ?? '',
      narrativeEn: y.narrativeEn ?? '',
      narrativeSource: y.narrativeSource ?? 'template',
    }))

    const totalExcluded = rows.reduce((s, r) => s + r.excludedCount, 0)

    return {
      success: true,
      data: {
        years: rows,
        calculatedAt: (years[0] as any)?.calculatedAt ?? null,
        method: {
          /** Real (today's-pesos) value above which a single release is treated as an artefact. */
          artifactCeilingReal: 5e10,
          totalExcluded,
          deflator: 'BCU Unidad Indexada, monthly',
          fx: 'BCU monthly average, at each contract\'s own month',
          macroSource: MACRO_SOURCE,
        },
      },
    }
  }
  catch (error: any) {
    if (error?.statusCode) throw error
    console.error('Error reading spending trend:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to read spending trend' })
  }
})
