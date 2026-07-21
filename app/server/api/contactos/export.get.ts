import { createError, defineEventHandler, getQuery, setHeader } from 'h3'
import { connectToDatabase } from '../../utils/database'
import {
  buildProcurementFilter,
  procurementSort,
  serializeProcurementContact,
  toCsv,
  toJsonExport,
  toVcard,
  toXlsx,
  PROC_CONTACTS_MAX_TIME_MS,
  PROC_EXPORT_CAP,
  PROC_EXPORT_META,
  type ProcExportFormat,
} from '../../utils/procurement-contacts'
import { ProcurementContactModel } from '../../../../shared/models/procurement_contacts'

const FORMATS: ProcExportFormat[] = ['csv', 'xlsx', 'json', 'vcf']

/**
 * Full-filtered-set export of the purchasing-contact directory in csv/xlsx/json/vcf.
 * Whole matching set (not a page), capped at PROC_EXPORT_CAP with an explicit
 * truncation signal. All public comprasestatales data.
 */
export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const format = String(query.format ?? 'csv').toLowerCase() as ProcExportFormat
  if (!FORMATS.includes(format)) {
    throw createError({ statusCode: 400, statusMessage: `Unsupported format (use ${FORMATS.join(', ')})` })
  }

  try {
    await connectToDatabase()

    const filter = buildProcurementFilter(query)
    const docs = await ProcurementContactModel.find(filter)
      .sort(procurementSort(query))
      .limit(PROC_EXPORT_CAP + 1)
      .maxTimeMS(PROC_CONTACTS_MAX_TIME_MS)
      .lean()

    const truncated = docs.length > PROC_EXPORT_CAP
    const rows = (truncated ? docs.slice(0, PROC_EXPORT_CAP) : docs).map(d => serializeProcurementContact(d as never))
    if (truncated) {
      console.warn(`[contactos/export] result exceeded PROC_EXPORT_CAP=${PROC_EXPORT_CAP}; truncated`)
      setHeader(event, 'X-Export-Truncated', String(PROC_EXPORT_CAP))
    }

    const meta = PROC_EXPORT_META[format]
    const date = new Date().toISOString().slice(0, 10)
    setHeader(event, 'content-type', meta.contentType)
    setHeader(event, 'content-disposition', `attachment; filename="contactos-compras-${date}.${meta.ext}"`)
    setHeader(event, 'cache-control', 'public, max-age=300')

    if (format === 'xlsx') return await toXlsx(rows)
    if (format === 'json') return toJsonExport(rows)
    if (format === 'vcf') return toVcard(rows)
    return toCsv(rows)
  }
  catch (error) {
    console.error('Error exporting purchasing contacts:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to export contacts' })
  }
})
