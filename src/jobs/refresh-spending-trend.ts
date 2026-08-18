#!/usr/bin/env tsx
/**
 * Precompute of the year-over-year spending analysis (`spending_trend`).
 *
 * The question this answers is "did the State spend more, or did money just
 * get cheaper?" — so almost all of the work here is removing the three things
 * that make a naive `SUM(amount.primaryAmount) GROUP BY year` a lie:
 *
 *   1. `primaryAmount` converted foreign currency at the rate of the day the
 *      ingest ran. Every figure below is rebuilt from `amount.totalAmounts`
 *      (currency -> amount) at the rate of the contract's OWN month.
 *   2. Pesos of 2003 are not pesos of 2025. Everything is also expressed in
 *      today's pesos via the Unidad Indexada of each contract's month.
 *   3. A handful of releases carry a contract lump sum in the unit price; one
 *      release is ~64% of 2003 and another ~64% of 2024. Those are detected on
 *      their REAL value, excluded, and listed one by one for public audit.
 *
 * What it writes, per year: the sanitised series (nominal / real / USD / per
 * capita / % GDP / % central-government expense), the exclusion list, an exact
 * additive bridge from the previous year, a partial price-vs-quantity lens over
 * comparable article codes, the buyers/categories/contracts that moved the
 * number, and a Spanish/English sentence describing all of it.
 *
 * Run: `npm run refresh-spending-trend` (add `--ai` to have Gemini rewrite the
 * generated sentences; the numbers are always ours). Monthly on the cron
 * server. Read-only over `releases`; writes only `spending_trend`.
 */
import { Types } from 'mongoose'
import { connectToDatabase } from '../../shared/connection/database'
import { callStructured } from '../../shared/ai/structured'
import { MACRO_URUGUAY, macroForYear } from '../../shared/macro-uruguay'
import { ExchangeRateModel, ReleaseModel, SiceCatalogModel, SpendingTrendModel } from '../../shared/models'
import type {
  ISpendingBridge,
  ISpendingContributor,
  ISpendingEvent,
  ISpendingExclusion,
  ISpendingPriceQuantity,
  ISpendingTrendYear,
} from '../../shared/models'
import { monthKey, toNominalUyu, type RateTable } from '../../shared/utils/real-value'
import { buildBridge, splitPriceQuantity, type BuyerYearTotals } from '../../shared/utils/spending-bridge'
import { canonicalUnitExpr } from '../../shared/utils/units'

/**
 * A release worth more than this in TODAY's pesos is a data artefact, not a
 * contract. Uruguay's largest genuine procurement is on the order of USD 1bn
 * (~4.5e10 UYU), so the ceiling sits just above it. Deliberately applied to the
 * REAL value: the fixed 5e10 nominal ceiling the other rollups use lets a 2003
 * artefact through while catching a legitimate 2025 megacontract.
 */
const ARTIFACT_CEIL_REAL = 5e10

/**
 * Candidate floor for the artefact scan, on `amount.primaryAmount` (indexed).
 * The largest deflation factor in the table is ~6.6x (2002 -> today), so
 * anything that could clear the real ceiling is above ceiling/6.6 ~ 7.6e9;
 * 5e9 leaves headroom. Everything above it is re-valued exactly.
 */
const ARTIFACT_CANDIDATE_FLOOR = 5e9

/** Article codes below this native-currency yearly value are dropped from the
 *  price/quantity lens — the long tail is 99% of the rows and ~0% of the money. */
const ITEM_VALUE_FLOOR_UYU = 500_000
const ITEM_VALUE_FLOOR_USD = 12_000

/**
 * Comparability gates for the price/quantity split. A code whose yearly quantity
 * moved 25x, or whose real unit price moved 10x, is a feed error or a redefined
 * article — not a purchasing decision — and its Laspeyres terms would dominate
 * the whole split. Rejected codes are counted, never silently dropped.
 */
const QTY_RATIO_CEIL = 25
const PRICE_RATIO_CEIL = 10

const TOP_N = 8

// ---------------------------------------------------------------------------
// Rates
// ---------------------------------------------------------------------------

async function loadRateTable(): Promise<RateTable> {
  const rows = await ExchangeRateModel.find({}, { month: 1, usd: 1, eur: 1, ui: 1 }).lean()
  const byMonth: RateTable['byMonth'] = {}
  let latestUi: number | null = null
  let latestUiMonth = ''
  for (const r of rows) {
    // Spread-in only the rates that exist: `exactOptionalPropertyTypes` rejects an
    // explicit `undefined` for an optional property.
    byMonth[r.month] = {
      ...(typeof r.usd === 'number' ? { usd: r.usd } : {}),
      ...(typeof r.eur === 'number' ? { eur: r.eur } : {}),
      ...(typeof r.ui === 'number' ? { ui: r.ui } : {}),
    }
    if (typeof r.ui === 'number' && r.ui > 0 && r.month > latestUiMonth) {
      latestUiMonth = r.month
      latestUi = r.ui
    }
  }
  return { byMonth, latestUi }
}

/** Yearly averages of the monthly UI and USD series — the bridge's deflator. */
function yearlyAverages(table: RateTable): Map<number, { ui: number | null, usd: number | null }> {
  const acc = new Map<number, { ui: number[], usd: number[] }>()
  for (const [month, rate] of Object.entries(table.byMonth)) {
    const year = Number(month.slice(0, 4))
    if (!Number.isFinite(year)) continue
    const bucket = acc.get(year) ?? { ui: [], usd: [] }
    if (typeof rate.ui === 'number' && rate.ui > 0) bucket.ui.push(rate.ui)
    if (typeof rate.usd === 'number' && rate.usd > 0) bucket.usd.push(rate.usd)
    acc.set(year, bucket)
  }
  const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null)
  return new Map([...acc].map(([y, b]) => [y, { ui: mean(b.ui), usd: mean(b.usd) }]))
}

/** UYU of `month` -> today's pesos. Null when the month has no UI. */
function deflatorForMonth(table: RateTable, month: string): number | null {
  if (!table.latestUi) return null
  const exact = table.byMonth[month]
  let ui = exact?.ui
  if (!ui) {
    const earlier = Object.keys(table.byMonth).filter(m => m <= month).sort()
    for (let i = earlier.length - 1; i >= 0; i--) {
      const candidate = table.byMonth[earlier[i]!]?.ui
      if (candidate) { ui = candidate; break }
    }
  }
  return ui ? table.latestUi / ui : null
}

// ---------------------------------------------------------------------------
// Aggregation row shapes
// ---------------------------------------------------------------------------

interface MoneyRow {
  _id: { y: number, m: number, b: string, c: string }
  amount: number
}
interface CountRow { _id: number, n: number }
interface LabelRow { _id: string, label: string }
interface ItemRow {
  _id: { y: number, code: string, unit: string, cur: string }
  qty: number
  value: number
}
interface SupplierRow { _id: number, n: number }

/** Per (year, buyer): own-month nominal UYU and today's-pesos real UYU. */
type BuyerYear = BuyerYearTotals

function monthStr(y: number, m: number): string {
  return `${y}-${String(m).padStart(2, '0')}`
}

/**
 * A human label for a contract. `tender.title` is blank on a large share of the
 * older feed, so fall back through the award title and the first line item —
 * an untitled row in the events table tells the reader nothing.
 */
function releaseTitle(doc: any): string {
  // Award-only releases (the direct-purchase majority) carry NO `tender` object
  // at all, and their items have no `description` — the only human string on the
  // document is `classification.description`. Award `title` is the resolution
  // number ("R/2101945…"), which names nothing, so it is the last resort.
  const candidates = [
    doc?.tender?.title,
    doc?.awards?.[0]?.items?.[0]?.description,
    doc?.awards?.[0]?.items?.[0]?.classification?.description,
    doc?.tender?.description,
    doc?.awards?.[0]?.title,
  ]
  for (const c of candidates) {
    const s = typeof c === 'string' ? c.trim() : ''
    if (s) return s.length > 160 ? `${s.slice(0, 157)}…` : s
  }
  return ''
}

// ---------------------------------------------------------------------------
// Narrative
// ---------------------------------------------------------------------------

const fmtEs = new Intl.NumberFormat('es-UY', { maximumFractionDigits: 1 })
const fmtEn = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 })

/** Compact money in the locale's own words: "1,2 billones" / "1.2 trillion". */
function money(value: number, locale: 'es' | 'en'): string {
  const abs = Math.abs(value)
  const fmt = locale === 'es' ? fmtEs : fmtEn
  if (abs >= 1e12) return `$ ${fmt.format(value / 1e12)} ${locale === 'es' ? 'billones' : 'trillion'}`
  if (abs >= 1e9) return `$ ${fmt.format(value / 1e9)} ${locale === 'es' ? 'mil millones' : 'billion'}`
  if (abs >= 1e6) return `$ ${fmt.format(value / 1e6)} ${locale === 'es' ? 'millones' : 'million'}`
  return `$ ${fmt.format(value)}`
}

function pct(value: number, locale: 'es' | 'en'): string {
  return `${(locale === 'es' ? fmtEs : fmtEn).format(value * 100)}%`
}

/**
 * The deterministic sentence. Every figure comes from the bridge, so the text
 * cannot drift from the chart above it.
 */
function buildNarrative(
  doc: Pick<ISpendingTrendYear, 'year' | 'nominalUyu' | 'partial'>,
  bridge: ISpendingBridge,
  topBuyer: ISpendingContributor | undefined,
  event: ISpendingEvent | undefined,
  pq: ISpendingPriceQuantity | null,
  locale: 'es' | 'en',
): string {
  const nominalDelta = bridge.total - bridge.base
  const nominalPct = bridge.base > 0 ? nominalDelta / bridge.base : 0
  const realPct = bridge.base > 0 ? bridge.realDelta / bridge.base : 0
  const up = nominalDelta >= 0
  const realUp = bridge.realDelta >= 0
  const parts: string[] = []

  if (locale === 'es') {
    parts.push(
      `En ${doc.year} las compras del Estado sumaron ${money(bridge.total, 'es')}, `
      + `${up ? 'un aumento' : 'una caída'} de ${pct(Math.abs(nominalPct), 'es')} frente a ${doc.year - 1} en pesos corrientes.`,
    )
    parts.push(
      `La inflación explica ${money(Math.abs(bridge.inflation), 'es')} de ese movimiento: `
      + `descontada, el gasto ${realUp ? 'subió' : 'bajó'} ${pct(Math.abs(realPct), 'es')} real.`,
    )
    const coverage = bridge.entrants + bridge.exits
    if (Math.abs(coverage) > Math.abs(bridge.realDelta) * 0.1) {
      parts.push(
        `${money(Math.abs(coverage), 'es')} de la variación real no es más gasto sino más (o menos) cobertura: `
        + `${bridge.entrantBuyers} organismos reportaron en ${doc.year} sin haber reportado en ${doc.year - 1} y ${bridge.exitBuyers} dejaron de reportar.`,
      )
    }
    if (event) {
      // A contract can be worth MORE than the year's net change (other things moved
      // the other way). "Pesa 170% de la variación" reads as an error; say it plainly.
      const weight = event.share > 1
        ? `pesa ${fmtEs.format(event.share)} veces la variación real de todo el año`
        : `pesa ${pct(event.share, 'es')} de la variación real`
      parts.push(
        `Un solo contrato ${weight}: ${event.title || 'sin título'} `
        + `(${event.buyerName}${event.supplierName ? ` → ${event.supplierName}` : ''}, ${money(event.nominalUyu, 'es')}).`,
      )
    }
    else if (topBuyer && Math.abs(topBuyer.share) > 0.1) {
      parts.push(`El organismo que más movió la aguja fue ${topBuyer.label}, con ${money(topBuyer.delta, 'es')} (${pct(topBuyer.share, 'es')} de la variación real).`)
    }
    if (pq && pq.coverage > 0.2 && Math.abs(pq.matchedDelta) > 0) {
      const priceShare = pq.price / (Math.abs(pq.price) + Math.abs(pq.quantity) || 1)
      parts.push(
        `En los rubros comparables (${pct(pq.coverage, 'es')} del año), el cambio se reparte entre `
        + `${money(pq.price, 'es')} por precio unitario y ${money(pq.quantity, 'es')} por cantidad comprada — `
        + `${Math.abs(priceShare) > 0.5 ? 'pesa más el precio' : 'pesa más la cantidad'}.`,
      )
    }
    if (doc.partial) parts.push(`Ojo: ${doc.year} está en curso, el total todavía no es comparable con un año completo.`)
    return parts.join(' ')
  }

  parts.push(
    `In ${doc.year} public procurement totalled ${money(bridge.total, 'en')}, `
    + `${up ? 'up' : 'down'} ${pct(Math.abs(nominalPct), 'en')} on ${doc.year - 1} in current pesos.`,
  )
  parts.push(
    `Inflation accounts for ${money(Math.abs(bridge.inflation), 'en')} of that: net of it, spending `
    + `${realUp ? 'rose' : 'fell'} ${pct(Math.abs(realPct), 'en')} in real terms.`,
  )
  const coverage = bridge.entrants + bridge.exits
  if (Math.abs(coverage) > Math.abs(bridge.realDelta) * 0.1) {
    parts.push(
      `${money(Math.abs(coverage), 'en')} of the real change is not more spending but more (or less) coverage: `
      + `${bridge.entrantBuyers} bodies reported in ${doc.year} that had not in ${doc.year - 1}, and ${bridge.exitBuyers} stopped reporting.`,
    )
  }
  if (event) {
    const weight = event.share > 1
      ? `is worth ${fmtEn.format(event.share)} times the whole year's real change`
      : `is ${pct(event.share, 'en')} of the real change`
    parts.push(
      `A single contract ${weight}: ${event.title || 'untitled'} `
      + `(${event.buyerName}${event.supplierName ? ` → ${event.supplierName}` : ''}, ${money(event.nominalUyu, 'en')}).`,
    )
  }
  else if (topBuyer && Math.abs(topBuyer.share) > 0.1) {
    parts.push(`The body that moved the number most was ${topBuyer.label}, with ${money(topBuyer.delta, 'en')} (${pct(topBuyer.share, 'en')} of the real change).`)
  }
  if (pq && pq.coverage > 0.2 && Math.abs(pq.matchedDelta) > 0) {
    const priceShare = pq.price / (Math.abs(pq.price) + Math.abs(pq.quantity) || 1)
    parts.push(
      `Across comparable article codes (${pct(pq.coverage, 'en')} of the year), the change splits into `
      + `${money(pq.price, 'en')} from unit prices and ${money(pq.quantity, 'en')} from quantities — `
      + `${Math.abs(priceShare) > 0.5 ? 'price dominates' : 'quantity dominates'}.`,
    )
  }
  if (doc.partial) parts.push(`Note: ${doc.year} is still running, so the total is not comparable with a full year.`)
  return parts.join(' ')
}

/**
 * Every numeric token in a string, as a SORTED multiset.
 *
 * Sorted, not in reading order: a rewrite is allowed to move clauses around
 * (that is most of what makes it read better), but it is not allowed to invent,
 * drop or alter a figure. Comparing the multiset catches all three while
 * tolerating the reordering. Whitespace inside a figure is dropped so
 * "$ 179,6" and "$179,6" compare equal; the digits themselves are untouched.
 */
export function numericFingerprint(s: string): string {
  return (s.match(/\d[\d.,]*/g) ?? [])
    .map(t => t.replace(/[.,]$/, ''))
    .sort()
    .join('|')
}

/** Why a rewrite was not used — logged so a silent zero-accept run is diagnosable. */
type PolishOutcome =
  | { ok: true, es: string, en: string }
  | { ok: false, reason: 'error' | 'mismatch', detail?: string }

/**
 * Optional Gemini pass. It is given the finished sentences and told to rewrite
 * them for readability WITHOUT touching a figure; any output whose numbers do
 * not match is rejected and the deterministic text is kept.
 */
export async function polishNarrative(
  es: string,
  en: string,
  model: string,
  apiKey: string,
): Promise<PolishOutcome> {
  try {
    const { data } = await callStructured<{ es: string, en: string }>({
      apiKey,
      model,
      systemInstruction:
        'Sos editor de un sitio de transparencia sobre compras públicas de Uruguay. '
        + 'Reescribís textos para que se lean fluidos y claros para público general. '
        + 'REGLA ABSOLUTA sobre las cifras: copiá cada número EXACTAMENTE como aparece, '
        + 'carácter por carácter, incluida su escala en palabras. Si el texto dice '
        + '"$ 179,6 mil millones" tenés que escribir "$ 179,6 mil millones": está prohibido '
        + 'convertirlo a "179.600 millones", redondearlo, cambiarle los separadores o pasarlo a dígitos. '
        + 'Tampoco podés agregar ni quitar cifras, porcentajes, años, unidades ni nombres propios. '
        + 'No agregues juicios de valor, causas ni contexto que no esté en el texto. '
        + 'Podés reordenar las oraciones y cambiar la redacción alrededor de las cifras.',
      prompt: `Reescribí estos dos textos (mismo contenido, mejor redacción, cifras intactas).\n\nES:\n${es}\n\nEN:\n${en}`,
      schema: {
        type: 'OBJECT',
        properties: { es: { type: 'STRING' }, en: { type: 'STRING' } },
        required: ['es', 'en'],
      },
      temperature: 0.2,
      timeoutMs: 45_000,
      maxRetries: 2,
    })
    // Guard: every figure must survive the rewrite untouched.
    if (numericFingerprint(data.es) !== numericFingerprint(es)) {
      return { ok: false, reason: 'mismatch', detail: `es: ${numericFingerprint(es)} -> ${numericFingerprint(data.es)}` }
    }
    if (numericFingerprint(data.en) !== numericFingerprint(en)) {
      return { ok: false, reason: 'mismatch', detail: `en: ${numericFingerprint(en)} -> ${numericFingerprint(data.en)}` }
    }
    return { ok: true, es: data.es.trim(), en: data.en.trim() }
  }
  catch (err) {
    return { ok: false, reason: 'error', detail: err instanceof Error ? err.message : String(err) }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function run(): Promise<void> {
  const started = Date.now()
  if (!process.env.MONGO_SOCKET_TIMEOUT_MS) {
    process.env.MONGO_SOCKET_TIMEOUT_MS = String(30 * 60 * 1000)
  }
  const useAi = process.argv.includes('--ai')
  const dataVersion = `v${Date.now()}`
  const aggOpts = { allowDiskUse: true, maxTimeMS: 25 * 60 * 1000 }

  console.log('[spending-trend] connecting…')
  await connectToDatabase()

  const rates = await loadRateTable()
  if (!rates.latestUi) throw new Error('exchange_rates has no UI series — run refresh-exchange-rates first')
  const yearAvg = yearlyAverages(rates)
  console.log(`[spending-trend] rate table: ${Object.keys(rates.byMonth).length} months, latest UI ${rates.latestUi}`)

  // -- 1. Artefacts and verified overrides -----------------------------------
  // Both are release-level exceptions, and both are small enough to handle one
  // by one: they are pulled out of the bulk aggregation and folded back in Node.
  console.log('[spending-trend] scanning artefact candidates…')
  const candidates = await ReleaseModel.find(
    { 'amount.primaryAmount': { $gt: ARTIFACT_CANDIDATE_FLOOR } },
    {
      ocid: 1,
      date: 1,
      'buyer.id': 1,
      'buyer.name': 1,
      'tender.title': 1,
      'tender.description': 1,
      'awards.title': 1,
      'awards.items.description': 1,
        'awards.items.classification.description': 1,
      'amount.totalAmounts': 1,
      'amount.primaryAmount': 1,
      'amount.verifiedOverride': 1,
    },
  ).lean()

  const overrides = await ReleaseModel.find(
    { 'amount.verifiedOverride': { $exists: true } },
    { ocid: 1, date: 1, 'buyer.id': 1, 'buyer.name': 1, 'amount.primaryAmount': 1 },
  ).lean()

  /** Own-month UYU for a totalAmounts map. `null` currencies are reported back. */
  const nominalOf = (
    totalAmounts: unknown,
    month: string | null,
  ): { nominal: number, unconvertible: string[] } => {
    const map = totalAmounts instanceof Map
      ? Object.fromEntries(totalAmounts)
      : (totalAmounts as Record<string, number> | null | undefined) ?? {}
    let nominal = 0
    const unconvertible: string[] = []
    for (const [currency, raw] of Object.entries(map)) {
      const value = Number(raw)
      if (!Number.isFinite(value) || value === 0) continue
      const converted = toNominalUyu(value, currency, month, rates)
      if (converted === null) unconvertible.push(currency)
      else nominal += converted
    }
    return { nominal, unconvertible }
  }

  const excludedIds = new Set<string>()
  const exclusionsByYear = new Map<number, ISpendingExclusion[]>()
  const pushExclusion = (year: number, e: ISpendingExclusion) => {
    const list = exclusionsByYear.get(year) ?? []
    list.push(e)
    exclusionsByYear.set(year, list)
  }

  for (const r of candidates) {
    if ((r as any).amount?.verifiedOverride) continue // already corrected, keep it
    const month = monthKey(r.date as Date)
    const { nominal } = nominalOf((r as any).amount?.totalAmounts, month)
    const deflator = month ? deflatorForMonth(rates, month) : null
    const real = deflator ? nominal * deflator : nominal
    if (real <= ARTIFACT_CEIL_REAL) continue
    const year = (r.date as Date).getUTCFullYear()
    excludedIds.add(String(r._id))
    pushExclusion(year, {
      releaseId: String(r._id),
      ocid: r.ocid ?? '',
      buyerName: (r as any).buyer?.name ?? '',
      title: releaseTitle(r),
      nominalUyu: nominal,
      reason: 'artifact-ceiling',
    })
  }
  console.log(`[spending-trend] ${candidates.length} candidates scanned → ${excludedIds.size} artefacts excluded, ${overrides.length} verified overrides handled separately`)

  const overrideIds = new Set(overrides.map(o => String(o._id)))
  const skipObjectIds = [...excludedIds, ...overrideIds].map(id => new Types.ObjectId(id))
  const excludedObjectIds = [...excludedIds].map(id => new Types.ObjectId(id))

  // -- 2. The money, by year x month x buyer x currency ----------------------
  // Month granularity is what makes both conversions exact: each currency is
  // converted at its own month's rate and deflated by its own month's UI.
  console.log('[spending-trend] aggregating money…')
  const buyerKeyExpr = { $ifNull: ['$buyer.id', { $concat: ['name:', { $ifNull: ['$buyer.name', '?'] }] }] }
  const moneyRows: MoneyRow[] = await ReleaseModel.aggregate([
    {
      $match: {
        'amount.hasAmounts': true,
        'amount.primaryAmount': { $gt: 0 },
        'date': { $ne: null },
        '_id': { $nin: skipObjectIds },
      },
    },
    {
      $project: {
        y: { $year: '$date' },
        m: { $month: '$date' },
        b: buyerKeyExpr,
        ta: { $objectToArray: { $ifNull: ['$amount.totalAmounts', {}] } },
      },
    },
    { $unwind: '$ta' },
    { $group: { _id: { y: '$y', m: '$m', b: '$b', c: '$ta.k' }, amount: { $sum: '$ta.v' } } },
  ]).option(aggOpts)
  console.log(`[spending-trend] ${moneyRows.length} money rows`)

  // -- 3. Counts and labels --------------------------------------------------
  // `unconvertible` = releases quoting a currency the BCU table does not carry
  // (GBP, BRL, CHF, ZAR, CAD, ARS — ~180 releases in total). Their value cannot
  // be stated in pesos of their own month, so it is reported, never guessed.
  const CONVERTIBLE = ['UYU', 'USD', 'EUR', 'UYI', 'UI', 'UUYI']
  const [countRows, labelRows, unconvertibleRows]: [CountRow[], LabelRow[], CountRow[]] = await Promise.all([
    ReleaseModel.aggregate<CountRow>([
      { $match: { 'amount.hasAmounts': true, 'amount.primaryAmount': { $gt: 0 }, 'date': { $ne: null } } },
      { $group: { _id: { $year: '$date' }, n: { $sum: 1 } } },
    ]).option(aggOpts),
    ReleaseModel.aggregate<LabelRow>([
      { $match: { 'date': { $ne: null }, 'buyer.name': { $ne: null } } },
      { $group: { _id: buyerKeyExpr, label: { $last: '$buyer.name' } } },
    ]).option(aggOpts),
    ReleaseModel.aggregate<CountRow>([
      { $match: { 'amount.currencies': { $nin: CONVERTIBLE, $exists: true }, 'date': { $ne: null } } },
      { $group: { _id: { $year: '$date' }, n: { $sum: 1 } } },
    ]).option(aggOpts),
  ])
  const buyerLabel = new Map(labelRows.map(r => [r._id, r.label]))
  const releasesByYear = new Map(countRows.map(r => [r._id, r.n]))
  const unconvertibleByYear = new Map(unconvertibleRows.map(r => [r._id, r.n]))

  // -- 4. Items (price vs quantity) and distinct suppliers -------------------
  // The artefact and override releases are skipped here too: their line items are
  // exactly the ones with a lump sum in the unit price, so leaving them in would
  // poison both the category table and the price/quantity lens.
  console.log('[spending-trend] aggregating items…')
  const itemRows: ItemRow[] = await ReleaseModel.aggregate([
    { $match: { 'amount.hasAmounts': true, 'date': { $ne: null }, '_id': { $nin: skipObjectIds } } },
    { $project: { y: { $year: '$date' }, awards: '$awards' } },
    { $unwind: '$awards' },
    { $unwind: '$awards.items' },
    {
      $match: {
        'awards.items.classification.id': { $nin: [null, '', '0'] },
        'awards.items.quantity': { $gt: 0 },
        'awards.items.unit.value.amount': { $gt: 0 },
        'awards.items.unit.value.currency': { $in: ['UYU', 'USD'] },
      },
    },
    {
      $group: {
        _id: {
          y: '$y',
          code: { $toString: '$awards.items.classification.id' },
          unit: canonicalUnitExpr('$awards.items.unit.name'),
          cur: '$awards.items.unit.value.currency',
        },
        qty: { $sum: '$awards.items.quantity' },
        value: { $sum: { $multiply: ['$awards.items.quantity', '$awards.items.unit.value.amount'] } },
      },
    },
    {
      $match: {
        $expr: {
          $or: [
            { $and: [{ $eq: ['$_id.cur', 'UYU'] }, { $gte: ['$value', ITEM_VALUE_FLOOR_UYU] }] },
            { $and: [{ $eq: ['$_id.cur', 'USD'] }, { $gte: ['$value', ITEM_VALUE_FLOOR_USD] }] },
          ],
        },
      },
    },
  ]).option(aggOpts)
  console.log(`[spending-trend] ${itemRows.length} item rows`)

  const supplierRows: SupplierRow[] = await ReleaseModel.aggregate([
    { $match: { 'amount.hasAmounts': true, 'date': { $ne: null } } },
    { $project: { y: { $year: '$date' }, s: '$awards.suppliers.id' } },
    { $unwind: '$s' },
    { $unwind: '$s' },
    { $group: { _id: { y: '$y', s: '$s' } } },
    { $group: { _id: '$_id.y', n: { $sum: 1 } } },
  ]).option(aggOpts)
  const suppliersByYear = new Map(supplierRows.map(r => [r._id, r.n]))

  // -- 5. Fold the money rows into per-year and per-(year,buyer) totals ------
  const perYear = new Map<number, { nominal: number, real: number, usd: number, skippedRows: number }>()
  const perYearBuyer = new Map<number, Map<string, BuyerYear>>()

  const addBuyer = (year: number, buyer: string, nominal: number, real: number) => {
    const inner = perYearBuyer.get(year) ?? new Map<string, BuyerYear>()
    const cur = inner.get(buyer) ?? { nominal: 0, real: 0 }
    cur.nominal += nominal
    cur.real += real
    inner.set(buyer, cur)
    perYearBuyer.set(year, inner)
  }

  for (const row of moneyRows) {
    const { y, m, b, c } = row._id
    const month = monthStr(y, m)
    const nominal = toNominalUyu(row.amount, c, month, rates)
    const bucket = perYear.get(y) ?? { nominal: 0, real: 0, usd: 0, skippedRows: 0 }
    if (nominal === null) {
      // No BCU rate for this currency/month. Counted so a systemic gap shows up
      // in the run log; the public figure is the release-level
      // `unconvertibleCount`, which is what the page cites.
      bucket.skippedRows += 1
      perYear.set(y, bucket)
      continue
    }
    const deflator = deflatorForMonth(rates, month) ?? 1
    const usdRate = rates.byMonth[month]?.usd ?? yearAvg.get(y)?.usd ?? null
    bucket.nominal += nominal
    bucket.real += nominal * deflator
    bucket.usd += usdRate ? nominal / usdRate : 0
    perYear.set(y, bucket)
    addBuyer(y, b, nominal, nominal * deflator)
  }

  // Verified overrides: `primaryAmount` already holds the official total converted
  // at the rate of its own month, so it is the correct historical figure here.
  for (const o of overrides) {
    const date = o.date as Date | undefined
    if (!date) continue
    const y = date.getUTCFullYear()
    const month = monthKey(date)!
    const nominal = Number((o as any).amount?.primaryAmount ?? 0)
    if (!Number.isFinite(nominal) || nominal <= 0) continue
    const deflator = deflatorForMonth(rates, month) ?? 1
    const usdRate = rates.byMonth[month]?.usd ?? null
    const bucket = perYear.get(y) ?? { nominal: 0, real: 0, usd: 0, skippedRows: 0 }
    bucket.nominal += nominal
    bucket.real += nominal * deflator
    bucket.usd += usdRate ? nominal / usdRate : 0
    perYear.set(y, bucket)
    addBuyer(y, (o as any).buyer?.id ?? `name:${(o as any).buyer?.name ?? '?'}`, nominal, nominal * deflator)
  }

  // -- 6. Item table folded per (year, code) and per (year, code, unit) ------
  const codeYearValue = new Map<number, Map<string, number>>() // categories
  interface CodeUnit { qty: number, value: number }
  const codeUnitYear = new Map<number, Map<string, CodeUnit>>() // `${code}|${unit}`

  for (const row of itemRows) {
    const { y, code, unit, cur } = row._id
    const rate = cur === 'USD' ? (yearAvg.get(y)?.usd ?? null) : 1
    if (rate === null) continue
    const valueUyu = row.value * rate
    const byCode = codeYearValue.get(y) ?? new Map<string, number>()
    byCode.set(code, (byCode.get(code) ?? 0) + valueUyu)
    codeYearValue.set(y, byCode)

    // Price/quantity needs a single currency per code+unit series; USD rows are
    // converted at the year average, which is enough for a direction signal.
    const key = `${code}|${unit}`
    const byUnit = codeUnitYear.get(y) ?? new Map<string, CodeUnit>()
    const acc = byUnit.get(key) ?? { qty: 0, value: 0 }
    acc.qty += row.qty
    acc.value += valueUyu
    byUnit.set(key, acc)
    codeUnitYear.set(y, byUnit)
  }

  // Names for the category table — only the codes we will actually show.
  const wantedCodes = new Set<string>()
  for (const byCode of codeYearValue.values()) for (const code of byCode.keys()) wantedCodes.add(code)
  const catalog = wantedCodes.size
    ? await SiceCatalogModel.find({ code: { $in: [...wantedCodes] } }, { code: 1, canonicalName: 1 }).lean()
    : []
  const codeName = new Map(catalog.map(c => [c.code, c.canonicalName]))

  // -- 7. Events: the contracts big enough to move a year on their own -------
  const years = [...perYear.keys()].filter(y => y >= 2002 && y <= new Date().getUTCFullYear()).sort((a, b) => a - b)
  const eventsByYear = new Map<number, Array<{ doc: any, nominal: number }>>()
  for (const y of years) {
    const top = await ReleaseModel.find(
      {
        sourceYear: y,
        'amount.primaryAmount': { $gt: 0 },
        '_id': { $nin: excludedObjectIds },
      },
      {
        ocid: 1,
        date: 1,
        'tender.title': 1,
        'tender.description': 1,
        'awards.title': 1,
        'awards.items.description': 1,
        'awards.items.classification.description': 1,
        'buyer.name': 1,
        'awards.suppliers.name': 1,
        'amount.totalAmounts': 1,
        'amount.primaryAmount': 1,
      },
    ).sort({ 'amount.primaryAmount': -1 }).limit(12).lean()
    const scored = top.map((r) => {
      const month = monthKey(r.date as Date)
      const { nominal } = nominalOf((r as any).amount?.totalAmounts, month)
      return { doc: r, nominal: nominal || Number((r as any).amount?.primaryAmount ?? 0) }
    }).sort((a, b) => b.nominal - a.nominal)
    eventsByYear.set(y, scored)
  }

  // -- 8. Assemble ------------------------------------------------------------
  const currentYear = new Date().getUTCFullYear()
  const docs: ISpendingTrendYear[] = []

  for (const year of years) {
    const totals = perYear.get(year)!
    const prev = perYear.get(year - 1)
    const uiAvg = yearAvg.get(year)?.ui ?? null
    const uiAvgPrev = yearAvg.get(year - 1)?.ui ?? null
    const macro = macroForYear(year)
    const exclusions = exclusionsByYear.get(year) ?? []
    const excludedNominal = exclusions.reduce((s, e) => s + e.nominalUyu, 0)

    // The bridge, all terms in pesos of `year`. k converts today's pesos back to
    // this year's price level, so `real(prev) * k` is last year's spend repriced.
    const k = uiAvg && rates.latestUi ? uiAvg / rates.latestUi : null
    let bridge: ISpendingBridge | null = null
    let topBuyers: ISpendingContributor[] = []

    if (prev && k !== null && uiAvgPrev) {
      const out = buildBridge({
        prevNominal: prev.nominal,
        curNominal: totals.nominal,
        prevReal: prev.real,
        k,
        prevBuyers: perYearBuyer.get(year - 1) ?? new Map<string, BuyerYearTotals>(),
        curBuyers: perYearBuyer.get(year) ?? new Map<string, BuyerYearTotals>(),
      })
      bridge = out.bridge

      const denom = Math.abs(out.bridge.realDelta) || 1
      topBuyers = out.contributions
        .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
        .slice(0, TOP_N)
        .map(c => ({
          key: c.key,
          label: buyerLabel.get(c.key) ?? c.key,
          delta: c.delta,
          share: c.delta / denom,
          current: c.current,
          previous: c.previous,
        }))
    }

    // Categories: same repricing, over article codes.
    let topCategories: ISpendingContributor[] = []
    if (bridge && k !== null && uiAvgPrev) {
      const inflationFactor = uiAvg! / uiAvgPrev
      const cur = codeYearValue.get(year) ?? new Map<string, number>()
      const before = codeYearValue.get(year - 1) ?? new Map<string, number>()
      const denom = Math.abs(bridge.realDelta) || 1
      const rows: ISpendingContributor[] = []
      const seen = new Set([...cur.keys(), ...before.keys()])
      for (const code of seen) {
        const now = cur.get(code) ?? 0
        const then = (before.get(code) ?? 0) * inflationFactor
        const delta = now - then
        // No single article code can move more than the whole year's spend; when
        // one appears to, a lump-sum line is being multiplied by its quantity.
        if (Math.abs(delta) > totals.nominal) continue
        rows.push({
          key: code,
          label: codeName.get(code) ?? code,
          delta,
          share: delta / denom,
          current: now,
          previous: then,
        })
      }
      topCategories = rows.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, TOP_N)
    }

    // Price vs quantity over article codes present in both years.
    //
    // Quantities in the feed are integer-floored and, on lump-sum lines, plain
    // wrong (a "quantity" of 10.000 against a contract total). A single such
    // pair produces a +/-1e15 pair of terms that cancel to a meaningless net, so
    // three comparability gates run first and everything they reject is counted
    // in `droppedCodes` rather than quietly folded in.
    let priceQuantity: ISpendingPriceQuantity | null = null
    if (uiAvg && uiAvgPrev) {
      priceQuantity = splitPriceQuantity(
        codeUnitYear.get(year) ?? new Map<string, CodeUnit>(),
        codeUnitYear.get(year - 1) ?? new Map<string, CodeUnit>(),
        {
          inflationFactor: uiAvg / uiAvgPrev,
          yearTotal: totals.nominal,
          qtyRatioCeil: QTY_RATIO_CEIL,
          priceRatioCeil: PRICE_RATIO_CEIL,
          contributionCap: Math.max(totals.nominal * 0.05, 1),
        },
      )
    }

    // Events: contracts worth more than 10% of the year's real change.
    const events: ISpendingEvent[] = []
    if (bridge && Math.abs(bridge.realDelta) > 0) {
      for (const { doc, nominal } of (eventsByYear.get(year) ?? []).slice(0, TOP_N)) {
        const share = nominal / Math.abs(bridge.realDelta)
        events.push({
          releaseId: String(doc._id),
          ocid: doc.ocid ?? '',
          title: releaseTitle(doc),
          buyerName: doc.buyer?.name ?? '',
          supplierName: doc.awards?.[0]?.suppliers?.[0]?.name ?? '',
          nominalUyu: nominal,
          share,
        })
      }
    }

    const population = macro?.population ?? null
    const gdp = macro?.gdpNominalUyu ?? null
    const govExpense = macro?.centralGovExpenseUyu ?? null

    const doc: ISpendingTrendYear = {
      year,
      partial: year >= currentYear,
      nominalUyu: totals.nominal,
      realUyu: totals.real,
      usd: totals.usd,
      rawNominalUyu: totals.nominal + excludedNominal,
      releases: releasesByYear.get(year) ?? 0,
      buyers: (perYearBuyer.get(year) ?? new Map()).size,
      suppliers: suppliersByYear.get(year) ?? 0,
      uiAvg,
      usdAvg: yearAvg.get(year)?.usd ?? null,
      gdpNominalUyu: gdp,
      pctOfGdp: gdp ? totals.nominal / gdp : null,
      centralGovExpenseUyu: govExpense,
      pctOfCentralGovExpense: govExpense ? totals.nominal / govExpense : null,
      population,
      realPerCapita: population ? totals.real / population : null,
      usdPerCapita: population ? totals.usd / population : null,
      exclusions,
      excludedCount: exclusions.length,
      excludedNominalUyu: excludedNominal,
      unconvertibleCount: unconvertibleByYear.get(year) ?? 0,
      bridge,
      priceQuantity,
      topBuyers,
      topCategories,
      events,
      narrativeEs: '',
      narrativeEn: '',
      narrativeSource: 'template',
      dataVersion,
      calculatedAt: new Date(),
    }

    if (bridge) {
      const headline = events.find(e => e.share > 0.1)
      doc.narrativeEs = buildNarrative(doc, bridge, topBuyers[0], headline, priceQuantity, 'es')
      doc.narrativeEn = buildNarrative(doc, bridge, topBuyers[0], headline, priceQuantity, 'en')
    }
    else {
      doc.narrativeEs = `${year} es el primer año de la serie: no hay año anterior contra el cual comparar.`
      doc.narrativeEn = `${year} is the first year in the series, so there is nothing to compare it against.`
    }

    docs.push(doc)
  }

  // -- 9. Optional Gemini polish ---------------------------------------------
  if (useAi) {
    const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? ''
    const model = process.env.SPENDING_TREND_GEMINI_MODEL || 'gemini-2.5-flash-lite'
    if (!apiKey) {
      console.warn('[spending-trend] --ai requested but GEMINI_API_KEY is unset — keeping template text')
    }
    else {
      let polished = 0
      let mismatched = 0
      let errored = 0
      let firstReason = ''
      for (const doc of docs) {
        if (!doc.bridge) continue
        const out = await polishNarrative(doc.narrativeEs, doc.narrativeEn, model, apiKey)
        if (!out.ok) {
          if (out.reason === 'error') errored += 1
          else mismatched += 1
          if (!firstReason) firstReason = `${out.reason}: ${out.detail ?? ''}`
          continue
        }
        doc.narrativeEs = out.es
        doc.narrativeEn = out.en
        doc.narrativeSource = 'gemini'
        polished += 1
      }
      console.log(
        `[spending-trend] Gemini rewrote ${polished}/${docs.length} narratives `
        + `(${mismatched} rejected on figures, ${errored} failed). Rejected years keep the template text.`,
      )
      if (firstReason) console.log(`[spending-trend]   first rejection — ${firstReason.slice(0, 300)}`)
    }
  }

  // -- 10. Write -------------------------------------------------------------
  // Upsert keyed on `year`, then sweep years no longer produced. Deliberately
  // NOT `deleteMany({ dataVersion: { $ne } })`: two overlapping runs of that
  // pattern delete each other's generation and empty the collection.
  console.log('[spending-trend] writing…')
  for (const doc of docs) {
    await SpendingTrendModel.replaceOne({ year: doc.year }, doc, { upsert: true })
  }
  const swept = await SpendingTrendModel.deleteMany({ year: { $nin: docs.map(d => d.year) } })

  const macroYears = MACRO_URUGUAY.filter(m => m.gdpNominalUyu !== null).length
  console.log(
    `[spending-trend] done in ${((Date.now() - started) / 1000).toFixed(1)}s — `
    + `${docs.length} years, ${excludedIds.size} artefacts excluded, ${macroYears} macro years, swept ${swept.deletedCount}`,
  )
  for (const d of docs.slice(-6)) {
    console.log(
      `  ${d.year}: nominal $${(d.nominalUyu / 1e9).toFixed(1)}B · real $${(d.realUyu / 1e9).toFixed(1)}B`
      + ` · ${d.releases} releases · ${d.buyers} buyers`
      + (d.bridge ? ` · Δreal ${(d.bridge.realDelta / 1e9).toFixed(1)}B (infl ${(d.bridge.inflation / 1e9).toFixed(1)}B)` : ''),
    )
  }
}

if (require.main === module) {
  run()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[spending-trend] failed:', err)
      process.exit(1)
    })
}

export { run }
