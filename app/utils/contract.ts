/**
 * Reading an OCDS release.
 *
 * The source shape is deep and inconsistent — money hangs off
 * `awards[].items[].unit.value`, the tender may have no title, and
 * `date` arrives as a string. Every page needs the same handful of
 * facts, so the extraction lives here once instead of being
 * re-improvised per page.
 */

export interface ContractLike {
  id?: string
  ocid?: string
  date?: string | Date
  sourceYear?: number
  sourceUrl?: string | null
  tender?: {
    title?: string
    description?: string
    status?: string
    procurementMethod?: string
    procurementMethodDetails?: string
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
      classification?: { description?: string }
      unit?: { name?: string, value?: { amount?: number, currency?: string } }
    }[]
  }[]
  amount?: {
    primaryAmount?: number
    primaryCurrency?: string
    currencies?: string[]
    hasAmounts?: boolean
    totalItems?: number
  }
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

/**
 * What was bought. Falls back through the layers the source actually
 * populates before giving up — a blank cell tells the reader nothing.
 */
export function contractTitle(c?: ContractLike | null): string {
  const t = c?.tender?.title?.trim()
  if (t) return t

  const awardTitle = c?.awards?.[0]?.title?.trim()
  // Award titles are often just the internal order number (e.g.
  // "R/211203010017"), which is noise as a heading.
  if (awardTitle && !/^[A-Z]?\/?\d[\d/-]*$/.test(awardTitle)) return awardTitle

  const item = c?.awards?.[0]?.items?.[0]
  const desc = item?.description?.trim() || item?.classification?.description?.trim()
  if (desc) return desc

  const tenderDesc = c?.tender?.description?.trim()
  if (tenderDesc) return tenderDesc

  return ''
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

/** es-UY short date. */
export function formatDate(d?: Date | string | null): string {
  if (!d) return '—'
  const date = d instanceof Date ? d : new Date(d)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('es-UY', { day: '2-digit', month: 'short', year: 'numeric' }).format(date)
}

export function formatDateLong(d?: Date | string | null): string {
  if (!d) return '—'
  const date = d instanceof Date ? d : new Date(d)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('es-UY', { day: 'numeric', month: 'long', year: 'numeric' }).format(date)
}

/**
 * The official record for a release on the government's own site.
 * Mirrors `server/utils/query.ts#sourceUrl` for the cases where the API
 * response predates that field.
 */
export function govSourceUrl(id?: string | null): string | null {
  if (!id) return null
  return `https://www.comprasestatales.gub.uy/ocds/release/${encodeURIComponent(id)}`
}
