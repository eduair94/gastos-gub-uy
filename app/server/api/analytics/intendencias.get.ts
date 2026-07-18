import { createError, defineEventHandler } from 'h3'
import { connectToDatabase } from '../../utils/database'
import { OrganismGroupStatsModel, ReleaseModel } from '../../utils/models'

/**
 * Departmental government (Intendencias) spending.
 *
 * Fast path: serve the precomputed `organism_group_stats` doc for the
 * 'intendencias' group (rebuilt monthly by src/jobs/refresh-organism-groups.ts).
 * Fallback: if the job has never run, aggregate `releases` live so the flagship
 * page always works. Both return the same shape.
 *
 * The 19 departmental Intendencias appear as first-class buyers with clean, stable
 * ids `80-1`..`98-1` (Artigas..Montevideo). Money is `amount.primaryAmount` (UYU).
 *
 * Outlier discipline (DESIGN.md): a handful of source records carry corrupt
 * quantities that produce astronomically large amounts (one IM release alone
 * reports ~1.8e11 UYU; site-wide 13 records ≈ 92.8% of the raw grand total, each
 * on the order of 10^12). Those impossible magnitudes would swamp any comparison,
 * so a single release above CORRUPT_CEIL (5e10 UYU ≈ USD 1.25bn — larger than any
 * real single Uruguayan municipal contract) is excluded from the totals and
 * counted separately for transparency. Legitimate large public works stay in.
 *
 * Per-capita is NOT computed here — population is not in the procurement data;
 * the page joins a static, cited INE census map to these totals.
 */

// buyer.id for the 19 departments: 80-1 (Artigas) .. 98-1 (Montevideo).
const INTENDENCIA_IDS = Array.from({ length: 19 }, (_, i) => `${80 + i}-1`)

// Plausibility ceiling for a single release, in UYU. Above this the amount is a
// data artefact, never a real contract — excluded from sums, reported separately.
const CORRUPT_CEIL = 5e10

export default defineEventHandler(async () => {
  try {
    await connectToDatabase()

    // Fast path: the precomputed group doc, shaped to the page's contract.
    const group = await OrganismGroupStatsModel.findOne({ groupKey: 'intendencias' }).lean()
    if (group) {
      const departments = (group.members ?? [])
        .filter((m: any) => m.contracts > 0)
        .map((m: any) => ({
          buyerId: m.buyerId,
          name: `Intendencia de ${m.label}`,
          total: m.total,
          contracts: m.contracts,
          avg: m.contracts ? m.total / m.contracts : 0,
          minYear: m.minYear ?? null,
          maxYear: m.maxYear ?? null,
          excludedRecords: m.excludedRecords ?? 0,
          byYear: (m.byYear ?? []).map((y: any) => ({ year: y.year, total: y.total, contracts: y.contracts })),
        }))
        .sort((a: any, b: any) => b.total - a.total)

      return {
        success: true,
        data: {
          departments,
          byYear: (group.byYear ?? []).map((y: any) => ({ year: y.year, total: y.total, contracts: y.contracts })),
          national: {
            total: group.total,
            contracts: group.contracts,
            avgContract: group.contracts ? group.total / group.contracts : 0,
            cap: group.cap,
            excludedRecords: group.excludedRecords,
          },
          calculatedAt: group.calculatedAt,
          source: 'precomputed',
        },
      }
    }

    // Fallback: live aggregation (job has never run).
    const [facet] = await ReleaseModel.aggregate([
      { $match: { 'buyer.id': { $in: INTENDENCIA_IDS } } },
      {
        $facet: {
          // Per-department capped totals.
          perDept: [
            { $match: { 'amount.primaryAmount': { $gt: 0, $lte: CORRUPT_CEIL } } },
            {
              $group: {
                _id: '$buyer.id',
                name: { $first: '$buyer.name' },
                total: { $sum: '$amount.primaryAmount' },
                contracts: { $sum: 1 },
                minYear: { $min: '$sourceYear' },
                maxYear: { $max: '$sourceYear' },
              },
            },
            { $sort: { total: -1 } },
          ],
          // National spend by year (for the trend chart).
          byYear: [
            {
              $match: {
                'amount.primaryAmount': { $gt: 0, $lte: CORRUPT_CEIL },
                'sourceYear': { $gt: 0 },
              },
            },
            {
              $group: {
                _id: '$sourceYear',
                total: { $sum: '$amount.primaryAmount' },
                contracts: { $sum: 1 },
              },
            },
            { $sort: { _id: 1 } },
          ],
          // Per-department spend by year (for the interannual view).
          perDeptYear: [
            {
              $match: {
                'amount.primaryAmount': { $gt: 0, $lte: CORRUPT_CEIL },
                'sourceYear': { $gt: 0 },
              },
            },
            {
              $group: {
                _id: { b: '$buyer.id', y: '$sourceYear' },
                total: { $sum: '$amount.primaryAmount' },
                contracts: { $sum: 1 },
              },
            },
          ],
          // The excluded corrupt tail, per department — disclosed, never hidden.
          excluded: [
            { $match: { 'amount.primaryAmount': { $gt: CORRUPT_CEIL } } },
            {
              $group: {
                _id: '$buyer.id',
                n: { $sum: 1 },
                sum: { $sum: '$amount.primaryAmount' },
              },
            },
          ],
        },
      },
    ]).option({ allowDiskUse: true })

    const excludedById: Record<string, { n: number, sum: number }> = {}
    for (const e of facet?.excluded ?? []) excludedById[e._id] = { n: e.n, sum: e.sum }

    // Fold per-department per-year rows into a per-buyer series.
    const yearsById: Record<string, { year: number, total: number, contracts: number }[]> = {}
    for (const r of facet?.perDeptYear ?? []) {
      const id = r._id.b as string
      ;(yearsById[id] ??= []).push({ year: r._id.y as number, total: r.total as number, contracts: r.contracts as number })
    }
    for (const id of Object.keys(yearsById)) yearsById[id]!.sort((a, b) => a.year - b.year)

    const departments = (facet?.perDept ?? []).map((d: any) => ({
      buyerId: d._id as string,
      name: d.name as string,
      total: d.total as number,
      contracts: d.contracts as number,
      avg: d.contracts ? d.total / d.contracts : 0,
      minYear: d.minYear as number | null,
      maxYear: d.maxYear as number | null,
      excludedRecords: excludedById[d._id]?.n ?? 0,
      byYear: yearsById[d._id as string] ?? [],
    }))

    const byYear = (facet?.byYear ?? []).map((y: any) => ({
      year: y._id as number,
      total: y.total as number,
      contracts: y.contracts as number,
    }))

    const nationalTotal = departments.reduce((s: number, d: any) => s + d.total, 0)
    const nationalContracts = departments.reduce((s: number, d: any) => s + d.contracts, 0)
    const excludedRecords = (facet?.excluded ?? []).reduce((s: number, e: any) => s + e.n, 0)

    return {
      success: true,
      data: {
        departments,
        byYear,
        national: {
          total: nationalTotal,
          contracts: nationalContracts,
          avgContract: nationalContracts ? nationalTotal / nationalContracts : 0,
          cap: CORRUPT_CEIL,
          excludedRecords,
        },
        calculatedAt: new Date().toISOString(),
      },
    }
  }
  catch (error: any) {
    if (error?.statusCode) throw error
    console.error('Error aggregating intendencia spending:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to aggregate intendencia spending' })
  }
})
