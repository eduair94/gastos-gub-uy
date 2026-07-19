#!/usr/bin/env tsx
/**
 * Monthly precompute of per-department procurement indicators for the party
 * comparison page (/analytics/partidos). One document per (buyer.id, year) for the
 * 19 Intendencias (80-1 … 98-1), written to `dept_indicators` via
 * compute-then-swap-by-dataVersion.
 *
 * Three read-only aggregations (buyer.id is unindexed on releases, so each is a
 * COLLSCAN scoped to the 19 dept ids with allowDiskUse — acceptable once a month,
 * NEVER on a request path):
 *   A. counts — records, priced/total, and the procurement-method mix
 *   B. suppliers — per-supplier spend → top-5 concentration share (an UPPER BOUND:
 *      the release amount is not apportioned per supplier, so unwinding double-counts)
 *   C. anomalies — severityRank>=3 flags joined releaseId → releases.buyer.id/sourceYear
 *
 * These are DESCRIPTIVE indicators. The page groups them by the governing party as
 * context, never as a party performance score. See shared/political-mandates.ts.
 *
 * Scheduled monthly by cronserver.ts; run manually with `npm run refresh-dept-indicators`.
 */
import { connectToDatabase } from '../../shared/connection/database'
import { AnomalyModel, DeptIndicatorModel, ReleaseModel } from '../../shared/models'
import type { IDeptIndicatorYear } from '../../shared/models'
import { methodClass } from '../../shared/procurement-method'

const CORRUPT_CEIL = 5e10 // same cap as intendencias.get.ts / refresh-organism-groups
const ANOMALY_MIN_RANK = 3 // the triage floor (high + critical)
const INTENDENCIA_IDS = Array.from({ length: 19 }, (_, i) => `${80 + i}-1`)

interface CountRow { _id: { b: string, y: number, m: string | null }, recs: number, priced: number, total: number }
interface SupplierRow { _id: { b: string, y: number, s: string | null }, spend: number }
interface AnomalyRow { _id: { b: string, y: number }, count: number }

async function run(): Promise<void> {
  const started = Date.now()
  if (!process.env.MONGO_SOCKET_TIMEOUT_MS) {
    process.env.MONGO_SOCKET_TIMEOUT_MS = String(15 * 60 * 1000)
  }
  const dataVersion = `v${Date.now()}`
  console.log('[dept-indicators] connecting…')
  await connectToDatabase()

  const pricedCapped = {
    $and: [
      { $gt: ['$amount.primaryAmount', 0] },
      { $lte: ['$amount.primaryAmount', CORRUPT_CEIL] },
    ],
  }

  // ---- A. counts + method mix (over ALL records; price is a cond) ----
  console.log('[dept-indicators] A: counts + method mix…')
  const counts: CountRow[] = await ReleaseModel.aggregate([
    { $match: { 'buyer.id': { $in: INTENDENCIA_IDS }, 'sourceYear': { $gt: 0 } } },
    {
      $group: {
        _id: { b: '$buyer.id', y: '$sourceYear', m: '$tender.procurementMethodDetails' },
        recs: { $sum: 1 },
        priced: { $sum: { $cond: [pricedCapped, 1, 0] } },
        total: { $sum: { $cond: [pricedCapped, '$amount.primaryAmount', 0] } },
      },
    },
  ]).option({ allowDiskUse: true })

  // ---- B. supplier concentration (priced only; unwound = upper bound) ----
  console.log('[dept-indicators] B: supplier concentration…')
  const suppliers: SupplierRow[] = await ReleaseModel.aggregate([
    {
      $match: {
        'buyer.id': { $in: INTENDENCIA_IDS },
        'sourceYear': { $gt: 0 },
        'amount.primaryAmount': { $gt: 0, $lte: CORRUPT_CEIL },
      },
    },
    { $unwind: '$awards' },
    { $unwind: '$awards.suppliers' },
    {
      $group: {
        _id: { b: '$buyer.id', y: '$sourceYear', s: '$awards.suppliers.name' },
        spend: { $sum: '$amount.primaryAmount' },
      },
    },
  ]).option({ allowDiskUse: true })

  // ---- C. anomaly density (rank>=3), joined to the release's dept + year ----
  console.log('[dept-indicators] C: anomaly density…')
  const anomalies: AnomalyRow[] = await AnomalyModel.aggregate([
    { $match: { severityRank: { $gte: ANOMALY_MIN_RANK } } },
    { $lookup: { from: 'releases', localField: 'releaseId', foreignField: 'id', as: 'rel' } },
    { $unwind: '$rel' },
    { $match: { 'rel.buyer.id': { $in: INTENDENCIA_IDS } } },
    { $group: { _id: { b: '$rel.buyer.id', y: '$rel.sourceYear' }, count: { $sum: 1 } } },
  ]).option({ allowDiskUse: true })

  // ---- Fold into per (buyerId, year) docs ----
  const key = (b: string, y: number) => `${b}|${y}`
  const acc = new Map<string, IDeptIndicatorYear>()
  const ensure = (b: string, y: number): IDeptIndicatorYear => {
    const k = key(b, y)
    let d = acc.get(k)
    if (!d) {
      d = {
        buyerId: b, year: y,
        total: 0, contracts: 0, totalRecords: 0, pricedRecords: 0,
        directCount: 0, tenderCount: 0, otherMethodCount: 0, methodKnown: 0,
        top5Share: null, supplierCount: 0, anomalyCountRank3: 0,
        dataVersion, calculatedAt: new Date(),
      }
      acc.set(k, d)
    }
    return d
  }

  // A → volume, price, method
  for (const r of counts) {
    const d = ensure(r._id.b, r._id.y)
    d.totalRecords += r.recs
    d.pricedRecords += r.priced
    d.contracts += r.priced
    d.total += r.total
    const cls = methodClass(r._id.m)
    if (cls === 'direct') d.directCount += r.recs
    else if (cls === 'tender') d.tenderCount += r.recs
    else if (cls === 'other') d.otherMethodCount += r.recs
    if (cls !== 'unknown') d.methodKnown += r.recs
  }

  // B → top-5 supplier share (share of the unwound supplier-spend basis)
  const supByDeptYear = new Map<string, { total: number, spends: number[], count: number }>()
  for (const r of suppliers) {
    if (!r._id.s) continue // skip nameless supplier rows
    const k = key(r._id.b, r._id.y)
    const g = supByDeptYear.get(k) ?? { total: 0, spends: [], count: 0 }
    g.total += r.spend
    g.spends.push(r.spend)
    g.count += 1
    supByDeptYear.set(k, g)
  }
  for (const [k, g] of supByDeptYear) {
    const [b, yStr] = k.split('|')
    const d = ensure(b, Number(yStr))
    const top5 = g.spends.sort((a, z) => z - a).slice(0, 5).reduce((s, v) => s + v, 0)
    d.top5Share = g.total > 0 ? Math.min(1, top5 / g.total) : null
    d.supplierCount = g.count
  }

  // C → anomaly count
  for (const r of anomalies) {
    if (!r._id.y || r._id.y <= 0) continue
    const d = ensure(r._id.b, r._id.y)
    d.anomalyCountRank3 += r.count
  }

  const docs = [...acc.values()].filter(d => d.totalRecords > 0)

  console.log(`[dept-indicators] writing ${docs.length} dept×year docs…`)
  for (const doc of docs) {
    await DeptIndicatorModel.replaceOne({ buyerId: doc.buyerId, year: doc.year }, doc, { upsert: true })
  }
  const swept = await DeptIndicatorModel.deleteMany({ dataVersion: { $ne: dataVersion } })

  const depts = new Set(docs.map(d => d.buyerId)).size
  const years = docs.length ? `${Math.min(...docs.map(d => d.year))}–${Math.max(...docs.map(d => d.year))}` : '—'
  const anomTotal = docs.reduce((s, d) => s + d.anomalyCountRank3, 0)
  console.log(`[dept-indicators] done in ${((Date.now() - started) / 1000).toFixed(1)}s — ${docs.length} docs, ${depts} depts, years ${years}, ${anomTotal} rank≥3 flags (swept ${swept.deletedCount} stale).`)
}

if (require.main === module) {
  run()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[dept-indicators] failed:', err)
      process.exit(1)
    })
}

export { run }
