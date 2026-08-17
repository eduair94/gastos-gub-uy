import { createError, defineEventHandler, getRouterParam } from 'h3'
import { connectToDatabase } from '../../../utils/database'
import { SpendingTrendModel } from '../../../utils/models'
import { MACRO_SOURCE } from '../../../../../shared/macro-uruguay'

/**
 * One year of the spending series — the data behind /gastos/[year].
 *
 * The sibling `spending-trend.get.ts` ships all 25 documents at once because
 * /analytics/evolucion-gasto switches year client-side. A year PAGE must not pay
 * for the other 24, so this reads three documents: the year itself plus its
 * neighbours, which the page needs only for the prev/next links.
 *
 * `year_1` is already a unique index (scripts/ensure-indexes.ts), so this is an
 * index walk over three keys. Nothing is aggregated on the request path.
 */

/** The series runs from 2002. Anything outside this is a bad URL, not a miss. */
const MIN_YEAR = 2002
const MAX_YEAR = 2100

export default defineEventHandler(async (event) => {
  const raw = getRouterParam(event, 'year') ?? ''
  const year = Number(raw)

  // A non-numeric or out-of-range segment is a 404 immediately: it must never
  // reach Mongo, and it must never answer 200 with an empty page.
  if (!/^\d{4}$/.test(raw) || !Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
    throw createError({ statusCode: 404, statusMessage: 'Year not found' })
  }

  try {
    await connectToDatabase()

    const docs = await SpendingTrendModel
      .find({ year: { $in: [year - 1, year, year + 1] } })
      .sort({ year: 1 })
      .lean()

    const y = docs.find((d: any) => d.year === year) as any
    if (!y) {
      throw createError({ statusCode: 404, statusMessage: 'Year not found' })
    }

    const has = (n: number) => docs.some((d: any) => d.year === n && d.bridge)

    return {
      success: true,
      data: {
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
        calculatedAt: y.calculatedAt ?? null,
        // Only neighbours that have their own indexable page get a link.
        prevYear: has(year - 1) ? year - 1 : null,
        nextYear: has(year + 1) ? year + 1 : null,
        method: {
          artifactCeilingReal: 5e10,
          deflator: 'BCU Unidad Indexada, monthly',
          fx: 'BCU monthly average, at each contract\'s own month',
          macroSource: MACRO_SOURCE,
        },
      },
    }
  }
  catch (error: any) {
    if (error?.statusCode) throw error
    console.error('Error reading spending trend year:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to read spending trend year' })
  }
})
