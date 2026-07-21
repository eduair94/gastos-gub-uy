/**
 * Shared read/serialize layer for the public provider contact directory
 * (`supplier_contacts`). Every read path — the paginated list, the export, and
 * the rubro facet — goes through the SAME filter builder and the SAME
 * `sanitizeContact`, so a compliance rule (ToS strip, suppressed-email drop)
 * can only ever live in one place and cannot be bypassed by one endpoint.
 */
import type { ISupplierContact } from './models'
import { DeiCompanyModel, SupplierPatternModel } from './models'
import { escapeRegex, sanitizeSearch } from './query'
import { fetchNamesByCategory, CATEGORIES } from './enrichment'

/** The enrichment METHOD(s) that produced a record — shown as badges (never exported). */
export type ContactMethod = 'crawl4ai' | 'googleMaps' | 'dei' | 'rupe' | 'impo'

/**
 * Which methods touched this record, from the RAW per-field provenance (before the
 * ToS strip) — so a Maps-only record still shows a "Maps" badge even though its
 * fields are hidden. A record can carry several.
 */
export function contactMethods(
  doc: Partial<Pick<ISupplierContact, 'emails' | 'websiteSource' | 'phoneSource' | 'placeSource'>>,
): ContactMethod[] {
  const found = new Set<ContactMethod>()
  const emailSources = (doc.emails ?? []).map(e => e.source)
  const fieldSources = [doc.websiteSource, doc.phoneSource, doc.placeSource]
  const has = (s: string) => emailSources.includes(s as never) || fieldSources.includes(s as never)
  if (has('webSearch') || has('website')) found.add('crawl4ai')
  if (has('googleMaps')) found.add('googleMaps')
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
  const filter: Record<string, unknown> = { status: 'enriched' }
  const supplierIdSets: string[][] = []

  // Default = deliverable list: at least one MX-validated, valid email.
  // verified=0 widens to any surfaceable email — but still excludes suppressed/
  // invalid, so a widened row always has a displayable address (mirrors pickEmails).
  if (String(query.verified ?? '1') === '0') {
    filter.emails = { $elemMatch: { status: { $nin: ['suppressed', 'invalid'] } } }
  }
  else {
    filter.emails = { $elemMatch: { mxValid: true, status: 'valid' } }
  }

  // `search` and `categoria` both constrain `name`; assigning both to `filter.name`
  // directly would let the second clobber the first, so combine them with `$and`
  // when more than one name condition is in play (mirrors /api/suppliers).
  const nameConditions: Record<string, unknown>[] = []
  // User input → escaped literal + length cap before it reaches the regex engine
  // (ReDoS guard; the repo-wide rule, see app/server/context.md).
  const search = sanitizeSearch(query.search)
  if (search) nameConditions.push({ name: { $regex: escapeRegex(search), $options: 'i' } })

  // Company TYPE (AI-classified enrichment category) → resolve matching names,
  // gated the same way the chip is (confidence >= 0.5). No names → no rows.
  const categoria = query.categoria ? String(query.categoria) : ''
  if (categoria && CATEGORIES.has(categoria)) {
    const names = await fetchNamesByCategory(categoria)
    if (!names.length) return { empty: true }
    nameConditions.push({ name: { $in: names } })
  }

  if (nameConditions.length === 1) Object.assign(filter, nameConditions[0])
  else if (nameConditions.length > 1) filter.$and = nameConditions

  if (query.rubro) filter['rubros.classificationId'] = String(query.rubro)

  // "has phone" means a DISPLAYABLE phone: googleMaps-sourced phones are stripped
  // on read (ToS), so counting them here would inflate the total with blank cells.
  if (String(query.hasPhone ?? '') === '1') {
    filter.phone = { $nin: [null, ''] }
    filter.phoneSource = { $ne: 'googleMaps' }
  }
  if (String(query.hasWebsite ?? '') === '1') {
    filter.website = { $nin: [null, ''] }
    filter.websiteSource = { $ne: 'googleMaps' }
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
  mxValid: boolean
  status: string
  isRoleAccount: boolean
}
export interface PublicRubro {
  classificationId: string
  label: string
  share: number
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
  phone: string | null
  /** Origin of `phone` (e.g. "dei"), or null. */
  phoneSource: string | null
  locality: string | null
  address: string | null
  /** Top rubro label (highest share). */
  rubro: string | null
  rubros: PublicRubro[]
  /** Enrichment methods that produced this record (badges only — not exported). */
  methods: ContactMethod[]
  priorityScore: number
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
      mxValid: !!e.mxValid,
      status: e.status,
      isRoleAccount: !!e.isRoleAccount,
    }))
}

function pickDisplayEmail(primary: string | null, emails: PublicEmail[]): string | null {
  const usable = new Set(emails.map(e => e.email))
  if (primary && usable.has(primary)) return primary
  const valid = emails.find(e => e.status === 'valid')
  if (valid) return valid.email
  return emails[0]?.email ?? null
}

/**
 * Strip ToS-restricted, Google-Maps-sourced fields before ANY display or export.
 * `phone` when its provenance is googleMaps; the location block (address/locality)
 * when the place provenance is googleMaps. DEI open-data and provider-website
 * fields pass through. This is the compliance choke point.
 */
export function sanitizeContact(
  doc: Partial<ISupplierContact> & {
    dei?: { estado?: string | null } | null
    onlyDirectAward?: boolean
    directAwardCount?: number
  },
): PublicContact {
  const emails = pickEmails(doc.emails ?? [])
  const rubros: PublicRubro[] = (doc.rubros ?? [])
    .map(r => ({ classificationId: r.classificationId, label: r.label ?? '', share: r.share ?? 0 }))
    .sort((a, b) => b.share - a.share)

  const phone = doc.phoneSource === 'googleMaps' ? null : (doc.phone ?? null)
  // A Places-listed website is Google-Maps content under the same ToS as phone.
  const website = doc.websiteSource === 'googleMaps' ? null : (doc.website ?? null)
  const placeRestricted = doc.placeSource === 'googleMaps'
  // Provenance travels with the field it describes: null once the field itself is
  // stripped/absent, so the origin shown always matches a visible value.
  const websiteSource = website ? (doc.websiteSource ?? null) : null
  const phoneSource = phone ? (doc.phoneSource ?? null) : null

  return {
    supplierId: doc.supplierId ?? '',
    rut: doc.rut ?? '',
    name: doc.name ?? '',
    email: pickDisplayEmail(doc.primaryEmail ?? null, emails),
    emails,
    website,
    websiteSource,
    phone,
    phoneSource,
    locality: placeRestricted ? null : (doc.locality ?? null),
    address: placeRestricted ? null : (doc.address ?? null),
    rubro: rubros[0]?.label || null,
    rubros,
    methods: contactMethods(doc),
    priorityScore: doc.priorityScore ?? 0,
    onlyDirectAward: doc.onlyDirectAward ?? false,
    directAwardCount: doc.directAwardCount ?? 0,
    ...(doc.dei !== undefined ? { dei: doc.dei ? { estado: doc.dei.estado ?? null } : null } : {}),
  }
}

// ---- Serializers -------------------------------------------------------------

/** Curated table order used by CSV + XLSX. */
const TABLE_COLUMNS: { key: keyof PublicContact | 'emailsJoined', header: string, width: number }[] = [
  { key: 'name', header: 'Nombre', width: 42 },
  { key: 'rut', header: 'RUT', width: 14 },
  { key: 'email', header: 'Email', width: 30 },
  { key: 'emailsJoined', header: 'Emails', width: 40 },
  { key: 'website', header: 'Sitio web', width: 28 },
  { key: 'websiteSource', header: 'Origen sitio', width: 14 },
  { key: 'phone', header: 'Teléfono', width: 16 },
  { key: 'locality', header: 'Localidad', width: 20 },
  { key: 'address', header: 'Dirección', width: 34 },
  { key: 'rubro', header: 'Rubro', width: 32 },
  { key: 'supplierId', header: 'ID proveedor', width: 18 },
]

function cellValue(c: PublicContact, key: string): string {
  if (key === 'emailsJoined') return c.emails.map(e => e.email).join('; ')
  const v = (c as Record<string, unknown>)[key]
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
    if (c.phone) lines.push(`TEL;TYPE=WORK,VOICE:${vcardEscape(c.phone)}`)
    if (c.address || c.locality) lines.push(`ADR;TYPE=WORK:;;${vcardEscape(c.address ?? '')};${vcardEscape(c.locality ?? '')};;;Uruguay`)
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
