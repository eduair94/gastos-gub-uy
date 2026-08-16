#!/usr/bin/env tsx
/**
 * Local-dev fixture generator. Fills `releases` with synthetic-but-OCDS-shaped
 * procurement data — 19 Intendencias + a handful of national ministries, several
 * years each — so a local Mongo has SOMETHING for the dashboard to render without
 * a multi-hour real ingestion. Numbers are pseudo-random (seeded, reproducible);
 * this is not real spending data and must never point at a non-local database.
 *
 * Inserts via the raw driver (`ReleaseModel.collection`), not `.create()`/Mongoose
 * validation, to match how the live uploader writes and to allow the same
 * partial/unknown-method documents real feed data has (~part of the point:
 * downstream code must tolerate missing tender.procurementMethodDetails etc).
 *
 * After seeding, hands off to the REAL jobs to build every derived collection —
 * nothing about supplier patterns, anomalies, dept indicators, etc. is
 * reimplemented here, so this fixture stays correct as those jobs evolve.
 *
 * Usage:
 *   npm run seed:dev                    # wipe + reseed releases, then rebuild derived data
 *   npm run seed:dev -- --releases-only # just the releases collection, skip the job chain
 *   npm run seed:dev -- --seed=42       # different pseudo-random fixture
 */
import { execFileSync } from 'child_process'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { connectToDatabase, disconnectFromDatabase, maskMongoUri } from '../shared/connection/database'
import { ReleaseModel, SupplierContactModel } from '../shared/models'
import { mongoUri } from '../shared/config'

// SAFETY: this wipes `releases`. Refuse anything that isn't obviously local.
// A credentialed or +srv URI never matches, so the refusal is the safe default.
// The URI goes through maskMongoUri because the one it most often refuses is a
// REMOTE one carrying the production password, and this line lands in terminal
// scrollback and CI logs.
if (!/^mongodb:\/\/(localhost|127\.0\.0\.1|mongo)(:\d+)?\//.test(mongoUri)) {
  console.error(`Refusing to seed MONGODB_URI="${maskMongoUri(mongoUri)}" — this only runs against a local database.`)
  console.error('Importing any model runs dotenv with `override: true`, so a shell variable will NOT')
  console.error('win over a remote URI in `.env` — point `.env` at the local container to seed it.')
  process.exit(1)
}

const args = process.argv.slice(2)
const releasesOnly = args.includes('--releases-only')
const seedArg = args.find(a => a.startsWith('--seed='))
const SEED = seedArg ? Number(seedArg.slice('--seed='.length)) : 1

// ---- seeded PRNG (mulberry32) — reproducible fixture, no extra dependency ----
function mulberry32(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rand = mulberry32(SEED)
const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)] as T
const int = (min: number, max: number) => Math.floor(min + rand() * (max - min + 1))
// log-uniform: spreads across orders of magnitude instead of clustering near `max`.
const logUniform = (min: number, max: number) => Math.round(Math.exp(Math.log(min) + rand() * (Math.log(max) - Math.log(min))))

// ---- buyers: the 19 Intendencias (party-comparison page) + a few ministries ----
const INTENDENCIAS = [
  ['80-1', 'Intendencia de Artigas'], ['81-1', 'Intendencia de Canelones'],
  ['82-1', 'Intendencia de Cerro Largo'], ['83-1', 'Intendencia de Colonia'],
  ['84-1', 'Intendencia de Durazno'], ['85-1', 'Intendencia de Flores'],
  ['86-1', 'Intendencia de Florida'], ['87-1', 'Intendencia de Lavalleja'],
  ['88-1', 'Intendencia de Maldonado'], ['89-1', 'Intendencia de Paysandú'],
  ['90-1', 'Intendencia de Río Negro'], ['91-1', 'Intendencia de Rivera'],
  ['92-1', 'Intendencia de Rocha'], ['93-1', 'Intendencia de Salto'],
  ['94-1', 'Intendencia de San José'], ['95-1', 'Intendencia de Soriano'],
  ['96-1', 'Intendencia de Tacuarembó'], ['97-1', 'Intendencia de Treinta y Tres'],
  ['98-1', 'Intendencia de Montevideo'],
] as const
// inciso ids picked to match shared/organism-groups.ts's `ministerios` member list
// exactly, so refresh-organism-groups actually counts them (a buyer.id whose inciso
// isn't in that taxonomy — e.g. Presidencia, inciso 2 — silently counts as 0 there).
const MINISTRIES = [
  ['3-1', 'Ministerio de Defensa Nacional'], ['4-1', 'Ministerio del Interior'],
  ['5-1', 'Ministerio de Economía y Finanzas'], ['7-1', 'Ministerio de Ganadería, Agricultura y Pesca'],
  ['10-1', 'Ministerio de Transporte y Obras Públicas'], ['11-1', 'Ministerio de Educación y Cultura'],
  ['12-1', 'Ministerio de Salud Pública'], ['14-1', 'Ministerio de Vivienda y Medio Ambiente'],
] as const
// A few real buyer.ids from the other three /analytics/organismos groups (salud,
// entes, educación — shared/organism-groups.ts) so none of the five groups render
// empty. Real ids/names, not synthetic, since the page's taxonomy keys off them.
const OTHER_ORGANISM_GROUPS = [
  ['29-68', 'ASSE (central)'], ['29-6', 'Hospital Pasteur'], ['29-4', 'Centro Hospitalario Pereira Rossell'],
  ['60-1', 'ANCAP'], ['61-1', 'UTE'], ['66-1', 'OSE'], ['65-1', 'ANTEL'],
  ['25-1', 'ANEP — CODICEN'], ['25-3', 'Educación Secundaria'], ['26-1', 'UDELAR'],
] as const
const BUYERS = [...INTENDENCIAS, ...MINISTRIES, ...OTHER_ORGANISM_GROUPS]

const SUPPLIERS = Array.from({ length: 45 }, (_, i) => {
  const name = pick([
    'Constructora', 'Distribuidora', 'Servicios Integrales', 'Comercial', 'Suministros',
    'Logística', 'Tecnología', 'Insumos', 'Grupo', 'Corporación',
  ]) + ' ' + pick(['del Norte', 'del Este', 'Uruguay', 'del Litoral', 'Nacional', 'S.A.', 'S.R.L.', 'del Plata', 'Austral', 'Central'])
  return {
    id: `dev-sup-${i + 1}`,
    name,
    domain: `${name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '')}.com.uy`,
  }
})
// Rough Uruguay bounding box — precision doesn't matter, just needs to plot inside the country.
const URUGUAY_BBOX = { latMin: -34.95, latMax: -30.1, lngMin: -58.45, lngMax: -53.1 }

const ITEM_CATALOG = [
  { desc: 'Combustibles y lubricantes', classId: '15100000', unit: 'litro', priceRange: [40, 90] },
  { desc: 'Papelería y útiles de oficina', classId: '44100000', unit: 'unidad', priceRange: [20, 500] },
  { desc: 'Servicios de limpieza', classId: '90910000', unit: 'servicio', priceRange: [15000, 400000] },
  { desc: 'Equipos informáticos', classId: '30200000', unit: 'unidad', priceRange: [8000, 90000] },
  { desc: 'Medicamentos', classId: '33600000', unit: 'unidad', priceRange: [50, 3000] },
  { desc: 'Obras viales', classId: '45200000', unit: 'servicio', priceRange: [500000, 15000000] },
  { desc: 'Servicios de seguridad', classId: '79710000', unit: 'servicio', priceRange: [30000, 600000] },
  { desc: 'Alimentos', classId: '15800000', unit: 'kg', priceRange: [40, 600] },
  { desc: 'Mobiliario', classId: '39100000', unit: 'unidad', priceRange: [3000, 60000] },
  { desc: 'Servicios profesionales', classId: '79400000', unit: 'servicio', priceRange: [20000, 800000] },
] as const

const METHODS = [
  { label: 'Compra Directa por excepción', weight: 3 },
  { label: 'Compra Directa', weight: 3 },
  { label: 'Licitación Abreviada', weight: 3 },
  { label: 'Licitación Pública', weight: 2 },
  { label: 'Concurso de Precios', weight: 2 },
  { label: 'Convenio Marco', weight: 1 },
  { label: null, weight: 4 }, // unknown method — real feed data is ~69% like this
] as const
function weightedMethod(): string | null {
  const total = METHODS.reduce((s, m) => s + m.weight, 0)
  let r = rand() * total
  for (const m of METHODS) {
    r -= m.weight
    if (r <= 0) return m.label
  }
  return null
}
// OCDS `tender.procurementMethod` code for the chosen Spanish label — populate-filters
// groups by this field (not procurementMethodDetails), so without it the "método de
// compra" filter comes up empty.
function ocdsMethodCode(label: string | null): string | undefined {
  if (!label) return undefined
  if (label.includes('Directa')) return 'direct'
  if (label.includes('Pública')) return 'open'
  if (label === 'Convenio Marco') return 'limited'
  return 'selective' // Licitación Abreviada, Concurso de Precios
}

const YEARS = [2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026]
const CURRENT_YEAR = new Date().getFullYear()

let seq = 0
function nextId(prefix: string) {
  seq += 1
  return { id: `${prefix}-devseed-${seq}`, ocid: `ocds-yfs5dr-devseed${seq}` }
}

function releaseDateFor(year: number): Date {
  const isPartial = year === CURRENT_YEAR
  const maxMonth = isPartial ? new Date().getMonth() : 11
  return new Date(year, int(0, maxMonth), int(1, 28))
}

// Which classification codes each supplier actually won, for the supplier_contacts
// `rubros` field (built directly below — enrich-supplier-contacts.ts is a live
// external-lookup job that doesn't apply to fictitious suppliers, see seedSupplierContacts).
const supplierClassCounts = new Map<string, Map<string, { label: string, count: number }>>()
function trackSupplierClass(supplierId: string, classId: string, label: string) {
  const m = supplierClassCounts.get(supplierId) ?? new Map()
  const e = m.get(classId) ?? { label, count: 0 }
  e.count += 1
  m.set(classId, e)
  supplierClassCounts.set(supplierId, m)
}

// A CONTACT ROLE and Uruguayan-looking phone for buyer offices — feeds
// procurement_contacts via the real refresh-contacts.ts job (it just needs
// parties[].contactPoint.email on a buyer/procuringEntity party).
const CONTACT_ROLES = ['Compras', 'Adquisiciones', 'Departamento de Compras', 'Administración']
function buyerContactPoint(buyerName: string) {
  const slug = buyerName.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '')
  return {
    name: pick(CONTACT_ROLES),
    email: `compras@${slug}.gub.uy`,
    telephone: `+598 2${int(100, 999)} ${int(1000, 9999)}`,
  }
}

function buildAwardRelease(buyerId: string, buyerName: string, year: number) {
  const { id, ocid } = nextId('adjudicacion')
  const date = releaseDateFor(year)
  const supplier = pick(SUPPLIERS)
  const nItems = int(1, 3)
  const items = Array.from({ length: nItems }, (_, i) => {
    const cat = pick(ITEM_CATALOG)
    let unitPrice = logUniform(cat.priceRange[0], cat.priceRange[1])
    // ~3% outliers so detect-anomalies has something real to flag in dev.
    if (rand() < 0.03) unitPrice *= int(8, 25)
    const quantity = int(1, 12)
    return {
      id: String(i + 1),
      description: cat.desc,
      quantity,
      classification: { id: cat.classId, description: cat.desc, scheme: 'UNSPSC' },
      unit: { id: cat.unit, name: cat.unit, value: { amount: unitPrice, currency: 'UYU' } },
      _lineTotal: unitPrice * quantity,
    }
  })
  const total = items.reduce((s, it) => s + it._lineTotal, 0)
  const methodDetails = weightedMethod()
  for (const it of items) trackSupplierClass(supplier.id, it.classification.id, it.description)
  // The real uploader stamps this on ingest, a few days after the release's own
  // `date` — see src/uploaders/release-uploader-new.ts:452. Feeds the "Origen
  // del registro" panel's "Importado el" row.
  const webFetchDate = new Date(date.getTime() + int(0, 3) * 86_400_000)

  return {
    id, ocid,
    initiationType: 'tender',
    tag: ['award'],
    date,
    sourceYear: year,
    webFetchDate,
    // Same fallback shape the real uploader uses when a release carries no RSS
    // <link> of its own (release-uploader-new.ts:738) — feeds "Enlace del origen".
    rssLink: `https://www.comprasestatales.gub.uy/ocds/release/${id}`,
    parties: [
      { id: buyerId, roles: ['buyer', 'procuringEntity'], name: buyerName, contactPoint: buyerContactPoint(buyerName) },
      { id: supplier.id, roles: ['supplier'], name: supplier.name },
    ],
    buyer: { id: buyerId, name: buyerName },
    tender: methodDetails
      ? {
          id: `${id}-tender`,
          hasEnquiries: false,
          procurementMethodDetails: methodDetails,
          procurementMethod: ocdsMethodCode(methodDetails),
          status: pick(['complete', 'complete', 'complete', 'active']),
          title: `${pick(ITEM_CATALOG).desc} — ${buyerName}`,
          description: `Adquisición de ${items[0]!.description.toLowerCase()} para ${buyerName}`,
          tenderPeriod: { startDate: date, endDate: date },
          procuringEntity: { id: buyerId, name: buyerName },
          submissionMethodDetails: 'Electrónica',
          items: items.map(({ _lineTotal, ...it }) => it),
        }
      : undefined,
    awards: [
      {
        id: `${id}-award`,
        title: `Adjudicación — ${buyerName}`,
        date,
        status: 'active',
        items: items.map(({ _lineTotal, ...it }) => it),
        suppliers: [supplier],
        documents: [],
      },
    ],
    amount: {
      version: 2,
      totalAmounts: { UYU: total },
      totalItems: items.length,
      currencies: ['UYU'],
      hasAmounts: true,
      primaryAmount: total,
      primaryCurrency: 'UYU',
      // Every item here is priced in UYU already (see ITEM_CATALOG), so the
      // "original" peso amount is just the total and no conversion happened —
      // still stamped with a rate-check date, matching how the real pipeline
      // records it even for peso-only releases. Feeds "Detalle del monto".
      originalUYUAmount: total,
      hasConvertedAmounts: false,
      exchangeRateDate: date,
    },
  }
}

// Unpriced tender-only record — keeps totalRecords > pricedRecords, matching the
// real feed's "not every record carries a price yet" shape (priceCoverage metric).
// Always carries a buyer contactPoint (feeds procurement_contacts via the real
// refresh-contacts.ts job — it matches tag:'tender' + a buyer/procuringEntity
// party with a contactPoint.email). `openNow: true` gives it a future
// tenderPeriod.endDate so backfill-open-calls picks it up as a live Llamado.
function buildTenderOnlyRelease(buyerId: string, buyerName: string, year: number, openNow = false) {
  const { id, ocid } = nextId('llamado')
  const date = openNow ? new Date(Date.now() - int(1, 10) * 86_400_000) : releaseDateFor(year)
  const endDate = openNow ? new Date(Date.now() + int(5, 45) * 86_400_000) : date
  const methodDetails = weightedMethod()
  return {
    id, ocid,
    initiationType: 'tender',
    tag: ['tender'],
    date,
    sourceYear: year,
    parties: [{ id: buyerId, roles: ['buyer', 'procuringEntity'], name: buyerName, contactPoint: buyerContactPoint(buyerName) }],
    buyer: { id: buyerId, name: buyerName },
    tender: {
      id: `${id}-tender`,
      hasEnquiries: false,
      procurementMethodDetails: methodDetails,
      procurementMethod: ocdsMethodCode(methodDetails),
      status: 'active',
      title: `${pick(ITEM_CATALOG).desc} — ${buyerName}`,
      description: `Llamado en curso — ${buyerName}`,
      tenderPeriod: { startDate: date, endDate },
      procuringEntity: { id: buyerId, name: buyerName },
      submissionMethodDetails: 'Electrónica',
      items: [],
    },
  }
}

/**
 * Real award releases captured from the public API (scripts/fetch-real-fixture.mjs).
 *
 * The synthetic generator above draws every item from a 10-entry catalogue, so
 * its records are too uniform to exercise what real data does: packed
 * `submissionMethodDetails`, `bidders`/`callBidders`, `tcr`, scraped
 * características, and — the reason this fixture exists — several award lines
 * sharing one `classification.id` at DIFFERENT unit prices. The contract page
 * compares prices per LINE because of that case; only real records prove it.
 *
 * Absent or unreadable, the seed still works: it just loses those shapes.
 */
function loadRealReleases(): any[] {
  const path = join(__dirname, 'fixtures', 'real-releases.json')
  if (!existsSync(path)) {
    console.warn('[seed-dev-db] no real-releases fixture — synthetic records only.')
    console.warn('[seed-dev-db] regenerate it with: node scripts/fetch-real-fixture.mjs')
    return []
  }
  try {
    const docs = JSON.parse(readFileSync(path, 'utf8')) as any[]
    // JSON has no date type, so every timestamp arrived as an ISO string. Left
    // that way, `date` sorts lexically, date-range filters miss entirely and
    // formatDate renders "Invalid Date" — revive them into real Dates.
    return docs.map(d => reviveDates(d))
  }
  catch (err) {
    console.warn(`[seed-dev-db] real-releases fixture unreadable, skipping: ${(err as Error).message}`)
    return []
  }
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-]\d{2}:\d{2})$/

function reviveDates(value: any): any {
  if (typeof value === 'string') return ISO_DATE.test(value) ? new Date(value) : value
  if (Array.isArray(value)) return value.map(reviveDates)
  if (value && typeof value === 'object') {
    const out: Record<string, any> = {}
    for (const [k, v] of Object.entries(value)) out[k] = reviveDates(v)
    return out
  }
  return value
}

async function seedReleases() {
  console.log(`[seed-dev-db] generating fixture releases (seed=${SEED})…`)
  const docs: any[] = []
  for (const [buyerId, buyerName] of BUYERS) {
    const isNational = !INTENDENCIAS.some(m => m[0] === buyerId)
    for (const year of YEARS) {
      const isPartial = year === CURRENT_YEAR
      const base = isNational ? int(35, 80) : int(20, 45)
      const n = isPartial ? Math.round(base * 0.5) : base
      for (let i = 0; i < n; i++) docs.push(buildAwardRelease(buyerId, buyerName, year))
      const nUnpriced = Math.round(n * 0.15)
      for (let i = 0; i < nUnpriced; i++) docs.push(buildTenderOnlyRelease(buyerId, buyerName, year))
    }
    // A few genuinely OPEN calls per buyer (future tenderPeriod.endDate) so
    // /llamados isn't empty — npm run backfill-open-calls projects these.
    for (let i = 0; i < int(2, 4); i++) docs.push(buildTenderOnlyRelease(buyerId, buyerName, CURRENT_YEAR, true))
  }

  const real = loadRealReleases()
  const all = [...docs, ...real]

  await connectToDatabase()
  console.log(`[seed-dev-db] wiping existing releases…`)
  await ReleaseModel.collection.deleteMany({})
  console.log(`[seed-dev-db] inserting ${docs.length} synthetic + ${real.length} real releases…`)
  // Raw driver, not Mongoose .create()/.insertMany() validation — mirrors how the
  // live uploader writes, and lets unknown-method/unpriced docs through untouched.
  const BATCH = 1000
  for (let i = 0; i < all.length; i += BATCH) {
    await ReleaseModel.collection.insertMany(all.slice(i, i + BATCH))
  }
  console.log(`[seed-dev-db] done: ${all.length} releases (${docs.length} synthetic across ${BUYERS.length} buyers × ${YEARS.length} years, ${real.length} real from the public API).`)
}

// supplier_contacts (behind /proveedores/contactos + the supplier detail contact
// tab) is normally built by src/jobs/enrich-supplier-contacts.ts, which resolves
// REAL companies via DEI/RUPE/web-search/Google Maps — meaningless for our made-up
// suppliers, so this seeds the collection directly instead of chaining that job.
// Must run AFTER seedReleases (needs supplierClassCounts, populated while building
// award releases) and while still connected — called from main() before disconnect.
async function seedSupplierContacts() {
  console.log(`[seed-dev-db] seeding ${SUPPLIERS.length} supplier_contacts…`)
  await SupplierContactModel.collection.deleteMany({})
  const docs = SUPPLIERS.map((s) => {
    const classCounts = supplierClassCounts.get(s.id)
    const totalLines = classCounts ? [...classCounts.values()].reduce((sum, e) => sum + e.count, 0) : 0
    const rubros = classCounts
      ? [...classCounts.entries()]
          .sort((a, b) => b[1].count - a[1].count)
          .slice(0, 5)
          .map(([classificationId, e]) => ({
            classificationId,
            label: e.label,
            itemCount: e.count,
            share: totalLines > 0 ? Math.round((e.count / totalLines) * 1000) / 1000 : 0,
          }))
      : []
    const email = `contacto@${s.domain}`
    const lat = URUGUAY_BBOX.latMin + rand() * (URUGUAY_BBOX.latMax - URUGUAY_BBOX.latMin)
    const lng = URUGUAY_BBOX.lngMin + rand() * (URUGUAY_BBOX.lngMax - URUGUAY_BBOX.lngMin)
    return {
      supplierId: s.id,
      rut: String(int(200000000000, 219999999999)),
      name: s.name,
      emails: [{ email, source: 'website', sourceUrl: null, confidence: 0.9, isRoleAccount: true, mxValid: true, status: 'valid' }],
      primaryEmail: email,
      website: `https://${s.domain}`,
      websiteSource: 'website',
      phone: `+598 ${int(90, 99)}${int(100, 999)} ${int(100, 999)}`,
      phoneSource: 'website',
      phones: [],
      websitePhone: null,
      websiteAddress: null,
      contactFormUrl: null,
      socialLinks: [],
      enrichmentMethods: ['crawl4ai'],
      address: null,
      locality: pick(INTENDENCIAS)[1].replace('Intendencia de ', ''),
      lat, lng,
      location: { type: 'Point', coordinates: [lng, lat] },
      hours: null,
      mapsUrl: null,
      placeId: null,
      placeSource: null,
      rubros,
      status: 'enriched',
      priorityScore: totalLines,
      enrichedAt: new Date(),
      neverAwarded: false,
      rupeEstado: null,
      enrichmentVersion: 1,
      mapsEnrichedAt: null,
      mapsEnrichmentVersion: 0,
    }
  })
  await SupplierContactModel.collection.insertMany(docs)
  console.log(`[seed-dev-db] done: ${docs.length} supplier_contacts.`)
}

// `execFileSync` does not go through a shell, so on Windows plain 'npm' is not
// an executable it can find and every job would die with ENOENT — caught below,
// downgraded to a warning, and the run would still report success with an empty
// fixture. Windows is the dev box for this repo, so resolve the real binary.
const NPM = process.platform === 'win32' ? 'npm.cmd' : 'npm'

const failedJobs: string[] = []
function runJob(npmScript: string) {
  console.log(`\n[seed-dev-db] npm run ${npmScript}`)
  try {
    execFileSync(NPM, ['run', npmScript], { stdio: 'inherit', cwd: __dirname + '/..' })
  }
  catch (err) {
    // One job failing is survivable — the fixture is still useful without, say,
    // product analytics. A job failing SILENTLY is not: it reads as a complete
    // fixture and the missing collection surfaces later as an empty page.
    failedJobs.push(npmScript)
    console.warn(`[seed-dev-db] "${npmScript}" failed — continuing. ${(err as Error).message}`)
  }
}

async function main() {
  await seedReleases()
  await seedSupplierContacts()
  await disconnectFromDatabase()

  if (releasesOnly) {
    console.log('\n[seed-dev-db] --releases-only: skipping the derived-data job chain.')
    return
  }

  // Real jobs rebuild every precomputed collection from `releases` — nothing
  // about their logic is duplicated here.
  runJob('ensure-indexes')
  runJob('refresh-analytics')
  runJob('detect-anomalies')
  runJob('refresh-dept-indicators')
  runJob('refresh-organism-groups')
  runJob('refresh-product-analytics')
  runJob('backfill-open-calls') // projects the openNow=true releases into open_calls (/llamados)
  runJob('refresh-contacts') // organism procurement contacts (/contactos)
  runJob('populate-filters')

  if (failedJobs.length) {
    console.error(`\n[seed-dev-db] ${failedJobs.length} job(s) FAILED: ${failedJobs.join(', ')}`)
    console.error('[seed-dev-db] `releases` and `supplier_contacts` were seeded, but the collections')
    console.error('[seed-dev-db] those jobs build are missing or stale — pages fed by them will be empty.')
    process.exitCode = 1
    return
  }

  console.log('\n[seed-dev-db] Fixture ready. Start the dashboard with: npm --prefix app run dev')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
