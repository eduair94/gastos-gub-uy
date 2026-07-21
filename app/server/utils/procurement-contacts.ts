/**
 * Read/serialize layer for the public PURCHASING-CONTACT directory
 * (procurement_contacts — one per organism/contracting unit, from the tender
 * parties[].contactPoint). All public comprasestatales data (no ToS strip), so
 * this is the choke point for filtering, shaping and the four-format download —
 * mirroring app/server/utils/contacts.ts for suppliers.
 */
import type { IProcurementContact } from '../../../shared/models/procurement_contacts'
import { groupOrganismClause, organismGroupLabel, organismGroupOptions } from '../../../shared/organism-groups'

export const PROC_CONTACTS_MAX_TIME_MS = 15_000
export const PROC_EXPORT_CAP = 50_000

export { organismGroupOptions }

export type ProcQuery = Record<string, unknown>

/**
 * The one Mongo filter for the purchasing-contact directory: full-text search,
 * organism GROUP (Intendencias/Ministerios/…), and deliverability toggles. Each
 * complex clause is combined under `$and` so none clobbers another.
 */
export function buildProcurementFilter(query: ProcQuery): Record<string, unknown> {
  const clauses: Record<string, unknown>[] = []

  const search = String((query.q ?? query.search ?? '') as string).trim()
  if (search) clauses.push({ $text: { $search: search } })

  const grupo = query.grupo ? String(query.grupo) : ''
  if (grupo) {
    const clause = groupOrganismClause(grupo)
    if (clause) clauses.push(clause)
  }

  if (String(query.hasEmail ?? '') === '1') {
    clauses.push({ $or: [{ email: { $nin: [null, ''] } }, { 'variants.email': { $nin: [null, ''] } }] })
  }
  if (String(query.hasPhone ?? '') === '1') {
    clauses.push({ telephone: { $nin: [null, ''] } })
  }
  const minLlamados = Number(query.minLlamados ?? 0)
  if (Number.isFinite(minLlamados) && minLlamados > 0) {
    clauses.push({ llamadosCount: { $gte: minLlamados } })
  }

  if (!clauses.length) return {}
  if (clauses.length === 1) return clauses[0]!
  return { $and: clauses }
}

/** `llamados` (activity, indexed) or `organism` (name). */
export function procurementSort(query: ProcQuery): Record<string, 1 | -1> {
  return String(query.sortBy ?? 'llamados') === 'organism'
    ? { organismName: 1 }
    : { llamadosCount: -1 }
}

export interface PublicProcurementContact {
  organismId: string
  organismName: string
  /** Top-level group label (Intendencias/Ministerios/…) or null. */
  group: string | null
  contactName: string | null
  email: string | null
  /** All distinct emails (primary + variants). */
  emails: string[]
  telephone: string | null
  faxNumber: string | null
  llamadosCount: number
}

export function serializeProcurementContact(doc: Partial<IProcurementContact>): PublicProcurementContact {
  const emails = [...new Set(
    [doc.email, ...(doc.variants ?? []).map(v => v.email)]
      .filter((e): e is string => !!e && e.includes('@'))
      .map(e => e.trim().toLowerCase()),
  )]
  return {
    organismId: doc.organismId ?? '',
    organismName: doc.organismName ?? '',
    group: doc.organismId ? organismGroupLabel(doc.organismId) : null,
    contactName: doc.contactName ?? null,
    email: doc.email ?? emails[0] ?? null,
    emails,
    telephone: doc.telephone ?? null,
    faxNumber: doc.faxNumber ?? null,
    llamadosCount: doc.llamadosCount ?? 0,
  }
}

// ---- Serializers (same guards as contacts.ts) --------------------------------

const TABLE_COLUMNS: { key: keyof PublicProcurementContact | 'emailsJoined', header: string, width: number }[] = [
  { key: 'organismName', header: 'Organismo', width: 44 },
  { key: 'organismId', header: 'ID', width: 12 },
  { key: 'group', header: 'Grupo', width: 24 },
  { key: 'contactName', header: 'Contacto', width: 30 },
  { key: 'email', header: 'Email', width: 30 },
  { key: 'emailsJoined', header: 'Emails', width: 40 },
  { key: 'telephone', header: 'Teléfono', width: 18 },
  { key: 'faxNumber', header: 'Fax', width: 16 },
  { key: 'llamadosCount', header: 'Llamados', width: 12 },
]

function cellValue(c: PublicProcurementContact, key: string): string {
  if (key === 'emailsJoined') return c.emails.join('; ')
  const v = (c as Record<string, unknown>)[key]
  return v == null ? '' : String(v)
}
function csvField(v: string): string {
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}
function neutralizeFormula(v: string): string {
  return /^[=+\-@\t\r]/.test(v) ? `'${v}` : v
}
function vcardEscape(v: string): string {
  return v.replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;')
}

export function toCsv(rows: PublicProcurementContact[]): string {
  const head = TABLE_COLUMNS.map(c => csvField(c.header)).join(',')
  const body = rows.map(c => TABLE_COLUMNS.map(col => csvField(neutralizeFormula(cellValue(c, String(col.key))))).join(','))
  return '﻿' + [head, ...body].join('\r\n') + '\r\n'
}

export function toJsonExport(rows: PublicProcurementContact[]): string {
  return JSON.stringify(rows, null, 2)
}

export function toVcard(rows: PublicProcurementContact[]): string {
  const cards = rows.map((c) => {
    const lines = ['BEGIN:VCARD', 'VERSION:3.0']
    lines.push(`FN:${vcardEscape(c.contactName || c.organismName)}`)
    lines.push(`ORG:${vcardEscape(c.organismName)}`)
    if (c.email) lines.push(`EMAIL;TYPE=INTERNET:${vcardEscape(c.email)}`)
    for (const e of c.emails) if (e !== c.email) lines.push(`EMAIL;TYPE=INTERNET:${vcardEscape(e)}`)
    if (c.telephone) lines.push(`TEL;TYPE=WORK,VOICE:${vcardEscape(c.telephone)}`)
    if (c.faxNumber) lines.push(`TEL;TYPE=WORK,FAX:${vcardEscape(c.faxNumber)}`)
    if (c.group) lines.push(`NOTE:${vcardEscape(c.group)}`)
    lines.push('END:VCARD')
    return lines.join('\r\n')
  })
  return cards.join('\r\n') + '\r\n'
}

export async function toXlsx(rows: PublicProcurementContact[]): Promise<Buffer> {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Con la tuya, contribuyente'
  const ws = wb.addWorksheet('Contactos de compras')
  ws.columns = TABLE_COLUMNS.map(c => ({ header: c.header, key: String(c.key), width: c.width }))
  for (const c of rows) {
    ws.addRow(Object.fromEntries(TABLE_COLUMNS.map(col => [String(col.key), cellValue(c, String(col.key))])))
  }
  const header = ws.getRow(1)
  header.font = { bold: true }
  header.eachCell((cell) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } } })
  ws.views = [{ state: 'frozen', ySplit: 1 }]
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: TABLE_COLUMNS.length } }
  return Buffer.from(await wb.xlsx.writeBuffer())
}

export type ProcExportFormat = 'csv' | 'xlsx' | 'json' | 'vcf'
export const PROC_EXPORT_META: Record<ProcExportFormat, { contentType: string, ext: string }> = {
  csv: { contentType: 'text/csv; charset=utf-8', ext: 'csv' },
  xlsx: { contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ext: 'xlsx' },
  json: { contentType: 'application/json; charset=utf-8', ext: 'json' },
  vcf: { contentType: 'text/vcard; charset=utf-8', ext: 'vcf' },
}
