/**
 * The live half of the caso contract: every source URL is fetched and every
 * cross-reference query is resolved against the real collection, through the
 * REAL filter builder the API uses — not a copy of it, so the two cannot drift.
 *
 * Needs the network and a live MONGODB_URI, which is why it is a script and not
 * part of `npm test` (tests/unit/casos-structure.test.ts holds the pure rules).
 *
 *   npx tsx scripts/verify-casos.ts              # everything
 *   npx tsx scripts/verify-casos.ts --urls       # source URLs only
 *   npx tsx scripts/verify-casos.ts --queries    # DB cross-references only
 *   npx tsx scripts/verify-casos.ts --slug=foo   # one dossier
 *
 * Exit code is non-zero when a source URL is gone (404/410/DNS) or a query
 * returns nothing. A 401/403/405 is reported but tolerated: several Uruguayan
 * outlets answer bots that way while serving readers normally.
 */
import { buildContractFilters, toMatchDocument } from '../app/server/api/contracts/index.get'
import { casoToQueryParams, listCasoDefs } from '../app/server/utils/casos'
import { connectToDatabase } from '../shared/connection/database'
import { ReleaseModel } from '../shared/models/release'

process.env.MONGO_SOCKET_TIMEOUT_MS = process.env.MONGO_SOCKET_TIMEOUT_MS ?? '600000'

const args = process.argv.slice(2)
const only = args.find(a => a.startsWith('--slug='))?.slice('--slug='.length)
const doUrls = !args.includes('--queries')
const doQueries = !args.includes('--urls')

const URL_TIMEOUT_MS = 20000
const URL_CONCURRENCY = 6
const QUERY_TIMEOUT_MS = 25000
/** A browser UA: several outlets 403 the default fetch agent but serve readers. */
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

const casos = listCasoDefs().filter(c => !only || c.slug === only)
if (!casos.length) {
  console.error(only ? `no caso with slug "${only}"` : 'no casos defined')
  process.exit(1)
}

const errors: string[] = []
const warnings: string[] = []

// ── Source URLs ─────────────────────────────────────────────────────────────

interface UrlJob { slug: string, outlet: string, url: string }

async function checkUrl(job: UrlJob): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), URL_TIMEOUT_MS)
    try {
      // GET, not HEAD: a sizeable share of these hosts answer HEAD with 405 or
      // with a status that contradicts the one GET returns.
      const res = await fetch(job.url, {
        method: 'GET',
        redirect: 'follow',
        signal: ctrl.signal,
        headers: { 'user-agent': UA, 'accept': 'text/html,application/xhtml+xml' },
      })
      clearTimeout(timer)
      if (res.status >= 200 && res.status < 300) return
      if ([401, 403, 405, 429].includes(res.status)) {
        warnings.push(`${job.slug}: ${res.status} from ${job.outlet} (bot-blocked, reachable) ${job.url}`)
        return
      }
      errors.push(`${job.slug}: HTTP ${res.status} — ${job.outlet} ${job.url}`)
      return
    }
    catch (e) {
      clearTimeout(timer)
      if (attempt === 1) {
        errors.push(`${job.slug}: unreachable (${String((e as Error).message).slice(0, 80)}) — ${job.outlet} ${job.url}`)
      }
    }
  }
}

async function runPool<T>(items: T[], n: number, fn: (item: T) => Promise<void>) {
  let i = 0
  const workers = Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) {
      const item = items[i++]!
      await fn(item)
    }
  })
  await Promise.all(workers)
}

// ── Cross-reference queries ────────────────────────────────────────────────

/** Past this an organism-only query is the body's ledger, not a case. */
const MAX_ORGANISM_ONLY = 2500
/**
 * A single-contract cross-reference is more likely a coincidental keyword hit
 * than the case — "Libertad" matches a place, "policial" matches a uniform
 * order. One row under a headline about a hundred-million-dollar programme
 * reads as evidence and is not.
 */
const MIN_CONTRACTS = 2

async function checkQuery(slug: string, query: Record<string, unknown>) {
  const filters = buildContractFilters(casoToQueryParams(query as never))
  const match = toMatchDocument(filters)
  const q = query as { search?: string, suppliers?: string[], supplierIds?: string[], hasReiteracion?: boolean }
  // `hasReiteracion` acota tanto como un proveedor o una frase: deja las compras que el
  // Tribunal de Cuentas observó, que son una fracción chica del padrón de cualquier
  // organismo. Una consulta que lo lleva NO es una consulta sólo-organismo.
  const organismOnly = !q.search && !q.suppliers?.length && !q.supplierIds?.length && !q.hasReiteracion
  const t = Date.now()
  try {
    const count = await ReleaseModel.countDocuments(match).maxTimeMS(QUERY_TIMEOUT_MS)
    const ms = Date.now() - t
    if (count < MIN_CONTRACTS) {
      errors.push(`${slug}: cross-reference query returns ${count} contract(s) — below the ${MIN_CONTRACTS} needed to be a set rather than a coincidence`)
    }
    else if (organismOnly && count > MAX_ORGANISM_ONLY) {
      // Nothing scopes this to the case, so the page would headline a figure
      // that answers "what does this body buy" under a dossier about one
      // project. The buyer already has a page for that question.
      errors.push(`${slug}: organism-only query returns ${count} contracts — that is the body's whole ledger, not this case`)
    }
    else if (ms > 9000) {
      // The API handler's own budget. Slower than this and the page renders empty.
      warnings.push(`${slug}: query took ${ms}ms — over the endpoint's 9s budget`)
    }
    return { count, ms }
  }
  catch (e) {
    errors.push(`${slug}: query failed (${String((e as Error).message).slice(0, 100)})`)
    return { count: -1, ms: Date.now() - t }
  }
}

async function main() {
  console.log(`verifying ${casos.length} caso(s)…\n`)

  if (doUrls) {
    const jobs: UrlJob[] = casos.flatMap(c => c.sources.map(s => ({ slug: c.slug, outlet: s.outlet, url: s.url })))
    console.log(`→ ${jobs.length} source URLs`)
    let done = 0
    await runPool(jobs, URL_CONCURRENCY, async (j) => {
      await checkUrl(j)
      if (++done % 25 === 0) process.stdout.write(`  ${done}/${jobs.length}\r`)
    })
    console.log(`  ${done}/${jobs.length} checked`)
  }

  if (doQueries) {
    const withQuery = casos.filter(c => c.query)
    console.log(`\n→ ${withQuery.length} cross-reference queries (of ${casos.length} casos)`)
    await connectToDatabase()
    for (const c of withQuery) {
      const r = await checkQuery(c.slug, c.query as Record<string, unknown>)
      console.log(`  ${c.slug.padEnd(48)} ${String(r.count).padStart(6)} contratos  ${r.ms}ms`)
    }
  }

  console.log('')
  for (const w of warnings) console.log(`  ! ${w}`)
  if (errors.length) {
    console.error(`\n✗ ${errors.length} error(s):`)
    for (const e of errors) console.error(`  - ${e}`)
    process.exit(1)
  }
  console.log(`✓ verify-casos: ${casos.length} casos pass (${warnings.length} warning(s))`)
  process.exit(0)
}

main().catch((e) => { console.error('FAIL', e); process.exit(1) })
