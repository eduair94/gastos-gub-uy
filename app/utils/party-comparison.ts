/**
 * Party comparison — descriptive aggregation of departmental indicators grouped by
 * the governing party. NOT a performance score.
 *
 * Two lenses, both shown, because neither alone is honest:
 *   - median  : median of the per-department values. Each department counts once,
 *               so it is NEUTRAL to size — Montevideo (37% of the country, always FA)
 *               does not dominate. This is the default lens.
 *   - aggregate: the metric recomputed from the party's SUMMED components — size-
 *               weighted. For spend it is the per-capita figure (Σspend / Σpoblación).
 *
 * The gap between the two lenses is itself informative and is surfaced, not hidden.
 * Confounders (FA governs urban, PN the rural interior; small N per party-year;
 * reporting completeness varies) are shown alongside on the page.
 */
import type { PartyCode } from '#shared/political-mandates'

export interface DeptRow {
  buyerId: string
  year: number
  total: number
  contracts: number
  totalRecords: number
  pricedRecords: number
  directCount: number
  tenderCount: number
  otherMethodCount: number
  methodKnown: number
  top5Share: number | null
  supplierCount: number
  anomalyCountRank3: number
  party: PartyCode | null
  partyLabel: string | null
  partyColor: string | null
  holder: string | null
  termLabel: string | null
  isTransition: boolean
}

export type MetricKey = 'perCapita' | 'directShare' | 'priceCoverage' | 'methodCoverage' | 'top5' | 'anomalyDensity' | 'total'

export interface MetricDef {
  key: MetricKey
  /** How the value formats. */
  format: 'money' | 'pct' | 'per1000'
  /** true = a higher value is "more of the thing" (not a value judgement). */
  higherIsMore: boolean
  /** Needs the census population join (per-capita). */
  needsPopulation?: boolean
}

export const METRICS: Record<MetricKey, MetricDef> = {
  perCapita: { key: 'perCapita', format: 'money', higherIsMore: true, needsPopulation: true },
  total: { key: 'total', format: 'money', higherIsMore: true },
  directShare: { key: 'directShare', format: 'pct', higherIsMore: true },
  priceCoverage: { key: 'priceCoverage', format: 'pct', higherIsMore: true },
  methodCoverage: { key: 'methodCoverage', format: 'pct', higherIsMore: true },
  top5: { key: 'top5', format: 'pct', higherIsMore: true },
  anomalyDensity: { key: 'anomalyDensity', format: 'per1000', higherIsMore: true },
}

export const METRIC_ORDER: MetricKey[] = [
  'perCapita', 'directShare', 'priceCoverage', 'top5', 'anomalyDensity', 'total', 'methodCoverage',
]

/** The value of one metric for one department row. null when undefined for that row. */
export function metricValue(row: DeptRow, key: MetricKey, population?: number | null): number | null {
  switch (key) {
    case 'perCapita': return population && population > 0 ? row.total / population : null
    case 'total': return row.total
    case 'directShare': return row.methodKnown > 0 ? row.directCount / row.methodKnown : null
    case 'priceCoverage': return row.totalRecords > 0 ? row.pricedRecords / row.totalRecords : null
    case 'methodCoverage': return row.totalRecords > 0 ? row.methodKnown / row.totalRecords : null
    case 'top5': return row.top5Share
    case 'anomalyDensity': return row.contracts > 0 ? (row.anomalyCountRank3 / row.contracts) * 1000 : null
    default: return null
  }
}

export function median(xs: number[]): number | null {
  const v = xs.filter(x => Number.isFinite(x)).sort((a, b) => a - b)
  if (!v.length) return null
  const mid = Math.floor(v.length / 2)
  return v.length % 2 ? v[mid]! : (v[mid - 1]! + v[mid]!) / 2
}

export interface PartyAgg {
  party: PartyCode
  partyLabel: string
  partyColor: string
  nDepts: number
  population: number
  /** Median of the per-department metric values (size-neutral). */
  median: number | null
  /** Metric recomputed from summed components (size-weighted). */
  aggregate: number | null
}

/**
 * Aggregate rows (already filtered to one year, or a cumulative set) by party, for a
 * given metric. `popMap` is buyerId → population (census); required for perCapita.
 */
export function aggregateByParty(rows: DeptRow[], key: MetricKey, popMap: Record<string, number>): PartyAgg[] {
  const byParty = new Map<PartyCode, DeptRow[]>()
  for (const r of rows) {
    if (!r.party) continue
    ;(byParty.get(r.party) ?? byParty.set(r.party, []).get(r.party)!).push(r)
  }

  const out: PartyAgg[] = []
  for (const [party, list] of byParty) {
    const pop = (buyerId: string) => popMap[buyerId] ?? 0
    const vals = list.map(r => metricValue(r, key, pop(r.buyerId))).filter((v): v is number => v != null)
    const population = list.reduce((s, r) => s + pop(r.buyerId), 0)

    let aggregate: number | null = null
    const sum = (f: (r: DeptRow) => number) => list.reduce((s, r) => s + f(r), 0)
    switch (key) {
      case 'perCapita': aggregate = population > 0 ? sum(r => r.total) / population : null; break
      case 'total': aggregate = sum(r => r.total); break
      case 'directShare': { const mk = sum(r => r.methodKnown); aggregate = mk > 0 ? sum(r => r.directCount) / mk : null; break }
      case 'priceCoverage': { const tr = sum(r => r.totalRecords); aggregate = tr > 0 ? sum(r => r.pricedRecords) / tr : null; break }
      case 'methodCoverage': { const tr = sum(r => r.totalRecords); aggregate = tr > 0 ? sum(r => r.methodKnown) / tr : null; break }
      case 'top5': { const t = sum(r => r.total); aggregate = t > 0 ? sum(r => (r.top5Share ?? 0) * r.total) / t : null; break } // spend-weighted mean
      case 'anomalyDensity': { const c = sum(r => r.contracts); aggregate = c > 0 ? (sum(r => r.anomalyCountRank3) / c) * 1000 : null; break }
    }

    out.push({
      party,
      partyLabel: list[0]!.partyLabel ?? party,
      partyColor: list[0]!.partyColor ?? '#888',
      nDepts: list.length,
      population,
      median: median(vals),
      aggregate,
    })
  }
  // Stable order: FA, PN, PC, CR.
  const ORDER: PartyCode[] = ['FA', 'PN', 'PC', 'CR']
  return out.sort((a, b) => ORDER.indexOf(a.party) - ORDER.indexOf(b.party))
}
