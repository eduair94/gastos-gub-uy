#!/usr/bin/env tsx

/**
 * Provider × data-load-error cross-reference.
 *
 * The sibling of cross-provider-anomalies.ts, scoped to the LOAD-ERROR bucket instead of the
 * unexplained one. The second-stage AI (score-anomalies-ai.ts) tags a flag `error-carga` or
 * `moneda-erronea` when the extreme unit price is not a real overprice but a data-entry mistake
 * (a quantity of 10.000 where it should be 1, the line total loaded as the unit price, a figure in
 * the wrong currency). Those are NOT corruption — they are bad data to report at the source.
 *
 * This job cross-references those load errors against the providers (and buyers/organisms) behind
 * them so the site can answer "are the same providers or the same organisms making the same load
 * errors over and over" — the exact question /analytics/proveedores-errores-carga asks, mirroring the
 * unexplained-anomaly page.
 *
 * SCOPE. aiVerdict.explainable === 'yes' AND aiVerdict.category ∈ {error-carga, moneda-erronea}
 * (LOAD_ERROR_CATEGORIES) — the same set surfaced at /analytics/errores-carga.
 *
 * GROUPING. Anomalies carry only metadata.supplierName (a string), never the supplier RUT, so
 * grouping is by name. A best-effort RUT is attached only when the name resolves to a single distinct
 * supplier_patterns id (usually it does not — the same name maps to several id-scheme variants — so
 * `supplierId` is normally absent and the page links back to the errores-carga alerts by name).
 *
 * DISTORTION (stored in the `overprice*` fields for shape-parity with provider_anomaly_stats) is an
 * estimate of how much the bad record inflated the reported figure: per flag,
 * max(0, detectedValue - expectedRange.max) * quantity, accumulated PER CURRENCY (UYU and USD are
 * never summed together), then re-expressed in today's pesos. It is a DATA-QUALITY magnitude, not
 * money the provider billed — the page renders it in celeste, never gold.
 *
 * SWAP. Writes the new dataVersion (stats upserted by unique supplierName, a fresh summary doc
 * inserted), then deletes every older version — a reader never sees a half-built set. Runs every 24h
 * from the cronserver; the load-error set is small (~1k), so this is a light job (seconds), but it
 * still raises the socket timeout defensively like the others.
 */

import { connectToDatabase } from '../../shared/connection/database'
import {
  AnomalyModel,
  ExchangeRateModel,
  ProviderLoadErrorStatsModel,
  ProviderLoadErrorSummaryModel,
  ReleaseModel,
  SupplierPatternModel,
} from '../../shared/models'
import type {
  ILoadErrorOverpriceEntry,
  IProviderLoadErrorStats,
  IProviderLoadErrorSummary,
} from '../../shared/models'
import { LOAD_ERROR_CATEGORIES } from '../../shared/utils/anomaly-categories'
import type { RateTable } from '../../shared/utils/real-value'
import { toTodayUyu } from '../../shared/utils/real-value'
import { Logger } from '../services/logger-service'

/** The canonical "load error" marker: the second-stage AI classified the extreme price as a
 *  data-entry mistake (wrong quantity/decimals or wrong currency), not a real overprice. */
const LOAD_ERROR = {
  'aiVerdict.explainable': 'yes',
  'aiVerdict.category': { $in: LOAD_ERROR_CATEGORIES as unknown as string[] },
} as const
const BULK_BATCH = 500
const TOP_BUYERS_PER_PROVIDER = 8
const TOP_RUBROS_PER_PROVIDER = 6
const SUMMARY_TOP_PAIRS = 20
const SUMMARY_TOP_BUYERS = 15
const SUMMARY_TOP_PROVIDERS = 12

/**
 * Per-flag distortion plausibility ceiling, in the flag's own currency.
 *
 * distortion = (paid - rangeTop) * quantity, and a load error is exactly the kind of record that
 * carries a malformed quantity or a shifted decimal, so a handful of flags produce astronomical raw
 * values. Left unchecked one artifact dominates every total and the distortion sort. Cap each flag's
 * contribution at the same plausibility ceiling the unexplained cross-reference uses, so one bad
 * record can't dominate.
 */
const OVERPRICE_CEILING: Record<string, number> = {
  UYU: Number(process.env.LOAD_ERROR_DISTORTION_CEILING_UYU ?? 100_000_000),
}
const OVERPRICE_CEILING_DEFAULT = Number(process.env.LOAD_ERROR_DISTORTION_CEILING_OTHER ?? 2_500_000)
function overpriceCeiling(currency: string): number {
  return OVERPRICE_CEILING[currency] ?? OVERPRICE_CEILING_DEFAULT
}

/** Ceiling for the comparable UYU-today distortion — the same plausibility guard applied to the
 *  converted figure, so one bogus-quantity flag can't dominate the totals or the sort. */
const UYU_TODAY_CEILING = Number(process.env.LOAD_ERROR_DISTORTION_UYU_TODAY_CEILING ?? 150_000_000)

/** Raw per-flag distortion in the flag's own currency (unclamped) — the basis for the UYU-today value. */
function rawOverpriceOf(a: any): number {
  const paid = a?.detectedValue
  const hi = a?.expectedRange?.max
  if (!Number.isFinite(paid) || !Number.isFinite(hi)) return 0
  const qty = Number.isFinite(a?.metadata?.itemQuantity) && a.metadata.itemQuantity > 0 ? a.metadata.itemQuantity : 1
  return Math.max(0, paid - hi) * qty
}

/** Per-flag distortion in the flag's own currency, clamped to the plausibility ceiling. Returns the
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
/** The load-error type (error-carga / moneda-erronea) the AI assigned. */
function categoryOf(a: any): string | null {
  const c = a?.aiVerdict?.category
  return typeof c === 'string' && c ? c : null
}

interface ProviderAcc {
  supplierName: string
  flagCount: number
  overprice: Map<string, number>
  overpriceUyuToday: number
  curCounts: Map<string, number>
  worstZ: number
  confSum: number
  confN: number
  rubros: Map<string, number>
  categories: Map<string, number>
  buyers: Map<string, number>
  currencies: Set<string>
  years: Set<number>
}

export class CrossProviderLoadErrors {
  private logger = new Logger()
  private dataVersion = `v${Date.now()}`

  private providers = new Map<string, ProviderAcc>()
  private pairAgg = new Map<string, number>()
  private buyerAgg = new Map<string, { count: number, providers: Set<string> }>()
  private rubroTotals = new Map<string, number>()
  private categoryTotals = new Map<string, number>()
  private yearTotals = new Map<number, number>()
  private overpriceTotals = new Map<string, number>()
  private overpriceUyuTodayTotal = 0
  private flagTotal = 0
  private clampedFlags = 0

  private accFor(name: string): ProviderAcc {
    let a = this.providers.get(name)
    if (!a) {
      a = {
        supplierName: name,
        flagCount: 0,
        overprice: new Map(),
        overpriceUyuToday: 0,
        curCounts: new Map(),
        worstZ: 0,
        confSum: 0,
        confN: 0,
        rubros: new Map(),
        categories: new Map(),
        buyers: new Map(),
        currencies: new Set(),
        years: new Set(),
      }
      this.providers.set(name, a)
    }
    return a
  }

  /** Monthly BCU table (usd/eur + Unidad Indexada) → a RateTable for toTodayUyu. Mirrors the web
   *  app's app/server/utils/rates.ts, which the job can't import (it lives under app/). */
  private async loadRates(): Promise<RateTable> {
    const rows: any[] = await ExchangeRateModel.find().select('month usd eur ui').lean()
    const byMonth: RateTable['byMonth'] = {}
    let latestMonth = ''
    let latestUi: number | null = null
    for (const r of rows) {
      byMonth[r.month] = { usd: r.usd, eur: r.eur, ui: r.ui }
      if (r.ui && r.month > latestMonth) { latestMonth = r.month; latestUi = r.ui }
    }
    return { byMonth, latestUi }
  }

  /** Load the load-error flags, join their contract dates, and fold them into the accumulators.
   *  Small set (~1k), so it loads into memory rather than streaming — that lets us batch the
   *  release-date and exchange-rate lookups the UYU-today conversion needs. */
  async build(): Promise<void> {
    const flags: any[] = await AnomalyModel.find(LOAD_ERROR)
      .select('releaseId detectedValue expectedRange currency metadata.supplierName metadata.buyerName metadata.itemClassification metadata.itemQuantity metadata.currency metadata.zScore metadata.year sourceYear aiVerdict.confidence aiVerdict.category')
      .lean()

    // Contract dates (release.date) for the FX month + inflation base, keyed by releaseId.
    const releaseIds = [...new Set(flags.map(f => f.releaseId).filter(Boolean))]
    const dateByRelease = new Map<string, string | Date>()
    const RCHUNK = 5000
    for (let i = 0; i < releaseIds.length; i += RCHUNK) {
      const rows: any[] = await ReleaseModel.find({ id: { $in: releaseIds.slice(i, i + RCHUNK) } }).select('id date').lean()
      for (const r of rows) if (r.date) dateByRelease.set(r.id, r.date)
    }
    const rates = await this.loadRates()
    let noRate = 0

    for (const a of flags) {
      this.flagTotal++
      const name = ((a?.metadata?.supplierName ?? '') as string).trim() || '—'
      const buyer = ((a?.metadata?.buyerName ?? '') as string).trim() || '—'
      const c = currencyOf(a)
      const { value: op } = overpriceOf(a, c)
      const z = Number.isFinite(a?.metadata?.zScore) ? a.metadata.zScore : 0
      const conf = Number.isFinite(a?.aiVerdict?.confidence) ? a.aiVerdict.confidence : null
      const rubro = rubroOf(a)
      const category = categoryOf(a)
      const year = Number(a?.sourceYear ?? a?.metadata?.year)

      // Comparable distortion in TODAY's pesos: convert the raw distortion at the contract month's
      // rate, inflation-adjust via the UI, then clamp. Fallback: a UYU flag with no UI keeps its
      // nominal value; a foreign flag we can't convert contributes 0 (rare) rather than a wrong peso.
      const raw = rawOverpriceOf(a)
      const date = dateByRelease.get(a.releaseId)
      let uyuToday = toTodayUyu(raw, c, date ?? null, rates)
      if (uyuToday === null) { noRate++; uyuToday = c === 'UYU' ? Math.min(raw, UYU_TODAY_CEILING) : 0 }
      if (uyuToday > UYU_TODAY_CEILING) { this.clampedFlags++; uyuToday = UYU_TODAY_CEILING }

      const p = this.accFor(name)
      p.flagCount++
      p.overprice.set(c, (p.overprice.get(c) ?? 0) + op)
      p.overpriceUyuToday += uyuToday
      p.curCounts.set(c, (p.curCounts.get(c) ?? 0) + 1)
      p.worstZ = Math.max(p.worstZ, z)
      if (conf !== null) { p.confSum += conf; p.confN++ }
      p.rubros.set(rubro, (p.rubros.get(rubro) ?? 0) + 1)
      if (category) p.categories.set(category, (p.categories.get(category) ?? 0) + 1)
      p.buyers.set(buyer, (p.buyers.get(buyer) ?? 0) + 1)
      p.currencies.add(c)
      if (Number.isFinite(year)) p.years.add(year)

      // Global rollups for the summary.
      this.overpriceUyuTodayTotal += uyuToday
      this.pairAgg.set(`${name}||${buyer}`, (this.pairAgg.get(`${name}||${buyer}`) ?? 0) + 1)
      const b = this.buyerAgg.get(buyer) ?? { count: 0, providers: new Set<string>() }
      b.count++; b.providers.add(name); this.buyerAgg.set(buyer, b)
      this.rubroTotals.set(rubro, (this.rubroTotals.get(rubro) ?? 0) + 1)
      if (category) this.categoryTotals.set(category, (this.categoryTotals.get(category) ?? 0) + 1)
      if (Number.isFinite(year)) this.yearTotals.set(year, (this.yearTotals.get(year) ?? 0) + 1)
      this.overpriceTotals.set(c, (this.overpriceTotals.get(c) ?? 0) + op)
    }
    this.logger.info(`  scanned ${this.flagTotal} load-error flags across ${this.providers.size} providers (${noRate} without a usable FX/UI rate)`)
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

  toStatsDocs(ruts: Map<string, string>): IProviderLoadErrorStats[] {
    const now = new Date()
    const docs: IProviderLoadErrorStats[] = []
    for (const p of this.providers.values()) {
      const overprice: ILoadErrorOverpriceEntry[] = [...p.overprice.entries()]
        .map(([currency, amount]) => ({ currency, amount }))
        .sort((a, b) => b.amount - a.amount)
      // Primary currency = the one carrying the most flags (ties -> larger distortion).
      const primaryCurrency = [...p.curCounts.entries()]
        .sort((a, b) => b[1] - a[1] || (p.overprice.get(b[0]) ?? 0) - (p.overprice.get(a[0]) ?? 0))[0]?.[0] ?? 'UYU'
      const buyers = [...p.buyers.entries()]
        .map(([buyerName, count]) => ({ buyerName, count }))
        .sort((a, b) => b.count - a.count)
      const rubros = [...p.rubros.entries()]
        .map(([rubro, count]) => ({ rubro, count }))
        .sort((a, b) => b.count - a.count)
      const categories = [...p.categories.entries()]
        .map(([category, count]) => ({ category, count }))
        .sort((a, b) => b.count - a.count)
      const years = [...p.years].sort((a, b) => a - b)
      docs.push({
        supplierName: p.supplierName,
        supplierId: ruts.get(p.supplierName),
        flagCount: p.flagCount,
        overprice,
        overpriceUyuToday: Math.round(p.overpriceUyuToday),
        primaryCurrency,
        primaryOverprice: p.overprice.get(primaryCurrency) ?? 0,
        worstZ: Math.round(p.worstZ),
        avgConfidence: p.confN ? +(p.confSum / p.confN).toFixed(3) : null,
        rubros: rubros.slice(0, TOP_RUBROS_PER_PROVIDER),
        categories,
        topCategory: categories[0]?.category,
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

  toSummaryDoc(): IProviderLoadErrorSummary {
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
      overpriceUyuTodayTotal: Math.round(this.overpriceUyuTodayTotal),
      overpriceTotals: [...this.overpriceTotals.entries()].map(([currency, amount]) => ({ currency, amount })).sort((a, b) => b.amount - a.amount),
      rubroTotals: [...this.rubroTotals.entries()].map(([rubro, count]) => ({ rubro, count })).sort((a, b) => b.count - a.count),
      categoryTotals: [...this.categoryTotals.entries()].map(([category, count]) => ({ category, count })).sort((a, b) => b.count - a.count),
      yearTotals: [...this.yearTotals.entries()].map(([year, count]) => ({ year, count })).sort((a, b) => a.year - b.year),
      topProviders,
      topPairs,
      topBuyers,
      dataVersion: this.dataVersion,
      calculatedAt: new Date(),
    }
  }

  async save(stats: IProviderLoadErrorStats[], summary: IProviderLoadErrorSummary): Promise<void> {
    // Upsert stats by unique supplierName (compute-then-swap: previous docs still present), then
    // sweep older versions — never a window where the collection is empty.
    for (let i = 0; i < stats.length; i += BULK_BATCH) {
      const ops = stats.slice(i, i + BULK_BATCH).map(doc => ({
        replaceOne: { filter: { supplierName: doc.supplierName }, replacement: doc, upsert: true },
      }))
      if (ops.length) await ProviderLoadErrorStatsModel.bulkWrite(ops, { ordered: false })
    }
    const sweptStats = await ProviderLoadErrorStatsModel.deleteMany({ dataVersion: { $ne: this.dataVersion } })
    // Fresh summary doc, then drop the previous ones.
    await ProviderLoadErrorSummaryModel.create(summary)
    const sweptSum = await ProviderLoadErrorSummaryModel.deleteMany({ dataVersion: { $ne: this.dataVersion } })
    this.logger.info(`  wrote ${stats.length} provider docs + summary; swept ${sweptStats.deletedCount} stale stats, ${sweptSum.deletedCount} stale summaries`)
  }

  async run(): Promise<void> {
    const started = Date.now()
    if (!process.env.MONGO_SOCKET_TIMEOUT_MS) {
      process.env.MONGO_SOCKET_TIMEOUT_MS = String(10 * 60 * 1000)
    }
    this.logger.info('Cross-referencing data-load errors by provider...')
    await connectToDatabase()
    await this.build()
    const ruts = await this.resolveRuts()
    const stats = this.toStatsDocs(ruts)
    const summary = this.toSummaryDoc()
    await this.save(stats, summary)
    this.logger.info(`Provider load-error cross-reference rebuilt: ${stats.length} providers, ${summary.flagTotal} flags in ${((Date.now() - started) / 1000).toFixed(1)}s`)
  }
}

if (require.main === module) {
  new CrossProviderLoadErrors()
    .run()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ provider load-error cross-reference failed:', err)
      process.exit(1)
    })
}
