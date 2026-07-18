#!/usr/bin/env tsx
/**
 * Monthly precompute of the organism-group spending rollups.
 *
 * Reads `releases`, aggregates capped spend per buyer.id (+ per buyer.id per year),
 * folds them into the ORGANISM_GROUPS taxonomy (Intendencias, Ministerios, Salud,
 * Entes, Educación), and writes one document per group into `organism_group_stats`
 * using compute-then-swap-by-dataVersion so a reader never sees an empty collection.
 *
 * Scheduled monthly by cronserver.ts ("0 3 1 * *", America/Montevideo); run manually
 * with `npm run refresh-organism-groups`. Read-only over `releases`; writes only its
 * own collection, so it uses an independent guard (not busyWith).
 *
 * Cap: single releases above CORRUPT_CEIL are data artefacts (one IM release reports
 * ~1.8e11 UYU); excluded from sums and counted in `excludedRecords`. Legit large
 * public works stay in. Same rule as app/server/api/analytics/intendencias.get.ts.
 */
import { connectToDatabase } from '../../shared/connection/database'
import { OrganismGroupStatsModel, ReleaseModel } from '../../shared/models'
import type { IOrganismGroupStats, IOrganismMemberStat, IOrganismYearStat } from '../../shared/models'
import { ORGANISM_GROUPS, memberMatchesBuyerId } from '../../shared/organism-groups'

const CORRUPT_CEIL = 5e10

interface PerBuyer {
  _id: string
  total: number
  contracts: number
  excluded: number
  minYear: number | null
  maxYear: number | null
}
interface PerBuyerYear {
  _id: { b: string, y: number }
  total: number
  contracts: number
}

async function run(): Promise<void> {
  const started = Date.now()
  if (!process.env.MONGO_SOCKET_TIMEOUT_MS) {
    process.env.MONGO_SOCKET_TIMEOUT_MS = String(15 * 60 * 1000)
  }
  const dataVersion = `v${Date.now()}`
  console.log('[organism-groups] connecting…')
  await connectToDatabase()

  const pricedCapped = {
    $and: [
      { $gt: ['$amount.primaryAmount', 0] },
      { $lte: ['$amount.primaryAmount', CORRUPT_CEIL] },
    ],
  }

  console.log('[organism-groups] aggregating per buyer…')
  const perBuyer: PerBuyer[] = await ReleaseModel.aggregate([
    { $match: { 'buyer.id': { $exists: true, $ne: null } } },
    {
      $group: {
        _id: '$buyer.id',
        total: { $sum: { $cond: [pricedCapped, '$amount.primaryAmount', 0] } },
        contracts: { $sum: { $cond: [pricedCapped, 1, 0] } },
        excluded: { $sum: { $cond: [{ $gt: ['$amount.primaryAmount', CORRUPT_CEIL] }, 1, 0] } },
        minYear: { $min: '$sourceYear' },
        maxYear: { $max: '$sourceYear' },
      },
    },
  ]).option({ allowDiskUse: true })

  console.log('[organism-groups] aggregating per buyer × year…')
  const perBuyerYear: PerBuyerYear[] = await ReleaseModel.aggregate([
    {
      $match: {
        'buyer.id': { $exists: true, $ne: null },
        'amount.primaryAmount': { $gt: 0, $lte: CORRUPT_CEIL },
        'sourceYear': { $gt: 0 },
      },
    },
    { $group: { _id: { b: '$buyer.id', y: '$sourceYear' }, total: { $sum: '$amount.primaryAmount' }, contracts: { $sum: 1 } } },
  ]).option({ allowDiskUse: true })

  const byBuyer = new Map<string, PerBuyer>()
  for (const r of perBuyer) byBuyer.set(r._id, r)

  const docs: IOrganismGroupStats[] = ORGANISM_GROUPS.map((group) => {
    // Which buyer.ids belong to this group (for the by-year rollup).
    const groupBuyerIds = new Set<string>()

    const members: IOrganismMemberStat[] = group.members.map((m) => {
      const matched = perBuyer.filter(r => memberMatchesBuyerId(m, r._id))
      const matchedIds = new Set(matched.map(r => r._id))
      matched.forEach(r => groupBuyerIds.add(r._id))
      const total = matched.reduce((s, r) => s + r.total, 0)
      const contracts = matched.reduce((s, r) => s + r.contracts, 0)
      const excludedRecords = matched.reduce((s, r) => s + r.excluded, 0)
      const years = matched.flatMap(r => [r.minYear, r.maxYear]).filter((y): y is number => typeof y === 'number' && y > 0)

      // Per-member interannual series: fold every matched buyer.id's per-year rows
      // together (a ministry spans many unidades ejecutoras; an Intendencia is one id).
      const memberYearMap = new Map<number, IOrganismYearStat>()
      for (const r of perBuyerYear) {
        if (!matchedIds.has(r._id.b)) continue
        const y = memberYearMap.get(r._id.y) ?? { year: r._id.y, total: 0, contracts: 0 }
        y.total += r.total
        y.contracts += r.contracts
        memberYearMap.set(r._id.y, y)
      }
      const memberByYear = [...memberYearMap.values()].sort((a, b) => a.year - b.year)

      return {
        key: m.key,
        label: m.label,
        // Omit (not `undefined`) when absent — the model's optional fields are
        // exact (exactOptionalPropertyTypes), so a literal `undefined` is a type error.
        ...(m.buyerId ? { buyerId: m.buyerId } : {}),
        ...(m.inciso ? { inciso: m.inciso } : {}),
        total,
        contracts,
        minYear: years.length ? Math.min(...years) : null,
        maxYear: years.length ? Math.max(...years) : null,
        excludedRecords,
        byYear: memberByYear,
      }
    })

    // By-year over every buyer.id in the group.
    const yearMap = new Map<number, IOrganismYearStat>()
    for (const r of perBuyerYear) {
      if (!groupBuyerIds.has(r._id.b)) continue
      const y = yearMap.get(r._id.y) ?? { year: r._id.y, total: 0, contracts: 0 }
      y.total += r.total
      y.contracts += r.contracts
      yearMap.set(r._id.y, y)
    }
    const byYear = [...yearMap.values()].sort((a, b) => a.year - b.year)

    const total = members.reduce((s, m) => s + m.total, 0)
    const contracts = members.reduce((s, m) => s + m.contracts, 0)
    const excludedRecords = members.reduce((s, m) => s + m.excludedRecords, 0)

    return {
      groupKey: group.key,
      label: group.label,
      labelEn: group.labelEn,
      metric: group.metric,
      blurbEs: group.blurbEs,
      blurbEn: group.blurbEn,
      members: members.sort((a, b) => b.total - a.total),
      byYear,
      total,
      contracts,
      memberCount: members.filter(m => m.contracts > 0).length,
      cap: CORRUPT_CEIL,
      excludedRecords,
      dataVersion,
      calculatedAt: new Date(),
    }
  })

  console.log('[organism-groups] writing…')
  for (const doc of docs) {
    await OrganismGroupStatsModel.replaceOne({ groupKey: doc.groupKey }, doc, { upsert: true })
  }
  const swept = await OrganismGroupStatsModel.deleteMany({ dataVersion: { $ne: dataVersion } })

  const summary = docs.map(d => `${d.groupKey}: ${d.memberCount} miembros, $${Math.round(d.total / 1e6)}M`).join(' · ')
  console.log(`[organism-groups] done in ${((Date.now() - started) / 1000).toFixed(1)}s — ${docs.length} groups (swept ${swept.deletedCount} stale). ${summary}`)
}

if (require.main === module) {
  run()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[organism-groups] failed:', err)
      process.exit(1)
    })
}

export { run }
