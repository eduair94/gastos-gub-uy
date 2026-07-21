#!/usr/bin/env tsx

/**
 * Rebuilds every pre-calculated analytics collection from `releases`.
 *
 * Replaces the old split between `src/populate-analytics.ts` (supplier/buyer patterns) and
 * `src/precalculate-dashboard.ts` (dashboard/trends/top-entities/categories), which were
 * manual-only scripts. Nothing ever scheduled them, so production analytics had been frozen at
 * whatever the last hand-run produced.
 *
 * Three things are different here:
 *
 *  1. MONEY. Everything is denominated in UYU via `amount.primaryAmount`. See analytics-pipeline.ts
 *     for why the old `$sum: '$awards.items.unit.value.amount'` was wrong.
 *
 *  2. YEARS. Nothing is hardcoded. The year list is read back from the data, so 2025/2026 and every
 *     year after appear on their own. The old code carried `recentYears = [2023, 2024, 2025]` and a
 *     sliding `twoYearsAgo` monthly window that silently deleted older months on each run.
 *
 *  3. CRASH SAFETY. Everything is computed first and written last. The old code deleted all four
 *     collections up front and then ran multi-minute aggregations, so any failure in between left
 *     the public dashboard serving nothing until someone noticed. Here a failure leaves the previous
 *     data in place, and the destructive window is the few seconds of `swapCollection`.
 *
 * Usage:
 *   npx tsx src/jobs/refresh-analytics.ts              # everything
 *   npx tsx src/jobs/refresh-analytics.ts --patterns   # supplier + buyer patterns only
 *   npx tsx src/jobs/refresh-analytics.ts --dashboard  # dashboard/trends/top-entities/categories only
 */

import type { PipelineStage } from 'mongoose'
import { connectToDatabase } from '../../shared/connection/database'
import { methodClass } from '../../shared/procurement-method'
import {
  AnomalyModel,
  BuyerPatternModel,
  CategoryDistributionModel,
  DashboardMetricsModel,
  ICategoryDistribution,
  IDashboardMetrics,
  ISpendingTrend,
  ITopEntity,
  ReleaseModel,
  SpendingTrendsModel,
  SupplierPatternModel,
  TopEntitiesModel,
} from '../../shared/models'
import { Logger } from '../services/logger-service'
import {
  AWARD_SUPPLIER_ID,
  AWARD_SUPPLIER_NAME,
  AWARD_MATCH,
  FX_SCALE,
  IMPLAUSIBLE_MATCH,
  MAX_PLAUSIBLE_RELEASE_UYU,
  UNWOUND_ITEM_UYU,
} from './analytics-pipeline'

const TOP_N_OVERALL = 50
const TOP_N_PER_YEAR = 20
const TOP_N_CATEGORIES_OVERALL = 30
const TOP_N_CATEGORIES_PER_YEAR = 20
const BULK_BATCH = 1000

const AGG = { allowDiskUse: true } as const
// Method history is independent of money. AWARD_MATCH deliberately excludes
// zero/missing/implausible amounts for financial rollups; using it here would
// hide real tender awards and create false "direct only" positives.
const AWARD_HISTORY_MATCH: Record<string, unknown> = {
  tag: 'award',
  'awards.suppliers.id': { $exists: true, $ne: null },
}

interface SupplierRow {
  _id: string
  name: string
  totalValue: number
  totalContracts: number
  years: number[]
  buyers: string[]
}

export interface SupplierMethodRow {
  _id: { supplier: string, method?: string | null }
  count: number
}

export interface SupplierMethodMix {
  directAwardCount: number
  tenderAwardCount: number
  onlyDirectAward: boolean
}

/** Fold the compact aggregation result in JS so methodClass stays canonical. */
export function reduceSupplierMethodMix(rows: SupplierMethodRow[]): Map<string, SupplierMethodMix> {
  const counts = new Map<string, { directAwardCount: number, tenderAwardCount: number }>()
  for (const row of rows) {
    const supplierId = row._id.supplier
    if (!supplierId) continue
    const current = counts.get(supplierId) ?? { directAwardCount: 0, tenderAwardCount: 0 }
    const cls = methodClass(row._id.method)
    if (cls === 'direct') current.directAwardCount += row.count
    else if (cls === 'tender') current.tenderAwardCount += row.count
    counts.set(supplierId, current)
  }

  return new Map([...counts].map(([supplierId, count]) => [supplierId, {
    ...count,
    onlyDirectAward: count.tenderAwardCount === 0 && count.directAwardCount >= 1,
  }]))
}

interface BuyerRow {
  _id: string
  name: string
  totalSpending: number
  totalContracts: number
  years: number[]
}

export class AnalyticsRefresher {
  private logger = new Logger()
  private dataVersion = `v${Date.now()}`

  /**
   * Supplier totals. Suppliers hang off individual awards, and a release can carry many awards with
   * a different supplier on each (production has releases with 8 awards and 8 distinct suppliers), so
   * money has to be attributed per award rather than per release. Grouping by (supplier, release)
   * first collapses items and makes `totalContracts` a true count of distinct contracts.
   */
  async refreshSupplierPatterns(): Promise<number> {
    this.logger.info('Rebuilding supplier patterns...')
    const started = Date.now()

    const suppliers: SupplierRow[] = await ReleaseModel.aggregate(
      [
        { $match: AWARD_MATCH },
        { $addFields: { _fx: FX_SCALE } },
        { $unwind: { path: '$awards', preserveNullAndEmptyArrays: false } },
        { $unwind: { path: '$awards.items', preserveNullAndEmptyArrays: false } },
        {
          $group: {
            _id: { supplier: AWARD_SUPPLIER_ID, release: '$id' },
            name: { $first: AWARD_SUPPLIER_NAME },
            value: { $sum: UNWOUND_ITEM_UYU },
            year: { $first: '$sourceYear' },
            buyer: { $first: '$buyer.id' },
          },
        },
        { $match: { '_id.supplier': { $ne: null } } },
        {
          $group: {
            _id: '$_id.supplier',
            name: { $first: '$name' },
            totalValue: { $sum: '$value' },
            totalContracts: { $sum: 1 },
            years: { $addToSet: '$year' },
            buyers: { $addToSet: '$buyer' },
          },
        },
        { $sort: { totalValue: -1 } },
      ],
      AGG,
    )

    // Award-phase releases carry the suppliers but, in the live feed, no `tender`
    // object (5000/5000 sampled adjudicacion-* rows). Tender-phase siblings carry
    // procurementMethodDetails and share the award's ocid. Collapse both sides by
    // ocid in Mongo, count each supplier/release once, and only pull the compact
    // supplier/method result into JS for the canonical methodClass classifier.
    const methodRows: SupplierMethodRow[] = await ReleaseModel.aggregate(
      [
        {
          $match: {
            'ocid': { $type: 'string', $ne: '' },
            'tender.procurementMethodDetails': { $type: 'string', $ne: '' },
          },
        },
        {
          $project: {
            _id: 0,
            ocid: 1,
            method: '$tender.procurementMethodDetails',
            date: 1,
          },
        },
        // Prefer the latest non-empty method when a llamado has updates.
        { $sort: { ocid: 1, date: -1 } },
        {
          $group: {
            _id: '$ocid',
            method: { $first: '$method' },
          },
        },
        { $project: { _id: 0, ocid: '$_id', method: 1 } },
        {
          $unionWith: {
            coll: 'releases',
            pipeline: [
              { $match: AWARD_HISTORY_MATCH },
              { $unwind: { path: '$awards', preserveNullAndEmptyArrays: false } },
              {
                $group: {
                  _id: { supplier: AWARD_SUPPLIER_ID, release: '$id' },
                  ocid: { $first: '$ocid' },
                },
              },
              {
                $match: {
                  '_id.supplier': { $type: 'string', $ne: '' },
                  'ocid': { $type: 'string', $ne: '' },
                },
              },
              {
                $group: {
                  _id: { supplier: '$_id.supplier', ocid: '$ocid' },
                  count: { $sum: 1 },
                },
              },
              {
                $project: {
                  _id: 0,
                  ocid: '$_id.ocid',
                  supplierCount: { supplier: '$_id.supplier', count: '$count' },
                },
              },
            ],
          },
        },
        {
          $group: {
            _id: '$ocid',
            method: { $max: '$method' },
            supplierCounts: { $addToSet: '$supplierCount' },
          },
        },
        { $unwind: { path: '$supplierCounts', preserveNullAndEmptyArrays: false } },
        { $match: { 'supplierCounts.supplier': { $type: 'string', $ne: '' } } },
        {
          $group: {
            _id: { supplier: '$supplierCounts.supplier', method: '$method' },
            count: { $sum: '$supplierCounts.count' },
          },
        },
      ],
      AGG,
    )
    const methodMix = reduceSupplierMethodMix(methodRows)

    await this.bulkUpsert(
      SupplierPatternModel,
      suppliers.map(s => ({
        filter: { supplierId: s._id },
        set: {
          supplierId: s._id,
          name: s.name ?? 'Unknown',
          totalContracts: s.totalContracts,
          totalValue: s.totalValue,
          avgContractValue: s.totalContracts > 0 ? s.totalValue / s.totalContracts : 0,
          years: (s.years ?? []).filter(y => y != null).sort((a, b) => a - b),
          yearCount: (s.years ?? []).filter(y => y != null).length,
          buyers: (s.buyers ?? []).filter(b => b != null),
          buyerCount: (s.buyers ?? []).filter(b => b != null).length,
          ...(methodMix.get(s._id) ?? {
            directAwardCount: 0,
            tenderAwardCount: 0,
            onlyDirectAward: false,
          }),
          lastUpdated: new Date(),
        },
      })),
      'suppliers',
    )

    this.logger.info(
      `Supplier patterns: ${suppliers.length} in ${((Date.now() - started) / 1000).toFixed(1)}s`,
    )
    return suppliers.length
  }

  /**
   * Buyer totals. Unlike suppliers, a release has exactly one buyer, so the release-level
   * `amount.primaryAmount` can be summed directly — no $unwind, no fan-out, no fx scaling.
   */
  async refreshBuyerPatterns(): Promise<number> {
    this.logger.info('Rebuilding buyer patterns...')
    const started = Date.now()

    const buyers: BuyerRow[] = await ReleaseModel.aggregate(
      [
        { $match: { ...AWARD_MATCH, 'buyer.id': { $exists: true, $ne: null } } },
        {
          $group: {
            _id: '$buyer.id',
            name: { $first: '$buyer.name' },
            totalSpending: { $sum: '$amount.primaryAmount' },
            totalContracts: { $sum: 1 },
            years: { $addToSet: '$sourceYear' },
          },
        },
        { $sort: { totalSpending: -1 } },
      ],
      AGG,
    )

    // How many distinct suppliers each buyer has dealt with. The first $group collapses
    // (buyer, supplier) pairs, so the second only has to count them.
    //
    // This deliberately does NOT keep the supplier ids. Only supplierCount is ever read
    // (app/server/api/buyers/[id].get.ts, app/pages/buyers/index.vue); the array itself had no
    // reader, yet one buyer carried 1,833 ids, inflating the average buyer_patterns document to
    // 13.2KB — and the list endpoint does .find().lean() with no .select(), so every one of those
    // ids was being serialised to the browser on every page of the buyers list.
    const supplierLinks: { _id: string, supplierCount: number }[] = await ReleaseModel.aggregate(
      [
        { $match: { ...AWARD_MATCH, 'buyer.id': { $exists: true, $ne: null } } },
        { $unwind: { path: '$awards', preserveNullAndEmptyArrays: false } },
        { $group: { _id: { buyer: '$buyer.id', supplier: AWARD_SUPPLIER_ID } } },
        { $match: { '_id.supplier': { $ne: null } } },
        { $group: { _id: '$_id.buyer', supplierCount: { $sum: 1 } } },
      ],
      AGG,
    )
    const supplierCountByBuyer = new Map(supplierLinks.map(l => [l._id, l.supplierCount]))

    await this.bulkUpsert(
      BuyerPatternModel,
      buyers.map(b => ({
        filter: { buyerId: b._id },
        set: {
          buyerId: b._id,
          name: b.name ?? 'Unknown',
          totalContracts: b.totalContracts,
          totalSpending: b.totalSpending,
          avgContractValue: b.totalContracts > 0 ? b.totalSpending / b.totalContracts : 0,
          years: (b.years ?? []).filter(y => y != null).sort((a, b2) => a - b2),
          yearCount: (b.years ?? []).filter(y => y != null).length,
          supplierCount: supplierCountByBuyer.get(b._id) ?? 0,
          lastUpdated: new Date(),
        },
        // Drop the id list left by earlier runs. Without this the stale array survives forever,
        // since nothing overwrites a field the job no longer sets.
        unset: { suppliers: '' },
      })),
      'buyers',
    )

    this.logger.info(
      `Buyer patterns: ${buyers.length} in ${((Date.now() - started) / 1000).toFixed(1)}s`,
    )
    return buyers.length
  }

  /** Yearly totals, plus monthly totals for every month present. Both release-level. */
  async computeSpendingTrends(): Promise<ISpendingTrend[]> {
    const calculatedAt = new Date()

    const yearly: { _id: number, value: number, count: number }[] = await ReleaseModel.aggregate(
      [
        { $match: { ...AWARD_MATCH, sourceYear: { $ne: null } } },
        {
          $group: {
            _id: '$sourceYear',
            value: { $sum: '$amount.primaryAmount' },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ],
      AGG,
    )

    // Every month, not a sliding two-year window. The cost is the same scan and the storage is a few
    // hundred documents; the old window quietly dropped history on every run.
    const monthly: { _id: { year: number, month: number }, value: number, count: number }[] =
      await ReleaseModel.aggregate(
        [
          { $match: { ...AWARD_MATCH, date: { $ne: null, $type: 'date' } } },
          {
            $group: {
              _id: { year: { $year: '$date' }, month: { $month: '$date' } },
              value: { $sum: '$amount.primaryAmount' },
              count: { $sum: 1 },
            },
          },
          { $sort: { '_id.year': 1, '_id.month': 1 } },
        ],
        AGG,
      )

    const trends: ISpendingTrend[] = []
    for (const y of yearly) {
      trends.push({
        year: y._id,
        date: `${y._id}-01-01`,
        value: y.value,
        count: y.count,
        groupBy: 'year',
        calculatedAt,
        dataVersion: this.dataVersion,
      })
    }
    for (const m of monthly) {
      trends.push({
        year: m._id.year,
        month: m._id.month,
        date: `${m._id.year}-${String(m._id.month).padStart(2, '0')}-01`,
        value: m.value,
        count: m.count,
        groupBy: 'month',
        calculatedAt,
        dataVersion: this.dataVersion,
      })
    }

    this.logger.info(
      `Spending trends: ${yearly.length} years (${yearly[0]?._id}-${yearly[yearly.length - 1]?._id}), ${monthly.length} months`,
    )
    return trends
  }

  /**
   * Year-over-year growth, compared like for like.
   *
   * The latest year is nearly always partial, so measuring all of it against all of the previous
   * year compares eight months to twelve and reports a collapse that never happened — mid-2026 vs
   * full-2025 read as -43%. Both sides are therefore cut at the same day-of-year, using the newest
   * release date present rather than the wall clock, so a stalled ingest cannot masquerade as a
   * spending drop.
   */
  private async computeYearOverYearGrowth(): Promise<number> {
    const newest = await ReleaseModel.find({ ...AWARD_MATCH, date: { $ne: null, $type: 'date' } })
      .select('date')
      .sort({ date: -1 })
      .limit(1)
      .lean()

    const asOf: Date | undefined = (newest[0] as any)?.date
    if (!asOf) return 0

    const year = asOf.getUTCFullYear()
    const startOfCurrent = new Date(Date.UTC(year, 0, 1))
    const startOfPrevious = new Date(Date.UTC(year - 1, 0, 1))
    // Same instant one year earlier. Feb 29 lands on Mar 1 in a non-leap year, which is a day of
    // drift on 1-in-4 runs and immaterial against a year of spending.
    const asOfPrevious = new Date(asOf)
    asOfPrevious.setUTCFullYear(year - 1)

    const [current, previous] = await Promise.all([
      this.spendBetween(startOfCurrent, asOf),
      this.spendBetween(startOfPrevious, asOfPrevious),
    ])

    if (previous <= 0) return 0
    return ((current - previous) / previous) * 100
  }

  private async spendBetween(from: Date, to: Date): Promise<number> {
    const rows = await ReleaseModel.aggregate(
      [
        { $match: { ...AWARD_MATCH, date: { $gte: from, $lte: to } } },
        { $group: { _id: null, value: { $sum: '$amount.primaryAmount' } } },
      ],
      AGG,
    )
    return rows[0]?.value ?? 0
  }

  async computeDashboardMetrics(recentAnomalies: number): Promise<IDashboardMetrics> {
    const [totalContracts, totalSuppliers, totalBuyers, totals] = await Promise.all([
      ReleaseModel.countDocuments(),
      SupplierPatternModel.countDocuments(),
      BuyerPatternModel.countDocuments(),
      ReleaseModel.aggregate(
        [
          { $match: AWARD_MATCH },
          {
            $group: {
              _id: null,
              totalSpending: { $sum: '$amount.primaryAmount' },
              awardedContracts: { $sum: 1 },
            },
          },
        ],
        AGG,
      ),
    ])

    const totalSpending: number = totals[0]?.totalSpending ?? 0
    const awardedContracts: number = totals[0]?.awardedContracts ?? 0

    const currentYearGrowth = await this.computeYearOverYearGrowth()

    return {
      totalContracts,
      totalSpending,
      totalSuppliers,
      totalBuyers,
      avgContractValue: awardedContracts > 0 ? totalSpending / awardedContracts : 0,
      currentYearGrowth,
      recentAnomalies,
      calculatedAt: new Date(),
      dataVersion: this.dataVersion,
    }
  }

  /**
   * Top suppliers/buyers overall and per year.
   *
   * Per-year rankings are aggregated from `releases` rather than read off the pattern documents.
   * The old code queried patterns with `{ years: { $in: [year] } }` and then sorted by `totalValue`,
   * which is a LIFETIME total — so "top suppliers of 2024" actually ranked every supplier that
   * happened to be active in 2024 by their all-time revenue.
   */
  async computeTopEntities(years: number[]): Promise<ITopEntity[]> {
    const calculatedAt = new Date()
    const entities: ITopEntity[] = []

    const topSuppliers = await SupplierPatternModel.find({})
      .sort({ totalValue: -1 })
      .limit(TOP_N_OVERALL)
      .select('supplierId name totalContracts totalValue avgContractValue')
      .lean()
    topSuppliers.forEach((s: any, i) => {
      entities.push({
        entityType: 'supplier',
        entityId: s.supplierId,
        name: s.name,
        totalAmount: s.totalValue,
        totalContracts: s.totalContracts,
        avgContractValue: s.avgContractValue,
        rank: i + 1,
        calculatedAt,
        dataVersion: this.dataVersion,
      })
    })

    const topBuyers = await BuyerPatternModel.find({})
      .sort({ totalSpending: -1 })
      .limit(TOP_N_OVERALL)
      .select('buyerId name totalContracts totalSpending avgContractValue')
      .lean()
    topBuyers.forEach((b: any, i) => {
      entities.push({
        entityType: 'buyer',
        entityId: b.buyerId,
        name: b.name,
        totalAmount: b.totalSpending,
        totalContracts: b.totalContracts,
        avgContractValue: b.avgContractValue,
        rank: i + 1,
        calculatedAt,
        dataVersion: this.dataVersion,
      })
    })

    for (const year of years) {
      const [suppliersOfYear, buyersOfYear] = await Promise.all([
        ReleaseModel.aggregate(
          [
            { $match: { ...AWARD_MATCH, sourceYear: year } },
            { $addFields: { _fx: FX_SCALE } },
            { $unwind: { path: '$awards', preserveNullAndEmptyArrays: false } },
            { $unwind: { path: '$awards.items', preserveNullAndEmptyArrays: false } },
            {
              $group: {
                _id: { supplier: AWARD_SUPPLIER_ID, release: '$id' },
                name: { $first: AWARD_SUPPLIER_NAME },
                value: { $sum: UNWOUND_ITEM_UYU },
              },
            },
            { $match: { '_id.supplier': { $ne: null } } },
            {
              $group: {
                _id: '$_id.supplier',
                name: { $first: '$name' },
                totalAmount: { $sum: '$value' },
                totalContracts: { $sum: 1 },
              },
            },
            { $sort: { totalAmount: -1 } },
            { $limit: TOP_N_PER_YEAR },
          ],
          AGG,
        ),
        ReleaseModel.aggregate(
          [
            { $match: { ...AWARD_MATCH, sourceYear: year, 'buyer.id': { $exists: true, $ne: null } } },
            {
              $group: {
                _id: '$buyer.id',
                name: { $first: '$buyer.name' },
                totalAmount: { $sum: '$amount.primaryAmount' },
                totalContracts: { $sum: 1 },
              },
            },
            { $sort: { totalAmount: -1 } },
            { $limit: TOP_N_PER_YEAR },
          ],
          AGG,
        ),
      ])

      suppliersOfYear.forEach((s: any, i: number) => {
        entities.push({
          entityType: 'supplier',
          entityId: s._id,
          name: s.name ?? 'Unknown',
          totalAmount: s.totalAmount,
          totalContracts: s.totalContracts,
          avgContractValue: s.totalContracts > 0 ? s.totalAmount / s.totalContracts : 0,
          rank: i + 1,
          year,
          calculatedAt,
          dataVersion: this.dataVersion,
        })
      })
      buyersOfYear.forEach((b: any, i: number) => {
        entities.push({
          entityType: 'buyer',
          entityId: b._id,
          name: b.name ?? 'Unknown',
          totalAmount: b.totalAmount,
          totalContracts: b.totalContracts,
          avgContractValue: b.totalContracts > 0 ? b.totalAmount / b.totalContracts : 0,
          rank: i + 1,
          year,
          calculatedAt,
          dataVersion: this.dataVersion,
        })
      })
    }

    this.logger.info(`Top entities: ${entities.length} rows across ${years.length} years + overall`)
    return entities
  }

  async computeCategoryDistribution(years: number[]): Promise<ICategoryDistribution[]> {
    const calculatedAt = new Date()
    const categories: ICategoryDistribution[] = []

    const categoryStage = (match: Record<string, unknown>, limit: number): PipelineStage[] => [
      { $match: match },
      { $addFields: { _fx: FX_SCALE } },
      { $unwind: { path: '$awards', preserveNullAndEmptyArrays: false } },
      { $unwind: { path: '$awards.items', preserveNullAndEmptyArrays: false } },
      {
        $group: {
          _id: '$awards.items.classification.description',
          totalAmount: { $sum: UNWOUND_ITEM_UYU },
          contractCount: { $sum: 1 },
        },
      },
      { $sort: { totalAmount: -1 } },
      { $limit: limit },
    ]

    const overall = await ReleaseModel.aggregate(
      categoryStage({ ...AWARD_MATCH }, TOP_N_CATEGORIES_OVERALL),
      AGG,
    )
    const overallTotal = overall.reduce((sum, c) => sum + c.totalAmount, 0)
    overall.forEach((c: any, i: number) => {
      categories.push({
        category: c._id || 'Unknown',
        totalAmount: c.totalAmount,
        contractCount: c.contractCount,
        percentage: overallTotal > 0 ? (c.totalAmount / overallTotal) * 100 : 0,
        rank: i + 1,
        calculatedAt,
        dataVersion: this.dataVersion,
      })
    })

    for (const year of years) {
      const yearly = await ReleaseModel.aggregate(
        categoryStage({ ...AWARD_MATCH, sourceYear: year }, TOP_N_CATEGORIES_PER_YEAR),
        AGG,
      )
      const yearTotal = yearly.reduce((sum, c) => sum + c.totalAmount, 0)
      yearly.forEach((c: any, i: number) => {
        categories.push({
          category: c._id || 'Unknown',
          totalAmount: c.totalAmount,
          contractCount: c.contractCount,
          percentage: yearTotal > 0 ? (c.totalAmount / yearTotal) * 100 : 0,
          rank: i + 1,
          year,
          calculatedAt,
          dataVersion: this.dataVersion,
        })
      })
    }

    this.logger.info(`Category distribution: ${categories.length} rows`)
    return categories
  }

  private async bulkUpsert(
    model: any,
    ops: { filter: Record<string, unknown>, set: Record<string, unknown>, unset?: Record<string, string> }[],
    label: string,
  ): Promise<void> {
    for (let i = 0; i < ops.length; i += BULK_BATCH) {
      const batch = ops.slice(i, i + BULK_BATCH).map(o => ({
        updateOne: {
          filter: o.filter,
          update: o.unset ? { $set: o.set, $unset: o.unset } : { $set: o.set },
          upsert: true,
        },
      }))
      if (batch.length === 0) continue
      await model.bulkWrite(batch, { ordered: false, bypassDocumentValidation: true })
      this.logger.info(`  ${label}: ${Math.min(i + BULK_BATCH, ops.length)}/${ops.length}`)
    }
  }

  /**
   * Replace a collection's contents. Called only after every aggregation has succeeded, so the
   * window in which readers can see an empty collection is the delete-to-insert gap rather than the
   * whole multi-minute computation.
   *
   * This is not atomic. MongoDB here is a standalone node, so there are no multi-document
   * transactions to lean on, and the API layer does not filter by `dataVersion` — which is what a
   * true version swap would need.
   */
  private async swapCollection(model: any, docs: any[], label: string): Promise<void> {
    if (docs.length === 0) {
      this.logger.warn(`${label}: computed 0 documents — keeping existing data rather than wiping it`)
      return
    }
    await model.deleteMany({})
    for (let i = 0; i < docs.length; i += BULK_BATCH) {
      await model.insertMany(docs.slice(i, i + BULK_BATCH), { ordered: false })
    }
    this.logger.info(`${label}: swapped in ${docs.length} documents`)
  }

  /**
   * Names every release the plausibility ceiling keeps out of the totals. There are only a handful,
   * so listing them costs nothing and means the guard is auditable from the logs alone.
   */
  private async reportExcluded(): Promise<void> {
    if (MAX_PLAUSIBLE_RELEASE_UYU <= 0) {
      this.logger.warn('Plausibility ceiling disabled — totals include every release, however implausible')
      return
    }

    const excluded = await ReleaseModel.find(IMPLAUSIBLE_MATCH)
      .select('id sourceYear amount.primaryAmount')
      .sort({ 'amount.primaryAmount': -1 })
      .lean()

    if (excluded.length === 0) {
      this.logger.info(`Plausibility ceiling ${(MAX_PLAUSIBLE_RELEASE_UYU / 1e9).toFixed(0)}B UYU: nothing excluded`)
      return
    }

    const total = excluded.reduce((sum, r: any) => sum + (r.amount?.primaryAmount ?? 0), 0)
    this.logger.warn(
      `Plausibility ceiling ${(MAX_PLAUSIBLE_RELEASE_UYU / 1e9).toFixed(0)}B UYU excluded ${excluded.length} release(s) totalling ${(total / 1e9).toFixed(1)}B UYU from aggregate totals:`,
    )
    for (const r of excluded as any[]) {
      this.logger.warn(`  ${r.id} (${r.sourceYear}): ${(r.amount.primaryAmount / 1e9).toFixed(1)}B UYU`)
    }
  }

  async run(scope: { patterns: boolean, dashboard: boolean }): Promise<void> {
    const started = Date.now()

    // The shared default is a 45s idle-socket timeout, which these aggregations exceed while the
    // server is still legitimately working. Must be set before the first connect.
    if (!process.env.MONGO_SOCKET_TIMEOUT_MS) {
      process.env.MONGO_SOCKET_TIMEOUT_MS = String(30 * 60 * 1000)
    }

    await connectToDatabase()
    this.logger.info(`Analytics refresh starting (dataVersion=${this.dataVersion})`)
    await this.reportExcluded()

    if (scope.patterns) {
      await this.refreshSupplierPatterns()
      await this.refreshBuyerPatterns()
    }

    if (scope.dashboard) {
      // Compute everything before touching a single collection.
      const trends = await this.computeSpendingTrends()
      const years = trends
        .filter(t => t.groupBy === 'year' && typeof t.year === 'number')
        .map(t => t.year as number)
        .sort((a, b) => a - b)

      // Newly DISCOVERED anomalies, keyed off firstDetectedAt (written once, on insert).
      // detectedAt is restamped by every rescan, so counting on it reported all 22,368 as "recent"
      // — the metric could never say anything other than the total.
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      const recentAnomalies = await AnomalyModel.countDocuments({
        firstDetectedAt: { $gte: thirtyDaysAgo },
      })

      const [metrics, entities, categories] = await Promise.all([
        this.computeDashboardMetrics(recentAnomalies),
        this.computeTopEntities(years),
        this.computeCategoryDistribution(years),
      ])

      // Only now is anything destroyed.
      await this.swapCollection(SpendingTrendsModel, trends, 'spending_trends')
      await this.swapCollection(TopEntitiesModel, entities, 'top_entities')
      await this.swapCollection(CategoryDistributionModel, categories, 'category_distribution')
      await this.swapCollection(DashboardMetricsModel, [metrics], 'dashboard_metrics')

      this.logger.info(
        `Totals: spending=${(metrics.totalSpending / 1e9).toFixed(1)}B UYU across ${metrics.totalContracts.toLocaleString()} releases, years ${years[0]}-${years[years.length - 1]}`,
      )
    }

    this.logger.info(`Analytics refresh finished in ${((Date.now() - started) / 1000).toFixed(1)}s`)
  }
}

if (require.main === module) {
  const args = process.argv.slice(2)
  const only = { patterns: args.includes('--patterns'), dashboard: args.includes('--dashboard') }
  const scope = !only.patterns && !only.dashboard ? { patterns: true, dashboard: true } : only

  new AnalyticsRefresher()
    .run(scope)
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Analytics refresh failed:', error)
      process.exit(1)
    })
}
