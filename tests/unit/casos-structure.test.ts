/**
 * The caso collection's editorial contract, enforced.
 *
 * These dossiers make attributed claims about named public bodies and named
 * companies, so the rules that keep them publishable are not style preferences
 * — they are the difference between data journalism and a rumour with a logo.
 * This file is pure (no DB, no network) so it runs in `npm test`;
 * scripts/verify-casos.ts does the live half (every URL fetched, every query
 * resolved).
 *
 *   npx tsx tests/unit/casos-structure.test.ts
 */
import { CASO_THEMES, listCasoDefs } from '../../app/server/utils/casos'
import type { CasoDef } from '../../app/server/utils/casos'

const STATUSES = new Set([
  'condena', 'procesamiento', 'formalizacion', 'imputacion', 'juicio', 'investigacion',
  'denuncia', 'absolucion', 'archivo', 'rescision', 'auditoria', 'sobrecosto',
  'inconcluso', 'en-ejecucion', 'terminado', 'debate', 'sin-resolver',
])
const KINDS = new Set(['judicial', 'auditoria', 'gestion', 'debate'])
const COVERAGE = new Set(['likely', 'partial', 'unlikely'])
const THEME_KEYS = new Set(CASO_THEMES.map(t => t.key))

/** Words that would state a verdict this site has no standing to state. */
const VERDICT_WORDS = [
  /\bes culpable\b/i,
  /\bcometi[óo] (?:el )?delito\b/i,
  /\brob[óo] (?:el|los|la|las) (?:dinero|fondos|plata)\b/i,
  /\bqued[óo] demostrado que rob/i,
]

const failures: string[] = []
function check(cond: boolean, msg: string) {
  if (!cond) failures.push(msg)
}

const casos = listCasoDefs()

check(casos.length >= 100, `expected at least 100 casos, got ${casos.length}`)

const seen = new Set<string>()
for (const c of casos) {
  const at = `caso "${c.slug}"`

  check(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(c.slug), `${at}: slug must be kebab-case ascii`)
  check(!seen.has(c.slug), `${at}: duplicate slug`)
  seen.add(c.slug)

  check(THEME_KEYS.has(c.theme), `${at}: unknown theme "${c.theme}"`)
  check(KINDS.has(c.statusKind), `${at}: unknown statusKind "${c.statusKind}"`)
  check(STATUSES.has(c.status), `${at}: unknown status "${c.status}"`)
  check(COVERAGE.has(c.feedCoverage), `${at}: unknown feedCoverage "${c.feedCoverage}"`)
  check(Boolean(c.emoji), `${at}: missing emoji`)
  check(c.organisms.length > 0, `${at}: no organisms named`)

  // ── Sources: the whole basis of the page ─────────────────────────────────
  check(c.sources.length >= 3, `${at}: needs >= 3 sources, has ${c.sources.length}`)
  const outlets = new Set(c.sources.map(s => s.outlet.toLowerCase().trim()))
  check(outlets.size >= 2, `${at}: sources must come from >= 2 distinct outlets`)
  for (const s of c.sources) {
    check(/^https?:\/\/\S+$/i.test(s.url), `${at}: source url is not a URL: ${s.url}`)
    check(s.title.trim().length > 8, `${at}: source title too short: "${s.title}"`)
    check(s.outlet.trim().length > 1, `${at}: source outlet missing`)
  }
  const urls = c.sources.map(s => s.url)
  check(new Set(urls).size === urls.length, `${at}: duplicate source URL`)

  // ── Both locales, with real content in each field ────────────────────────
  for (const [loc, txt] of [['es', c.es], ['en', c.en]] as const) {
    check(txt.title.trim().length >= 10, `${at}: ${loc}.title too short`)
    check(txt.title.length <= 110, `${at}: ${loc}.title too long (${txt.title.length})`)
    check(txt.dek.trim().length >= 60, `${at}: ${loc}.dek too short`)
    check(txt.contexto.trim().length >= 180, `${at}: ${loc}.contexto too short (${txt.contexto.length})`)
    check(txt.hallazgo.trim().length >= 200, `${at}: ${loc}.hallazgo too short (${txt.hallazgo.length})`)
    check(txt.statusNote.trim().length >= 80, `${at}: ${loc}.statusNote too short`)
    check(txt.porQueImporta.trim().length >= 80, `${at}: ${loc}.porQueImporta too short`)
    for (const rx of VERDICT_WORDS) {
      check(!rx.test(txt.hallazgo) && !rx.test(txt.dek), `${at}: ${loc} states a verdict (${rx})`)
    }
  }

  // ── The cross-reference, and its honesty ─────────────────────────────────
  if (c.query) {
    const q = c.query
    const leads = Boolean(q.search || q.suppliers?.length || q.supplierIds?.length || q.buyers?.length || q.categoryId?.length)
    // buyer.id carries no index on this collection: a query led by it scans
    // 2.1M documents and blows the endpoint's 9s budget.
    check(leads, `${at}: query must lead with search / supplier / buyer name / category, not buyer.id alone`)
    check(!q.buyerIds?.length, `${at}: query uses buyerIds, which is not indexed — use buyers (names)`)
    check(Boolean(c.es.caveat && c.en.caveat), `${at}: a caso with a cross-reference must carry a caveat in both locales`)
  }
  // A caso with no query is fine — `feedCoverage` records WHY, and the page
  // renders one of two different absences from it (money outside the
  // procurement record vs. money inside it that no filter isolates). What is
  // NOT fine is a query that returns nothing, which scripts/verify-casos.ts
  // catches against the live collection.
}

// Every theme must actually have dossiers, or its page and its hub chip are dead ends.
for (const t of CASO_THEMES) {
  const n = casos.filter((c: CasoDef) => c.theme === t.key).length
  check(n >= 3, `theme "${t.key}" has only ${n} casos — a theme page needs at least 3`)
}

if (failures.length) {
  console.error(`✗ casos-structure: ${failures.length} failure(s)\n`)
  for (const f of failures.slice(0, 60)) console.error('  -', f)
  if (failures.length > 60) console.error(`  … and ${failures.length - 60} more`)
  process.exit(1)
}

console.log(`✓ casos-structure: ${casos.length} casos across ${CASO_THEMES.length} themes, ${casos.reduce((a, c) => a + c.sources.length, 0)} sources, all rules pass`)
