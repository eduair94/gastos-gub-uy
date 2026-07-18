#!/usr/bin/env tsx

/**
 * Provider × unexplained-anomaly cross-reference.
 *
 * Cross-references the flags the AI could NOT explain — anomalies where
 * aiVerdict.explainable === 'no', the same set surfaced at
 * /analytics/anomalies?ai=unexplained — against the providers that receive them,
 * so the site can answer "which providers (and buyers) concentrate the unexplained
 * overprices, and is there a pattern".
 *
 * GROUPING. Anomalies carry only metadata.supplierName (a string), never the supplier
 * RUT, so grouping is by name. A best-effort RUT is attached only when the name resolves
 * to a single distinct supplier_patterns id (usually it does not — the same name maps to
 * several id-scheme variants — so `supplierId` is normally absent and the page links back
 * to the anomalies list by name).
 *
 * OVERPRICE is an estimate: per flag, max(0, detectedValue - expectedRange.max) * quantity,
 * accumulated PER CURRENCY (UYU and USD are never summed together).
 *
 * SWAP. Writes the new dataVersion (stats upserted by unique supplierName, a fresh summary
 * doc inserted), then deletes every older version — a reader never sees a half-built set.
 * Runs every 24h from the cronserver; the unexplained set is small (hundreds), so this is a
 * light job (seconds), but it still raises the socket timeout defensively like the others.
 */

import { connectToDatabase } from '../../shared/connection/database'
import {
  AnomalyModel,
  ProviderAnomalyStatsModel,
  ProviderAnomalySummaryModel,
  SupplierPatternModel,
} from '../../shared/models'
import type {
  IOverpriceEntry,
  IProviderAnomalyStats,
  IProviderAnomalySummary,
} from '../../shared/models'
import { Logger } from '../services/logger-service'

/** The canonical "unexplained" marker: the second-stage AI found no legitimate explanation. */
const UNEXPLAINED = { 'aiVerdict.explainable': 'no' } as const
const BULK_BATCH = 500
const TOP_BUYERS_PER_PROVIDER = 8
const TOP_RUBROS_PER_PROVIDER = 6
const SUMMARY_TOP_PAIRS = 20
const SUMMARY_TOP_BUYERS = 15
const SUMMARY_TOP_PROVIDERS = 12

/**
 * Per-flag overprice plausibility ceiling, in the flag's own currency.
 *
 * overprice = (paid - rangeTop) * quantity, and a handful of flags carry a malformed quantity
 * (e.g. a single line with a 20.9-billion-peso "overprice" — one flag = 98% of the raw UYU total).
 * Left unchecked, one artifact dominates every total and the overprice sort. Cap each flag's
 * contribution at a value a genuine single-contract unit-price overprice never realistically
 * exceeds (10x the largest legitimate case observed), the same "plausibility ceiling" pattern the
 * rest of the site uses for release money (src/jobs/analytics-pipeline MAX_PLAUSIBLE_RELEASE_UYU).
 */
const OVERPRICE_CEILING: Record<string, number> = {
  UYU: Number(process.env.PROVIDER_OVERPRICE_CEILING_UYU ?? 100_000_000),
}
const OVERPRICE_CEILING_DEFAULT = Number(process.env.PROVIDER_OVERPRICE_CEILING_OTHER ?? 2_500_000)
function overpriceCeiling(currency: string): number {
  return OVERPRICE_CEILING[currency] ?? OVERPRICE_CEILING_DEFAULT
}

/** Per-flag overprice in the flag's own currency, clamped to the plausibility ceiling. Returns the
 *  clamped value and whether the raw value was above the ceiling (a quantity/data artifact). */
function overpriceOf(a: any, currency: string): { value: number, clamped: boolean } {
  const paid = a?.detectedValue
  const hi = a?.expectedRange?.max
  if (!Number.isFinite(paid) || !Number.isFinite(hi)) return { value: 0, clamped: false }
  const qty = Number.isFinite(a?.metadata?.itemQuantity) && a.metadata.itemQuantity > 0 ? a.metadata.itemQuantity : 1
  const raw = Math.max(0, paid - hi) * qty
  const ceil = overpriceCeiling(currency)
  return raw > ceil ? { value: ceil, clamped: true } : { value: raw, clamped: false }
}
function currencyOf(a: any): string {
  return (a?.currency ?? a?.metadata?.currency ?? 'UYU') as string
}
/** SICE top-level rubro, falling back to the catalog/free-text description. */
function rubroOf(a: any): string {
  const c = a?.metadata?.itemClassification
  return (c?.rubro ?? c?.canonicalName ?? c?.description ?? '—') as string
}

interface ProviderAcc {
  supplierName: string
  flagCount: number
  overprice: Map<string, number>
  curCounts: Map<string, number>
  worstZ: number
  confSum: number
  confN: number
  rubros: Map<string, number>
  buyers: Map<string, number>
  currencies: Set<string>
  years: Set<number>
}

export class CrossProviderAnomalies {
  private logger = new Logger()
  private dataVersion = `v${Date.now()}`

  private providers = new Map<string, ProviderAcc>()
  private pairAgg = new Map<string, number>()
  private buyerAgg = new Map<string, { count: number, providers: Set<string> }>()
  private rubroTotals = new Map<string, number>()
  private yearTotals = new Map<number, number>()
  private overpriceTotals = new Map<string, number>()
  private flagTotal = 0
  private clampedFlags = 0

  private accFor(name: string): ProviderAcc {
    let a = this.providers.get(name)
    if (!a) {
      a = {
        supplierName: name,
        flagCount: 0,
        overprice: new Map(),
        curCounts: new Map(),
        worstZ: 0,
        confSum: 0,
        confN: 0,
        rubros: new Map(),
        buyers: new Map(),
        currencies: new Set(),
        years: new Set(),
      }
      this.providers.set(name, a)
    }
    return a
  }

  /** Stream the unexplained flags and fold them into the provider / buyer / pair accumulators. */
  async build(): Promise<void> {
    const cursor = AnomalyModel.find(UNEXPLAINED)
      .select('detectedValue expectedRange currency metadata.supplierName metadata.buyerName metadata.itemClassification metadata.itemQuantity metadata.currency metadata.zScore metadata.year sourceYear aiVerdict.confidence')
      .lean()
      .cursor({ batchSize: BULK_BATCH })

    for await (const a of cursor as any) {
      this.flagTotal++
      const name = ((a?.metadata?.supplierName ?? '') as string).trim() || '—'
      const buyer = ((a?.metadata?.buyerName ?? '') as string).trim() || '—'
      const c = currencyOf(a)
      const { value: op, clamped } = overpriceOf(a, c)
      if (clamped) this.clampedFlags++
      const z = Number.isFinite(a?.metadata?.zScore) ? a.metadata.zScore : 0
      const conf = Number.isFinite(a?.aiVerdict?.confidence) ? a.aiVerdict.confidence : null
      const rubro = rubroOf(a)
      const year = Number(a?.sourceYear ?? a?.metadata?.year)

      const p = this.accFor(name)
      p.flagCount++
      p.overprice.set(c, (p.overprice.get(c) ?? 0) + op)
      p.curCounts.set(c, (p.curCounts.get(c) ?? 0) + 1)
      p.worstZ = Math.max(p.worstZ, z)
      if (conf !== null) { p.confSum += conf; p.confN++ }
      p.rubros.set(rubro, (p.rubros.get(rubro) ?? 0) + 1)
      p.buyers.set(buyer, (p.buyers.get(buyer) ?? 0) + 1)
      p.currencies.add(c)
      if (Number.isFinite(year)) p.years.add(year)

      // Global rollups for the summary.
      this.pairAgg.set(`${name}||${buyer}`, (this.pairAgg.get(`${name}||${buyer}`) ?? 0) + 1)
      const b = this.buyerAgg.get(buyer) ?? { count: 0, providers: new Set<string>() }
      b.count++; b.providers.add(name); this.buyerAgg.set(buyer, b)
      this.rubroTotals.set(rubro, (this.rubroTotals.get(rubro) ?? 0) + 1)
      if (Number.isFinite(year)) this.yearTotals.set(year, (this.yearTotals.get(year) ?? 0) + 1)
      this.overpriceTotals.set(c, (this.overpriceTotals.get(c) ?? 0) + op)
    }
    this.logger.info(`  scanned ${this.flagTotal} unexplained flags across ${this.providers.size} providers`)
  }

  /** Best-effort RUT: only when the name maps to ONE distinct supplier_patterns id. */
  async resolveRuts(): Promise<Map<string, string>> {
    const names = [...this.providers.keys()].filter(n => n !== '—')
    const out = new Map<string, string>()
    const CHUNK = 2000
    const byName = new Map<string, Set<string>>()
    for (let i = 0; i < names.length; i += CHUNK) {
      const rows = await SupplierPatternModel
        .find({ name: { $in: names.slice(i, i + CHUNK) } })
        .select('name supplierId')
        .lean()
      for (const r of rows as any[]) {
        const set = byName.get(r.name) ?? new Set<string>()
        set.add(r.supplierId)
        byName.set(r.name, set)
      }
    }
    for (const [name, ids] of byName) if (ids.size === 1) out.set(name, [...ids][0]!)
    this.logger.info(`  resolved ${out.size}/${names.length} names to a unique RUT`)
    return out
  }

  toStatsDocs(ruts: Map<string, string>): IProviderAnomalyStats[] {
    const now = new Date()
    const docs: IProviderAnomalyStats[] = []
    for (const p of this.providers.values()) {
      const overprice: IOverpriceEntry[] = [...p.overprice.entries()]
        .map(([currency, amount]) => ({ currency, amount }))
        .sort((a, b) => b.amount - a.amount)
      // Primary currency = the one carrying the most flags (ties -> larger overprice).
      const primaryCurrency = [...p.curCounts.entries()]
        .sort((a, b) => b[1] - a[1] || (p.overprice.get(b[0]) ?? 0) - (p.overprice.get(a[0]) ?? 0))[0]?.[0] ?? 'UYU'
      const buyers = [...p.buyers.entries()]
        .map(([buyerName, count]) => ({ buyerName, count }))
        .sort((a, b) => b.count - a.count)
      const rubros = [...p.rubros.entries()]
        .map(([rubro, count]) => ({ rubro, count }))
        .sort((a, b) => b.count - a.count)
      const years = [...p.years].sort((a, b) => a - b)
      docs.push({
        supplierName: p.supplierName,
        supplierId: ruts.get(p.supplierName),
        flagCount: p.flagCount,
        overprice,
        primaryCurrency,
        primaryOverprice: p.overprice.get(primaryCurrency) ?? 0,
        worstZ: Math.round(p.worstZ),
        avgConfidence: p.confN ? +(p.confSum / p.confN).toFixed(3) : null,
        rubros: rubros.slice(0, TOP_RUBROS_PER_PROVIDER),
        buyers: buyers.slice(0, TOP_BUYERS_PER_PROVIDER),
        buyerCount: buyers.length,
        topBuyer: buyers[0]?.buyerName,
        topBuyerCount: buyers[0]?.count ?? 0,
        captive: buyers.length === 1 && p.flagCount > 1,
        currencies: [...p.currencies].sort(),
        years,
        firstYear: years[0],
        lastYear: years[years.length - 1],
        dataVersion: this.dataVersion,
        calculatedAt: now,
      })
    }
    return docs
  }

  toSummaryDoc(): IProviderAnomalySummary {
    const captiveCount = [...this.providers.values()].filter(p => p.buyers.size === 1 && p.flagCount > 1).length
    const topPairs = [...this.pairAgg.entries()]
      .map(([k, count]) => { const [supplierName, buyerName] = k.split('||'); return { supplierName: supplierName!, buyerName: buyerName!, count } })
      .sort((a, b) => b.count - a.count)
      .slice(0, SUMMARY_TOP_PAIRS)
    const topBuyers = [...this.buyerAgg.entries()]
      .map(([buyerName, v]) => ({ buyerName, count: v.count, providerCount: v.providers.size }))
      .sort((a, b) => b.count - a.count)
      .slice(0, SUMMARY_TOP_BUYERS)
    const topProviders = [...this.providers.values()]
      .map(p => ({ supplierName: p.supplierName, flagCount: p.flagCount, captive: p.buyers.size === 1 && p.flagCount > 1 }))
      .sort((a, b) => b.flagCount - a.flagCount)
      .slice(0, SUMMARY_TOP_PROVIDERS)
    return {
      providerCount: this.providers.size,
      flagTotal: this.flagTotal,
      captiveCount,
      clampedFlags: this.clampedFlags,
      overpriceTotals: [...this.overpriceTotals.entries()].map(([currency, amount]) => ({ currency, amount })).sort((a, b) => b.amount - a.amount),
      rubroTotals: [...this.rubroTotals.entries()].map(([rubro, count]) => ({ rubro, count })).sort((a, b) => b.count - a.count),
      yearTotals: [...this.yearTotals.entries()].map(([year, count]) => ({ year, count })).sort((a, b) => a.year - b.year),
      topProviders,
      topPairs,
      topBuyers,
      dataVersion: this.dataVersion,
      calculatedAt: new Date(),
    }
  }

  async save(stats: IProviderAnomalyStats[], summary: IProviderAnomalySummary): Promise<void> {
    // Upsert stats by unique supplierName (compute-then-swap: previous docs still present), then
    // sweep older versions — never a window where the collection is empty.
    for (let i = 0; i < stats.length; i += BULK_BATCH) {
      const ops = stats.slice(i, i + BULK_BATCH).map(doc => ({
        replaceOne: { filter: { supplierName: doc.supplierName }, replacement: doc, upsert: true },
      }))
      if (ops.length) await ProviderAnomalyStatsModel.bulkWrite(ops, { ordered: false })
    }
    const sweptStats = await ProviderAnomalyStatsModel.deleteMany({ dataVersion: { $ne: this.dataVersion } })
    // Fresh summary doc, then drop the previous ones.
    await ProviderAnomalySummaryModel.create(summary)
    const sweptSum = await ProviderAnomalySummaryModel.deleteMany({ dataVersion: { $ne: this.dataVersion } })
    this.logger.info(`  wrote ${stats.length} provider docs + summary; swept ${sweptStats.deletedCount} stale stats, ${sweptSum.deletedCount} stale summaries`)
  }

  async run(): Promise<void> {
    const started = Date.now()
    if (!process.env.MONGO_SOCKET_TIMEOUT_MS) {
      process.env.MONGO_SOCKET_TIMEOUT_MS = String(10 * 60 * 1000)
    }
    this.logger.info('Cross-referencing unexplained anomalies by provider...')
    await connectToDatabase()
    await this.build()
    const ruts = await this.resolveRuts()
    const stats = this.toStatsDocs(ruts)
    const summary = this.toSummaryDoc()
    await this.save(stats, summary)
    this.logger.info(`Provider anomaly cross-reference rebuilt: ${stats.length} providers, ${summary.flagTotal} flags in ${((Date.now() - started) / 1000).toFixed(1)}s`)
  }
}

if (require.main === module) {
  new CrossProviderAnomalies()
    .run()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ provider anomaly cross-reference failed:', err)
      process.exit(1)
    })
}
