import { createError, defineEventHandler, getQuery } from 'h3'
import type { PipelineStage } from 'mongoose'
import { ReleaseModel } from '../../../../shared/models/release'
import { connectToDatabase, mongoose } from '../../utils/database'
import { FilterDataModel } from '../../utils/models'
import { buildContractFilters, toMatchDocument } from './index.get'

/**
 * Summary statistics for the current filter set, powering the explorer's
 * result-summary strip.
 *
 * Accepts exactly the same filter params as `contracts/index.get.ts` — the
 * match is built by the same function, so the strip always describes the same
 * contracts as the list beneath it.
 *
 * ## Why the unbounded case does NOT serve the precomputed collections
 *
 * The brief suggested short-circuiting to `dashboard_metrics` / `spending_trends`
 * when no filters are applied. Profiling the live DB shows those collections
 * are computed on a *different basis* than a live sum over `releases`, not
 * merely stale (last run 2025-08-07):
 *
 *   dashboard_metrics.totalSpending  303,899,499,422  vs live 30,955,068,167,505  (~102x)
 *   dashboard_metrics.totalContracts       1,890,561  vs live      2,171,928
 *   spending_trends 2024 count                381,889  vs live        172,962      (~2.2x)
 *   spending_trends 2024 value         61,826,073,321  vs live   609,352,628,373   (~9.9x)
 *
 * (`spending_trends.totalCount` sums to 3,567,778 — more than the 2,171,928
 * documents in the collection — so it counts awards/items, not releases.)
 *
 * Serving those numbers unfiltered while serving live sums the moment any
 * filter is applied would make the UI's headline value jump ~100x on the first
 * click. That is worse than showing nothing. So the unbounded branch returns
 * only what it can state honestly and cheaply:
 *
 *   - count   -> estimatedDocumentCount() (accurate, ~175ms, no scan)
 *   - byYear  -> per-year counts from `filter_data` (2024: 173,002 vs live
 *                172,962 — within 0.02%), with value: null
 *   - value aggregates -> null, flagged via meta.unbounded
 *
 * The moment a single filter is applied, everything is computed live from one
 * consistent basis. Measured: a full facet over sourceYear=2024 (172,962 docs)
 * takes ~2.9s; the same facet unbounded takes ~7.9s, which is why it is not
 * served.
 *
 * ## Median
 *
 * Dropped (always null). This deployment is MongoDB 4.4.30 — the `$percentile`
 * accumulator needs 7.0+, and the only alternative is sorting the whole matched
 * set, which the brief explicitly rules out.
 */

const MAX_TIME_MS = 10000

interface StatsBucket { year: number, count: number, value: number | null }
interface NamedBucket { name: string, value: number, count: number }

/**
 * Anything at or above this is treated as not-a-real-amount for the
 * *typical contract* figure.
 *
 * Measured on the live data: 13 releases report >= 1e11 UYU and between
 * them account for 92.8% of the entire 30.9-trillion sum; the top 3
 * alone are 86%. They are arithmetic artefacts, not spending — e.g.
 * `adjudicacion-1318822` multiplies a 519,788.85 USD unit price by a
 * quantity of 1,200,007 ("ARRENDAMIENTO EQUIPOS DE GENERACION"), giving
 * 623 billion USD, roughly eight times Uruguay's GDP, for one contract.
 * The corrupt figure is the *quantity*, which comes from the source.
 *
 * We never silently drop these from a filtered total — if a reader
 * filters to that agency they must see what the source published, and
 * the page links to the official PDF so they can check. This bound
 * exists only so the robust statistics below aren't swamped by them.
 */
const IMPLAUSIBLE_UYU = 1e11

/**
 * The typical contract: the exact median, read straight off the index.
 *
 * The mean is useless on this distribution (a few records drag it by two
 * orders of magnitude) and MongoDB 4.4 has no `$percentile` — that
 * arrived in 7.0. `$sample` is the usual workaround but it only gets the
 * optimised random-cursor path when it is the FIRST stage; behind a
 * `$match` it degrades to a collection scan and blew an 8s budget here.
 *
 * Counting and then seeking to the midpoint walks
 * `amount.primaryAmount` in index order instead, which is both exact and
 * faster. The median is the figure that actually describes what the
 * state buys: half of all purchases are smaller than this.
 */
async function typicalContract(match: Record<string, unknown> = {}): Promise<number | null> {
  const m = { ...match, 'amount.primaryAmount': { $gt: 0, $lt: IMPLAUSIBLE_UYU } }

  const n = await ReleaseModel.countDocuments(m, { maxTimeMS: 6000 }).catch(() => 0)
  if (!n) return null

  const rows = await ReleaseModel
    .find(m, { 'amount.primaryAmount': 1 })
    .sort({ 'amount.primaryAmount': 1 })
    .skip(Math.floor(n / 2))
    .limit(1)
    .maxTimeMS(8000)
    .lean()
    .catch(() => null)

  const v = (rows as Array<{ amount?: { primaryAmount?: number } }> | null)?.[0]?.amount?.primaryAmount
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

/** Unfiltered summary assembled from cheap, honest sources only. */
async function unboundedStats() {
  const [count, yearsDoc, median] = await Promise.all([
    ReleaseModel.estimatedDocumentCount(),
    FilterDataModel.findOne({ type: 'years' }).select('data lastUpdated').lean(),
    typicalContract(),
  ])

  const byYear: StatsBucket[] = ((yearsDoc?.data || []) as Array<{ value: unknown, count: number }>)
    .map(o => ({ year: Number(o.value), count: o.count, value: null }))
    .filter(o => Number.isFinite(o.year) && o.year > 2000)
    .sort((a, b) => a.year - b.year)

  return {
    count,
    totalValue: null,
    avgValue: null,
    medianValue: median,
    byYear,
    currencies: [] as Array<{ currency: string, count: number }>,
    topBuyers: [] as NamedBucket[],
    topSuppliers: [] as NamedBucket[],
    meta: {
      unbounded: true,
      // Tells the UI to prompt for a filter rather than render empty charts.
      note: 'Value aggregates require at least one filter. Unfiltered totals from the precomputed collections are on a different basis and are deliberately not served.',
      countSource: 'estimatedDocumentCount',
      byYearSource: 'filter_data',
      byYearAsOf: yearsDoc?.lastUpdated ?? null,
      medianSource: 'exact',
      medianExcludesAbove: IMPLAUSIBLE_UYU,
    },
  }
}

export default defineEventHandler(async (event) => {
  const startTime = Date.now()

  try {
    await connectToDatabase()

    if (mongoose.connection.readyState !== 1) {
      throw new Error('Database connection not ready')
    }

    const query = getQuery(event)
    const filters = buildContractFilters(query)

    if (!filters.hasFilters) {
      const data = await unboundedStats()
      return {
        success: true,
        data: { ...data, meta: { ...data.meta, executionTimeMs: Date.now() - startTime } },
      }
    }

    const match = toMatchDocument(filters)

    // A single $facet: one pass over the matched set feeds every sub-pipeline.
    const pipeline: PipelineStage[] = [
      { $match: match },
      {
        $facet: {
          // `avgValue` uses $avg, which ignores documents with no amount — it
          // is the average of contracts that HAVE a value, not totalValue/count.
          totals: [
            {
              $group: {
                _id: null,
                count: { $sum: 1 },
                totalValue: { $sum: '$amount.primaryAmount' },
                avgValue: { $avg: '$amount.primaryAmount' },
                countWithAmount: {
                  $sum: { $cond: [{ $gt: ['$amount.primaryAmount', null] }, 1, 0] },
                },
              },
            },
          ],
          byYear: [
            { $group: { _id: '$sourceYear', count: { $sum: 1 }, value: { $sum: '$amount.primaryAmount' } } },
            { $sort: { _id: 1 } },
          ],
          currencies: [
            { $unwind: '$amount.currencies' },
            { $group: { _id: '$amount.currencies', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 20 },
          ],
          topBuyers: [
            { $group: { _id: '$buyer.name', value: { $sum: '$amount.primaryAmount' }, count: { $sum: 1 } } },
            { $sort: { value: -1 } },
            { $limit: 5 },
          ],
          // Unwinding awards x suppliers means a release with N suppliers
          // contributes its full primaryAmount to each of them — the amount is
          // stored per release, not per supplier, so it cannot be apportioned.
          // Ranking stays meaningful; the absolute values are an upper bound.
          topSuppliers: [
            { $unwind: '$awards' },
            { $unwind: '$awards.suppliers' },
            { $group: { _id: '$awards.suppliers.name', value: { $sum: '$amount.primaryAmount' }, count: { $sum: 1 } } },
            { $sort: { value: -1 } },
            { $limit: 5 },
          ],
        },
      },
    ]

    const [[result], medianValue] = await Promise.all([
      ReleaseModel.aggregate(pipeline, {
        allowDiskUse: false,
        maxTimeMS: MAX_TIME_MS,
      }),
      typicalContract(match),
    ])

    const totals = result?.totals?.[0] || { count: 0, totalValue: 0, avgValue: null, countWithAmount: 0 }

    const byYear: StatsBucket[] = (result?.byYear || [])
      .filter((b: { _id: unknown }) => Number.isFinite(Number(b._id)))
      .map((b: { _id: unknown, count: number, value: number }) => ({
        year: Number(b._id),
        count: b.count,
        value: b.value ?? 0,
      }))

    const currencies = (result?.currencies || [])
      .filter((c: { _id: unknown }) => typeof c._id === 'string')
      .map((c: { _id: string, count: number }) => ({ currency: c._id, count: c.count }))

    const toNamed = (rows: Array<{ _id: unknown, value: number, count: number }> = []): NamedBucket[] =>
      rows
        .filter(r => typeof r._id === 'string' && r._id)
        .map(r => ({ name: r._id as string, value: r.value ?? 0, count: r.count }))

    return {
      success: true,
      data: {
        count: totals.count ?? 0,
        totalValue: totals.totalValue ?? 0,
        avgValue: totals.avgValue ?? null,
        medianValue,
        byYear,
        currencies,
        topBuyers: toNamed(result?.topBuyers),
        topSuppliers: toNamed(result?.topSuppliers),
        meta: {
          unbounded: false,
          countWithAmount: totals.countWithAmount ?? 0,
          avgValueBasis: 'contracts with a recorded amount',
          topSuppliersValueBasis: 'upper bound; release amount is not apportioned across suppliers',
          executionTimeMs: Date.now() - startTime,
        },
      },
    }
  }
  catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error

    const message = (error as Error).message || ''
    // A filter set too broad/expensive to summarise should say so, not 500.
    if (message.includes('operation exceeded time limit') || message.includes('MaxTimeMSExpired')) {
      throw createError({
        statusCode: 503,
        statusMessage: 'Statistics timed out for this filter set - please narrow your filters',
      })
    }

    console.error('Error computing contract stats:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to compute contract statistics',
    })
  }
})
