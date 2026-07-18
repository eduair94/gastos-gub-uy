#!/usr/bin/env tsx

/**
 * Per catalogue-code (classification.id) analytics rebuild.
 *
 * Fills the `product_analytics` collection: for every real catalogue code, what it is, how many
 * lines/contracts bought it, how many distinct buyers and suppliers, total UYU spend, the top
 * buyers and suppliers by spend, and a per-year series.
 *
 * WHY A JOB. Live group-by-classification over the ~2.2M releases collection is ~15s — the same
 * reason every other aggregation here is precomputed. This runs offline and the API then reads
 * ~20k indexed docs on the request path.
 *
 * MONEY. Reuses the shared helpers in ./analytics-pipeline (`FX_SCALE`, `UNWOUND_ITEM_UYU`,
 * `MAX_PLAUSIBLE_RELEASE_UYU`) so per-product spend is UYU-consistent with the rest of the site:
 * quantity-multiplied, currency-converted, and with the same plausibility ceiling that keeps a
 * handful of malformed line-total records from dominating. Spend is GATED to plausible priced
 * releases; COUNTS are computed over every award line with a real code, so a code that was bought
 * often but never carried a clean money figure still ranks by activity.
 *
 * GROUPING. Four grouped scans (buyers, suppliers, years, descriptions), each streamed via cursor
 * and merged in JS by code — the same memory-safe shape detect-anomalies uses. `contractCount` is
 * summed from per-{code,buyer} distinct-release counts, which is exact because a release carries
 * exactly one buyer (so no release is double-counted across a code's buyers).
 *
 * SWAP. Writes the new dataVersion, then deletes every older version — a reader never sees a
 * half-built set.
 */

import { connectToDatabase } from '../../shared/connection/database'
import { ProductAnalyticsModel, ReleaseModel, SiceCatalogModel } from '../../shared/models'
import type { IProductAnalytics, IProductRankEntry, IProductYear } from '../../shared/models'
import { Logger } from '../services/logger-service'
import {
  AWARD_SUPPLIER_ID,
  AWARD_SUPPLIER_NAME,
  FX_SCALE,
  MAX_PLAUSIBLE_RELEASE_UYU,
  UNWOUND_ITEM_UYU,
} from './analytics-pipeline'

/** The classification.id sentinel bucket — 36% of all award lines, mixed unrelated descriptions. */
const JUNK_CODES = ['0', '', 'UNKNOWN']
const TOP_N = 12
const BULK_BATCH = 1000
const AGG = { allowDiskUse: true, maxTimeMS: 20 * 60 * 1000 } as const

/**
 * Per-item UYU spend, gated. Zero unless the release carries a plausible amount.primaryAmount, so
 * money-less and implausible-total releases contribute to line counts but not to spend.
 */
const SPEND = {
  $cond: [
    {
      $and: [
        { $gt: ['$amount.primaryAmount', 0] },
        MAX_PLAUSIBLE_RELEASE_UYU > 0
          ? { $lt: ['$amount.primaryAmount', MAX_PLAUSIBLE_RELEASE_UYU] }
          : { $literal: true },
      ],
    },
    UNWOUND_ITEM_UYU,
    0,
  ],
}

/** Shared leading stages: award releases, fx ratio, unwound to one real-coded item line. */
const baseStages = [
  { $match: { tag: 'award' } },
  { $addFields: { _fx: FX_SCALE } },
  { $unwind: { path: '$awards', preserveNullAndEmptyArrays: false } },
  { $unwind: { path: '$awards.items', preserveNullAndEmptyArrays: false } },
  { $match: { 'awards.items.classification.id': { $nin: [...JUNK_CODES, null] } } },
]

interface Acc {
  code: string
  description: string
  descBest: number
  lineCount: number
  contractCount: number
  totalUYU: number
  /** Keyed by entity id (or 'n:'+name when the source carries no id) so a buyer/supplier that
   *  was renamed over the years collapses to one entity instead of inflating the distinct count.
   *  `bestNameLines` remembers which name variant labelled the most lines. */
  buyers: Map<string, RankAcc>
  suppliers: Map<string, RankAcc>
  byYear: Map<number, IProductYear>
  currencies: Set<string>
}

interface RankAcc extends IProductRankEntry {
  bestNameLines: number
}

function accFor(map: Map<string, Acc>, code: string): Acc {
  let a = map.get(code)
  if (!a) {
    a = {
      code,
      description: '',
      descBest: -1,
      lineCount: 0,
      contractCount: 0,
      totalUYU: 0,
      buyers: new Map(),
      suppliers: new Map(),
      byYear: new Map(),
      currencies: new Set(),
    }
    map.set(code, a)
  }
  return a
}

/** Fold one grouped {entity,spend,lines} row into a by-id map, merging renamed duplicates. */
function mergeEntity(into: Map<string, RankAcc>, id: string, name: string, spend: number, lines: number): void {
  const key = id ? id : `n:${name}`
  const cur = into.get(key)
  if (!cur) {
    into.set(key, { id, name, spendUYU: spend, lines, bestNameLines: lines })
    return
  }
  cur.spendUYU += spend
  cur.lines += lines
  // Keep whichever name variant labelled the most lines.
  if (name && lines > cur.bestNameLines) {
    cur.name = name
    cur.bestNameLines = lines
  }
}

export class ProductAnalyticsRefresher {
  private logger = new Logger()
  private dataVersion = `v${Date.now()}`

  private async streamGroup(pipeline: any[], onRow: (row: any) => void): Promise<void> {
    const cursor = ReleaseModel.aggregate(pipeline, AGG).cursor({ batchSize: BULK_BATCH })
    for await (const row of cursor) onRow(row)
  }

  async build(): Promise<Map<string, Acc>> {
    const map = new Map<string, Acc>()

    // --- Buyers: totalUYU, lineCount, buyerCount, contractCount, topBuyers -------------------
    // `contracts` is the set of release ids for this {code, buyer}; a release has one buyer, so
    // summing their sizes across a code's buyers counts distinct contracts without double-counting.
    this.logger.info('  pass 1/4: buyers')
    await this.streamGroup(
      [
        ...baseStages,
        {
          $group: {
            _id: { code: '$awards.items.classification.id', id: '$buyer.id', name: '$buyer.name' },
            spend: { $sum: SPEND },
            lines: { $sum: 1 },
            contracts: { $addToSet: '$id' },
          },
        },
      ],
      (row) => {
        const a = accFor(map, String(row._id.code))
        a.lineCount += row.lines
        a.totalUYU += row.spend || 0
        a.contractCount += Array.isArray(row.contracts) ? row.contracts.length : 0
        mergeEntity(a.buyers, row._id.id ?? '', row._id.name ?? '', row.spend || 0, row.lines)
      },
    )

    // --- Suppliers: supplierCount, topSuppliers ----------------------------------------------
    this.logger.info('  pass 2/4: suppliers')
    await this.streamGroup(
      [
        ...baseStages,
        {
          $group: {
            _id: { code: '$awards.items.classification.id', id: AWARD_SUPPLIER_ID, name: AWARD_SUPPLIER_NAME },
            spend: { $sum: SPEND },
            lines: { $sum: 1 },
          },
        },
      ],
      (row) => {
        const a = accFor(map, String(row._id.code))
        mergeEntity(a.suppliers, row._id.id ?? '', row._id.name ?? '', row.spend || 0, row.lines)
      },
    )

    // --- Years: byYear + first/last --------------------------------------------------------
    this.logger.info('  pass 3/4: years')
    await this.streamGroup(
      [
        ...baseStages,
        {
          $group: {
            _id: { code: '$awards.items.classification.id', year: '$sourceYear' },
            spend: { $sum: SPEND },
            lines: { $sum: 1 },
          },
        },
      ],
      (row) => {
        const year = Number(row._id.year)
        if (!Number.isFinite(year)) return
        const a = accFor(map, String(row._id.code))
        a.byYear.set(year, { year, spendUYU: row.spend || 0, lines: row.lines })
      },
    )

    // --- Descriptions (modal) + currencies -------------------------------------------------
    this.logger.info('  pass 4/4: descriptions + currencies')
    await this.streamGroup(
      [
        ...baseStages,
        {
          $group: {
            _id: { code: '$awards.items.classification.id', desc: '$awards.items.classification.description' },
            lines: { $sum: 1 },
            currencies: { $addToSet: '$awards.items.unit.value.currency' },
          },
        },
      ],
      (row) => {
        const a = accFor(map, String(row._id.code))
        const desc = (row._id.desc ?? '').trim()
        if (desc && row.lines > a.descBest) {
          a.descBest = row.lines
          a.description = desc
        }
        for (const c of row.currencies ?? []) if (c) a.currencies.add(String(c))
      },
    )

    return map
  }

  toDocs(map: Map<string, Acc>): IProductAnalytics[] {
    const now = new Date()
    const docs: IProductAnalytics[] = []
    for (const a of map.values()) {
      const byYear = [...a.byYear.values()].sort((x, y) => x.year - y.year)
      const years = byYear.map(y => y.year)
      const buyers = [...a.buyers.values()]
      const suppliers = [...a.suppliers.values()]
      const topN = (rows: RankAcc[]): IProductRankEntry[] => rows
        .sort((x, y) => y.spendUYU - x.spendUYU || y.lines - x.lines)
        .slice(0, TOP_N)
        .map(({ id, name, spendUYU, lines }) => ({ id, name, spendUYU, lines }))
      docs.push({
        code: a.code,
        description: a.description || a.code,
        lineCount: a.lineCount,
        contractCount: a.contractCount,
        buyerCount: buyers.length,
        supplierCount: suppliers.length,
        totalUYU: a.totalUYU,
        topBuyers: topN(buyers),
        topSuppliers: topN(suppliers),
        byYear,
        firstYear: years.length ? years[0] : undefined,
        lastYear: years.length ? years[years.length - 1] : undefined,
        currencies: [...a.currencies].sort(),
        rankBySpend: 0,
        rankByLines: 0,
        calculatedAt: now,
        dataVersion: this.dataVersion,
      })
    }

    // Global ranks.
    docs.slice().sort((x, y) => y.totalUYU - x.totalUYU).forEach((d, i) => { d.rankBySpend = i + 1 })
    docs.slice().sort((x, y) => y.lineCount - x.lineCount).forEach((d, i) => { d.rankByLines = i + 1 })
    return docs
  }

  /**
   * Left-join the SICE catalog by `code` and attach the canonical name, rubro
   * path/names and official unit to each doc — the SAME enrichment the alerts
   * and the anomaly detector read, so product pages show catalog-consistent
   * names/units. Codes absent from the catalog keep their modal `description`.
   */
  async enrich(docs: IProductAnalytics[]): Promise<void> {
    const CHUNK = 5000
    const cat = new Map<string, {
      canonicalName?: string | undefined; rubroPath?: string | undefined; famiName?: string | undefined; subfName?: string | undefined;
      clasName?: string | undefined; subcName?: string | undefined; unitName?: string | undefined; isService?: boolean | undefined
    }>()
    const codes = docs.map(d => d.code)
    for (let i = 0; i < codes.length; i += CHUNK) {
      const rows = await SiceCatalogModel
        .find({ code: { $in: codes.slice(i, i + CHUNK) } })
        .select('code canonicalName rubroPath famiName subfName clasName subcName unitName isService')
        .lean()
      for (const r of rows) cat.set(r.code, r)
    }
    let hit = 0
    for (const d of docs) {
      const c = cat.get(d.code)
      if (!c) continue
      hit++
      d.canonicalName = c.canonicalName
      d.rubroPath = c.rubroPath
      d.famiName = c.famiName
      d.subfName = c.subfName
      d.clasName = c.clasName
      d.subcName = c.subcName
      d.unitName = c.unitName
      d.isService = c.isService
    }
    this.logger.info(`  enriched ${hit}/${docs.length} codes from sice_catalog`)
  }

  async save(docs: IProductAnalytics[]): Promise<void> {
    this.logger.info(`  writing ${docs.length} product docs (version ${this.dataVersion})`)
    // Upsert by `code` rather than insertMany: the collection has a UNIQUE index on `code`, and the
    // previous version's docs are still present (compute-then-swap), so a bare insert would collide
    // on every code. replaceOne+upsert overwrites each code in place — no duplicate-key crash and
    // no window where the collection is empty — then the sweep removes codes that no longer exist.
    for (let i = 0; i < docs.length; i += BULK_BATCH) {
      const ops = docs.slice(i, i + BULK_BATCH).map(doc => ({
        replaceOne: { filter: { code: doc.code }, replacement: doc, upsert: true },
      }))
      await ProductAnalyticsModel.bulkWrite(ops, { ordered: false })
    }
    const swept = await ProductAnalyticsModel.deleteMany({ dataVersion: { $ne: this.dataVersion } })
    this.logger.info(`  swept ${swept.deletedCount} docs from older versions`)
  }

  async run(): Promise<void> {
    const started = Date.now()
    // The four grouped scans legitimately run for minutes over ~2.2M releases, well past the
    // web app's 45s idle-socket timeout. Raise it before connecting, matching the other jobs.
    if (!process.env.MONGO_SOCKET_TIMEOUT_MS) {
      process.env.MONGO_SOCKET_TIMEOUT_MS = String(30 * 60 * 1000)
    }
    this.logger.info('Rebuilding product analytics...')
    await connectToDatabase()
    const map = await this.build()
    const docs = this.toDocs(map)
    await this.enrich(docs)
    await this.save(docs)
    this.logger.info(`Product analytics rebuilt: ${docs.length} codes in ${((Date.now() - started) / 1000).toFixed(1)}s`)
  }
}

if (require.main === module) {
  new ProductAnalyticsRefresher()
    .run()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ product analytics refresh failed:', err)
      process.exit(1)
    })
}
