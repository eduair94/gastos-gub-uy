<script setup lang="ts">
import { toQueryListParam } from '#shared/utils/query-list'
import { canonicalUnit } from '#shared/utils/units'

// `te` checks a key exists before we translate an OCDS documentType we
// may not have a Spanish label for.
const { t, te } = useI18n()
const localePath = useLocalePath()
const route = useRoute()

const id = computed(() => String(route.params.id))

const { data: res, error } = await useFetch<any>(() => `/api/contracts/${encodeURIComponent(id.value)}`)

const contract = computed<ContractLike | null>(() => res.value?.data ?? null)

// Guard against double-firing between SSR hydration and a later client nav.
const { track } = useAnalytics()
let viewedId = ''
watch(id, (v) => {
  if (!v || v === viewedId) return
  viewedId = v
  track('view_item', { item_type: 'contract', item_id: v })
}, { immediate: true })

// The monthly BCU rate table, so each item price can be shown in UYU at the
// contract's own month and in today's pesos on click (see MoneyConvert).
const { data: rateRes } = await useFetch<any>('/api/rates')
const rateTable = computed(() => rateRes.value?.data ?? null)
// Every line shares the contract's moment — the date whose BCU rate applies.
const itemDate = computed(() => contractDate(contract.value))
const notFound = computed(() => !!error.value || !contract.value)

// The `noindex` further down was already right; the STATUS was not. A missing
// contract answered 200, so an invented id was a real page as far as a crawler
// is concerned. Both signals have to agree.
if (import.meta.server && notFound.value) {
  setResponseStatus(useRequestEvent()!, 404)
}

// Names the page, and every related row below it: the explicit subject,
// else the stage-named fallback.
const contractName = useContractTitle()

const title = computed(() => contractName(contract.value))

/**
 * What is actually being bought, when the title doesn't say.
 *
 * Shown only when it adds something the heading doesn't already carry.
 */
const subject = computed(() => {
  // The object of the purchase: OCDS description first (the detail API already
  // borrows the tender-stage sibling's when an award release has none), then
  // the object scraped from the gov page — the only source for compras OCDS
  // describes nowhere (e.g. "Sistema Veeam"). `featRes` is declared below; the
  // getter only runs at render, by when it exists.
  const d = contract.value?.tender?.description?.trim() || featRes.value?.data?.object?.trim()
  if (!d) return ''
  const heading = title.value.trim()
  if (!heading || d === heading || heading.startsWith(d)) return ''
  return d
})

const amount = computed(() => contractAmount(contract.value))
const currency = computed(() => contractCurrency(contract.value))
const suppliers = computed(() => contractSuppliers(contract.value))
const date = computed(() => contractDate(contract.value))

// Present only on the handful of releases where a lump sum stored in
// `unit.value.amount` inflated the header total by orders of magnitude and
// a job (src/jobs/correct-lumpsum-artifacts.ts) corrected it against the
// government's own published figure. Drives the "verified" badge below the
// header total; null everywhere else, so nothing renders on ordinary pages.
const verifiedOverride = computed(() => contractVerifiedOverride(contract.value))

// The amount restated in today's pesos — foreign converted at its own month's
// BCU rate, then deflated to today via the Unidad Indexada (server computes it).
// Worth showing when it moves the figure: always for a foreign-currency contract
// (it becomes pesos), and for a peso one only once inflation shifts it ≥3%.
const realToday = computed<number | null>(() => {
  const v = (contract.value as { realTodayAmount?: number } | null)?.realTodayAmount
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null
})
const showRealToday = computed(() => {
  // `amount` is `primaryAmount` — UYU-normalised for every contract — and
  // `realToday` is UYU too, so the ratio is a fair "does it move the figure"
  // test for peso and foreign contracts alike. Recent contracts barely move
  // (nominal ≈ today), so the line stays out of the way; old or foreign-and-old
  // ones shift enough to be worth stating.
  const r = realToday.value
  const nominal = amount.value
  if (r === null || !nominal || nominal <= 0) return false
  return Math.abs(r - nominal) / nominal >= 0.03
})

// Every stage the release carries. Only award/awardUpdate ever report
// money, so the stage is what explains an absent figure.
const tags = computed(() => contractTags(contract.value))
const showsMoney = computed(() => isMoneyStage(contract.value))

/** The stage help text, spelled out under the chip row instead of living
 *  only in a `:title` — a hover-only tooltip never reaches a touch reader,
 *  and this single line is what explains why a release may show no
 *  supplier, no items or no amount at all. */
const primaryStageHelp = computed(() => {
  const stage = primaryTag(contract.value)
  return stage ? t(`contract.stageHelp.${stage}`) : ''
})

// The headline is pesos, but the source may have priced the contract in
// dollars. Saying "$ 337.781,72" above a line reading "US$ 8.400,00"
// without explanation reads as a contradiction, so name the conversion.
const originalCurrencies = computed(() =>
  (contract.value?.amount?.currencies ?? []).filter(Boolean),
)
const wasConverted = computed(() =>
  currency.value === 'UYU'
  && originalCurrencies.value.length > 0
  && !originalCurrencies.value.includes('UYU'),
)

// The whole point of the site: you can always go check the original.
// The API returns `sourceUrl`; derive it locally if a cached response
// predates that field.
const officialUrl = computed(() =>
  (contract.value as any)?.sourceUrl ?? govSourceUrl(contract.value?.ocid),
)

// The government's award-detail page. Only meaningful once there's an
// award to detail, so it's hidden on tender-stage releases.
const awardLink = computed(() =>
  showsMoney.value
    ? ((contract.value as any)?.awardUrl ?? govAwardUrl(contract.value?.ocid))
    : null,
)

// The raw OCDS document we actually parsed — keyed on the release `id`,
// unlike the human page above which keys on the ocid.
const ocdsUrl = computed(() =>
  (contract.value as any)?.ocdsUrl ?? ocdsJsonUrl(contract.value?.id),
)

/**
 * The one address of the source document.
 *
 * `rssLink` and `ocdsUrl` are the SAME document on this feed and usually
 * differ only by scheme — the feed's own link is `http://`, ours is
 * `https://` — so printing both listed one URL twice. Prefer https; only
 * fall back to the other when they genuinely point somewhere else.
 */
const sourceDocUrl = computed<string | null>(() => {
  const rss = (contract.value?.rssLink ?? '').trim()
  const ocds = (ocdsUrl.value ?? '').trim()
  if (!rss) return ocds || null
  if (!ocds) return rss
  return sameDocument(rss, ocds)
    ? ([rss, ocds].find(u => u.startsWith('https:')) ?? ocds)
    : ocds
})

/** The feed's own link, kept ONLY when it is genuinely a different address —
 *  folding it into `sourceDocUrl` must never silently drop a second document. */
const rssLinkDistinct = computed<string | null>(() => {
  const rss = (contract.value?.rssLink ?? '').trim()
  const ocds = (ocdsUrl.value ?? '').trim()
  return rss && ocds && !sameDocument(rss, ocds) ? rss : null
})

function sameDocument(a: string, b: string): boolean {
  return a.replace(/^https?:/, '') === b.replace(/^https?:/, '')
}

const documents = computed(() => {
  const c = contract.value as any
  const tender = c?.tender?.documents ?? []
  const award = (c?.awards ?? []).flatMap((a: any) => a.documents ?? [])
  return [...tender, ...award].filter((d: any) => d?.url)
})

/** A large pliego set (some contracts carry 30+) rendered unbounded in the
 *  320px aside — capped, with everything still reachable behind one click,
 *  nothing dropped. */
const DOCS_PREVIEW = 8
const showAllDocs = ref(false)
const visibleDocuments = computed(() =>
  showAllDocs.value ? documents.value : documents.value.slice(0, DOCS_PREVIEW),
)

// ---- What was bought ------------------------------------------------
// `contractItems` flattens every award into one list, which loses both
// the catalogue code and which award a line belongs to. The detail page
// is the one place that must not drop either, so it reads the awards
// directly rather than through the flattening helper.
interface RawItem {
  id?: string
  description?: string
  quantity?: number
  classification?: { id?: string, description?: string }
  unit?: { name?: string, value?: { amount?: number, currency?: string } }
}

interface RawAward {
  id?: string
  date?: string
  status?: string
  suppliers?: { id?: string, name?: string }[]
  items?: RawItem[]
}

interface ItemRow {
  key: string
  /** The gov "Ítem Nº" — the OCDS item id's leading integer ("2-1" -> 2).
   *  Joins the row to its scraped características; null when unparseable. */
  nro: number | null
  description: string
  code: string
  codeDescription: string
  quantity: number | null
  unitName: string
  unitAmount: number | null
  currency: string
  total: number | null
}

interface ItemGroup {
  key: string
  awardId?: string
  awardDate?: string
  awardStatus?: string
  suppliers: { id?: string, name?: string }[]
  rows: ItemRow[]
  hasPrices: boolean
}

function toRow(i: RawItem, key: string): ItemRow {
  const description = i.description?.trim() || i.classification?.description?.trim() || ''
  const codeDescription = i.classification?.description?.trim() || ''
  const unitAmount = i.unit?.value?.amount ?? null
  const quantity = i.quantity ?? null
  const nroMatch = /^(\d+)/.exec(i.id ?? '')
  return {
    key,
    nro: nroMatch ? Number(nroMatch[1]) : null,
    description,
    code: i.classification?.id?.trim() || '',
    // On most records the catalogue description repeats the item
    // description verbatim; printing it twice is noise, so it only
    // survives when it says something the description doesn't.
    codeDescription: codeDescription && codeDescription !== description ? codeDescription : '',
    quantity,
    unitName: i.unit?.name?.trim() || '',
    unitAmount,
    currency: i.unit?.value?.currency || 'UYU',
    total: unitAmount === null ? null : unitAmount * (quantity ?? 1),
  }
}

const itemGroups = computed<ItemGroup[]>(() => {
  const c = contract.value
  const awards = (c?.awards ?? []) as RawAward[]

  if (awards.length) {
    return awards.map((a, ai) => {
      const rows = (a.items ?? []).map((i, ii) => toRow(i, `a${ai}-${ii}`))
      return {
        key: a.id || `award-${ai}`,
        awardId: a.id,
        awardDate: a.date,
        awardStatus: a.status,
        suppliers: a.suppliers ?? [],
        rows,
        hasPrices: rows.some(r => r.unitAmount !== null),
      }
    })
  }

  // A tender-stage release has no award yet, but it still lists what the
  // state intends to buy — priced or not, that is the only item detail
  // it has and it was previously invisible here.
  const tenderItems = (c?.tender?.items ?? []) as RawItem[]
  if (!tenderItems.length) return []
  const rows = tenderItems.map((i, ii) => toRow(i, `t-${ii}`))
  return [{ key: 'tender', suppliers: [], rows, hasPrices: rows.some(r => r.unitAmount !== null) }]
})

// ---- Características (scraped) --------------------------------------
// The OCDS feed drops the per-item "Características" table ("Tipo:
// SOMBRILLA DE CALOR", "Presentación: ENVASE / 250 G") and the
// "Variación" note that the government's own HTML shows. The API
// scrapes them on first view and caches per compra; fetched lazily and
// client-only so a slow gov site can never hold this page's render.
interface ItemFeature { name: string, value: string }
interface ItemFeatures { features: ItemFeature[], variation?: string }

const { data: featRes } = useLazyFetch<any>(
  () => `/api/contracts/${encodeURIComponent(id.value)}/features`,
  { server: false },
)

// The AI review of this contract's price flag, if any. Shown as a prominent panel so a
// journalist/researcher lands on the analysis + evidence + source links, not just the numbers.
// Client-only and keyed on the release id (how the alerts list links here).
// Every price flag on this release. limit=100 covers even the largest
// multi-award contracts; sorted severity-desc so [0] is the one the AI panel
// leads with, and the rest mark each flagged line inside the items table.
const { data: anomalyRes } = useLazyFetch<any>(
  () => `/api/analytics/anomalies?releaseId=${encodeURIComponent(id.value)}&limit=100&sortBy=severity&sortOrder=desc`,
  { server: false },
)
const anomaliesList = computed<any[]>(() => anomalyRes.value?.data?.anomalies ?? [])
const aiFlag = computed<any | null>(() => anomaliesList.value[0] ?? null)

// Join each flagged unit-price back to the line that carries it. The flag
// records the catalogue code, the canonical unit and the exact unit price it
// fired on, so the same triple identifies the row in the items table.
function anomalyRowKey(code: string, currency: string, unitName: string, unitAmount: number | null): string {
  return `${code}|${currency}|${canonicalUnit(unitName)}|${unitAmount ?? ''}`
}
const anomalyByRow = computed<Map<string, any>>(() => {
  const m = new Map<string, any>()
  for (const a of anomaliesList.value) {
    const code = a.metadata?.itemClassification?.id ?? a.classificationId ?? ''
    const val = typeof a.detectedValue === 'number' ? a.detectedValue : null
    if (!code || val === null) continue
    m.set(anomalyRowKey(code, a.currency ?? 'UYU', a.metadata?.itemUnit?.name ?? '', val), a)
  }
  return m
})
function rowAnomaly(row: ItemRow): any | null {
  return anomalyByRow.value.get(anomalyRowKey(row.code, row.currency, row.unitName, row.unitAmount)) ?? null
}

// ---- Filter the items table -----------------------------------------
// A contract can carry hundreds of lines across several awards (one here has
// ten across seven). A free-text filter plus an "only flagged" toggle turns
// scanning into finding. Both are client-only refinements of already-loaded
// rows — nothing is refetched.
const itemQuery = ref('')
const onlyAlerts = ref(false)

const totalItemRows = computed(() => itemGroups.value.reduce((n, g) => n + g.rows.length, 0))
const hasItemAlerts = computed(() =>
  anomalyByRow.value.size > 0 && itemGroups.value.some(g => g.rows.some(r => !!rowAnomaly(r))),
)
// The toolbar earns its space only when there's enough to navigate: many
// lines, or at least one flag to isolate.
const showItemFilter = computed(() => totalItemRows.value > 6 || hasItemAlerts.value)

function rowMatchesQuery(row: ItemRow, tokens: string[]): boolean {
  if (!tokens.length) return true
  const hay = `${row.description} ${row.code} ${row.codeDescription} ${row.unitName}`.toLowerCase()
  return tokens.every(tk => hay.includes(tk))
}

const filteredItemGroups = computed<ItemGroup[]>(() => {
  const tokens = itemQuery.value.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const alerts = onlyAlerts.value
  if (!tokens.length && !alerts) return itemGroups.value
  return itemGroups.value
    .map(g => ({ ...g, rows: g.rows.filter(r => rowMatchesQuery(r, tokens) && (!alerts || !!rowAnomaly(r))) }))
    .filter(g => g.rows.length > 0)
})
const shownItemRows = computed(() => filteredItemGroups.value.reduce((n, g) => n + g.rows.length, 0))
const noItemMatch = computed(() => itemGroups.value.length > 0 && filteredItemGroups.value.length === 0)
const aiVerdict = computed<any | null>(() => {
  const v = aiFlag.value?.aiVerdict
  return v && typeof v.explainable === 'string' ? v : null
})
const aiEvidence = computed<string[]>(() =>
  Array.isArray(aiVerdict.value?.evidence) ? aiVerdict.value.evidence.filter((x: any) => typeof x === 'string' && x.trim()) : [],
)
const aiDocs = computed<any[]>(() =>
  Array.isArray(aiVerdict.value?.documents) ? aiVerdict.value.documents.filter((d: any) => d?.url) : [],
)
const aiConfidencePct = computed<number | null>(() => {
  const c = aiVerdict.value?.confidence
  return typeof c === 'number' && Number.isFinite(c) ? Math.round(c * 100) : null
})
const aiScoredAt = computed<string | null>(() => {
  const s = aiVerdict.value?.scoredAt
  if (!s) return null
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
})
function aiMoney(v: number | null | undefined): string {
  return typeof v === 'number' && Number.isFinite(v) ? formatMoney(v, aiFlag.value?.currency ?? 'UYU', { compact: true }) : '—'
}

const itemFeatures = computed<Map<number, ItemFeatures>>(() => {
  const map = new Map<number, ItemFeatures>()
  for (const it of featRes.value?.data?.items ?? []) {
    if (typeof it?.nro !== 'number') continue
    const seen = new Set<string>()
    const features = (it.features ?? []).filter((f: any) => {
      if (!f?.name || !f?.value) return false
      const key = `${f.name}\u0000${f.value}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    const variation = typeof it.variation === 'string' && it.variation.trim() ? it.variation.trim() : undefined
    if (features.length || variation) map.set(it.nro, { features, variation })
  }
  return map
})

function rowFeatures(row: ItemRow): ItemFeatures | null {
  if (row.nro === null) return null
  return itemFeatures.value.get(row.nro) ?? null
}

// ---- Impuestos / total con impuestos (scraped) ----------------------
// The OCDS feed carries only tax-EXCLUSIVE unit prices, and truncates fractional
// quantities to integers (0,17 KG -> 0). The government page is the only source
// of the per-line "Monto total con impuestos" and the compra's tax-inclusive
// grand total, so the same lazy scrape that fetches características returns them.
type ScrapedMoney = { amount: number, currency: string }
interface ItemTax { quantity: number | null, quantityUnit: string, netUnit: number | null, gross: ScrapedMoney | null }

const taxByNro = computed<Map<number, ItemTax>>(() => {
  const map = new Map<number, ItemTax>()
  for (const it of featRes.value?.data?.items ?? []) {
    if (typeof it?.nro !== 'number') continue
    const gross = it.grossTotal && typeof it.grossTotal.amount === 'number'
      ? { amount: it.grossTotal.amount, currency: it.grossTotal.currency || 'UYU' }
      : null
    map.set(it.nro, {
      quantity: typeof it.quantity === 'number' ? it.quantity : null,
      quantityUnit: typeof it.quantityUnit === 'string' ? it.quantityUnit : '',
      netUnit: it.netUnitPrice && typeof it.netUnitPrice.amount === 'number' ? it.netUnitPrice.amount : null,
      gross,
    })
  }
  return map
})
const hasTaxData = computed(() => {
  for (const v of taxByNro.value.values()) if (v.gross) return true
  return false
})
/**
 * Award lines whose `nro` is shared with another line, so the scraped
 * per-item figures cannot be attributed to either.
 *
 * OCDS item ids are `<Ítem Nº>-<sub-index>` and one gov Ítem can be split
 * across several award lines ("1-1" and "1-2" — 12% of real multi-item
 * awards). The government page has ONE row per Ítem Nº carrying one
 * quantity and one total, so handing that row to BOTH lines printed one
 * line's total on the other: adjudicacion-1349468 showed $111.754 as the
 * total of its $628.585 line.
 */
const ambiguousNros = computed<Set<number>>(() => {
  const seen = new Map<number, number>()
  for (const g of itemGroups.value) {
    for (const r of g.rows) {
      if (r.nro === null) continue
      seen.set(r.nro, (seen.get(r.nro) ?? 0) + 1)
    }
  }
  return new Set([...seen.entries()].filter(([, n]) => n > 1).map(([nro]) => nro))
})

function taxRow(row: ItemRow): ItemTax | null {
  if (row.nro === null || ambiguousNros.value.has(row.nro)) return null
  return taxByNro.value.get(row.nro) ?? null
}
// Prefer the page's fractional quantity — the feed truncates 0,17 KG to 0.
function displayQuantity(row: ItemRow): number | null {
  const t = taxRow(row)
  return t && t.quantity !== null ? t.quantity : row.quantity
}
function rowGross(row: ItemRow): ScrapedMoney | null {
  return taxRow(row)?.gross ?? null
}
// Net line recomputed with the correct (fractional) quantity when we have it, so
// it never contradicts the tax-inclusive figure beside it.
function displayNetTotal(row: ItemRow): number | null {
  const t = taxRow(row)
  if (t && t.quantity !== null) {
    const unit = t.netUnit ?? row.unitAmount
    return unit === null ? null : unit * t.quantity
  }
  return row.total
}

const compraTotal = computed<ScrapedMoney | null>(() => {
  const total = featRes.value?.data?.total
  return total && typeof total.amount === 'number'
    ? { amount: total.amount, currency: total.currency || 'UYU' }
    : null
})
// The compra's tax breakdown: subtotal (Σ qty×net sin imp) → impuestos → total
// con impuestos, all off the same official page so the three always reconcile.
// Subtotal is only meaningful in a single currency, so it's dropped when lines mix.
/**
 * Whether the scraped per-item rows account for EVERY priced award line.
 *
 * They often don't: the gov page lists one row per Ítem Nº while OCDS can
 * split that Ítem across several award lines (adjudicacion-1349468 — obra +
 * leyes sociales — is two lines against one scraped row). Summing a partial
 * set as if it were the whole then subtracting it from the tax-INCLUSIVE
 * grand total produced a nonsense decomposition: subtotal $111.754 and
 * "impuestos" $766.873 on a $740.339 purchase.
 */
const taxRowsCoverAllLines = computed(() => {
  const priced = itemGroups.value.flatMap(g => g.rows).filter(r => r.unitAmount !== null)
  if (!priced.length) return false
  return priced.every((r) => {
    const t = taxRow(r)
    return !!t && t.quantity !== null && t.netUnit !== null
  })
})

const taxBreakdown = computed<{ total: number, subtotalNet: number | null, impuestos: number | null, currency: string } | null>(() => {
  const total = compraTotal.value
  if (!total) return null
  let subtotal = 0
  let sawAny = false
  let mixed = false
  for (const v of taxByNro.value.values()) {
    if (v.gross && v.gross.currency !== total.currency) mixed = true
    if (v.quantity !== null && v.netUnit !== null) {
      subtotal += v.quantity * v.netUnit
      sawAny = true
    }
  }
  // The tax-inclusive total is always trustworthy (it is the government's own
  // figure); only its DECOMPOSITION needs every line to be accounted for.
  const subtotalNet = sawAny && !mixed && taxRowsCoverAllLines.value ? subtotal : null
  const impuestos = subtotalNet !== null ? total.amount - subtotalNet : null
  return { total: total.amount, subtotalNet, impuestos, currency: total.currency }
})

// ---- Who ------------------------------------------------------------
interface ContactPoint {
  name?: string
  email?: string
  telephone?: string
  faxNumber?: string
}

interface PartyRow {
  key: string
  id?: string
  isBuyer: boolean
  name: string
  roles: string[]
  to: string | null
  legalName: string
  rut: string
  contact: { name: string, email: string, phone: string } | null
}

/**
 * Supplier ids carry slashes (`R/211203010017`) and the route is a
 * catch-all, so each segment is encoded on its own — encoding the whole
 * id would turn the separator into `%2F` and miss the route.
 */
function supplierPath(id: string): string {
  return `/suppliers/${id.split('/').map(encodeURIComponent).join('/')}`
}

function partyPath(id: string | undefined, roles: string[]): string | null {
  if (!id) return null
  if (roles.includes('supplier')) return supplierPath(id)
  if (roles.includes('buyer') || roles.includes('procuringEntity')) return `/buyers/${encodeURIComponent(id)}`
  return null
}

function roleLabel(role: string): string {
  const key = `contract.roles.${role}`
  return te(key) ? t(key) : role
}

function submissionLabel(method: string): string {
  const key = `contract.submissionMethods.${method}`
  return te(key) ? t(key) : method
}

/** OCDS status vocabulary (active/cancelled/complete/unsuccessful) — raw
 *  English tokens printed verbatim was the seam that made a Spanish-canonical
 *  page look like it was leaking pipeline internals. Same fallback shape as
 *  `roleLabel`/`submissionLabel` above. */
function statusLabel(status: string): string {
  const key = `contract.status.${status}`
  return te(key) ? t(key) : status
}

/** OCDS `initiationType` (tender/planning) — same fallback shape again. */
function initiationTypeLabel(v: string): string {
  const key = `contract.initiationTypes.${v}`
  return te(key) ? t(key) : v
}

function boolLabel(v: boolean): string {
  return v ? t('common.yes') : t('common.no')
}

const partyRoster = computed<PartyRow[]>(() => {
  const c = contract.value
  const sup = c?.supplier
  const declared = (c?.parties ?? []).filter(p => p?.name || p?.id)

  // `parties[]` is the authoritative roster. Older records predate it,
  // so fall back to the buyer/supplier the release does carry rather
  // than showing nobody.
  const list: { id?: string, name: string, roles: string[], contactPoint?: ContactPoint }[] = declared.length
    ? declared.map(p => ({ id: p.id, name: p.name ?? '', roles: p.roles ?? [], contactPoint: (p as any).contactPoint }))
    : [
        ...(c?.buyer?.name || c?.buyer?.id ? [{ id: c.buyer.id, name: c.buyer.name ?? '', roles: ['buyer'] }] : []),
        ...contractSuppliers(c).map(s => ({ id: s.id, name: s.name, roles: ['supplier'] })),
      ]

  return list.map((p, i) => {
    // The release states the supplier's tax identity once, at the top
    // level. Attach it to the party it describes instead of stranding it.
    const isSupplier = !!sup && ((!!sup.id && sup.id === p.id) || (!!sup.name && sup.name === p.name))
    const legalName = isSupplier ? (sup.identifier?.legalName?.trim() ?? '') : ''

    // Who to actually contact about this tender. The source carries it
    // per party and the government's own page prints it; we were
    // dropping it entirely. `faxNumber` is routinely a copy of
    // `telephone` in this data, so it is not surfaced.
    const cp = p.contactPoint
    const contact = {
      name: cp?.name?.trim() ?? '',
      email: cp?.email?.trim() ?? '',
      phone: cp?.telephone?.trim() ?? '',
    }

    return {
      key: `${p.id ?? p.name}-${i}`,
      id: p.id,
      isBuyer: p.roles.includes('buyer') || p.roles.includes('procuringEntity'),
      name: p.name,
      roles: p.roles,
      to: partyPath(p.id, p.roles),
      legalName: legalName && legalName !== p.name ? legalName : '',
      rut: isSupplier ? (sup.identifier?.id?.trim() ?? '') : '',
      contact: (contact.name || contact.email || contact.phone) ? contact : null,
    }
  })
})

// ---- The tender it belongs to ---------------------------------------
const tender = computed(() => contract.value?.tender ?? null)

/**
 * A period, with the closing time when the source gives one.
 *
 * "Recepción de ofertas hasta 30 sept 2026" loses the fact that it
 * closes at 15:00 — which is exactly the detail a bidder needs, and
 * which the government's page prints.
 */
function periodText(p?: { startDate?: string, endDate?: string } | null): string {
  if (!p) return ''
  const start = p.startDate ? formatDate(p.startDate) : ''
  const end = p.endDate ? formatDateTime(p.endDate) : ''
  if (start && end) return `${start} – ${end}`
  return start || end
}

/**
 * `submissionMethodDetails` is a packed string, not a sentence.
 *
 * The source ships it as semicolon-joined "key: value" pairs with raw
 * ISO timestamps inside:
 *
 *   "Lugar entrega de ofertas: Municipio de Carmelo- José Pedro Varela
 *    275 ;Fecha solicitud de prorroga: 2026-09-21T00:00:00Z"
 *
 * Printed verbatim that is machine exhaust. The government's own page
 * splits it into labelled lines and renders the date as a date, so do
 * the same. Anything that doesn't fit the pattern is passed through
 * untouched rather than mangled.
 */
const submissionParts = computed(() => {
  const raw = tender.value?.submissionMethodDetails?.trim()
  if (!raw) return []

  return raw.split(';').map(s => s.trim()).filter(Boolean).map((part) => {
    const m = /^([^:]{2,40}):\s*(.+)$/.exec(part)
    if (!m) return { label: '', value: part }

    const label = m[1].trim()
    let value = m[2].trim()

    // Turn any bare ISO timestamp into a readable date.
    const iso = /^\d{4}-\d{2}-\d{2}T[\d:.]+Z?$/.exec(value)
    if (iso) value = formatDateTime(value)

    return { label: `${label}:`, value }
  })
})

// tenderPeriod/enquiryPeriod are deliberately NOT part of this: Cronología
// is their only home now, so their presence alone shouldn't decide whether
// this panel (which no longer renders them) shows.
// tn.status is deliberately not part of this: the header chip is its only
// home now (see the Resumen facts markup), so status alone shouldn't decide
// whether this dl renders — it would render empty.
const hasTenderFacts = computed(() => {
  const tn = tender.value
  if (!tn) return false
  // procurementMethodDetails is deliberately absent: the eyebrow is its only
  // home now, so it must not decide whether this dl — which no longer renders
  // it — appears at all.
  return !!(
    tn.id || tn.procuringEntity?.name
    || typeof tn.hasEnquiries === 'boolean'
    || tn.submissionMethod?.length || tn.submissionMethodDetails
  )
})

/** True when the party roster already names this exact entity as the buyer
 *  — which is the normal case for any release carrying `parties[]`. Gates
 *  the fallback "Unidad ejecutora" fact row so it only appears for the
 *  older records where it wouldn't be shown anywhere otherwise. */
/**
 * The only award, when there is exactly one.
 *
 * Its id and status are facts about the contract, so with a single award they
 * belong in Resumen with the rest of them. They stay pinned above the items
 * table only when there are SEVERAL awards, where they are what tells one
 * block of lines from the next.
 */
const singleAward = computed(() => (itemGroups.value.length === 1 ? itemGroups.value[0] : null))

const procuringEntityShownAsParty = computed(() => {
  const name = tender.value?.procuringEntity?.name
  return !!name && partyRoster.value.some(p => p.isBuyer && p.name === name)
})

// ---- Price reference -------------------------------------------------
interface PriceRef {
  /** Catalogue code (classification.id) — the exact, comma-safe key the baseline buckets on and
   *  the explorer's `categoryId` filter matches. Used for the comparables link. */
  code: string
  paid: number
  currency: string
  n: number
  median: number
  p25: number
  p95: number
  position: 'below' | 'typical' | 'high' | 'veryHigh' | 'listPrice'
  tone: string
}

/** `listPrice` states a fact (this paid amount matches a known tariff), not a
 *  judgment — so unlike `typical` it does NOT share the reassuring celeste tone. */
function toneForPosition(position: PriceRef['position']): string {
  switch (position) {
    case 'veryHigh': return 'tag--alerta'
    case 'high': return 'tag--neutral'
    case 'below': return 'tag--activo'
    case 'listPrice': return 'tag--neutral'
    default: return 'tag--celeste'
  }
}

/**
 * The reference distribution for ONE priced line, or null when there is no
 * usable baseline for it.
 *
 * Keyed per LINE, never deduplicated. The previous "Precios de referencia"
 * table folded lines onto one row per `code|currency|unit` and skipped the
 * rest — measured against 750 real multi-item awards from the public API,
 * that silently dropped 21% of coded priced lines, and 39% of those contracts
 * had a dropped line whose price DIFFERED from the shown one (adjudicacion-1358139
 * shows "Bajo lo habitual" for code 4472 at $11.800 while hiding the same
 * code's $21.800 line). Each line carries its own paid price, so each line
 * gets its own verdict.
 */
function referenceFor(code: string, currency: string, unitName: string, paid: number | null): PriceRef | null {
  const baselines = (contract.value as any)?.itemBaselines as Record<string, any> | undefined
  if (!baselines || !code || !paid || paid <= 0) return null

  // Canonical unit (lowercased, unidad-folded) — the baseline and the detail
  // API both key on this, so "FRASCO" must fold to "frasco" or the lookup
  // misses and the comparison disappears. See shared/utils/units.
  const b = baselines[`${code}|${currency}|${canonicalUnit(unitName)}`]
  // Below 5 comparables the percentiles are noise, not a reference.
  if (!b || !b.n || b.n < 5) return null

  // An exact match against the item's recurring (tariff/list) prices wins over
  // any percentile comparison: catalogue items like TIMBRE PROFESIONAL pool every
  // legal denomination under one id, so the official 590 parto stamp sits far
  // above a p95 dominated by the 170 certificado — yet is not an overpayment.
  const isListPrice = Array.isArray(b.recurringPrices) && b.recurringPrices.includes(paid)

  const position: PriceRef['position'] = isListPrice
    ? 'listPrice'
    : paid > b.p95
      ? 'veryHigh'
      : paid > b.p75
        ? 'high'
        : paid < b.p25
          ? 'below'
          : 'typical'

  return {
    code,
    paid,
    currency,
    n: b.n,
    median: b.p50,
    p25: b.p25,
    p95: b.p95,
    position,
    tone: toneForPosition(position),
  }
}

function rowReference(row: ItemRow): PriceRef | null {
  return referenceFor(row.code, row.currency, row.unitName, row.unitAmount)
}

/** Whether ANY line has a comparison — decides if the column is worth its width. */
const hasAnyReference = computed(() =>
  itemGroups.value.some(g => g.rows.some(r => !!rowReference(r))),
)

/** Priced lines with a catalogue code but no usable baseline. Named explicitly in
 *  the table footer: a reader could otherwise not tell "we have no comparables"
 *  from "we didn't check". */
const referenceGaps = computed(() => {
  let total = 0
  let missing = 0
  for (const g of itemGroups.value) {
    for (const r of g.rows) {
      if (!r.code || !r.unitAmount || r.unitAmount <= 0) continue
      total += 1
      if (!rowReference(r)) missing += 1
    }
  }
  return missing > 0 ? { missing, total } : null
})

/** "3,5× la mediana" — physically next to the verdict chip so the number and
 *  the judgment can never disagree (a calm chip beside a 3.5× figure was the
 *  original defect: the chip alone could say "en rango" while the number told
 *  a different story). Always the Uruguay-formatted ratio, one decimal. */
function ratioText(r: PriceRef): string | null {
  if (!r.median || r.median <= 0) return null
  const ratio = r.paid / r.median
  if (!Number.isFinite(ratio) || ratio <= 0) return null
  const formatted = new Intl.NumberFormat('es-UY', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(ratio)
  return t('contract.reference.ratio', { ratio: formatted })
}

function rangeText(r: PriceRef): string {
  const lo = formatMoney(r.p25, r.currency, { compact: true })
  const hi = formatMoney(r.p95, r.currency, { compact: true })
  const sym = lo.split(' ')[0]
  const hiShort = hi.startsWith(`${sym} `) ? hi.slice(sym.length + 1) : hi
  return `${lo} – ${hiShort}`
}

/** The distribution the verdict came from, as one labelled line. Labelled and
 *  not three bare numbers: "$ 2,8 M · $ 1,1 M – 13,7 M · 956" gives a reader
 *  no way to tell median from range from sample size. */
function statsText(r: PriceRef): string {
  return t('contract.reference.stats', {
    median: formatMoney(r.median, r.currency, { compact: true }),
    range: rangeText(r),
    n: formatNumber(r.n),
  })
}

/**
 * The explorer, filtered to exactly this row's catalogue code.
 *
 * Filters by `categoryId` (classification.id), NOT the description: the baseline buckets on the
 * code, the code is index-backed, and — unlike the description — it is comma-safe and not
 * many-to-many with codes. So the reader lands on precisely the purchases the flag was scored
 * against, rather than a comma-shattered or wrong-code set. No count is advertised because the
 * explorer counts releases while the baseline counts item-price observations.
 */
function comparablesLink(r: PriceRef): string | null {
  if (!r.code) return null
  return localePath({
    path: '/contracts',
    query: {
      categoryId: r.code,
      currency: r.currency,
      tag: 'award',
      hasAmount: 'true',
    },
  })
}

function itemColumns(hasPrices: boolean, hasTax = false) {
  const cols = [
    { key: 'description', label: t('common.description'), primary: true },
    { key: 'code', label: t('contract.fields.classification') },
    { key: 'quantity', label: t('common.quantity'), align: 'end' as const, mono: true },
    { key: 'unitName', label: t('contract.fields.unit') },
  ]
  if (hasPrices) {
    cols.push(
      { key: 'unitAmount', label: t('common.unitPrice'), align: 'end' as const } as any,
      // What that unit price means, on the line it belongs to. Sits directly
      // after the price it judges so the two can never be read apart.
      ...(hasAnyReference.value
        ? [{ key: 'reference', label: t('contract.sections.reference') } as any]
        : []),
      { key: 'total', label: t('common.total'), align: 'end' as const } as any,
    )
    // The tax-inclusive line total, only once the scrape has supplied it.
    if (hasTax) {
      cols.push({ key: 'grossTotal', label: t('contract.tax.withTax'), align: 'end' as const } as any)
    }
  }
  return cols
}

const amendments = computed(() => tender.value?.amendments ?? [])

/**
 * Amendment descriptions arrive as raw pipeline tokens ("aclar_llamado",
 * "ajuste_llamado") — the same machine vocabulary the documentType
 * labels already translate. Give them a Spanish label, falling back to
 * the token if we don't have one.
 */
function amendmentLabel(desc?: string): string {
  const raw = (desc ?? '').trim()
  if (!raw) return ''
  const key = `contract.amendmentKind.${raw}`
  return te(key) ? t(key) : raw
}

// ---- Amount internals -----------------------------------------------
const amt = computed(() => contract.value?.amount ?? null)

// Every currency the source reported, not just the headline one.
const totalAmounts = computed(() => Object.entries(amt.value?.totalAmounts ?? {}))

// A release with no money has nothing to break down — the stage note in
// the header already explains why, and a table of zeroes would not.
const showAmountDetail = computed(() => !!amt.value?.hasAmounts)

/** The exact contact `pickPartyContact` picked for the aside panel
 *  (shared/utils/contact-point.ts): it prefers `procuringEntity` over
 *  `buyer`, so a release with BOTH — a common case, e.g. a ministry
 *  (buyer) and the specific unidad ejecutora (procuringEntity) — can carry
 *  two DIFFERENT contacts. Suppressing every buyer-role party's inline
 *  contact whenever the aside has ANY contact would silently drop the one
 *  the aside didn't pick. Compare by the actual contact instead, so only
 *  the party whose contact is the one actually shown gets hidden here. */
const asideContact = computed(() => (contract.value as any)?.contact as
  { name?: string, email?: string, telephone?: string } | null | undefined)

function isAsideContact(c: { name: string, email: string, phone: string } | null): boolean {
  const a = asideContact.value
  if (!c || !a) return false
  const email = (a.email ?? '').trim()
  const phone = (a.telephone ?? '').trim()
  return (!!email && email === c.email) || (!!phone && phone === c.phone)
}

/** The buying desk's own name, when it says something the executing unit
 *  above doesn't already. Some records name the contact after the organism
 *  itself, and repeating that adds a row without adding a fact. */
const buyingOfficeName = computed<string | null>(() => {
  const name = (asideContact.value?.name ?? '').trim()
  if (!name) return null
  const already = partyRoster.value.some(p => p.isBuyer && p.name.trim() === name)
  return already ? null : name
})

// ---- Where the record came from -------------------------------------
const webFetchDate = computed(() => (contract.value as any)?.webFetchDate as string | undefined)

const showProvenance = computed(() => {
  const c = contract.value
  // sourceFileName is deliberately not part of this guard: it no longer
  // renders (operational metadata, not a reader-facing fact — see the
  // "Ficha técnica" block below), so it can't be the only reason this
  // section shows.
  return !!(c?.sourceYear || webFetchDate.value || c?.initiationType || c?.rssLink)
})

/**
 * Names a document the way a reader would. The source gives OCDS
 * machine vocabulary ("awardNotice"), which is the system's word, not
 * the public's — fall back to it only when we have nothing better.
 */
function docLabel(d: { description?: string, documentType?: string }): string {
  if (d.description?.trim()) return d.description.trim()
  const key = `contract.docTypes.${d.documentType}`
  if (d.documentType && te(key)) return t(key)
  return d.documentType || t('common.download')
}

interface TimelineStep { key: string, sortDate: string, text: string }

// Only steps the source actually dated. A rail of placeholder steps would
// imply we know more about this contract than we do.
//
// The single source for the whole sequence — Resumen no longer repeats the
// tender/enquiry periods, so this carries their full range + closing TIME
// (via the same `periodText` Resumen used to own), not just a bare end date.
// A bidder needs "closes at 15:00", not just "closes 30 sept".
const timeline = computed<TimelineStep[]>(() => {
  const c = contract.value as any
  const steps: (TimelineStep | null)[] = [
    (() => {
      const p = c?.tender?.enquiryPeriod
      const text = periodText(p)
      const sortDate = p?.endDate ?? p?.startDate
      return text && sortDate ? { key: 'enquiry', sortDate, text } : null
    })(),
    (() => {
      const p = c?.tender?.tenderPeriod
      const text = periodText(p)
      const sortDate = p?.endDate ?? p?.startDate
      return text && sortDate ? { key: 'tender', sortDate, text } : null
    })(),
    c?.awards?.[0]?.date ? { key: 'award', sortDate: c.awards[0].date, text: formatDate(c.awards[0].date) } : null,
    c?.date ? { key: 'published', sortDate: c.date, text: formatDate(c.date) } : null,
  ]
  return steps
    .filter((s): s is TimelineStep => !!s && !Number.isNaN(new Date(s.sortDate).getTime()))
    .sort((a, b) => new Date(a.sortDate).getTime() - new Date(b.sortDate).getTime())
})

const rawOpen = ref(false)
function openRawJson() {
  rawOpen.value = true
  track('raw_json_view')
}

// Same shape as CallContact's copy button — the OCID is the single most
// copied string on the page (it's the reference a journalist pastes into a
// FOI request or a tip), yet had no copy affordance at all.
const ocidCopied = ref(false)
let ocidCopyTimer: ReturnType<typeof setTimeout> | undefined
async function copyOcid(value: string) {
  try {
    await navigator.clipboard.writeText(value)
    ocidCopied.value = true
    clearTimeout(ocidCopyTimer)
    ocidCopyTimer = setTimeout(() => {
      ocidCopied.value = false
    }, 2000)
  }
  catch { /* clipboard unavailable — no-op */ }
}

// "What else does this agency buy?" is the most common next question.
// `contract` is already resolved here, so the query is a plain value.
const buyerName = contract.value?.buyer?.name ?? ''

/**
 * The agency's other purchases.
 *
 * `tag: 'award'` is load-bearing. Sorted by date alone, a busy organismo's
 * newest releases are all `tenderUpdate` aclaraciones — no title, no
 * supplier, no amount — so every row rendered as "Contrato / today / $ 0",
 * and three of them were clarifications of the SAME llamado. Only the
 * award stage is a purchase with a subject and a price. `awardUpdate` is
 * excluded too: the `ajuste_adjudicacion` records carry the correction on
 * the parent ocid and have no items or suppliers of their own.
 *
 * `count=false` because this list never paginates, and counting a
 * tag-filtered match costs more than the twelve rows do. `slim=true`
 * drops the award line detail no row displays.
 */
const { data: relatedRes } = await useFetch<any>('/api/contracts', {
  query: {
    buyers: buyerName,
    tag: 'award',
    limit: 12,
    slim: 'true',
    count: 'false',
    sortBy: 'date',
    sortOrder: 'desc',
  },
  immediate: !!buyerName,
})

const RELATED_ROWS = 4

/**
 * One row per purchase, not per release.
 *
 * Filtering on release `id` was not enough: several releases share an
 * ocid, so the contract you are reading could reappear under a different
 * id, and two adjustments of one purchase read as two contracts.
 */
const related = computed<ContractLike[]>(() => {
  const rows = (relatedRes.value?.data?.contracts ?? []) as ContractLike[]
  const seen = new Set<string>()
  const out: ContractLike[] = []

  for (const r of rows) {
    if (r.id === contract.value?.id) continue
    const key = r.ocid || r.id || ''
    if (!key || key === contract.value?.ocid || seen.has(key)) continue
    seen.add(key)
    out.push(r)
    if (out.length === RELATED_ROWS) break
  }
  return out
})

/** The supplier that won it — what tells two rows of the same agency apart. */
function relatedSupplier(c: ContractLike): string {
  return contractSuppliers(c)[0]?.name ?? ''
}

/**
 * `primaryAmount` is 0 both for "free" and for "the source reported no
 * money". Only the first is a fact, so a release with no reported amount
 * says so rather than showing a confident $ 0.
 */
function relatedAmount(c: ContractLike): number | null {
  return c.amount?.hasAmounts ? contractAmount(c) : null
}

// Breadcrumb: Contratos -> buyer (when a clean name/path is on the
// release) -> this contract's own title. Hoisted above `useSeo` because
// Unhead can re-invoke the getter outside setup context, where
// `useBreadcrumbLd` (which calls Nuxt-instance-dependent composables)
// would throw.
const breadcrumbLd = contract.value
  ? useBreadcrumbLd([
      { name: t('nav.contracts'), path: '/contracts' },
      ...(contract.value.buyer?.name
        ? [{ name: contract.value.buyer.name, path: partyPath(contract.value.buyer.id, ['buyer']) ?? undefined }]
        : []),
      { name: title.value },
    ])
  : undefined

useSeo(() => ({
  title: contract.value
    ? t('seo.contractDetail.title', { title: title.value, buyer: contract.value.buyer?.name ?? '' })
    : t('contract.notFound.title'),
  description: contract.value
    ? t('seo.contractDetail.description', {
        buyer: contract.value.buyer?.name ?? '',
        amount: formatMoney(amount.value, currency.value),
        supplier: suppliers.value[0]?.name ?? '',
        date: formatDateLong(date.value),
      })
    : t('contract.notFound.body'),
  path: `/contracts/${id.value}`,
  noindex: notFound.value,
  kicker: t('contract.eyebrow'),
  // Spanish source data in translated chrome: the name, the figures and the item
  // text are identical in /en, so the English twin is a near-duplicate answering
  // no English query. Indexed in es only. See useSeo's defaultLocaleOnly.
  defaultLocaleOnly: true,
  stat: showsMoney.value ? formatMoney(amount.value, currency.value) : undefined,
  jsonLd: contract.value
    ? [
        {
          '@context': 'https://schema.org',
          '@type': 'Dataset',
          'name': title.value,
          'description': contract.value.tender?.description ?? title.value,
          'identifier': contract.value.ocid,
          'datePublished': date.value?.toISOString(),
          'isBasedOn': officialUrl.value,
          'creator': { '@type': 'GovernmentOrganization', 'name': contract.value.buyer?.name },
          'license': 'https://catalogodatos.gub.uy',
        },
        breadcrumbLd,
      ]
    : undefined,
}))
</script>

<template>
  <div class="u-container page">
    <!-- ===== Not found ===== -->
    <StatePanel
      v-if="notFound"
      :title="t('contract.notFound.title')"
      :body="t('contract.notFound.body')"
      :action-to="localePath('/contracts')"
      :action-label="t('contract.notFound.action')"
      level="h1"
    />

    <template v-else-if="contract">
      <!-- ===== Header ===== -->
      <header class="head">
        <div class="head__main">
          <!-- The procurement method alone. "Contrato" used to lead here and
               competed with the stage chip 20px below saying "Adjudicación",
               for the same record — and "contract" is an OCDS stage this feed
               never publishes (RELEASE_TAGS has only tender/award variants).
               "Contratos" survives as the umbrella for the collection: the
               nav, the /contracts route and the explorer, which really does
               mix llamados and adjudicaciones. The record itself is named by
               its stage, once. -->
          <p
            v-if="contract.tender?.procurementMethodDetails"
            class="u-eyebrow"
          >
            {{ contract.tender.procurementMethodDetails }}
          </p>
          <h1 class="head__title">
            {{ title }}
          </h1>

          <!-- The subject, in the source's own words.
               On tender releases `tender.title` is the bureaucratic
               label ("Llamado a Expresiones de Interés 14339/2026") and
               `tender.description` is what is actually being bought
               ("Terminal de Ómnibus de la ciudad de Carmelo"). The
               government's own page prints both; we were dropping the
               one that says something. -->
          <p
            v-if="subject"
            class="head__subject"
          >
            {{ subject }}
          </p>
        </div>

        <div class="head__money">
          <template v-if="showsMoney">
            <!-- The feed's tax-exclusive figure and the government's
                 tax-inclusive one, side by side: they are two readings of the
                 same purchase, and stacking them made the second look like a
                 separate, larger amount. The caveat that reconciles them sits
                 under both. -->
            <div class="head__totals">
              <div class="head__total">
                <!-- Only says "sin impuestos" when a with-taxes figure sits
                     beside it. Alone it is just the awarded amount, and the
                     qualifier would raise a distinction with nothing to
                     contrast against. -->
                <p class="head__moneyl">
                  {{ taxBreakdown ? t('contract.awardedNet') : t('contract.awarded') }}
                </p>
                <!-- No decimals on the headline figures: at this size the
                     ",00" is noise on almost every contract, and the exact
                     cents remain in the per-line table below. -->
                <MoneyAmount
                  :amount="amount"
                  :currency="currency"
                  size="xl"
                  align="start"
                />
              </div>
              <div
                v-if="taxBreakdown"
                class="head__total"
              >
                <p class="head__moneyl">
                  {{ t('contract.tax.totalWithTax') }}
                </p>
                <!-- The magnitude rule is dropped on this pair. It is a
                     site-wide LOG scale for telling a thousand-peso purchase
                     from a million-peso one at a glance; on two readings of
                     the SAME purchase the two bars come out near-identical
                     and invite a comparison that means nothing. -->
                <MoneyAmount
                  :amount="taxBreakdown.total"
                  :currency="taxBreakdown.currency"
                  size="xl"
                  align="start"
                  :rule="false"
                />
              </div>
            </div>
            <!-- No caveat paragraph here any more: the two labels above say
                 "sin impuestos" and "con impuestos", which is the whole of
                 what the sentence explained. Naming "la ficha oficial de la
                 compra" only pointed at a place without going there, and the
                 source band directly below already does, with two buttons. -->
            <dl
              v-if="taxBreakdown && taxBreakdown.subtotalNet !== null"
              class="head__taxbreak"
            >
              <div class="head__taxrow">
                <dt>{{ t('contract.tax.subtotal') }}</dt>
                <dd class="u-mono">
                  {{ formatMoney(taxBreakdown.subtotalNet, taxBreakdown.currency, { decimals: true }) }}
                </dd>
              </div>
              <div class="head__taxrow">
                <dt>{{ t('contract.tax.taxes') }}</dt>
                <dd class="u-mono">
                  {{ formatMoney(taxBreakdown.impuestos, taxBreakdown.currency, { decimals: true }) }}
                </dd>
              </div>
            </dl>
            <p
              v-if="showRealToday"
              class="head__real"
              :title="t('money.todayHelp')"
            >
              ≈ {{ formatMoney(realToday, 'UYU') }} {{ t('money.today') }}
            </p>
            <p
              v-if="isMixedCurrency(contract)"
              class="head__fx"
            >
              {{ t('money.mixedCurrency') }}
            </p>
            <p
              v-else-if="wasConverted"
              class="head__fx"
            >
              {{ t('money.convertedFrom', { currency: originalCurrencies.join(', ') }) }}
            </p>

            <!-- Present only on releases where a lump sum stored in the item's
                 unit price inflated this total by orders of magnitude and the
                 header figure was corrected against the official record (see
                 `contractVerifiedOverride`). The line items below are left as
                 the raw feed reported them, so this explains the gap instead
                 of leaving it looking like a contradiction. -->
            <div
              v-if="verifiedOverride"
              class="head__verified"
            >
              <span
                class="tag tag--activo"
                :title="t('contract.verifiedTotalHelp')"
              >
                <v-icon size="12">mdi-check-decagram</v-icon>
                {{ t('contract.verifiedTotalBadge') }}
              </span>
              <p class="head__verifiedhelp">
                {{ t('contract.verifiedTotalHelp') }}
                <a
                  :href="verifiedOverride.sourceUrl"
                  target="_blank"
                  rel="noopener external"
                >{{ t('contract.verifiedTotalSource') }}</a>
              </p>
            </div>
          </template>
          <!-- Not "Sin monto": this stage has no amount to report yet,
               which is a fact about the process, not a gap in the data. -->
          <p
            v-else
            class="head__nomoney"
          >
            {{ t('contract.noMoneyStage') }}
          </p>
        </div>
      </header>

      <!-- Stage/status/OCID + the source band, side by side at half width
           each instead of the source band running the full page width below
           everything — the two belong at the same reading height, not one
           on top of the other. -->
      <div class="head2">
        <div class="head2__meta">
          <div class="head__meta">
            <!-- The stage is the single fact that explains why a release
                 may carry no supplier, no items and no amount. It leads. -->
            <span
              v-for="tg in tags"
              :key="tg"
              class="tag"
              :class="tagTone(tg)"
              :title="t(`contract.stageHelp.${tg}`)"
            >{{ t(`contract.stage.${tg}`) }}</span>
            <!-- "Llamado:" prefix on purpose: a bare "Vigente"/"Finalizado"
                 next to the "Adjudicación" stage chip reads as saying the
                 same thing twice. It usually IS the same fact — but not
                 always: a multi-lot tender can still be "Vigente" after
                 THIS lot already has a supplier. The prefix names which of
                 the two facts this chip is, so the pair never has to be
                 puzzled out case by case. -->
            <span
              v-if="contract.tender?.status"
              class="tag"
              :class="statusTagClass(contract.tender.status)"
              :title="t('contract.tenderStatusHelp')"
            >
              {{ t('contract.tenderStatusChip', { status: statusLabel(contract.tender.status) }) }}
            </span>
            <button
              type="button"
              class="head__ocid"
              :title="t('contract.ocidHelp')"
              :aria-label="t('contract.ocidHelp')"
              @click="copyOcid(contract.ocid!)"
            >
              <span class="head__ocidlabel">{{ t('contract.ocidLabel') }}</span>
              <span class="u-mono">{{ contract.ocid }}</span>
              <v-icon size="13">
                {{ ocidCopied ? 'mdi-check' : 'mdi-content-copy' }}
              </v-icon>
            </button>
          </div>
          <!-- Spelled out, not hover-only: the chip's `title` above never
               reaches a touch reader, and this is the one line that explains
               why a release may show no supplier, no items or no amount. -->
          <p
            v-if="primaryStageHelp"
            class="head__stagehelp"
          >
            {{ primaryStageHelp }}
          </p>
        </div>

        <!-- The links back to the source. The site's whole claim rests on
             these being one click away, on every contract. Two government
             views: the llamado (call) page, and — for awards — the
             adjudicación detail page. -->
        <div
          v-if="officialUrl || awardLink"
          class="official"
        >
          <v-icon
            size="20"
            class="official__i"
          >
            mdi-shield-check-outline
          </v-icon>
          <span class="official__text">
            <strong>{{ t('contract.officialSource') }}</strong>
            <span>{{ t('contract.officialSourceHelp') }}</span>
          </span>
          <span class="official__actions">
            <a
              v-if="awardLink"
              class="official__btn"
              :href="awardLink"
              target="_blank"
              rel="noopener external"
            >
              {{ t('contract.officialAward') }}
              <v-icon size="15">mdi-open-in-new</v-icon>
            </a>
            <a
              v-if="officialUrl"
              class="official__btn official__btn--ghost"
              :href="officialUrl"
              target="_blank"
              rel="noopener external"
            >
              {{ t('contract.officialTender') }}
              <v-icon size="15">mdi-open-in-new</v-icon>
            </a>
          </span>
        </div>
      </div>

      <div class="grid">
        <div class="grid__main">
          <!-- ===== AI review of the price flag (journalist/researcher panel) ===== -->
          <section
            v-if="aiVerdict"
            id="alerta-precio"
            class="panel block airev"
            :class="`airev--${aiVerdict.explainable}`"
          >
            <div class="panel__head">
              <h2>{{ t('contract.ai.title') }}</h2>
              <span
                class="airev__verdict"
                :class="`airev__verdict--${aiVerdict.explainable}`"
              >{{ t(`anomalies.ai.verdict.${aiVerdict.explainable}`) }}</span>
            </div>
            <div class="panel__body airev__body">
              <div class="airev__tags">
                <span class="airev__tag">{{ t(`anomalies.ai.category.${aiVerdict.category}`) }}</span>
                <span
                  v-if="aiConfidencePct !== null"
                  class="airev__tag u-mono"
                >{{ t('anomalies.confidence') }} {{ aiConfidencePct }}%</span>
                <span class="airev__tag u-mono">{{ t(`anomalies.severity.${aiFlag.severity}`) }}</span>
              </div>

              <p
                v-if="aiVerdict.analysis"
                class="airev__analysis"
              >
                {{ aiVerdict.analysis }}
              </p>
              <p
                v-else-if="aiVerdict.reason"
                class="airev__analysis"
              >
                {{ aiVerdict.reason }}
              </p>

              <div class="airev__figs u-mono">
                <span>{{ t('anomalies.detected') }}: <strong>{{ aiMoney(aiFlag.detectedValue) }}</strong></span>
                <span v-if="aiFlag.expectedRange">{{ t('anomalies.expected') }}: {{ aiMoney(aiFlag.expectedRange.min) }} – {{ aiMoney(aiFlag.expectedRange.max) }}</span>
              </div>

              <div
                v-if="aiEvidence.length"
                class="airev__ev"
              >
                <p class="airev__h">
                  {{ t('anomalies.ai.evidence') }}
                </p>
                <ul>
                  <li
                    v-for="(e, i) in aiEvidence"
                    :key="`aie${i}`"
                  >
                    {{ e }}
                  </li>
                </ul>
              </div>

              <div
                v-if="aiDocs.length"
                class="airev__docs"
              >
                <p class="airev__h">
                  {{ t('anomalies.ai.documents') }}
                </p>
                <ul>
                  <li
                    v-for="(d, i) in aiDocs"
                    :key="`aid${i}`"
                  >
                    <a
                      :href="d.url"
                      target="_blank"
                      rel="noopener nofollow"
                    >{{ d.type || t('anomalies.ai.document') }}</a>
                    <span
                      v-if="d.format"
                      class="airev__fmt"
                    >{{ d.format }}</span>
                  </li>
                </ul>
              </div>

              <p class="airev__note">
                {{ t('anomalies.ai.note') }}
                <span
                  v-if="aiVerdict.model"
                  class="u-mono"
                > · {{ aiVerdict.model }}<span v-if="aiScoredAt"> · {{ aiScoredAt }}</span></span>
              </p>
            </div>
          </section>

          <!-- ===== What the Court of Accounts said ===== -->
          <ContractTcr :rulings="(contract as any)?.tcr ?? null" />

          <!-- ===== Who else bid ===== -->
          <ContractBidders
            :call-bidders="(contract as any)?.callBidders ?? null"
            :acta="(contract as any)?.bidders ?? null"
            :winners="suppliers.map(s => s.name).filter(Boolean)"
          />

          <!-- ===== Resumen: who, then the process facts =====
               Merged from two panels that used to repeat the same fact
               twice — the tender's `procuringEntity.name` and the buyer
               party's name are the same entity, so it now shows once, as
               the linked party card, not again as inert text below. -->
          <section
            v-if="partyRoster.length || hasTenderFacts"
            class="panel block"
          >
            <div class="panel__head">
              <h2>{{ t('contract.sections.summary') }}</h2>
            </div>
            <div class="panel__body">
              <div class="parties">
                <!-- Driven by `parties[]`, the release's own roster: every
                   entry, named with the role it actually played. -->
                <div
                  v-for="p in partyRoster"
                  :key="p.key"
                  class="party"
                >
                  <p class="party__role">
                    {{ p.roles.length ? p.roles.map(roleLabel).join(' · ') : t('contract.fields.roles') }}
                  </p>
                  <NuxtLink
                    v-if="p.to"
                    :to="localePath(p.to)"
                    class="party__name"
                  >
                    {{ p.name || '—' }}
                  </NuxtLink>
                  <span
                    v-else
                    class="party__name party__name--plain"
                  >{{ p.name || '—' }}</span>

                  <!-- Which administration held office the year this was recorded —
                     public record, context only. Silent for organisms with no
                     executive mandate (judiciary, university) and undated releases. -->
                  <MandateChip
                    v-if="p.isBuyer && p.id"
                    :buyer-id="p.id"
                    :year="contract?.sourceYear"
                    show-self-governed
                    class="party__mandate"
                  />

                  <span
                    v-if="p.legalName"
                    class="party__sub"
                  >{{ t('contract.fields.legalName') }}: {{ p.legalName }}</span>
                  <span
                    v-if="p.rut"
                    class="party__sub u-mono"
                  >{{ t('contract.fields.rut') }}: {{ p.rut }}</span>

                  <!-- Who to actually ask. The source carries this per party
                     and the government's own page prints it — except when
                     it's the exact contact the aside panel already shows
                     (buyer vs procuringEntity can carry DIFFERENT contacts,
                     so this only hides the one that's actually duplicated). -->
                  <div
                    v-if="p.contact && !(p.isBuyer && isAsideContact(p.contact))"
                    class="contact"
                  >
                    <p class="contact__l">
                      {{ t('contract.fields.contact') }}
                    </p>
                    <span
                      v-if="p.contact.name"
                      class="contact__name"
                    >{{ p.contact.name }}</span>
                    <a
                      v-if="p.contact.email"
                      :href="`mailto:${p.contact.email}`"
                      class="contact__link u-truncate"
                    >{{ p.contact.email }}</a>
                    <a
                      v-if="p.contact.phone"
                      :href="`tel:${p.contact.phone.replace(/[^\d+]/g, '')}`"
                      class="contact__link u-mono"
                    >{{ p.contact.phone }}</a>
                  </div>
                </div>
              </div>

              <dl
                v-if="hasTenderFacts || singleAward"
                class="facts facts--cols"
              >
                <!-- With one award these describe the contract, so they read
                     here with the rest of its facts instead of floating above
                     the items table. Several awards keep them per block. -->
                <div
                  v-if="singleAward?.awardId"
                  class="facts__row"
                >
                  <dt>{{ t('contract.fields.awardId') }}</dt>
                  <dd class="u-mono">
                    {{ singleAward.awardId }}
                  </dd>
                </div>
                <div
                  v-if="singleAward?.awardStatus"
                  class="facts__row"
                >
                  <dt>{{ t('contract.fields.awardStatus') }}</dt>
                  <dd>
                    <span
                      class="tag"
                      :class="statusTagClass(singleAward.awardStatus)"
                    >{{ statusLabel(singleAward.awardStatus) }}</span>
                  </dd>
                </div>
                <!-- The specific office that ran this purchase — "Cerro Largo
                     TEC", not just "OSE". `buyer.id` is <inciso>-<unidad
                     ejecutora> (shared/organism-groups.ts), so the party above
                     names the executing unit while this names the desk inside
                     it. It is the most granular answer to "who bought this",
                     and until now it only existed as the first line of the
                     aside's contact card. -->
                <div
                  v-if="buyingOfficeName"
                  class="facts__row"
                >
                  <dt>
                    {{ t('contract.fields.buyingOffice') }}
                    <span
                      class="facts__help"
                      :title="t('contract.fields.buyingOfficeHelp')"
                    >?</span>
                  </dt>
                  <dd>{{ buyingOfficeName }}</dd>
                </div>
                <div
                  v-if="tender?.id"
                  class="facts__row"
                >
                  <dt>{{ t('contract.fields.tenderId') }}</dt>
                  <dd class="u-mono">
                    {{ tender.id }}
                  </dd>
                </div>
                <!-- Only when the party roster above didn't already name this
                     entity — the common case (a `parties[]`-carrying release)
                     already shows it as the linked buyer/procuringEntity
                     card; this is the fallback for older records where it
                     wouldn't otherwise appear anywhere. -->
                <div
                  v-if="tender?.procuringEntity?.name && !procuringEntityShownAsParty"
                  class="facts__row"
                >
                  <dt>{{ t('contract.fields.procuringEntity') }}</dt>
                  <dd>{{ tender.procuringEntity.name }}</dd>
                </div>
                <!-- No "Estado" row here on purpose: the header chip above
                     renders under the EXACT same condition (tender?.status)
                     and shows it better — colour-coded by statusTagClass,
                     in the highest-visibility spot on the page. Repeating it
                     as plain text was the one status that broke the pattern
                     "Etapa" already follows: never echoed in Resumen. -->
                <!-- No "Procedimiento" row: now that the eyebrow above the
                     title carries the method alone, this restated it a few
                     centimetres below. The eyebrow is the better home — it is
                     the first thing read, and "Compra Directa" vs "Licitación
                     Pública" frames everything under it. -->
                <div
                  v-if="typeof tender?.hasEnquiries === 'boolean'"
                  class="facts__row"
                >
                  <dt>{{ t('contract.fields.hasEnquiries') }}</dt>
                  <dd>{{ boolLabel(tender.hasEnquiries) }}</dd>
                </div>
                <div
                  v-if="tender?.submissionMethod?.length"
                  class="facts__row"
                >
                  <dt>{{ t('contract.fields.submissionMethod') }}</dt>
                  <dd>{{ tender.submissionMethod.map(submissionLabel).join(' · ') }}</dd>
                </div>
                <!-- Full width only when it earns it. This field is usually a
                     packed multi-part string ("Lugar entrega: … ;Fecha
                     prórroga: …") that needs the room, but it is often just
                     "Electrónica" — and spanning that across both columns
                     left a hole in the grid, so a 4-fact Resumen rendered
                     3 items down the left and 1 on the right instead of 2×2. -->
                <div
                  v-if="tender?.submissionMethodDetails"
                  class="facts__row"
                  :class="{ 'facts__row--full': submissionParts.length > 1 }"
                >
                  <dt>{{ t('contract.fields.submissionMethodDetails') }}</dt>
                  <dd>
                    <span
                      v-for="(part, i) in submissionParts"
                      :key="i"
                      class="subm__part"
                    >
                      <span
                        v-if="part.label"
                        class="subm__k"
                      >{{ part.label }}</span>
                      <span>{{ part.value }}</span>
                    </span>
                  </dd>
                </div>
              </dl>
            </div>
          </section>

          <!-- ===== What was bought ===== -->
          <section class="panel block">
            <div class="panel__head">
              <!-- A tender lists what the state INTENDS to buy; nothing
                   is awarded yet and there are no prices. Calling that
                   "qué se compró / artículos adjudicados" states a fact
                   that hasn't happened. -->
              <h2>{{ showsMoney ? t('contract.sections.items') : t('contract.sections.itemsTender') }}</h2>
              <p class="panel__help">
                {{ showsMoney ? t('contract.itemsHelp') : t('contract.itemsTenderHelp') }}
              </p>
            </div>

            <!-- Filter the lines: free text over description/code, plus an
                 "only flagged" toggle when a price alert fired. Both refine
                 already-loaded rows client-side. -->
            <div
              v-if="showItemFilter"
              class="ifilter"
            >
              <label class="ifilter__box">
                <v-icon
                  size="16"
                  class="ifilter__icon"
                >
                  mdi-magnify
                </v-icon>
                <input
                  v-model="itemQuery"
                  type="search"
                  class="ifilter__input"
                  :placeholder="t('contract.itemsFilter.placeholder')"
                  :aria-label="t('contract.itemsFilter.placeholder')"
                >
              </label>
              <button
                v-if="hasItemAlerts"
                type="button"
                class="ifilter__toggle"
                :class="{ 'ifilter__toggle--on': onlyAlerts }"
                :aria-pressed="onlyAlerts"
                @click="onlyAlerts = !onlyAlerts"
              >
                <v-icon size="15">
                  mdi-alert-outline
                </v-icon>
                {{ t('contract.itemsFilter.onlyAlerts') }}
              </button>
              <span
                class="ifilter__count u-mono"
                aria-live="polite"
              >{{ t('contract.itemsFilter.shown', { shown: shownItemRows, total: totalItemRows }) }}</span>
            </div>

            <div
              v-if="!itemGroups.length"
              class="panel__body"
            >
              <p class="u-muted">
                {{ t('contract.noItems') }}
              </p>
            </div>

            <!-- One block per award: the award's own id, date and status
                 sit above the lines it paid for, so a release with more
                 than one award never blurs into a single list. -->
            <div
              v-for="g in filteredItemGroups"
              :key="g.key"
              class="agroup"
            >
              <!-- Only when there are SEVERAL awards. With one, its id and
                   status describe the contract and now read in Resumen; a
                   lone block repeating them above its own table was a header
                   for a grouping the reader could not see. -->
              <dl
                v-if="itemGroups.length > 1"
                class="facts facts--award"
              >
                <div
                  v-if="g.awardId"
                  class="facts__row"
                >
                  <dt>{{ t('contract.fields.awardId') }}</dt>
                  <dd class="u-mono">
                    {{ g.awardId }}
                  </dd>
                </div>
                <!-- Only worth naming per award when there is more than one;
                     a single award's date is already Cronología's
                     "Adjudicación" entry, and repeating it here — unlabelled
                     as to WHICH date it even is — was confusing, not helpful. -->
                <div
                  v-if="itemGroups.length > 1 && g.awardDate"
                  class="facts__row"
                >
                  <dt>{{ t('contract.fields.awardDate') }}</dt>
                  <dd class="u-mono">
                    {{ formatDate(g.awardDate) }}
                  </dd>
                </div>
                <div
                  v-if="g.awardStatus"
                  class="facts__row"
                >
                  <dt>{{ t('contract.fields.awardStatus') }}</dt>
                  <dd>
                    <span
                      class="tag"
                      :class="statusTagClass(g.awardStatus)"
                    >{{ statusLabel(g.awardStatus) }}</span>
                  </dd>
                </div>
                <!-- Only worth naming per award when there is more than
                     one; otherwise the parties section already said it. -->
                <div
                  v-if="itemGroups.length > 1 && g.suppliers.length"
                  class="facts__row"
                >
                  <dt>{{ t('common.supplier') }}</dt>
                  <dd>{{ g.suppliers.map(s => s.name).filter(Boolean).join(' · ') }}</dd>
                </div>
              </dl>

              <p
                v-if="!g.rows.length"
                class="agroup__empty u-muted"
              >
                {{ t('contract.noItems') }}
              </p>

              <DataTable
                v-else
                class="itemstable"
                :columns="itemColumns(g.hasPrices, hasTaxData)"
                :rows="g.rows"
                :row-key="it => it.key"
                min-width="560px"
                :framed="false"
              >
                <template #cell:description="{ row }">
                  {{ row.description || '—' }}
                  <!-- The price flag on this exact line, restored inline: the
                       feed unit price sits far above this item's usual range.
                       The full analysis is the panel at the top of the page —
                       but AI triage is a separate second stage, so a
                       statistically-flagged line on an un-triaged release has
                       no #alerta-precio panel to jump to. Render a plain
                       badge rather than a link that would silently do
                       nothing. -->
                  <component
                    :is="aiVerdict ? 'a' : 'span'"
                    v-if="rowAnomaly(row)"
                    class="ialert"
                    :class="`ialert--${rowAnomaly(row).severity}`"
                    :href="aiVerdict ? '#alerta-precio' : undefined"
                    :title="rowAnomaly(row).description"
                  >
                    <v-icon size="12">
                      mdi-alert
                    </v-icon>
                    {{ t('contract.itemsFilter.alert') }}
                  </component>
                  <!-- Características scraped from the gov page — the
                       open-data feed doesn't carry them. See
                       /api/contracts/[id]/features. -->
                  <template v-if="rowFeatures(row)">
                    <span
                      v-if="rowFeatures(row)?.variation"
                      class="ifeat"
                    >{{ t('contract.features.variation') }}: <strong class="ifeat__v">{{ rowFeatures(row)?.variation }}</strong></span>
                    <span
                      v-for="f in rowFeatures(row)?.features"
                      :key="f.name + f.value"
                      class="ifeat"
                    >{{ f.name }}: <strong class="ifeat__v">{{ f.value }}</strong></span>
                  </template>
                </template>
                <template #cell:code="{ row }">
                  <!-- The catalogue code links to its product page: what else
                       the state buys under it, from whom, at what price. -->
                  <NuxtLink
                    v-if="row.code"
                    :to="localePath(`/products/${encodeURIComponent(row.code)}`)"
                    class="itable__code u-mono"
                  >{{ row.code }}</NuxtLink>
                  <span
                    v-else
                    class="u-muted"
                  >—</span>
                  <span
                    v-if="row.codeDescription"
                    class="itable__u"
                  >{{ row.codeDescription }}</span>
                </template>
                <template #cell:quantity="{ row }">
                  {{ formatNumber(displayQuantity(row)) }}
                </template>
                <template #cell:unitName="{ row }">
                  <span v-if="row.unitName">{{ row.unitName }}</span>
                  <span
                    v-else
                    class="u-muted"
                  >—</span>
                </template>
                <template #cell:unitAmount="{ row }">
                  <MoneyConvert
                    :amount="row.unitAmount"
                    :currency="row.currency"
                    :date="itemDate"
                    :rate-table="rateTable"
                    :rule="false"
                    size="sm"
                  />
                </template>
                <!-- What this line's unit price means against the same
                     catalogue item's last 36 months. Per LINE, so two lines
                     sharing a code but not a price each get their own
                     verdict — the old separate table showed only the first. -->
                <template #cell:reference="{ row }">
                  <template v-if="rowReference(row)">
                    <span class="refcell__verdict">
                      <span
                        class="tag refcell__pos"
                        :class="rowReference(row)!.tone"
                      >
                        {{ t(`contract.reference.pos.${rowReference(row)!.position}`) }}
                        <!-- The verdict's definition, inside the chip it
                             defines. A real <button>, not a `title`: it
                             reveals on hover AND on keyboard focus, so the
                             definition is reachable without a pointer. -->
                        <button
                          type="button"
                          class="refhelp"
                          :aria-label="t(`contract.reference.posHelp.${rowReference(row)!.position}`)"
                        >
                          ?
                          <span
                            class="refhelp__bubble"
                            role="tooltip"
                          >{{ t(`contract.reference.posHelp.${rowReference(row)!.position}`) }}</span>
                        </button>
                      </span>
                      <span
                        v-if="ratioText(rowReference(row)!)"
                        class="refcell__ratio u-mono"
                      >{{ ratioText(rowReference(row)!) }}</span>
                    </span>
                    <span class="refcell__stats">{{ statsText(rowReference(row)!) }}</span>
                    <NuxtLink
                      v-if="comparablesLink(rowReference(row)!)"
                      :to="comparablesLink(rowReference(row)!)!"
                      class="refcell__link"
                    >{{ t('contract.reference.viewComparables') }}</NuxtLink>
                  </template>
                  <!-- Named, not blank: a reader could otherwise not tell
                       "no comparables" from "we didn't check". -->
                  <span
                    v-else-if="row.unitAmount"
                    class="refcell__none"
                  >{{ t('contract.reference.noBaseline') }}</span>
                  <span
                    v-else
                    class="u-muted"
                  >—</span>
                </template>
                <template #cell:total="{ row }">
                  <MoneyConvert
                    :amount="displayNetTotal(row)"
                    :currency="row.currency"
                    :date="itemDate"
                    :rate-table="rateTable"
                    :rule="false"
                    size="sm"
                  />
                </template>
                <!-- "Monto total con impuestos" scraped from the gov page — the
                     open feed carries only tax-exclusive prices. -->
                <template #cell:grossTotal="{ row }">
                  <MoneyConvert
                    v-if="rowGross(row)"
                    :amount="rowGross(row)?.amount"
                    :currency="rowGross(row)?.currency ?? 'UYU'"
                    :date="itemDate"
                    :rate-table="rateTable"
                    :rule="false"
                    size="sm"
                  />
                  <span
                    v-else
                    class="u-muted"
                  >—</span>
                </template>
              </DataTable>
            </div>

            <div
              v-if="noItemMatch"
              class="ifilter__empty u-muted"
            >
              {{ t('contract.itemsFilter.noMatch') }}
            </div>

            <template v-if="hasAnyReference">
              <div class="panel__foot">
                <p class="reftable__note">
                  {{ t('contract.referenceHelp') }}
                </p>
                <!-- Counted per LINE, not per catalogue code: the whole point
                     of merging these tables was that a per-code count hid
                     dropped lines instead of revealing them. -->
                <p
                  v-if="referenceGaps"
                  class="reftable__note"
                >
                  {{ t('contract.reference.coverage', referenceGaps) }}
                </p>
                <!-- The one caveat this comparison needs: the feed's unit price
                     ignores the presentación, so "per G" can mean "per
                     250 G envase". Without saying so, a correct row reads
                     as a 250× scandal — or a real one reads as normal. -->
                <p class="reftable__note">
                  {{ t('contract.reference.presNote') }}
                  <a
                    v-if="awardLink"
                    :href="awardLink"
                    target="_blank"
                    rel="noopener"
                  >{{ t('contract.reference.presNoteSource') }}</a>
                </p>
                <NuxtLink
                  :to="localePath('/analytics/anomalies')"
                  class="reftable__link"
                >
                  {{ t('contract.reference.method') }}
                </NuxtLink>
              </div>
            </template>
          </section>

          <!-- ===== Amendments ===== -->
          <section
            v-if="amendments.length"
            class="panel block"
          >
            <div class="panel__head">
              <h2>{{ t('contract.sections.amendments') }}</h2>
            </div>
            <ol class="amds">
              <li
                v-for="(a, i) in amendments"
                :key="a.id || i"
                class="amds__row"
              >
                <span
                  v-if="a.date"
                  class="amds__date u-mono"
                >{{ formatDate(a.date) }}</span>
                <span class="amds__body">
                  <span
                    v-if="a.description"
                    class="amds__desc"
                  >{{ amendmentLabel(a.description) }}</span>
                  <!-- The release this one amends exists at /contracts/{id}
                       ~99% of the time; link it instead of printing a dead
                       id the reader has to paste into the URL bar. -->
                  <NuxtLink
                    v-if="a.amendsReleaseID"
                    :to="localePath(`/contracts/${a.amendsReleaseID}`)"
                    class="amds__ref u-mono"
                  >{{ t('contract.amendmentOf', { id: a.amendsReleaseID }) }}</NuxtLink>
                </span>
              </li>
            </ol>
          </section>

          <!-- ===== Related ===== -->
          <section
            v-if="related.length"
            class="block"
          >
            <div class="block__head">
              <h2>{{ t('contract.relatedTitle') }}</h2>
              <NuxtLink
                v-if="contract.buyer?.name"
                :to="localePath(`/contracts?buyers=${toQueryListParam(contract.buyer.name)}`)"
                class="block__all"
              >
                {{ t('common.viewAll') }}
              </NuxtLink>
            </div>
            <ol class="rank">
              <li
                v-for="r in related"
                :key="r.id"
                class="rank__row"
              >
                <NuxtLink
                  :to="localePath(`/contracts/${r.id}`)"
                  class="rank__link"
                >
                  <span class="rank__main">
                    <span class="rank__name u-truncate">{{ contractName(r) }}</span>
                    <span
                      v-if="relatedSupplier(r)"
                      class="rank__sub u-truncate"
                    >{{ relatedSupplier(r) }}</span>
                  </span>
                  <span class="rank__meta">{{ formatDate(contractDate(r)) }}</span>
                  <MoneyAmount
                    :amount="relatedAmount(r)"
                    :currency="contractCurrency(r)"
                    compact
                    size="sm"
                  />
                </NuxtLink>
              </li>
            </ol>
          </section>

          <!-- ===== Technical detail =====
               Amount breakdown, ingest provenance and raw JSON: real facts,
               but not what a reader reaches for first. These three used to
               anchor the aside — where they outlived the aside's own content
               on a short record and left the lateral column scrolling well
               past the last thing worth reading. One collapsed block, at the
               foot of the evidence it explains, closed by default. -->
          <details class="techdetails block">
            <summary class="techdetails__summary">
              {{ t('contract.sections.technical') }}
            </summary>

            <section
              v-if="showAmountDetail"
              class="panel block techdetails__block"
            >
              <div class="panel__head">
                <h2>{{ t('contract.sections.amount') }}</h2>
              </div>
              <div class="panel__body">
                <dl class="facts facts--cols">
                  <div
                    v-for="[cur, val] in totalAmounts"
                    :key="cur"
                    class="facts__row"
                  >
                    <dt>{{ cur }}</dt>
                    <dd>
                      <MoneyAmount
                        :amount="val"
                        :currency="cur"
                        :rule="false"
                        size="sm"
                        align="start"
                        decimals
                      />
                    </dd>
                  </div>
                  <div
                    v-if="typeof amt?.totalItems === 'number'"
                    class="facts__row"
                  >
                    <dt>{{ t('contract.fields.totalItems') }}</dt>
                    <dd class="u-mono">
                      {{ formatNumber(amt.totalItems) }}
                    </dd>
                  </div>
                  <div
                    v-if="amt?.currencies?.length"
                    class="facts__row"
                  >
                    <dt>{{ t('contract.fields.currencies') }}</dt>
                    <dd class="u-mono">
                      {{ amt.currencies.join(' · ') }}
                    </dd>
                  </div>
                  <div
                    v-if="typeof amt?.originalUYUAmount === 'number'"
                    class="facts__row"
                  >
                    <dt>{{ t('contract.fields.originalUYU') }}</dt>
                    <dd>
                      <MoneyAmount
                        :amount="amt.originalUYUAmount"
                        currency="UYU"
                        :rule="false"
                        size="sm"
                        align="start"
                        decimals
                      />
                    </dd>
                  </div>
                  <div
                    v-if="typeof amt?.hasConvertedAmounts === 'boolean'"
                    class="facts__row"
                  >
                    <dt>{{ t('contract.fields.converted') }}</dt>
                    <dd>{{ boolLabel(amt.hasConvertedAmounts) }}</dd>
                  </div>
                  <div
                    v-if="amt?.exchangeRateDate"
                    class="facts__row"
                  >
                    <dt>{{ t('contract.fields.exchangeRateDate') }}</dt>
                    <dd class="u-mono">
                      {{ formatDate(amt.exchangeRateDate) }}
                    </dd>
                  </div>
                  <!-- `amt.version` (the internal calculation-pipeline version)
                       and `sourceFileName` below are operational metadata, not
                       business facts — DESIGN.md's Don't list names both. The
                       raw-JSON dialog two blocks down already serves anyone
                       who needs them. -->
                </dl>
              </div>
            </section>

            <section
              v-if="showProvenance"
              class="panel block techdetails__block"
            >
              <div class="panel__head">
                <h2>{{ t('contract.sections.provenance') }}</h2>
              </div>
              <div class="panel__body">
                <dl class="facts facts--cols">
                  <div
                    v-if="contract.initiationType"
                    class="facts__row"
                  >
                    <dt>{{ t('contract.fields.initiationType') }}</dt>
                    <dd>{{ initiationTypeLabel(contract.initiationType) }}</dd>
                  </div>
                  <!-- No "Año de origen": it is just the year of the dates
                       already on the page (Cronología, "Importado el"), so it
                       restated a fact the reader can already see. -->
                  <div
                    v-if="webFetchDate"
                    class="facts__row"
                  >
                    <dt>{{ t('contract.fields.fetched') }}</dt>
                    <dd class="u-mono">
                      {{ formatDate(webFetchDate) }}
                    </dd>
                  </div>
                  <!-- The machine-readable original, distinct from the human
                       page linked at the top: someone checking our arithmetic
                       wants the exact document we parsed. One row, two ways in
                       — read it here, or open the source. `rssLink` and
                       `ocdsUrl` are the same address on this feed, differing
                       only by scheme, so they were printing twice. -->
                  <div
                    v-if="sourceDocUrl"
                    class="facts__row facts__row--full"
                  >
                    <dt>{{ t('contract.fields.sourceDoc') }}</dt>
                    <dd class="srcdoc">
                      <button
                        class="rawbtn"
                        type="button"
                        @click="openRawJson"
                      >
                        {{ t('common.view') }}
                      </button>
                      <a
                        :href="sourceDocUrl"
                        target="_blank"
                        rel="noopener external"
                        class="facts__link u-truncate"
                      >{{ sourceDocUrl }}</a>
                    </dd>
                  </div>
                  <!-- Only when the feed's own link is a DIFFERENT address —
                       normally it is the same document over http and folds
                       into the row above. -->
                  <div
                    v-if="rssLinkDistinct"
                    class="facts__row facts__row--full"
                  >
                    <dt>{{ t('contract.fields.rssLink') }}</dt>
                    <dd>
                      <a
                        :href="rssLinkDistinct"
                        target="_blank"
                        rel="noopener external"
                        class="facts__link u-truncate"
                      >{{ rssLinkDistinct }}</a>
                    </dd>
                  </div>
                </dl>
              </div>
            </section>
          </details>
        </div>

        <!-- ===== Aside ===== -->
        <aside class="grid__side">
          <CallContact
            class="block"
            :contact="(contract as any)?.contact"
            :organism="(contract as any)?.buyer?.name"
          />
          <!-- A genuine ordered sequence, so it is ordered by date —
               not numbered for decoration. -->
          <section
            v-if="timeline.length"
            class="panel block"
          >
            <div class="panel__head">
              <h2>{{ t('contract.sections.timeline') }}</h2>
            </div>
            <ol class="tl">
              <li
                v-for="s in timeline"
                :key="s.key"
                class="tl__step"
              >
                <span
                  class="tl__dot"
                  aria-hidden="true"
                />
                <span class="tl__body">
                  <span class="tl__label">{{ t(`contract.timeline.${s.key}`) }}</span>
                  <span class="tl__date u-mono">{{ s.text }}</span>
                </span>
              </li>
            </ol>
          </section>

          <section class="panel block">
            <div class="panel__head">
              <h2>{{ t('contract.sections.documents') }}</h2>
            </div>
            <div
              v-if="!documents.length"
              class="panel__body"
            >
              <p class="u-muted">
                {{ t('contract.noDocuments') }}
              </p>
            </div>
            <ul
              v-else
              class="docs"
            >
              <li
                v-for="(d, i) in visibleDocuments"
                :key="i"
              >
                <a
                  :href="d.url"
                  target="_blank"
                  rel="noopener external"
                  class="docs__link"
                >
                  <v-icon size="16">
                    mdi-file-document-outline
                  </v-icon>
                  <span class="u-truncate">{{ docLabel(d) }}</span>
                  <v-icon size="14">
                    mdi-open-in-new
                  </v-icon>
                </a>
              </li>
            </ul>
            <button
              v-if="!showAllDocs && documents.length > DOCS_PREVIEW"
              type="button"
              class="docs__more"
              @click="showAllDocs = true"
            >
              {{ t('contract.showAllDocs', { n: documents.length }) }}
            </button>
          </section>
        </aside>
      </div>

      <v-dialog
        v-model="rawOpen"
        max-width="900"
        scrollable
      >
        <div class="rawdlg">
          <div class="rawdlg__head">
            <h2>{{ contract.id }}</h2>
            <button
              class="rawdlg__x"
              type="button"
              :aria-label="t('nav.close')"
              @click="rawOpen = false"
            >
              <v-icon>mdi-close</v-icon>
            </button>
          </div>
          <pre class="rawdlg__pre">{{ JSON.stringify(contract, null, 2) }}</pre>
        </div>
      </v-dialog>
    </template>
  </div>
</template>

<style scoped>
.page { padding-block: var(--s-6) var(--s-8); }

@media (max-width: 620px) {
  .page { padding-block: var(--s-5) var(--s-5); }
}

/* ---- Header ---- */
.head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--s-5);
  align-items: start;
  /* The rule that used to close .head now closes .head2 instead — stage,
     OCID and the source band read as part of the same header zone as the
     title and the amount, not a separate section below it. */
}

/* Stage/status/OCID (left) and the source band (right), half width each —
   was a full-width band stacked below everything; now it sits at the same
   reading height as the chips it's paired with. */
.head2 {
  display: grid;
  /* Not an even split: the source band needs the room to keep its two
     buttons on one line, and the meta column (a couple of chips, the OCID
     button, one line of help text) rarely needs more than 40%. */
  grid-template-columns: minmax(0, 2fr) minmax(0, 3fr);
  gap: var(--s-5);
  align-items: start;
  margin-top: var(--s-4);
  padding-bottom: var(--s-5);
  border-bottom: 1px solid var(--rule);
}

.head2__meta {
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
  min-width: 0;
}

.head__title {
  margin: var(--s-2) 0 var(--s-3);
  max-width: 24ch;
}

.head__subject {
  margin: calc(var(--s-2) * -1) 0 var(--s-3);
  max-width: 60ch;
  font-size: var(--t-md);
  line-height: 1.5;
  color: var(--text-muted);
}

.head__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--s-3);
}

.head__ocid {
  display: inline-flex;
  align-items: center;
  gap: var(--s-1);
  padding: 2px var(--s-2);
  border: 1px solid transparent;
  border-radius: var(--r-sm);
  background: none;
  font-size: var(--t-xs);
  color: var(--text-muted);
  cursor: pointer;
}

.head__ocid:hover {
  border-color: var(--rule);
  background: var(--surface-sunken);
  color: var(--text);
}

.head__ocid .v-icon { opacity: 0.7; }

/* A raw "ocds-yfs5dr-…" string with no label reads as noise to a reader who
   has never heard of OCDS — this names what it is before showing it. */
.head__ocidlabel {
  font-family: var(--font-body);
  text-transform: none;
  letter-spacing: normal;
  opacity: 0.8;
}

.head__stagehelp {
  margin: var(--s-2) 0 0;
  font-size: var(--t-xs);
  color: var(--text-muted);
}

.head__money { min-width: 200px; }

.head__moneyl {
  margin: 0 0 var(--s-1);
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.head__fx {
  margin: var(--s-2) 0 0;
  font-size: var(--t-xs);
  color: var(--text-muted);
  max-width: 28ch;
}

.head__real {
  margin: var(--s-1) 0 0;
  font-family: var(--font-mono);
  font-size: var(--t-sm);
  font-weight: 600;
  color: var(--money);
  cursor: help;
}

.head__nomoney {
  margin: 0;
  max-width: 30ch;
  font-size: var(--t-sm);
  color: var(--text-muted);
}

/* ---- Verified total (correct-lumpsum-artifacts.ts override) ---- */
.head__verified { margin-top: var(--s-2); max-width: 34ch; }

.head__verifiedhelp {
  margin: var(--s-1) 0 0;
  font-size: var(--t-xs);
  line-height: 1.5;
  color: var(--text-muted);
}

.head__verifiedhelp a {
  color: var(--celeste-deep);
  font-weight: 600;
}

/* ---- The two readings of the same purchase, side by side ----
   The feed's tax-exclusive total and the government's tax-inclusive one.
   Stacked, the second read as a separate (larger) amount; in one row they
   read as what they are — the same purchase, before and after tax. */
.head__totals {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-6);
}

.head__total { min-width: 0; }

.head__taxbreak {
  margin: var(--s-2) 0 0;
  display: grid;
  gap: 2px;
  max-width: 34ch;
}

.head__taxrow {
  display: flex;
  justify-content: space-between;
  gap: var(--s-3);
  font-size: var(--t-sm);
}

.head__taxrow dt {
  color: var(--text-muted);
}

.head__taxrow dd {
  margin: 0;
  font-weight: 600;
}

/* ---- Official source ---- */
.official {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--s-3);
  /* Spacing now comes from .head2's own margin-top — this sits beside
     .head2__meta, not stacked below the whole header. */
  min-width: 0;
  padding: var(--s-3) var(--s-4);
  border: 1px solid color-mix(in srgb, var(--celeste) 40%, transparent);
  border-radius: var(--r-lg);
  background: var(--celeste-wash);
  color: var(--text);
}

@media (max-width: 620px) {
  .official__actions { margin-left: 0; width: 100%; }
  .official__btn { flex: 1 1 auto; justify-content: center; }
}

.official:hover { border-color: var(--celeste); }

.official__i {
  color: var(--celeste-deep);
  flex: none;
}

.official__text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.official__text strong { font-size: var(--t-sm); }

.official__text span {
  font-size: var(--t-xs);
  color: var(--text-muted);
}

.official__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-2);
  margin-left: auto;
}

.official__btn {
  display: inline-flex;
  align-items: center;
  gap: var(--s-1);
  padding: var(--s-2) var(--s-3);
  border-radius: var(--r-md);
  background: var(--celeste-deep);
  /* --celeste-deep flips light in the dark theme while --ink never flips, so a
     fixed #fff washes out there; --surface is #fff on light and dark navy on
     dark — readable on the celeste fill in both. */
  color: var(--surface);
  font-size: var(--t-sm);
  font-weight: 600;
  text-decoration: none;
  white-space: nowrap;
  transition: background var(--dur) var(--ease);
}

.official__btn:hover {
  background: var(--ink);
  color: #fff; /* --ink stays dark in both themes; the base color would be dark-on-dark here */
}

.official__btn--ghost {
  background: transparent;
  color: var(--celeste-deep);
  border: 1px solid color-mix(in srgb, var(--celeste) 45%, transparent);
}

.official__btn--ghost:hover {
  /* Was background: var(--surface) + color: var(--ink) — on the dark theme both
     are dark navy, so the label vanished on hover. A celeste tint plus the
     theme's own text color reads in both themes. */
  background: color-mix(in srgb, var(--celeste) 20%, transparent);
  color: var(--text);
}

/* ---- Grid ---- */
.grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: var(--s-6);
  align-items: start;
  margin-top: var(--s-6);
}

.grid__main,
.grid__side { min-width: 0; }

.block + .block { margin-top: var(--s-5); }

/* ---- Technical detail (collapsed) ----
   Amount breakdown, provenance and raw JSON — real, but not what a reader
   reaches for first. Each inner section keeps its own .panel card (same
   look as every other section on the page); <details> only adds the
   disclosure, closed by default. */
.techdetails__summary {
  margin-bottom: var(--s-4);
  cursor: pointer;
  list-style: none;
  font-family: var(--font-mono);
  font-size: var(--t-sm);
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.techdetails__summary::-webkit-details-marker { display: none; }

.techdetails__summary::before {
  content: '▸';
  display: inline-block;
  width: 1em;
  margin-right: var(--s-1);
  transition: transform var(--dur) var(--ease);
}

.techdetails[open] .techdetails__summary::before { transform: rotate(90deg); }

.techdetails__block + .techdetails__block { margin-top: var(--s-4); }

.block__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--s-4);
  margin-bottom: var(--s-3);
}

.block__all {
  font-size: var(--t-sm);
  font-weight: 600;
  color: var(--celeste-deep);
  text-decoration: none;
}

.panel__help {
  margin: 0;
  font-size: var(--t-xs);
  color: var(--text-muted);
}

/* ---- Parties ---- */
.parties {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--s-4);
}

/* Resumen merges the party cards and the process facts into one
   `.panel__body` now — this is the deliberate gap between them, not the
   doubled padding two separate panel bodies used to stack. */
.parties + .facts {
  margin-top: var(--s-5);
  padding-top: var(--s-5);
  border-top: 1px solid var(--rule);
}

.party {
  display: flex;
  flex-direction: column;
  gap: var(--s-1);
  min-width: 0;
}

.party__role {
  margin: 0;
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.party__name {
  font-weight: 600;
  font-size: var(--t-sm);
  color: var(--celeste-deep);
  text-decoration: none;
}

a.party__name:hover { text-decoration: underline; }

.party__name--plain {
  color: var(--text);
  font-weight: 500;
}

.party__sub {
  font-size: var(--t-xs);
  color: var(--text-muted);
  overflow-wrap: anywhere;
}

.party__mandate { align-self: flex-start; margin-top: 2px; }

/* ---- Submission conditions ---- */
.subm__part {
  display: block;
}

.subm__part + .subm__part { margin-top: var(--s-1); }

.subm__k {
  margin-right: var(--s-1);
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
}

/* ---- Contact ---- */
.contact {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: var(--s-2);
  padding-top: var(--s-2);
  border-top: 1px dashed var(--rule);
  min-width: 0;
}

.contact__l {
  margin: 0 0 2px;
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.contact__name {
  font-size: var(--t-xs);
  color: var(--text);
}

.contact__link {
  font-size: var(--t-xs);
  color: var(--celeste-deep);
  text-decoration: none;
}

.contact__link:hover { text-decoration: underline; }

/* Absorbing the price comparison took this table to 8 columns, which overran
   the 982px main column and pushed "Total" behind a horizontal scrollbar.
   Tighter cell gutters (8px instead of 16px) buy back ~110px — enough to fit
   without dropping a column or truncating a figure. Scoped to this table so
   every other DataTable on the site keeps the roomier default. */
.itemstable :deep(.dt__th),
.itemstable :deep(.dt__td) { padding-inline: var(--s-2); }

/* …but only BETWEEN columns. The outer edges keep the panel's own inset so
   the table's first and last columns line up with the heading, the help text
   and the footnotes above and below it, instead of running edge to edge. */
.itemstable :deep(.dt__th:first-child),
.itemstable :deep(.dt__td:first-child) { padding-left: var(--s-5); }

.itemstable :deep(.dt__th:last-child),
.itemstable :deep(.dt__td:last-child) { padding-right: var(--s-5); }

/* The verdict column's header is the longest label in the row; letting it
   wrap keeps it from setting the column's minimum width on its own. */
.itemstable :deep(.dt__th) { white-space: normal; }

/* DataTable cells default to `overflow-wrap: anywhere` so a long OCID or URL
   can't push the table sideways. In these short columns that turned "UNIDAD"
   into "UNIDA / D": one word, split mid-letter. Let them size to their widest
   word instead — the values here are one short token, so they cost a few
   pixels and never overflow. */
.itemstable :deep(.dt__td:nth-child(3) .dt__value),
.itemstable :deep(.dt__td:nth-child(4) .dt__value) {
  overflow-wrap: normal;
  word-break: keep-all;
}

.itemstable :deep(.dt__th:nth-child(3)),
.itemstable :deep(.dt__th:nth-child(4)),
.itemstable :deep(.dt__td:nth-child(3)),
.itemstable :deep(.dt__td:nth-child(4)) { min-width: max-content; }

/* Slack goes to the description, not to the short columns.
   `width: 100%` on one cell of an auto-layout table is the standard way to
   say "this column takes whatever is left": every other column then sits at
   its own content width instead of each padding out a share of the surplus,
   which is what left a gap between a 5-digit catalogue code and the quantity
   beside it. The description is the column that can always use more room. */
.itemstable :deep(.dt__th:first-child),
.itemstable :deep(.dt__td:first-child) { width: 100%; }

/* ---- Price comparison (a column of the items table) ----
   Stacked inside one cell: verdict + ratio lead, the distribution behind
   them, the drill-down link last. */
.refcell__verdict {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--s-2);
}

/* The whole chip is the tooltip's trigger, not just the "?" — a 13px target
   is a poor thing to have to hit for the definition of the badge beside it.
   `default` cursor because the chip is a label, not selectable prose: an
   I-beam over it invited a text selection that means nothing here. */
.refcell__pos {
  position: relative;
  display: inline-block;
  vertical-align: middle;
  cursor: default;
  user-select: none;
}

/* The ratio sits right beside the verdict chip so the two can never say
   different things — a calm chip next to a 3.5× figure was the original defect. */
.refcell__ratio {
  font-size: var(--t-xs);
  font-weight: 600;
  color: var(--text-muted);
}

/* "Habitual $ 131 · $ 115 – 177 · 100 comparables" — the numbers the verdict
   is derived from, one quiet line under it. */
.refcell__stats {
  display: block;
  margin-top: 2px;
  /* Floors the comparison column — the widest content in the row: a verdict
     chip, a ratio, then median + range + sample size. Letting the description
     take ALL the table's slack starved it to ~125px and stacked that into
     four cramped lines. A min-width here propagates to the column, so the
     description gets the REST of the surplus, not every last pixel. */
  min-width: 17rem;
  font-size: var(--t-xs);
  line-height: 1.45;
  color: var(--text-muted);
}

/* A priced line whose catalogue code has under 5 comparable purchases. Stated
   rather than left blank, so "no baseline" never reads as "not checked". */
.refcell__none {
  font-size: var(--t-xs);
  color: var(--text-muted);
}

.refcell__link {
  display: inline-block;
  margin-top: var(--s-1);
  font-size: var(--t-xs);
  font-weight: 600;
  color: var(--celeste-deep);
  text-decoration: none;
}

.refcell__link:hover { text-decoration: underline; }

.reftable__note {
  /* .panel__foot owns the outer spacing now. */
  margin: 0;
  font-size: var(--t-xs);
  color: var(--text-muted);
  /* No measure cap: as a footnote under a full-width table, a 70ch column
     reads as a layout error rather than as careful line length. It spans the
     table it annotates. */
}

.reftable__note + .reftable__note { margin-top: var(--s-2); }

/* The verdict definition, per chip: a "?" that reveals on hover AND on
   keyboard focus. A real <button> rather than a `title` attribute so it is
   reachable without a pointer — a native tooltip never opens on tap or Tab. */
.refhelp {
  /* Deliberately NOT a positioning context: the bubble anchors to the chip
     (.refcell__pos) so it centres over the whole badge and the badge's own
     hover can open it. */
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 13px;
  height: 13px;
  padding: 0;
  /* Inherits the chip's own tone so it reads as part of the badge, not as a
     control bolted next to it. */
  border: 1px solid currentColor;
  border-radius: var(--r-full);
  background: transparent;
  font-family: var(--font-body);
  font-size: 9px;
  font-weight: 700;
  line-height: 1;
  color: inherit;
  opacity: 0.65;
  cursor: help;
}

.refcell__pos:hover .refhelp,
.refhelp:focus-visible { opacity: 1; }

.refhelp__bubble {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 50%;
  z-index: 5;
  width: max-content;
  max-width: 260px;
  transform: translateX(-50%);
  padding: var(--s-2) var(--s-3);
  border: 1px solid var(--rule-strong);
  border-radius: var(--r-md);
  background: var(--surface);
  box-shadow: var(--shadow-2);
  font-size: var(--t-xs);
  font-weight: 400;
  line-height: 1.45;
  text-align: left;
  white-space: normal;
  color: var(--text);
  opacity: 0;
  visibility: hidden;
}

/* Hovering ANYWHERE on the chip opens it, not only the 13px "?" — keyboard
   focus on the button still does too, so it stays reachable without a pointer. */
.refcell__pos:hover .refhelp__bubble,
.refhelp:focus-visible .refhelp__bubble {
  opacity: 1;
  visibility: visible;
}

@media (prefers-reduced-motion: no-preference) {
  .refhelp__bubble { transition: opacity var(--dur) var(--ease); }
}

.reftable__note a {
  color: var(--celeste-deep);
  /* Underlined at rest: this link sits inline in a paragraph of muted
     prose, so color alone isn't enough to mark it as a link (Lighthouse
     link-in-text-block). */
  text-decoration: underline;
  text-decoration-color: color-mix(in srgb, currentColor 40%, transparent);
}

.reftable__note a:hover { text-decoration-color: currentColor; }

.reftable__link {
  display: inline-block;
  margin: var(--s-3) 0 0;
  font-size: var(--t-xs);
  font-weight: 600;
  color: var(--celeste-deep);
  text-decoration: none;
}

.reftable__link:hover { text-decoration: underline; }

/* ---- Fact lists ---- */
.facts {
  margin: 0;
  display: grid;
  gap: var(--s-3);
}

.facts__row {
  display: grid;
  grid-template-columns: minmax(0, 11ch) minmax(0, 1fr);
  align-items: baseline;
  gap: var(--s-3);
}

/* Two field-groups per row, label stacked above value inside each — the
   Resumen section's 8 short facts read as a long single column otherwise,
   wasting the panel's full width. */
.facts--cols {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  column-gap: var(--s-5);
}

.facts--cols .facts__row {
  grid-template-columns: minmax(0, 1fr);
  align-items: start;
  gap: 2px;
}

.facts--cols .facts__row--full { grid-column: 1 / -1; }

@media (max-width: 560px) {
  .facts--cols { grid-template-columns: minmax(0, 1fr); }
}

.facts dt {
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-muted);
}

/* "Unidad ejecutora" vs "unidad compradora" is a real distinction in the
   Uruguayan hierarchy (buyer.id is <inciso>-<unidad ejecutora>) and nothing
   on the page said which was which. */
.facts__help {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 13px;
  height: 13px;
  margin-left: 4px;
  border: 1px solid currentColor;
  border-radius: var(--r-full);
  font-family: var(--font-body);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: normal;
  line-height: 1;
  opacity: 0.7;
  cursor: help;
}

.facts__help:hover { opacity: 1; }

.facts dd {
  margin: 0;
  min-width: 0;
  font-size: var(--t-sm);
  overflow-wrap: anywhere;
}

.facts__link {
  /* `.u-truncate` sets overflow:hidden, which does nothing on an inline
     box — the raw source URL just ran past the viewport. A block box
     inside the min-width:0 track truncates as intended. */
  display: block;
  min-width: 0;
  max-width: 100%;
  color: var(--celeste-deep);
  font-size: var(--t-xs);
}

/* The award's own identity, sitting above the lines it paid for. */
.facts--award {
  grid-auto-flow: column;
  grid-auto-columns: max-content;
  justify-content: start;
  gap: var(--s-5);
  /* s-5 inline so the award bar lines up with the panel head and the
     unframed items table below it. */
  padding: var(--s-3) var(--s-5);
  border-bottom: 1px solid var(--rule);
}

.facts--award .facts__row {
  grid-template-columns: none;
  gap: 2px;
}

.agroup + .agroup { border-top: 1px solid var(--rule-strong); }

.agroup__empty {
  margin: 0;
  padding: var(--s-4) var(--s-5);
  font-size: var(--t-sm);
}

/* ---- Amendments ---- */
.amds {
  margin: 0;
  padding: 0;
  list-style: none;
}

.amds__row {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: var(--s-4);
  padding: var(--s-3) var(--s-5);
}

.amds__row + .amds__row { border-top: 1px solid var(--rule); }

.amds__date {
  font-size: var(--t-xs);
  color: var(--text-muted);
  white-space: nowrap;
}

.amds__body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.amds__desc {
  font-size: var(--t-sm);
  overflow-wrap: anywhere;
}

.amds__ref {
  font-size: var(--t-xs);
  color: var(--text-muted);
  overflow-wrap: anywhere;
}

/* ---- Items table ----
   Only `.itable__code` and `.itable__u` are still used, inside DataTable's
   cell slots — the rest of this block styled a hand-rolled <table> that
   DataTable replaced. */
.itable__code {
  display: block;
  font-size: var(--t-sm);
  color: var(--celeste-deep);
  text-decoration: none;
}

a.itable__code:hover { text-decoration: underline; }

.itable__u {
  display: block;
  margin-top: 2px;
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  color: var(--text-muted);
}

/* Scraped características under an item's description: quiet label,
   emphatic value — the value ("SOMBRILLA DE CALOR") is the fact. */
.ifeat {
  display: block;
  margin-top: var(--s-1);
  font-size: var(--t-xs);
  font-weight: 400;
  color: var(--text-muted);
}

.ifeat__v {
  font-weight: 600;
  color: var(--text);
}

/* ---- Rank ---- */
.rank {
  margin: 0;
  padding: 0;
  list-style: none;
  border: 1px solid var(--rule);
  border-radius: var(--r-lg);
  background: var(--surface);
  overflow: hidden;
}

.rank__row + .rank__row { border-top: 1px solid var(--rule); }

.rank__link {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: var(--s-4);
  padding: var(--s-3) var(--s-4);
  text-decoration: none;
  color: inherit;
}

.rank__link:hover { background: var(--surface-sunken); }

/* Two lines in the first column. `min-width: 0` is what lets the
   truncation inside it work — the `minmax(0, 1fr)` on the column only
   protects a direct child. */
.rank__main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.rank__name {
  font-size: var(--t-sm);
  font-weight: 600;
}

.rank__sub {
  font-size: var(--t-xs);
  color: var(--text-muted);
}

.rank__meta {
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  color: var(--text-muted);
  white-space: nowrap;
}

/* ---- Timeline ---- */
.tl {
  margin: 0;
  padding: var(--s-4) var(--s-5);
  list-style: none;
}

.tl__step {
  position: relative;
  display: flex;
  gap: var(--s-3);
  padding-bottom: var(--s-4);
}

.tl__step:last-child { padding-bottom: 0; }

.tl__step::before {
  content: "";
  position: absolute;
  left: 4px;
  top: 12px;
  bottom: 0;
  width: 1px;
  background: var(--rule);
}

.tl__step:last-child::before { display: none; }

.tl__dot {
  position: relative;
  z-index: 1;
  flex: none;
  width: 9px;
  height: 9px;
  margin-top: 5px;
  border-radius: 50%;
  background: var(--celeste);
}

.tl__body {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.tl__label {
  font-size: var(--t-sm);
  font-weight: 500;
}

.tl__date {
  font-size: var(--t-xs);
  color: var(--text-muted);
}

/* ---- Docs ---- */
.docs {
  margin: 0;
  padding: 0;
  list-style: none;
}

.docs li + li { border-top: 1px solid var(--rule); }

.docs__link {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  padding: var(--s-3) var(--s-5);
  font-size: var(--t-sm);
  color: var(--celeste-deep);
  text-decoration: none;
}

.docs__link:hover { background: var(--surface-sunken); }

.docs__more {
  display: block;
  width: 100%;
  padding: var(--s-3) var(--s-5);
  border: 0;
  border-top: 1px solid var(--rule);
  background: none;
  text-align: left;
  font-size: var(--t-xs);
  font-weight: 600;
  color: var(--celeste-deep);
  cursor: pointer;
}

.docs__more:hover { background: var(--surface-sunken); }

/* ---- Raw ---- */
.rawnote {
  margin: 0 0 var(--s-3);
  font-size: var(--t-xs);
}

/* "Ver" — the raw document, inline beside its own URL. It used to be a
   full-width button owning a whole panel; that panel is gone, its one action
   folded into the source-document row. */
.rawbtn {
  flex: none;
  padding: 2px var(--s-3);
  border: 1px solid var(--rule-strong);
  border-radius: var(--r-md);
  background: transparent;
  color: var(--text);
  font-family: var(--font-body);
  font-size: var(--t-xs);
  font-weight: 600;
  cursor: pointer;
}

/* The action and the address on one line, the URL truncating rather than
   pushing the button out of the row. */
.srcdoc {
  display: flex;
  align-items: center;
  gap: var(--s-3);
  min-width: 0;
}

.rawbtn:hover { background: var(--surface-sunken); }

.rawdlg {
  display: flex;
  flex-direction: column;
  max-height: 84dvh;
  background: var(--surface);
  border-radius: var(--r-lg);
}

.rawdlg__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--s-4) var(--s-5);
  border-bottom: 1px solid var(--rule);
}

.rawdlg__head h2 {
  font-size: var(--t-md);
  font-family: var(--font-mono);
}

.rawdlg__x {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border: 0;
  background: transparent;
  color: var(--text);
  cursor: pointer;
}

.rawdlg__pre {
  margin: 0;
  padding: var(--s-5);
  overflow: auto;
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  line-height: 1.6;
  color: var(--text);
}

/* ---- State ---- */
/* ---- Responsive ---- */
@media (max-width: 960px) {
  .grid { grid-template-columns: 1fr; }
}

@media (max-width: 760px) {
  /* The award meta reads as a row of pairs on desktop; stacked, it would
     fight the item cards below it, so it wraps instead. */
  .facts--award {
    grid-auto-flow: row;
    grid-auto-columns: auto;
    gap: var(--s-3);
  }
}

@media (max-width: 700px) {
  .head { grid-template-columns: 1fr; }
  .head__title { max-width: none; }
  .head__money { min-width: 0; }
  .head__nomoney { max-width: none; }
  .head2 { grid-template-columns: 1fr; }

  .amds__row {
    grid-template-columns: 1fr;
    row-gap: var(--s-1);
  }

  .rank__link {
    grid-template-columns: minmax(0, 1fr) auto;
    row-gap: var(--s-1);
  }

  .rank__meta { grid-column: 1; grid-row: 2; }
  .rank__link :deep(.money) { grid-column: 2; grid-row: 1 / span 2; }
}

/* ===== AI review panel =====
   The rail colour lives on the verdict modifier, never on the base rule: an
   unconditional red border painted the same alarm on a contract the AI
   cleared ("Posible explicación") as on one it couldn't explain — the
   evidence contract's "a pattern, not a verdict" promise, undone by CSS. */
.airev { border-left: 3px solid var(--rule-strong); }
.airev--no { border-left-color: var(--alerta); }
.airev--yes { border-left-color: var(--verde); }
.airev--uncertain { border-left-color: var(--rule-strong); }

.airev .panel__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-3);
}

.airev__verdict {
  flex: none;
  font-size: var(--t-sm);
  font-weight: 600;
  padding: 2px var(--s-3);
  border-radius: var(--r-full);
  border: 1px solid var(--rule);
  color: var(--text-muted);
}

.airev__verdict--no {
  color: var(--alerta);
  border-color: color-mix(in srgb, var(--alerta) 45%, transparent);
  background: color-mix(in srgb, var(--alerta) 12%, transparent);
}

.airev__verdict--yes {
  color: var(--verde);
  border-color: color-mix(in srgb, var(--verde) 45%, transparent);
  background: color-mix(in srgb, var(--verde) 12%, transparent);
}

.airev__verdict--uncertain {
  color: var(--text-muted);
  border-color: var(--rule-strong);
  background: var(--surface-sunken);
}

.airev__body {
  display: flex;
  flex-direction: column;
  gap: var(--s-3);
}

.airev__tags { display: flex; flex-wrap: wrap; gap: var(--s-2); }

.airev__tag {
  font-size: var(--t-xs);
  color: var(--text-muted);
  padding: 1px var(--s-2);
  border-radius: var(--r-full);
  background: var(--surface-sunken);
}

.airev__analysis {
  margin: 0;
  line-height: 1.65;
  font-size: var(--t-md);
  color: var(--text);
}

.airev__figs {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-2) var(--s-5);
  font-size: var(--t-sm);
  color: var(--text-muted);
}

.airev__h {
  margin: 0 0 var(--s-1);
  font-size: var(--t-xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
}

.airev__ev ul, .airev__docs ul {
  margin: 0;
  padding-left: var(--s-4);
  display: flex;
  flex-direction: column;
  gap: var(--s-1);
  line-height: 1.55;
  font-size: var(--t-sm);
}

.airev__docs a {
  /* Same link colour as the rest of the page — evidence links are not
     themselves an accusation, regardless of which panel they sit in. */
  color: var(--celeste-deep);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.airev__fmt { margin-left: var(--s-2); font-size: var(--t-xs); color: var(--text-muted); }

.airev__note {
  margin: 0;
  font-size: var(--t-xs);
  font-style: italic;
  color: var(--text-muted);
}

/* ===== Items filter toolbar ===== */
.ifilter {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--s-3);
  padding: var(--s-3) var(--s-5);
  border-bottom: 1px solid var(--rule);
}

.ifilter__box {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  flex: 1 1 240px;
  min-width: 0;
  padding: var(--s-2) var(--s-3);
  border: 1px solid var(--rule-strong);
  border-radius: var(--r-md);
  background: var(--surface-sunken);
}

.ifilter__box:focus-within { border-color: var(--celeste-deep); }
.ifilter__icon { flex: none; color: var(--text-muted); }

.ifilter__input {
  flex: 1 1 auto;
  min-width: 0;
  border: 0;
  background: none;
  color: var(--text);
  font-family: var(--font-body);
  font-size: var(--t-sm);
  /* No local `outline: none`: this only renders past 6 rows or with an
     active flag, so it never showed up in a quick check on a short
     contract — but killing the outline here silently opted this ONE
     input out of the sitewide focus-visible ring every other control gets
     (main.scss:430), leaving only a 1px border-colour shift on the wrapper
     as the sole focus signal. Let the global rule apply. */
}

.ifilter__toggle {
  display: inline-flex;
  align-items: center;
  gap: var(--s-1);
  flex: none;
  padding: var(--s-2) var(--s-3);
  border: 1px solid var(--rule-strong);
  border-radius: var(--r-md);
  background: var(--surface);
  color: var(--text-muted);
  font-family: var(--font-body);
  font-size: var(--t-sm);
  font-weight: 600;
  cursor: pointer;
}

.ifilter__toggle:hover { color: var(--text); }

.ifilter__toggle--on {
  color: var(--alerta);
  border-color: color-mix(in srgb, var(--alerta) 45%, transparent);
  background: color-mix(in srgb, var(--alerta) 10%, transparent);
}

.ifilter__count {
  margin-left: auto;
  flex: none;
  font-size: var(--t-xs);
  color: var(--text-muted);
}

.ifilter__empty {
  padding: var(--s-5);
  text-align: center;
  font-size: var(--t-sm);
}

@media (max-width: 560px) {
  .ifilter__count { margin-left: 0; }
}

/* ===== Per-line price flag =====
   The inline "alerta respectiva": a line whose unit price the detector
   flagged, linking up to the full analysis panel. */
.ialert {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  margin-left: var(--s-2);
  padding: 1px var(--s-2) 1px 5px;
  border-radius: var(--r-full);
  vertical-align: middle;
  font-family: var(--font-body);
  font-size: var(--t-xs);
  font-weight: 600;
  white-space: nowrap;
  text-decoration: none;
  color: var(--alerta);
  background: color-mix(in srgb, var(--alerta) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--alerta) 40%, transparent);
}

.ialert:hover { background: color-mix(in srgb, var(--alerta) 22%, transparent); }

/* Medium/low flags read as caution, not alarm. */
.ialert--medium,
.ialert--low {
  color: var(--text-muted);
  background: var(--surface-sunken);
  border-color: var(--rule-strong);
}
</style>
