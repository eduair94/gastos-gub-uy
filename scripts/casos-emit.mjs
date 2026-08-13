/**
 * Emits the caso data modules from the resolved authoring JSON.
 *
 *   node scripts/casos-emit.mjs <resolved.json>
 *
 * One file per theme under app/server/utils/casos/dossiers/, each exporting a typed
 * `CasoDef[]`. Generated rather than hand-typed because a hundred dossiers in
 * two locales is 1.5MB of literal that no human should be asked to keep
 * comma-correct — but the OUTPUT is the source of truth from here on: it is
 * committed, reviewed and edited by hand afterwards. This script is a
 * one-way authoring aid, not a build step.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const THEME_ORDER = [
  'salud-mental',
  'cancer',
  'defensa',
  'telecomunicaciones',
  'obra-publica',
  'educacion',
  'energia',
  'seguridad',
  'agua',
  'vivienda',
  'transporte',
  'estado-y-fondos',
  'ambiente',
  'deporte-y-cultura',
]

const q = s => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, ' ').replace(/\s+/g, ' ').trim()}'`

function emitStringArray(arr, indent) {
  if (!arr || !arr.length) return null
  return `[${arr.map(q).join(', ')}]`
}

function emitQuery(query, indent) {
  if (!query) return null
  const pad = ' '.repeat(indent)
  const inner = ' '.repeat(indent + 2)
  const parts = []
  for (const key of ['buyerIds', 'buyers', 'suppliers', 'supplierIds', 'categoryId', 'procurementMethodDetails']) {
    if (query[key]?.length) parts.push(`${inner}${key}: [\n${query[key].map(v => `${inner}  ${q(v)},`).join('\n')}\n${inner}],`)
  }
  if (query.search) parts.push(`${inner}search: ${q(query.search)},`)
  for (const key of ['yearFrom', 'yearTo']) {
    if (query[key] != null) parts.push(`${inner}${key}: ${query[key]},`)
  }
  if (!parts.length) return null
  return `{\n${parts.join('\n')}\n${pad}}`
}

function emitText(t, indent) {
  const inner = ' '.repeat(indent + 2)
  const pad = ' '.repeat(indent)
  const rows = ['title', 'dek', 'contexto', 'hallazgo', 'statusNote', 'porQueImporta', 'caveat']
    .filter(k => t[k])
    .map(k => `${inner}${k}: ${q(t[k])},`)
  return `{\n${rows.join('\n')}\n${pad}}`
}

function emitSources(sources, indent) {
  const inner = ' '.repeat(indent + 2)
  const pad = ' '.repeat(indent)
  const rows = sources.map((s) => {
    const bits = [`outlet: ${q(s.outlet)}`, `title: ${q(s.title)}`, `url: ${q(s.url)}`]
    if (s.date) bits.push(`date: ${q(s.date)}`)
    return `${inner}{ ${bits.join(', ')} },`
  })
  return `[\n${rows.join('\n')}\n${pad}]`
}

function emitCaso(c) {
  const lines = []
  lines.push('  {')
  lines.push(`    slug: ${q(c.slug)},`)
  lines.push(`    emoji: ${q(c.emoji)},`)
  lines.push(`    theme: ${q(c.theme)},`)
  if (c.period) lines.push(`    period: ${q(c.period)},`)
  lines.push(`    statusKind: ${q(c.statusKind)},`)
  lines.push(`    status: ${q(c.status)},`)
  if (c.amountReported) lines.push(`    amountReported: ${q(c.amountReported)},`)
  const orgs = emitStringArray(c.organisms, 4)
  lines.push(`    organisms: ${orgs ?? '[]'},`)
  const sup = emitStringArray(c.suppliersNamed ?? c.resolved?.supplierNames ?? c.supplierHints, 4)
  if (sup) lines.push(`    suppliersNamed: ${sup},`)
  lines.push(`    feedCoverage: ${q(c.feedCoverage)},`)
  const query = emitQuery(c.resolved?.query, 4)
  if (query) lines.push(`    query: ${query},`)
  if (c.investigationPath) lines.push(`    investigationPath: ${q(c.investigationPath)},`)
  if (c.related?.length) lines.push(`    related: ${emitStringArray(c.related, 4)},`)
  lines.push(`    sources: ${emitSources(c.sources, 4)},`)
  lines.push(`    es: ${emitText(c.es, 4)},`)
  lines.push(`    en: ${emitText(c.en, 4)},`)
  lines.push('  },')
  return lines.join('\n')
}

const inPath = process.argv[2]
if (!inPath) {
  console.error('usage: node scripts/casos-emit.mjs <resolved.json>')
  process.exit(1)
}

const all = JSON.parse(readFileSync(inPath, 'utf8'))
const root = resolve(process.cwd(), 'app/server/utils/casos/dossiers')

let written = 0
for (const theme of THEME_ORDER) {
  const casos = all.filter(c => c.theme === theme)
  const constName = `CASOS_${theme.toUpperCase().replace(/-/g, '_')}`
  const withQuery = casos.filter(c => c.resolved?.query).length
  const header = [
    `import type { CasoDef } from '../types'`,
    '',
    '/**',
    ` * ${theme} — ${casos.length} dossiers, ${withQuery} of them with a live cross-reference.`,
    ' *',
    ' * Every source URL was fetched and every query was resolved against the live',
    ' * collection before this file was committed (scripts/verify-casos.ts re-checks',
    ' * both). A caso with no `query` is not a gap in the research: its money does',
    ' * not travel through the Compras Estatales feed at all, which `feedCoverage`',
    ' * records and the page states outright.',
    ' */',
    `export const ${constName}: CasoDef[] = [`,
  ].join('\n')

  const body = casos.map(emitCaso).join('\n')
  const file = `${header}\n${body}\n]\n`
  writeFileSync(resolve(root, `${theme}.ts`), file, 'utf8')
  written += casos.length
  console.log(`${theme.padEnd(22)} ${String(casos.length).padStart(3)} casos, ${withQuery} with query`)
}
console.log(`\n${written} casos written across ${THEME_ORDER.length} files.`)
