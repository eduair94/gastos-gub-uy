/**
 * Shared read/serialize layer for the public provider contact directory
 * (`supplier_contacts`). Every read path — the paginated list, the export, and
 * the rubro facet — goes through the SAME filter builder and the SAME
 * `sanitizeContact`, so contact visibility and suppressed-email handling
 * can only ever live in one place and cannot be bypassed by one endpoint.
 */
import type { ISupplierContact } from './models'
import { DeiCompanyModel, SupplierPatternModel } from './models'
import { escapeRegex, sanitizeSearch } from './query'
import { fetchNamesByCategory, CATEGORIES } from './enrichment'

/** The enrichment METHOD(s) that produced a record — shown as badges (never exported). */
export type ContactMethod = 'crawl4ai' | 'googleMaps' | 'dei' | 'rupe' | 'impo'

/**
 * Which methods touched this record. Explicit attempted-method history is merged
 * with legacy per-field provenance so old and new rows both get correct chips.
 */
export function contactMethods(
  doc: Partial<Pick<ISupplierContact,
  'emails' | 'websiteSource' | 'phoneSource' | 'phones' | 'placeSource'
  | 'placeId' | 'mapsUrl' | 'enrichmentMethods'
  | 'websitePhone' | 'websiteAddress' | 'contactFormUrl' | 'socialLinks'>>,
): ContactMethod[] {
  const found = new Set<ContactMethod>(doc.enrichmentMethods ?? [])
  const emailSources = (doc.emails ?? []).map(e => e.source)
  const fieldSources = [
    doc.websiteSource, doc.phoneSource, doc.placeSource,
    ...(doc.phones ?? []).map(phone => phone.source),
    ...(doc.socialLinks ?? []).map(link => link.source),
  ]
  const has = (s: string) => emailSources.includes(s as never) || fieldSources.includes(s as never)
  if (has('webSearch') || has('website')) found.add('crawl4ai')
  if (doc.websitePhone || doc.websiteAddress || doc.contactFormUrl || doc.socialLinks?.length) found.add('crawl4ai')
  // placeId/mapsUrl backfill the badge for legacy rows where Maps evidence was
  // later superseded by a higher-ranked DEI/RUPE field.
  if (has('googleMaps') || doc.placeId || doc.mapsUrl) found.add('googleMaps')
  if (has('dei')) found.add('dei')
  if (has('rupe')) found.add('rupe')
  if (has('impo')) found.add('impo')
  // Stable, official-first order.
  return (['dei', 'rupe', 'crawl4ai', 'googleMaps', 'impo'] as ContactMethod[]).filter(m => found.has(m))
}

/** Shared ceiling for the list/export DB reads so a pathological query can't pin a mongod thread. */
export const CONTACTS_MAX_TIME_MS = 15_000

/** Hard ceiling on a single export — never silently exceeded (see export handler). */
export const EXPORT_CAP = 50_000

/** Size-token → the regex that matches the DEI `tamano` free text. Mirrors /api/suppliers. */
const TAMANO_RX: Record<string, RegExp> = {
  micro: /micro/i,
  pequena: /pequeñ/i,
  mediana: /median/i,
  gran: /gran/i,
}
const RUPE_ESTADOS = new Set(['ACTIVO', 'BAJA DGI', 'BAJA VOLUNTARIA', 'EN INGRESO'])

/**
 * The DEI `rut` is digits only; a `supplierId` carries an `R` and maybe a slash
 * in one of two known shapes. Reconstruct both (plus the bare rut) so a `$in`
 * on the indexed `supplierId` matches whatever shape the snapshot used.
 */
function candidateIds(ruts: string[]): string[] {
  const out: string[] = []
  for (const r of ruts) out.push(`R/${r}`, `R${r}`, r)
  return out
}

export type ContactQuery = Record<string, unknown>

/** A DEI filter that resolves to zero RUTs means "no rows can match" — signalled explicitly. */
export type FilterResult = { filter: Record<string, unknown> } | { empty: true }

export interface ContactFilterResolvers {
  resolveDeiSupplierIds?: (query: Record<string, unknown>) => Promise<string[]>
  resolveOnlyDirectSupplierIds?: () => Promise<string[]>
}

/**
 * The one Mongo filter for the contact directory. Async because DEI and
 * supplier-pattern filters resolve supplier ids before narrowing contacts.
 */
export async function buildContactFilter(
  query: ContactQuery,
  resolvers: ContactFilterResolvers = {},
): Promise<FilterResult> {
  const filter: Record<string, unknown> = {}
  const supplierIdSets: string[][] = []

  // AND-composed conditions: the origin dimension + search/categoria (both
  // constrain `name`). Collected into one array so none of them can clobber
  // another via a shared top-level key.
  const andConditions: Record<string, unknown>[] = []

  // Origin dimension — which population of the directory to include:
  //  - todas (default): contactable (valid email) OR registered-never-awarded
  //  - con-email: contactable only (the pre-existing default behaviour)
  //  - sin-adjudicaciones: registered-never-awarded only
  // `verified=0` widens "contactable" to any non-suppressed/invalid email,
  // exactly as before — it composes with any of the three origen values.
  const hasUsableEmail = String(query.verified ?? '1') === '0'
    ? { emails: { $elemMatch: { status: { $nin: ['suppressed', 'invalid'] } } } }
    : { emails: { $elemMatch: { mxValid: true, status: 'valid' } } }
  const origen = String(query.origen ?? 'todas')
  if (origen === 'con-email') andConditions.push(hasUsableEmail)
  else if (origen === 'sin-adjudicaciones') andConditions.push({ neverAwarded: true })
  else andConditions.push({ $or: [
    hasUsableEmail,
    { neverAwarded: true },
    { website: { $nin: [null, ''] } },
    { phone: { $nin: [null, ''] } },
    { phones: { $elemMatch: { phone: { $nin: [null, ''] } } } },
    { mapsUrl: { $nin: [null, ''] } },
    { contactFormUrl: { $nin: [null, ''] } },
    { 'socialLinks.0': { $exists: true } },
  ] })

  // `search` and `categoria` both constrain `name`; each becomes its own $and
  // entry so one can't clobber the other (mirrors /api/suppliers).
  // User input → escaped literal + length cap before it reaches the regex engine
  // (ReDoS guard; the repo-wide rule, see app/server/context.md).
  const search = sanitizeSearch(query.search)
  if (search) andConditions.push({ name: { $regex: escapeRegex(search), $options: 'i' } })

  const rupeEstado = String(query.rupeEstado ?? '').toUpperCase()
  if (RUPE_ESTADOS.has(rupeEstado)) andConditions.push({ rupeEstado })

  // Company TYPE (AI-classified enrichment category) → resolve matching names,
  // gated the same way the chip is (confidence >= 0.5). No names → no rows.
  const categoria = query.categoria ? String(query.categoria) : ''
  if (categoria && CATEGORIES.has(categoria)) {
    const names = await fetchNamesByCategory(categoria)
    if (!names.length) return { empty: true }
    andConditions.push({ name: { $in: names } })
  }

  // "has phone" includes every displayable observed number, not only the
  // backwards-compatible primary field.
  if (String(query.hasPhone ?? '') === '1') {
    andConditions.push({ $or: [
      { phone: { $nin: [null, ''] } },
      { phones: { $elemMatch: { phone: { $nin: [null, ''] } } } },
    ] })
  }

  if (andConditions.length === 1) Object.assign(filter, andConditions[0])
  else filter.$and = andConditions

  if (query.rubro) filter['rubros.classificationId'] = String(query.rubro)

  if (String(query.hasWebsite ?? '') === '1') {
    filter.website = { $nin: [null, ''] }
  }

  const tamano = query.tamano ? String(query.tamano) : ''
  const departamento = query.departamento ? String(query.departamento) : ''
  const deiOnly = query.dei === '1' || query.dei === 'true'
  const deiFilterActive = deiOnly || !!tamano || !!departamento
  if (deiFilterActive) {
    const deiQuery: Record<string, unknown> = {}
    const rx = tamano ? TAMANO_RX[tamano] : undefined
    if (rx) deiQuery.tamano = { $regex: rx }
    if (departamento) deiQuery.departamento = { $regex: `^${departamento}$`, $options: 'i' }

    const ids = resolvers.resolveDeiSupplierIds
      ? await resolvers.resolveDeiSupplierIds(deiQuery)
      : candidateIds((await DeiCompanyModel.find(deiQuery, { rut: 1, _id: 0 }).lean())
          .map(r => (r as { rut: string }).rut))
    if (!ids.length) return { empty: true }
    supplierIdSets.push(ids)
  }

  if (query.onlyDirect === '1' || query.onlyDirect === 'true') {
    const ids = resolvers.resolveOnlyDirectSupplierIds
      ? await resolvers.resolveOnlyDirectSupplierIds()
      : (await SupplierPatternModel.find(
          { onlyDirectAward: true },
          { supplierId: 1, _id: 0 },
        ).lean()).map(r => (r as { supplierId: string }).supplierId)
    if (!ids.length) return { empty: true }
    supplierIdSets.push(ids)
  }

  if (supplierIdSets.length) {
    const [first, ...rest] = supplierIdSets
    const restSets = rest.map(ids => new Set(ids))
    const intersection = [...new Set(first)].filter(id => restSets.every(ids => ids.has(id)))
    if (!intersection.length) return { empty: true }
    filter.supplierId = { $in: intersection }
  }

  return { filter }
}

/** Sort spec for the list/export. `priority` is the indexed `{ status, priorityScore }` path. */
export function contactSort(query: ContactQuery): Record<string, 1 | -1> {
  const dir: 1 | -1 = String(query.sortOrder ?? 'desc') === 'asc' ? 1 : -1
  return String(query.sortBy ?? 'priority') === 'name'
    ? { name: dir }
    : { priorityScore: dir }
}

export interface PublicEmail {
  email: string
  source: string
  sourceUrl: string | null
  confidence: number
  mxValid: boolean
  status: string
  isRoleAccount: boolean
}
export interface PublicPhone {
  phone: string
  source: string
  sourceUrl: string | null
  confidence: number
}
export interface PublicRubro {
  classificationId: string
  label: string
  share: number
}
export interface PublicSocialLink {
  platform: string
  url: string
  label: string
  source: string
  sourceUrl: string | null
}
/** The single sanitized shape every read path returns. */
export interface PublicContact {
  supplierId: string
  rut: string
  name: string
  /** Best display/outreach email (valid preferred). */
  email: string | null
  emails: PublicEmail[]
  website: string | null
  /** Origin of `website`: "dei"|"rupe" (official registry), "webSearch" (crawl4ai-verified), or null (unverified). */
  websiteSource: string | null
  /** Evidence page for the website value (Maps listing for Places-derived sites). */
  websiteSourceUrl: string | null
  phone: string | null
  /** Origin of `phone` (e.g. "dei"), or null. */
  phoneSource: string | null
  phones: PublicPhone[]
  websitePhone: string | null
  websiteAddress: string | null
  contactFormUrl: string | null
  socialLinks: PublicSocialLink[]
  locality: string | null
  address: string | null
  placeSource: string | null
  mapsUrl: string | null
  hours: string | null
  lat: number | null
  lng: number | null
  /** Top rubro label (highest share). */
  rubro: string | null
  rubros: PublicRubro[]
  /** Enrichment methods that produced this record (badges only — not exported). */
  methods: ContactMethod[]
  priorityScore: number
  /** True when this row is a RUPE registry seed that never won an award (address-only, no email/phone/website). */
  neverAwarded: boolean
  /** RUPE registry state (ACTIVO/EN INGRESO/…) when `neverAwarded`; null otherwise. */
  rupeEstado: string | null
  dei?: { estado: string | null } | null
  onlyDirectAward: boolean
  directAwardCount: number
}

/**
 * Emails safe to surface: never `suppressed` (opted-out / hard-bounced) and
 * never `invalid`. `valid` outranks `candidate` for the display pick.
 */
function pickEmails(emails: ISupplierContact['emails']): PublicEmail[] {
  return (emails ?? [])
    .filter(e => e.status !== 'suppressed' && e.status !== 'invalid')
    .map(e => ({
      email: e.email,
      source: e.source,
      sourceUrl: publicSourceUrl(e.sourceUrl),
      confidence: Number(e.confidence) || 0,
      mxValid: !!e.mxValid,
      status: e.status,
      isRoleAccount: !!e.isRoleAccount,
    }))
}

function publicSourceUrl(raw: string | null | undefined): string | null {
  if (!raw) return null
  try {
    const url = new URL(raw)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null
  }
  catch { return null }
}

function pickPhones(doc: Partial<ISupplierContact>): PublicPhone[] {
  const raw = [...(doc.phones ?? [])]
  if (!raw.length && doc.phone && doc.phoneSource) {
    raw.push({ phone: doc.phone, source: doc.phoneSource, sourceUrl: null, confidence: 0 })
  }
  if (doc.websitePhone) {
    raw.push({
      phone: doc.websitePhone,
      source: 'website',
      sourceUrl: doc.website ?? null,
      confidence: 0.8,
    })
  }
  const seen = new Set<string>()
  return raw
    .filter(entry => !!entry.phone?.trim())
    .map(entry => ({
      phone: entry.phone.trim(),
      source: entry.source,
      sourceUrl: publicSourceUrl(entry.sourceUrl ?? (entry.source === 'googleMaps' ? doc.mapsUrl : null)),
      confidence: Number(entry.confidence) || 0,
    }))
    .filter((entry) => {
      const key = `${entry.phone.replace(/\D/g, '') || entry.phone}|${entry.source}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
}

function pickDisplayEmail(primary: string | null, emails: PublicEmail[]): string | null {
  const usable = new Set(emails.map(e => e.email))
  if (primary && usable.has(primary)) return primary
  const valid = emails.find(e => e.status === 'valid')
  if (valid) return valid.email
  return emails[0]?.email ?? null
}

/** Build the public contact shape while retaining each value's provenance. */
export function sanitizeContact(
  doc: Partial<ISupplierContact> & {
    dei?: { estado?: string | null } | null
    onlyDirectAward?: boolean
    directAwardCount?: number
  },
): PublicContact {
  const emails = pickEmails(doc.emails ?? [])
  const phones = pickPhones(doc)
  const rubros: PublicRubro[] = (doc.rubros ?? [])
    .map(r => ({ classificationId: r.classificationId, label: r.label ?? '', share: r.share ?? 0 }))
    .sort((a, b) => b.share - a.share)

  const legacyPhone = doc.phone ?? null
  const phone = legacyPhone ?? phones[0]?.phone ?? null
  const website = doc.website ?? null
  const websiteSource = website
    ? (doc.websiteSource ?? (doc.placeSource === 'googleMaps' ? 'googleMaps' : null))
    : null
  const mapsUrl = publicSourceUrl(doc.mapsUrl)
  const websiteSourceUrl = website
    ? (websiteSource === 'googleMaps' ? mapsUrl : publicSourceUrl(website))
    : null
  const phoneSource = phone
    ? (legacyPhone ? (doc.phoneSource ?? null) : (phones[0]?.source ?? null))
    : null
  const socialLinks = (doc.socialLinks ?? []).map(link => ({
    platform: link.platform,
    url: link.url,
    label: link.label ?? '',
    source: link.source ?? 'website',
    sourceUrl: publicSourceUrl(link.sourceUrl),
  }))

  return {
    supplierId: doc.supplierId ?? '',
    rut: doc.rut ?? '',
    name: doc.name ?? '',
    email: pickDisplayEmail(doc.primaryEmail ?? null, emails),
    emails,
    website,
    websiteSource,
    websiteSourceUrl,
    phone,
    phoneSource,
    phones,
    websitePhone: doc.websitePhone ?? null,
    websiteAddress: doc.websiteAddress ?? null,
    contactFormUrl: doc.contactFormUrl ?? null,
    socialLinks,
    locality: doc.locality ?? null,
    address: doc.address ?? null,
    placeSource: doc.placeSource ?? null,
    mapsUrl,
    hours: doc.hours ?? null,
    lat: doc.lat ?? null,
    lng: doc.lng ?? null,
    rubro: rubros[0]?.label || null,
    rubros,
    methods: contactMethods(doc),
    priorityScore: doc.priorityScore ?? 0,
    neverAwarded: !!doc.neverAwarded,
    rupeEstado: doc.rupeEstado ?? null,
    onlyDirectAward: doc.onlyDirectAward ?? false,
    directAwardCount: doc.directAwardCount ?? 0,
    ...(doc.dei !== undefined ? { dei: doc.dei ? { estado: doc.dei.estado ?? null } : null } : {}),
  }
}

// ---- Serializers -------------------------------------------------------------

/** Curated table order used by CSV + XLSX. */
const TABLE_COLUMNS: { key: keyof PublicContact | 'emailsJoined' | 'phonesJoined' | 'socialsJoined' | 'awarded', header: string, width: number }[] = [
  { key: 'name', header: 'Nombre', width: 42 },
  { key: 'rut', header: 'RUT', width: 14 },
  { key: 'awarded', header: 'Adjudicó', width: 10 },
  { key: 'rupeEstado', header: 'Estado RUPE', width: 18 },
  { key: 'email', header: 'Email', width: 30 },
  { key: 'emailsJoined', header: 'Emails', width: 40 },
  { key: 'website', header: 'Sitio web', width: 28 },
  { key: 'websiteSource', header: 'Origen sitio', width: 14 },
  { key: 'websiteSourceUrl', header: 'Evidencia sitio', width: 34 },
  { key: 'phone', header: 'Teléfono', width: 16 },
  { key: 'phonesJoined', header: 'Teléfonos y origen', width: 48 },
  { key: 'websitePhone', header: 'Teléfono del sitio', width: 18 },
  { key: 'locality', header: 'Localidad', width: 20 },
  { key: 'hours', header: 'Horarios', width: 30 },
  { key: 'mapsUrl', header: 'Google Maps', width: 34 },
  { key: 'address', header: 'Dirección', width: 34 },
  { key: 'websiteAddress', header: 'Dirección del sitio', width: 34 },
  { key: 'contactFormUrl', header: 'Formulario de contacto', width: 32 },
  { key: 'socialsJoined', header: 'Redes sociales', width: 42 },
  { key: 'rubro', header: 'Rubro', width: 32 },
  { key: 'supplierId', header: 'ID proveedor', width: 18 },
]

function cellValue(c: PublicContact, key: string): string {
  if (key === 'emailsJoined') {
    return c.emails.map(e => `${e.email} [${e.source}${e.sourceUrl ? `: ${e.sourceUrl}` : ''}]`).join('; ')
  }
  if (key === 'phonesJoined') {
    return c.phones.map(phone => `${phone.phone} [${phone.source}${phone.sourceUrl ? `: ${phone.sourceUrl}` : ''}]`).join('; ')
  }
  if (key === 'socialsJoined') {
    return c.socialLinks.map(link => `${link.platform}: ${link.url} [${link.source}${link.sourceUrl ? `: ${link.sourceUrl}` : ''}]`).join('; ')
  }
  if (key === 'awarded') return c.neverAwarded ? 'No' : 'Sí'
  const v = (c as unknown as Record<string, unknown>)[key]
  return v == null ? '' : String(v)
}

/** RFC-4180 field: quote when it holds a comma, quote, CR or LF; escape quotes by doubling. */
function csvField(v: string): string {
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

/**
 * Neutralize spreadsheet formula injection: a value a spreadsheet would treat as
 * a formula (leads with = + - @, or a tab/CR) is prefixed with a single quote so
 * Excel/Sheets render it as literal text. A provider name is attacker-influenced
 * data, and this list is built to be opened in Excel — so it is untrusted here.
 * CSV only: XLSX stores these as string cells (exceljs never emits a formula),
 * where a leading quote would show literally.
 */
function neutralizeFormula(v: string): string {
  return /^[=+\-@\t\r]/.test(v) ? `'${v}` : v
}

export function toCsv(contacts: PublicContact[]): string {
  const head = TABLE_COLUMNS.map(c => csvField(c.header)).join(',')
  const rows = contacts.map(c => TABLE_COLUMNS.map(col => csvField(neutralizeFormula(cellValue(c, String(col.key))))).join(','))
  // BOM so Excel reads UTF-8 (accents) correctly; CRLF per RFC-4180.
  return '﻿' + [head, ...rows].join('\r\n') + '\r\n'
}

export function toJsonExport(contacts: PublicContact[]): string {
  return JSON.stringify(contacts, null, 2)
}

/** vCard 3.0 text escape: backslash, comma, semicolon, and ANY line break
 *  (CRLF/CR/LF → \n) so a bare CR in source data can't inject a vCard property. */
function vcardEscape(v: string): string {
  return v.replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;')
}

export function toVcard(contacts: PublicContact[]): string {
  const cards = contacts.map((c) => {
    const lines = ['BEGIN:VCARD', 'VERSION:3.0']
    lines.push(`FN:${vcardEscape(c.name)}`)
    lines.push(`ORG:${vcardEscape(c.name)}`)
    if (c.email) lines.push(`EMAIL;TYPE=INTERNET:${vcardEscape(c.email)}`)
    for (const e of c.emails) {
      if (e.email !== c.email) lines.push(`EMAIL;TYPE=INTERNET:${vcardEscape(e.email)}`)
    }
    if (c.website) lines.push(`URL:${vcardEscape(c.website)}`)
    const phoneValues = new Set(c.phones.map(entry => entry.phone))
    if (!phoneValues.size && c.phone) phoneValues.add(c.phone)
    if (!phoneValues.size && c.websitePhone) phoneValues.add(c.websitePhone)
    for (const phone of phoneValues) lines.push(`TEL;TYPE=WORK,VOICE:${vcardEscape(phone)}`)
    if (c.address || c.locality) lines.push(`ADR;TYPE=WORK:;;${vcardEscape(c.address ?? '')};${vcardEscape(c.locality ?? '')};;;Uruguay`)
    if (c.websiteAddress && c.websiteAddress !== c.address) lines.push(`ADR;TYPE=WORK:;;${vcardEscape(c.websiteAddress)};;;;;Uruguay`)
    if (c.contactFormUrl) lines.push(`URL;TYPE=CONTACT:${vcardEscape(c.contactFormUrl)}`)
    for (const social of c.socialLinks) lines.push(`X-SOCIALPROFILE;TYPE=${social.platform}:${vcardEscape(social.url)}`)
    if (c.rubro) lines.push(`NOTE:${vcardEscape(c.rubro)}`)
    lines.push('END:VCARD')
    return lines.join('\r\n')
  })
  return cards.join('\r\n') + '\r\n'
}

/** Build an .xlsx buffer. exceljs is imported lazily so it never touches non-export paths. */
export async function toXlsx(contacts: PublicContact[]): Promise<Buffer> {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Con la tuya, contribuyente'
  const ws = wb.addWorksheet('Contactos')
  ws.columns = TABLE_COLUMNS.map(c => ({ header: c.header, key: String(c.key), width: c.width }))
  for (const c of contacts) {
    ws.addRow(Object.fromEntries(TABLE_COLUMNS.map(col => [String(col.key), cellValue(c, String(col.key))])))
  }
  const header = ws.getRow(1)
  header.font = { bold: true }
  header.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } }
  })
  ws.views = [{ state: 'frozen', ySplit: 1 }]
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: TABLE_COLUMNS.length } }
  const buf = await wb.xlsx.writeBuffer()
  return Buffer.from(buf)
}

export type ExportFormat = 'csv' | 'xlsx' | 'json' | 'vcf'

export const EXPORT_META: Record<ExportFormat, { contentType: string, ext: string }> = {
  csv: { contentType: 'text/csv; charset=utf-8', ext: 'csv' },
  xlsx: { contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ext: 'xlsx' },
  json: { contentType: 'application/json; charset=utf-8', ext: 'json' },
  vcf: { contentType: 'text/vcard; charset=utf-8', ext: 'vcf' },
}
