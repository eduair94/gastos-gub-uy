import { createError, defineEventHandler, getQuery, setHeader } from 'h3'
import { connectToDatabase } from '../../utils/database'
import {
  buildContactFilter,
  contactSort,
  CONTACTS_MAX_TIME_MS,
  EXPORT_CAP,
  EXPORT_META,
  sanitizeContact,
  toCsv,
  toJsonExport,
  toVcard,
  toXlsx,
  type ExportFormat,
} from '../../utils/contacts'
import { SupplierContactModel } from '../../utils/models'

const FORMATS: ExportFormat[] = ['csv', 'xlsx', 'json', 'vcf']

/**
 * Full-filtered-set export of the contact directory in csv/xlsx/json/vcf.
 * Streams the whole matching set (not just a page), capped at EXPORT_CAP with an
 * explicit truncation signal — never a silent cut. ToS-restricted fields are
 * stripped by sanitizeContact before serialization. Falls under exportLimiter.
 */
export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const format = String(query.format ?? 'csv').toLowerCase() as ExportFormat
  if (!FORMATS.includes(format)) {
    throw createError({ statusCode: 400, statusMessage: `Unsupported format (use ${FORMATS.join(', ')})` })
  }

  try {
    await connectToDatabase()

    const built = await buildContactFilter(query)
    const rows = 'empty' in built
      ? []
      : await SupplierContactModel.find(built.filter)
        .sort(contactSort(query))
        .limit(EXPORT_CAP + 1)
        .maxTimeMS(CONTACTS_MAX_TIME_MS)
        .lean()

    const truncated = rows.length > EXPORT_CAP
    const contacts = (truncated ? rows.slice(0, EXPORT_CAP) : rows).map(r => sanitizeContact(r as never))
    if (truncated) {
      console.warn(`[contacts/export] result exceeded EXPORT_CAP=${EXPORT_CAP}; truncated`)
      setHeader(event, 'X-Export-Truncated', String(EXPORT_CAP))
    }

    const meta = EXPORT_META[format]
    const date = new Date().toISOString().slice(0, 10)
    setHeader(event, 'content-type', meta.contentType)
    setHeader(event, 'content-disposition', `attachment; filename="contactos-proveedores-${date}.${meta.ext}"`)
    // The filter is public but the payload is heavy; let the edge cache a filter
    // for a few minutes without treating it as immutable.
    setHeader(event, 'cache-control', 'public, max-age=300')

    if (format === 'xlsx') return await toXlsx(contacts)
    if (format === 'json') return toJsonExport(contacts)
    if (format === 'vcf') return toVcard(contacts)
    return toCsv(contacts)
  }
  catch (error) {
    console.error('Error exporting contacts:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to export contacts' })
  }
})
