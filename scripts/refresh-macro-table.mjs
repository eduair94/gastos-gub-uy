#!/usr/bin/env node
/**
 * Regenerates shared/macro-uruguay.ts from the World Bank open API.
 *
 * The procurement feed says nothing about the size of the economy, the size of
 * the whole public budget or the population — but a spending series is
 * meaningless without them. Rather than call an external API on the request
 * path (or on every job run), the three series are baked into a committed TS
 * file so the numbers are auditable in git and the page has no runtime
 * dependency on a foreign host.
 *
 * Run: `npm run refresh-macro-table` (once a year, or when the WB revises).
 */
import { writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = process.argv[2] ?? resolve(HERE, '../shared/macro-uruguay.ts')

const INDICATORS = {
  gdpNominalUyu: 'NY.GDP.MKTP.CN',
  population: 'SP.POP.TOTL',
  centralGovExpensePctGdp: 'GC.XPN.TOTL.GD.ZS',
}

const rows = {}
let lastUpdated = null

for (const [key, code] of Object.entries(INDICATORS)) {
  const url = `https://api.worldbank.org/v2/country/URY/indicator/${code}?format=json&per_page=200&date=2000:2030`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`World Bank ${code} -> HTTP ${res.status}`)
  const [meta, data] = await res.json()
  if (!Array.isArray(data)) throw new Error(`World Bank ${code} returned no observations`)
  lastUpdated = meta?.lastupdated ?? lastUpdated
  for (const d of data) {
    const year = Number(d.date)
    if (!Number.isFinite(year)) continue
    rows[year] ??= { year }
    rows[year][key] = d.value ?? null
  }
  const filled = data.filter(d => d.value !== null).length
  console.log(`  ${code}: ${filled}/${data.length} observations`)
}

const years = Object.keys(rows).map(Number).sort((a, b) => a - b)
const lit = v => (v === null || v === undefined ? 'null' : String(v))

const body = years.map((y) => {
  const r = rows[y]
  const gdp = r.gdpNominalUyu ?? null
  const pct = r.centralGovExpensePctGdp ?? null
  const derived = gdp !== null && pct !== null ? Math.round((gdp * pct) / 100) : null
  return `  { year: ${y}, gdpNominalUyu: ${lit(gdp)}, population: ${lit(r.population ?? null)}, `
    + `centralGovExpensePctGdp: ${lit(pct)}, centralGovExpenseUyu: ${lit(derived)} },`
}).join('\n')

const file = `/**
 * Uruguay macro context for the year-over-year spending analysis.
 *
 * Public procurement is one slice of what the State spends — not the budget.
 * To say whether spending "grew", the slice has to be read against the size of
 * the economy, the size of the whole public budget and the number of people it
 * serves. None of that is in the OCDS feed, so it lives here as a curated
 * table, committed so every figure is auditable in git history.
 *
 * Source: World Bank Open Data, which republishes BCU national accounts, INE
 * population and IMF Government Finance Statistics.
 *
 * \`centralGovExpenseUyu\` is DERIVED (gdpNominalUyu x pct / 100) — the World
 * Bank publishes the ratio, not the level. A \`null\` means there is no
 * observation for that year; consumers show "sin dato" rather than
 * interpolating.
 *
 * GENERATED FILE — run \`npm run refresh-macro-table\`, do not hand-edit.
 * World Bank series lastUpdated at generation: ${lastUpdated ?? 'unknown'}.
 */

export interface MacroYear {
  year: number
  /** GDP at current prices, UYU. World Bank NY.GDP.MKTP.CN. */
  gdpNominalUyu: number | null
  /** Total population. World Bank SP.POP.TOTL. */
  population: number | null
  /** Central-government expense as % of GDP. World Bank GC.XPN.TOTL.GD.ZS. */
  centralGovExpensePctGdp: number | null
  /** Derived: gdpNominalUyu x centralGovExpensePctGdp / 100, UYU. */
  centralGovExpenseUyu: number | null
}

export const MACRO_SOURCE = {
  name: 'World Bank Open Data',
  url: 'https://data.worldbank.org/country/uruguay',
  indicators: {
    gdpNominalUyu: 'https://data.worldbank.org/indicator/NY.GDP.MKTP.CN?locations=UY',
    population: 'https://data.worldbank.org/indicator/SP.POP.TOTL?locations=UY',
    centralGovExpensePctGdp: 'https://data.worldbank.org/indicator/GC.XPN.TOTL.GD.ZS?locations=UY',
  },
  lastUpdated: '${lastUpdated ?? ''}',
} as const

export const MACRO_URUGUAY: MacroYear[] = [
${body}
]

const BY_YEAR = new Map(MACRO_URUGUAY.map(m => [m.year, m]))

/** Macro row for a year, or null when the year is outside the published series. */
export function macroForYear(year: number): MacroYear | null {
  return BY_YEAR.get(year) ?? null
}
`

writeFileSync(OUT, file)
console.log(`\nWrote ${OUT} — ${years.length} years (${years[0]}-${years[years.length - 1]}).`)
