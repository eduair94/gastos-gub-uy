/**
 * Authoring pass: turn researched caso drafts into shippable defs.
 *
 * For each draft it resolves the organism / supplier / keyword hints into a
 * query the public explorer already understands, RUNS that query against the
 * live collection, and keeps it only if it returns a set worth showing.
 *
 * The one hard constraint is index shape (measured, not assumed):
 *   $text            ~0.65s
 *   buyer.name       ~2.6s   (buyer.name_1_date_-1)
 *   buyer.id        ~13.4s   NOT INDEXED — never lead with it
 * So every candidate query leads with a text search or an indexed name, and
 * `buyer.id` is never used at all.
 *
 *   npx tsx scripts/casos-resolve-queries.ts <raw.json> <resolved.json>
 */
import * as fs from 'node:fs'
import { buildContractFilters, toMatchDocument } from '../app/server/api/contracts/index.get'
import { connectToDatabase } from '../shared/connection/database'
import { ReleaseModel } from '../shared/models/release'

process.env.MONGO_SOCKET_TIMEOUT_MS = '600000'

/**
 * The API endpoint gives a caso 9s. A candidate query that cannot answer inside
 * that budget is not shippable however good it looks, so probing with a longer
 * budget would only pick queries that render an empty page in production.
 */
const MAX_TIME_MS = 9000
/** Above this the set stops being "the contracts of this case" and becomes noise. */
const MAX_SENSIBLE = 40000
/** Past this an organism-only query is the body's whole ledger, not a case. */
const MAX_ORGANISM_ONLY = 2500
/** The endpoint runs two aggregations plus a find() inside its own 9s. */
const SLOW_MS = 6000

interface RawCaso {
  slug: string
  emoji: string
  theme: string
  period?: string
  statusKind: string
  status: string
  amountReported?: string
  organisms: string[]
  supplierHints?: string[]
  searchHints: string[]
  yearFrom?: number | null
  yearTo?: number | null
  feedCoverage: string
  sources: Array<{ outlet: string, title: string, url: string, date?: string }>
  es: Record<string, string>
  en: Record<string, string>
}

/**
 * Organism shorthands the sources use → the inciso prefix that identifies every
 * buying unit under them. Expanded to real `buyer.name` values below, because
 * the name is indexed and the id is not.
 */
const INCISO: Record<string, string[]> = {
  'asse': ['29-'],
  'administración de servicios de salud del estado': ['29-'],
  'msp': ['12-'],
  'ministerio de salud pública': ['12-'],
  'anep': ['25-'],
  'administración nacional de educación pública': ['25-'],
  'ministerio de defensa nacional': ['3-'],
  'ministerio de defensa': ['3-'],
  'ejército': ['3-4'],
  'armada': ['3-18'],
  'fuerza aérea': ['3-23', '3-41'],
  'ministerio del interior': ['4-'],
  'policía': ['4-'],
  'ministerio de transporte y obras públicas': ['10-', '24-10'],
  'mtop': ['10-', '24-10'],
  'ministerio de educación y cultura': ['11-'],
  'mec': ['11-'],
  'ministerio de vivienda y ordenamiento territorial': ['14-'],
  'ministerio de vivienda, ordenamiento territorial y medio ambiente': ['14-'],
  'ministerio de ambiente': ['14-4'],
  'ministerio de ganadería, agricultura y pesca': ['7-'],
  'mgap': ['7-'],
  'ministerio de economía y finanzas': ['5-'],
  'mef': ['5-'],
  'ministerio de industria, energía y minería': ['8-'],
  'miem': ['8-'],
  'ministerio de turismo': ['9-3'],
  'ministerio de desarrollo social': ['15-'],
  'mides': ['15-'],
  'ministerio de trabajo y seguridad social': ['13-'],
  'presidencia de la república': ['2-', '24-2'],
  'presidencia': ['2-', '24-2'],
  'opp': ['2-3'],
  'oficina de planeamiento y presupuesto': ['2-3'],
  'secretaría nacional del deporte': ['2-11', '9-2'],
  'antel': ['65-'],
  'administración nacional de telecomunicaciones': ['65-'],
  'ute': ['61-'],
  'ancap': ['60-'],
  'ose': ['66-'],
  'anp': ['64-'],
  'administración nacional de puertos': ['64-'],
  'afe': ['62-'],
  'inau': ['27-'],
  'bps': ['28-'],
  'bse': ['53-'],
  'brou': ['51-'],
  'utec': ['31-'],
  'intendencia de montevideo': ['98-1'],
  'intendencia de canelones': ['81-1'],
  'agencia nacional de vivienda': ['68-'],
  'dinama': ['14-4'],
  'inia': ['7-'],
  'jutep': ['11-22'],
}

interface BuyerRow { id: string, name: string, n: number }

function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

/** Grouping 2.1M releases by buyer takes minutes; do it once per machine. */
const BUYER_CACHE = process.env.CASOS_BUYER_CACHE ?? 'buyers-cache.json'

async function loadBuyers(): Promise<BuyerRow[]> {
  if (fs.existsSync(BUYER_CACHE)) {
    const cached = JSON.parse(fs.readFileSync(BUYER_CACHE, 'utf8')) as BuyerRow[]
    if (cached.length) {
      console.log(`  (from cache ${BUYER_CACHE})`)
      return cached
    }
  }
  const rows = await ReleaseModel.aggregate([
    { $match: { 'buyer.name': { $ne: null } } },
    { $group: { _id: { id: '$buyer.id', name: '$buyer.name' }, n: { $sum: 1 } } },
    { $sort: { n: -1 } },
  ], { maxTimeMS: 600000, allowDiskUse: true })
  const out = rows
    .filter(r => typeof r._id?.name === 'string' && r._id.name)
    .map(r => ({ id: String(r._id.id ?? ''), name: String(r._id.name), n: r.n as number }))
  fs.writeFileSync(BUYER_CACHE, JSON.stringify(out), 'utf8')
  return out
}

/** Buyer NAMES for an organism label: inciso expansion first, then a name contains. */
function resolveBuyers(organisms: string[], buyers: BuyerRow[]): string[] {
  const out = new Set<string>()
  for (const raw of organisms) {
    const key = norm(raw)
    const prefixes = INCISO[key] ?? Object.entries(INCISO).find(([k]) => key.includes(k) || k.includes(key))?.[1]
    if (prefixes) {
      for (const b of buyers) {
        if (prefixes.some(p => (p.endsWith('-') ? b.id.startsWith(p) : b.id === p))) out.add(b.name)
      }
      continue
    }
    // Fall back to a name contains, which is how the long official unit names
    // ("Dirección Nacional de Bomberos") arrive from the research pass.
    for (const b of buyers) {
      if (norm(b.name).includes(key) && key.length > 5) out.add(b.name)
    }
  }
  return [...out]
}

/** Real supplier names behind a company mentioned in the press. */
async function resolveSuppliers(hints: string[]): Promise<string[]> {
  const out = new Set<string>()
  for (const hint of hints) {
    const bare = hint.replace(/\b(s\.?a\.?|s\.?r\.?l\.?|ltda?\.?|sas)\b/gi, '').trim()
    if (bare.length < 4) continue
    const rx = new RegExp(bare.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
    const rows = await ReleaseModel.aggregate([
      { $match: { 'awards.suppliers.name': rx } },
      { $unwind: '$awards' },
      { $unwind: '$awards.suppliers' },
      { $match: { 'awards.suppliers.name': rx } },
      { $group: { _id: '$awards.suppliers.name', n: { $sum: 1 } } },
      { $sort: { n: -1 } },
      { $limit: 6 },
    ], { maxTimeMS: MAX_TIME_MS }).catch(() => [])
    for (const r of rows) if (typeof r._id === 'string') out.add(r._id)
  }
  return [...out]
}

/**
 * Words too common in a procurement object to narrow anything.
 * `servicio`/`sistema`/`equipamiento` are the usual first token of a hint and
 * would match half the corpus on their own.
 */
const STOPWORDS = new Set([
  'de', 'del', 'la', 'las', 'los', 'el', 'en', 'por', 'para', 'con', 'sin', 'y', 'o', 'a', 'al',
  'servicio', 'servicios', 'sistema', 'sistemas', 'equipamiento', 'compra', 'compras',
  'adquisicion', 'adquisición', 'contrato', 'contratos', 'obra', 'obras', 'plan', 'programa',
  'nacional', 'publico', 'público', 'publica', 'pública', 'general', 'gestion', 'gestión',
])

/**
 * The one word in a hint worth searching on its own.
 *
 * `buildContractFilters` matches the FULL phrase by regex after the text index
 * narrows on the first token, so a hint like "cámaras de videovigilancia" only
 * hits contracts whose object contains that exact string — which is nearly
 * none, because procurement objects are written as "CAMARA DOMO IP" or
 * "VIDEOVIGILANCIA URBANA". The distinctive single token finds them; the phrase
 * does not. Tried after the phrase, so a hint that DOES match verbatim still
 * wins on precision.
 */
function distinctiveToken(hint: string): string | null {
  const tokens = hint
    .split(/\s+/)
    .map(w => w.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter(w => w.length >= 6 && !STOPWORDS.has(norm(w)))
  if (!tokens.length) return null
  return tokens.sort((a, b) => b.length - a.length)[0]!
}

interface Candidate {
  query: Record<string, unknown>
  filter: Record<string, unknown>
  label: string
  /**
   * Per-candidate ceiling. An organism-only query has a far tighter one than a
   * keyword-scoped query: past a couple of thousand contracts it has stopped
   * being "what this case is about" and become the body's entire ledger, which
   * already has a page of its own at /buyers/<id>. Showing it under a dossier
   * about one project would put a number on the screen that answers a
   * different question than the headline asks.
   */
  max: number
}

/**
 * The candidate's match, built by the SAME code the endpoint runs.
 *
 * A hand-rolled approximation is worse than no probe at all: the first version
 * of this script issued `$text: {$search: firstWord}` and nothing else, while
 * `buildContractFilters` follows the text index with a regex re-check of the
 * FULL phrase. Every multi-word keyword therefore probed far looser than it
 * would run, and a third of the queries that "resolved" here returned zero
 * contracts in production.
 */
function buildFilter(q: Record<string, unknown>): Record<string, unknown> {
  return toMatchDocument(buildContractFilters({ tag: 'award', ...q }))
}

async function probe(filter: Record<string, unknown>) {
  const t = Date.now()
  const rows = await ReleaseModel.aggregate([
    { $match: filter },
    { $group: { _id: null, count: { $sum: 1 }, total: { $sum: { $cond: [{ $lt: ['$amount.primaryAmount', 1e11] }, { $ifNull: ['$amount.primaryAmount', 0] }, 0] } } } },
  ], { maxTimeMS: MAX_TIME_MS }).catch(() => null)
  if (!rows) return { count: -1, total: 0, ms: Date.now() - t }
  return { count: rows[0]?.count ?? 0, total: rows[0]?.total ?? 0, ms: Date.now() - t }
}

async function main() {
  const [inPath, outPath] = process.argv.slice(2)
  if (!inPath || !outPath) throw new Error('usage: casos-resolve-queries.ts <raw.json> <resolved.json> [--slice=a:b]')
  // Probing is network-bound, so the work splits cleanly across processes.
  const sliceArg = process.argv.find(a => a.startsWith('--slice='))?.slice('--slice='.length)
  const [sliceFrom, sliceTo] = sliceArg ? sliceArg.split(':').map(Number) : [0, Number.MAX_SAFE_INTEGER]

  await connectToDatabase()
  console.log('loading buyer table…')
  const buyers = await loadBuyers()
  console.log(`  ${buyers.length} distinct buyer name/id pairs`)

  const all: RawCaso[] = JSON.parse(fs.readFileSync(inPath, 'utf8'))
  const raw = all.slice(sliceFrom, sliceTo)
  const out: unknown[] = []
  console.log(`resolving ${raw.length} of ${all.length} casos (slice ${sliceFrom}:${sliceTo === Number.MAX_SAFE_INTEGER ? 'end' : sliceTo})`)

  for (const [i, c] of raw.entries()) {
    const buyerNames = resolveBuyers(c.organisms ?? [], buyers)
    const supplierNames = await resolveSuppliers(c.supplierHints ?? [])
    const years: Record<string, number> = {}
    if (c.yearFrom) years.yearFrom = c.yearFrom
    if (c.yearTo) years.yearTo = c.yearTo

    const candidates: Candidate[] = []
    // Most specific first: supplier-led is the strongest evidence, then
    // keyword scoped to the buying bodies, then the bodies alone.
    //
    // A BARE keyword search is deliberately not a candidate. "horas docentes"
    // across the whole state is not "the contracts of this case" — it is a
    // plausible-looking number attached to the wrong set, which is worse than
    // no number. If nothing scopes the query to the organisms or companies the
    // sources name, the caso ships without a cross-reference and the page says
    // so.
    if (supplierNames.length) {
      const q = { suppliers: supplierNames }
      candidates.push({ label: 'suppliers', query: q, filter: buildFilter(q), max: MAX_SENSIBLE })
    }
    if (buyerNames.length && buyerNames.length <= 400) {
      const terms: string[] = []
      for (const hint of (c.searchHints ?? []).slice(0, 3)) {
        terms.push(hint)
        const token = distinctiveToken(hint)
        if (token && !terms.includes(token)) terms.push(token)
      }
      for (const term of terms) {
        const q = { search: term, buyers: buyerNames, ...years }
        candidates.push({ label: `search+buyers:${term}`, query: q, filter: buildFilter(q), max: MAX_SENSIBLE })
      }
    }
    if (buyerNames.length && buyerNames.length <= 60) {
      const q = { buyers: buyerNames, ...years }
      candidates.push({ label: 'buyers', query: q, filter: buildFilter(q), max: MAX_ORGANISM_ONLY })
    }

    let chosen: { label: string, query: Record<string, unknown>, count: number, total: number, ms: number } | null = null
    for (const cand of candidates) {
      const r = await probe(cand.filter)
      // Slower than SLOW_MS here means the endpoint — which runs two of these
      // plus a find() inside 9s — renders an empty page in production.
      if (r.count > 0 && r.count <= cand.max && r.ms <= SLOW_MS) {
        chosen = { label: cand.label, query: cand.query, ...r }
        break
      }
    }

    console.log(
      `${String(i + 1).padStart(3)}. ${c.slug.padEnd(46)} ${chosen ? `${chosen.label} -> ${chosen.count} (${chosen.ms}ms)` : 'NO QUERY'}`,
    )

    out.push({
      ...c,
      resolved: {
        buyerNames: buyerNames.length,
        supplierNames,
        query: chosen?.query ?? null,
        count: chosen?.count ?? 0,
        total: chosen?.total ?? 0,
        via: chosen?.label ?? null,
      },
    })
  }

  fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf8')
  const withQuery = out.filter((o: any) => o.resolved.query).length
  console.log(`\n${withQuery}/${out.length} casos got a live query.`)
  process.exit(0)
}

main().catch((e) => { console.error('FAIL', e); process.exit(1) })
