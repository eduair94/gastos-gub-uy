/**
 * Reading an OCDS release.
 *
 * The source shape is deep and inconsistent — money hangs off
 * `awards[].items[].unit.value`, the tender may have no title, and
 * `date` arrives as a string. Every page needs the same handful of
 * facts, so the extraction lives here once instead of being
 * re-improvised per page.
 */

/**
 * The lifecycle stages a release can carry in `tag`.
 *
 * One OCID spans several releases: a llamado is published, clarified and
 * amended, then adjudicated, then possibly cancelled. Only `award` and
 * `awardUpdate` carry money — a `tenderUpdate` legitimately has no
 * supplier, no items and no amount. Showing those rows unlabelled next
 * to awards is what makes the data look broken, so the stage is a
 * first-class thing the UI must always name.
 */
export const RELEASE_TAGS = [
  'award',
  'awardUpdate',
  'awardCancellation',
  'tender',
  'tenderUpdate',
  'tenderAmendment',
  'tenderCancellation',
] as const

export type ReleaseTag = typeof RELEASE_TAGS[number]

export interface ContractLike {
  id?: string
  ocid?: string
  date?: string | Date
  sourceYear?: number
  sourceUrl?: string | null
  tag?: string[]
  initiationType?: string
  rssLink?: string
  sourceFileName?: string
  parties?: { id?: string, name?: string, roles?: string[] }[]
  supplier?: { id?: string, name?: string, identifier?: { id?: string, legalName?: string }, roles?: string[] }
  tender?: {
    id?: string
    title?: string
    description?: string
    status?: string
    procurementMethod?: string
    procurementMethodDetails?: string
    hasEnquiries?: boolean
    submissionMethod?: string[]
    submissionMethodDetails?: string
    procuringEntity?: { id?: string, name?: string }
    tenderPeriod?: { startDate?: string, endDate?: string }
    enquiryPeriod?: { startDate?: string, endDate?: string }
    amendments?: { id?: string, date?: string, description?: string, amendsReleaseID?: string }[]
    documents?: unknown[]
    items?: unknown[]
  }
  buyer?: { id?: string, name?: string }
  awards?: {
    id?: string
    title?: string
    date?: string
    status?: string
    suppliers?: { id?: string, name?: string }[]
    items?: {
      description?: string
      quantity?: number
      classification?: { id?: string, description?: string }
      unit?: { name?: string, value?: { amount?: number, currency?: string } }
    }[]
  }[]
  amount?: {
    primaryAmount?: number
    primaryCurrency?: string
    currencies?: string[]
    totalAmounts?: Record<string, number>
    hasAmounts?: boolean
    hasConvertedAmounts?: boolean
    originalUYUAmount?: number
    exchangeRateDate?: string
    totalItems?: number
    version?: number
  }
}

/** Every stage tag on the release, filtered to ones we have a label for. */
export function contractTags(c?: ContractLike | null): ReleaseTag[] {
  const raw = Array.isArray(c?.tag) ? c!.tag : []
  return raw.filter((t): t is ReleaseTag => (RELEASE_TAGS as readonly string[]).includes(t))
}

/** The stage to lead with when a release carries more than one tag. */
export function primaryTag(c?: ContractLike | null): ReleaseTag | null {
  const tags = contractTags(c)
  for (const t of RELEASE_TAGS) if (tags.includes(t)) return t
  return null
}

/** Only these stages ever carry money. */
export function isMoneyStage(c?: ContractLike | null): boolean {
  const t = primaryTag(c)
  return t === 'award' || t === 'awardUpdate'
}

const TAG_TONE: Record<ReleaseTag, string> = {
  award: 'tag--activo',
  awardUpdate: 'tag--celeste',
  awardCancellation: 'tag--alerta',
  tender: 'tag--celeste',
  tenderUpdate: 'tag--neutral',
  tenderAmendment: 'tag--neutral',
  tenderCancellation: 'tag--alerta',
}

export function tagTone(tag?: string | null): string {
  return TAG_TONE[tag as ReleaseTag] ?? 'tag--neutral'
}

/** The peso figure to display. Pre-normalised upstream to UYU. */
export function contractAmount(c?: ContractLike | null): number | null {
  const a = c?.amount?.primaryAmount
  return typeof a === 'number' && Number.isFinite(a) ? a : null
}

export function contractCurrency(c?: ContractLike | null): string {
  return c?.amount?.primaryCurrency || 'UYU'
}

/** True when the source reported more than one currency for this release. */
export function isMixedCurrency(c?: ContractLike | null): boolean {
  return (c?.amount?.currencies?.length ?? 0) > 1
}

/** Distinct item descriptions a title may name before it stops listing. */
const TITLE_MAX_PARTS = 2
/** Hard ceiling in characters, for a single very long description. */
const TITLE_MAX_CHARS = 140

/**
 * Joins item descriptions into a title without letting a many-line
 * contract produce a paragraph. Truncation is marked with an ellipsis so
 * the reader knows there is more, and the exact item count is rendered
 * next to it.
 */
function joinCapped(parts: string[]): string {
  const shown = parts.slice(0, TITLE_MAX_PARTS).join(' · ')
  const clipped = parts.length > TITLE_MAX_PARTS
  const base = shown.length > TITLE_MAX_CHARS
    ? `${shown.slice(0, TITLE_MAX_CHARS).replace(/[\s·]+$/, '')}…`
    : shown
  return clipped && !base.endsWith('…') ? `${base}…` : base
}

/**
 * What was bought. Falls back through the layers the source actually
 * populates before giving up — a blank cell tells the reader nothing.
 *
 * Returns '' when the release genuinely has no subject of its own (a
 * clarification, an amendment). Callers should then use
 * `contractTitleFallback` to name the stage instead of printing a bare
 * "Contrato", which is what made those rows look like missing data.
 */
export function contractTitle(c?: ContractLike | null): string {
  const t = c?.tender?.title?.trim()
  if (t) return t

  const awardTitle = c?.awards?.[0]?.title?.trim()
  // Award titles are often just the internal order number (e.g.
  // "R/211203010017"), which is noise as a heading.
  if (awardTitle && !/^[A-Z]?\/?\d[\d/-]*$/.test(awardTitle)) return awardTitle

  // Name what was bought, but a title is a label — not a manifest.
  // `adjudicacion-1356714` has 19 items / 17 distinct descriptions, and
  // joining them all produced a 590-character "title" that broke the
  // table and the detail header. Cap it: the exact count sits in the
  // badge beside it and every line is on the detail page.
  const descs = (c?.awards ?? [])
    .flatMap(a => a.items ?? [])
    .map(i => i.description?.trim() || i.classification?.description?.trim())
    .filter((d): d is string => !!d)
  const unique = [...new Set(descs)]
  if (unique.length) return joinCapped(unique)

  // A tender description can run to a full paragraph — cap it too.
  const tenderDesc = c?.tender?.description?.trim()
  if (tenderDesc) return joinCapped([tenderDesc])

  const tenderItems = (c?.tender?.items ?? []) as { description?: string, classification?: { description?: string } }[]
  const tItems = [...new Set(tenderItems
    .map(i => i.description?.trim() || i.classification?.description?.trim())
    .filter((d): d is string => !!d))]
  if (tItems.length) return joinCapped(tItems)

  return ''
}

/**
 * How to name a release that has no subject line of its own.
 * Returns an i18n key plus params for the caller to translate — utils
 * has no access to `t`, and a hardcoded Spanish string here would break
 * the English locale.
 */
export function contractTitleFallback(c?: ContractLike | null): { key: string, params: Record<string, string> } {
  const tag = primaryTag(c)
  const ref = c?.tender?.id || c?.ocid?.replace(/^ocds-\w+-/, '') || ''
  return {
    key: tag ? `contract.stageTitle.${tag}` : 'common.contract',
    params: { ref },
  }
}

export function contractSuppliers(c?: ContractLike | null): { id?: string, name: string }[] {
  const out = new Map<string, { id?: string, name: string }>()
  for (const a of c?.awards ?? []) {
    for (const s of a.suppliers ?? []) {
      if (s?.name) out.set(s.name, { id: s.id, name: s.name })
    }
  }
  return [...out.values()]
}

export function contractDate(c?: ContractLike | null): Date | null {
  const raw = c?.date ?? c?.awards?.[0]?.date
  if (!raw) return null
  const d = raw instanceof Date ? raw : new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d
}

export function contractYear(c?: ContractLike | null): number | null {
  if (typeof c?.sourceYear === 'number') return c.sourceYear
  return contractDate(c)?.getFullYear() ?? null
}

/** Every award item across every award, flattened for the detail table. */
export function contractItems(c?: ContractLike | null) {
  return (c?.awards ?? []).flatMap(a =>
    (a.items ?? []).map(i => ({
      description: i.description?.trim() || i.classification?.description?.trim() || '',
      // The catalogue code (classification.id) — the key the product page and
      // the price baseline both join on. Carried so the search results dialog
      // can link each line to its product profile.
      code: i.classification?.id?.trim() || '',
      codeDescription: i.classification?.description?.trim() || '',
      quantity: i.quantity ?? null,
      unitName: i.unit?.name?.trim() || '',
      unitAmount: i.unit?.value?.amount ?? null,
      currency: i.unit?.value?.currency || 'UYU',
      total: (i.unit?.value?.amount ?? 0) * (i.quantity ?? 1),
      awardId: a.id,
      supplier: a.suppliers?.[0]?.name ?? '',
    })),
  )
}

const STATUS_TAG: Record<string, string> = {
  active: 'tag--activo',
  cancelled: 'tag--alerta',
  complete: 'tag--celeste',
  unsuccessful: 'tag--neutral',
}

export function statusTagClass(status?: string | null): string {
  return STATUS_TAG[status ?? ''] ?? 'tag--neutral'
}

/**
 * es-UY short date, read in UTC.
 *
 * These timestamps are Uruguayan wall-clock stamped with a `Z`: an award
 * dated 1 July is stored `2026-07-01T00:00:00.000Z`. Formatting that in
 * the reader's zone (UTC-3 in Uruguay) rolls it back to 30 June — every
 * midnight date on the site was showing the day before, and
 * contradicting the government's own page. Reading in UTC returns the
 * date the source actually recorded.
 */
export function formatDate(d?: Date | string | null): string {
  if (!d) return '—'
  const date = d instanceof Date ? d : new Date(d)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('es-UY', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date)
}

export function formatDateLong(d?: Date | string | null): string {
  if (!d) return '—'
  const date = d instanceof Date ? d : new Date(d)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('es-UY', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date)
}

/**
 * True when a timestamp carries a real time-of-day rather than midnight.
 *
 * Read in UTC on purpose — see `formatDateTime`.
 */
export function hasTimeOfDay(d?: Date | string | null): boolean {
  if (!d) return false
  const date = d instanceof Date ? d : new Date(d)
  if (Number.isNaN(date.getTime())) return false
  return date.getUTCHours() !== 0 || date.getUTCMinutes() !== 0
}

/**
 * Date + time, rendered in UTC.
 *
 * The source stamps local Uruguayan wall-clock times with a `Z` suffix:
 * a tender closing at 15:00 in Montevideo is stored as
 * `2026-09-30T15:00:00.000Z`. Converting that to America/Montevideo
 * would render 12:00 and contradict the government's own page, which
 * says 15:00. Echoing the source's wall clock is the honest read — a
 * deadline is only useful if it matches the official one.
 */
export function formatDateTime(d?: Date | string | null): string {
  if (!d) return '—'
  const date = d instanceof Date ? d : new Date(d)
  if (Number.isNaN(date.getTime())) return '—'
  if (!hasTimeOfDay(date)) return formatDate(date)
  return new Intl.DateTimeFormat('es-UY', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC',
  }).format(date)
}

/**
 * The public government page for a purchase — the page a reader opens to
 * check us. Mirrors `server/utils/query.ts#sourceUrl`; keep the two in
 * step.
 *
 * Takes the **ocid**, not the release `id`. The ocid suffix is the
 * government's `id_compra`; `id` differs on adjustment and cancellation
 * records and resolves to an unrelated contract there.
 */
export function govSourceUrl(ocid?: string | null): string | null {
  if (!ocid) return null
  const m = /^ocds-[a-z0-9]+-(.+)$/i.exec(ocid.trim())
  const compraId = (m?.[1] ?? '').trim()
  if (!compraId) return null
  return `https://www.comprasestatales.gub.uy/consultas/detalle/mostrar-llamado/1/id/${encodeURIComponent(compraId)}`
}

/**
 * The government's **award-detail** page, distinct from the call page
 * `govSourceUrl` returns. Mirrors `server/utils/query.ts#awardUrl`.
 *   govSourceUrl -> /consultas/detalle/mostrar-llamado/1/id/{id}
 *   govAwardUrl  -> /consultas/detalle/id/{id}
 */
export function govAwardUrl(ocid?: string | null): string | null {
  if (!ocid) return null
  const m = /^ocds-[a-z0-9]+-(.+)$/i.exec(ocid.trim())
  const compraId = (m?.[1] ?? '').trim()
  if (!compraId) return null
  return `https://www.comprasestatales.gub.uy/consultas/detalle/id/${encodeURIComponent(compraId)}`
}

/** The raw OCDS JSON for one release. Keyed on `id`, unlike the page above. */
export function ocdsJsonUrl(id?: string | null): string | null {
  if (!id) return null
  return `https://www.comprasestatales.gub.uy/ocds/release/${encodeURIComponent(id)}`
}
