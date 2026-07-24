import type { Readable } from 'node:stream'
import { createError, defineEventHandler, getQuery, sendStream, setHeader } from 'h3'
import { connectToDatabase } from '../../utils/database'
import {
  buildContactFilter,
  contactCsvHeader,
  contactCsvRows,
  contactExportCell,
  CONTACT_EXPORT_COLUMNS,
  contactSort,
  CONTACTS_MAX_TIME_MS,
  contactVcardRows,
  EXPORT_CAP,
  EXPORT_META,
  sanitizeContact,
  type ExportFormat,
  type PublicContact,
} from '../../utils/contacts'
import {
  acquireHeavyExportSlot,
  createTextExportStream,
  createXlsxExportStream,
  EXPORT_BATCH_SIZE,
} from '../../utils/heavy-export'
import { attachOnlyDirectAward } from '../../utils/only-direct-award'
import { attachRupe } from '../../utils/rupe'
import { SupplierContactModel } from '../../utils/models'

const FORMATS: ExportFormat[] = ['csv', 'xlsx', 'json', 'vcf']

async function decorateBatch(rows: unknown[], format: ExportFormat): Promise<PublicContact[]> {
  const withRupe = await attachRupe(rows, row => (row as { supplierId?: string }).supplierId ?? '')
  // Tabular/vCard exports deliberately omit the UI-only signal. JSON exposes
  // the PublicContact shape, so decorate it before serializing.
  const decorated = format === 'json'
    ? await attachOnlyDirectAward(withRupe, row => (row as { supplierId?: string }).supplierId ?? '')
    : withRupe
  return decorated.map(row => sanitizeContact(row as never))
}

async function* contactBatches(
  filter: Record<string, unknown>,
  query: Record<string, unknown>,
  format: ExportFormat,
  signal: AbortSignal,
): AsyncGenerator<PublicContact[]> {
  const cursor = SupplierContactModel.find(filter)
    .sort(contactSort(query))
    .limit(EXPORT_CAP)
    .maxTimeMS(CONTACTS_MAX_TIME_MS)
    .lean()
    .cursor({ batchSize: EXPORT_BATCH_SIZE })

  try {
    let rows: unknown[] = []
    for await (const row of cursor) {
      if (signal.aborted) break
      rows.push(row)
      if (rows.length < EXPORT_BATCH_SIZE) continue
      yield await decorateBatch(rows, format)
      rows = []
    }
    if (rows.length && !signal.aborted) yield await decorateBatch(rows, format)
  }
  finally {
    await cursor.close().catch(() => undefined)
  }
}

async function* emptyBatches(): AsyncGenerator<PublicContact[]> {}

/**
 * Full-filtered-set export of the contact directory in csv/xlsx/json/vcf.
 * Mongo, enrichment and serialization all run in bounded batches. A shared
 * per-worker slot prevents concurrent 50k-row downloads from exhausting the
 * Node heap; PM2's second worker remains available to serve the site.
 */
export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const format = String(query.format ?? 'csv').toLowerCase() as ExportFormat
  if (!FORMATS.includes(format)) {
    throw createError({ statusCode: 400, statusMessage: `Unsupported format (use ${FORMATS.join(', ')})` })
  }

  const release = acquireHeavyExportSlot()
  if (!release) {
    setHeader(event, 'retry-after', '15')
    throw createError({ statusCode: 503, statusMessage: 'Another export is already running; retry shortly' })
  }

  const startedAt = Date.now()
  const controller = new AbortController()
  let responseStream: Readable | null = null
  let outcome = 'failed'
  let exportedRows = 0

  const abort = () => {
    controller.abort()
    if (responseStream && !responseStream.readableEnded && !responseStream.destroyed) {
      responseStream.destroy(new Error('Export client disconnected'))
    }
  }
  event.node.req.once('aborted', abort)
  event.node.res.once('close', abort)

  try {
    await connectToDatabase()
    const built = await buildContactFilter(query)
    const total = 'empty' in built
      ? 0
      : await SupplierContactModel.countDocuments(
        built.filter,
        { maxTimeMS: CONTACTS_MAX_TIME_MS },
      )
    exportedRows = Math.min(total, EXPORT_CAP)

    if (total > EXPORT_CAP) {
      setHeader(event, 'X-Export-Truncated', String(EXPORT_CAP))
    }
    setHeader(event, 'X-Export-Limit', String(EXPORT_CAP))
    setHeader(event, 'X-Export-Total', String(total))

    const meta = EXPORT_META[format]
    const date = new Date().toISOString().slice(0, 10)
    setHeader(event, 'content-type', meta.contentType)
    setHeader(event, 'content-disposition', `attachment; filename="contactos-proveedores-${date}.${meta.ext}"`)
    setHeader(event, 'cache-control', 'public, max-age=300')

    console.info(`[contacts/export] start format=${format} rows=${exportedRows} truncated=${total > EXPORT_CAP}`)
    const batches = 'empty' in built
      ? emptyBatches()
      : contactBatches(built.filter, query, format, controller.signal)

    if (format === 'xlsx') {
      const xlsx = createXlsxExportStream({
        batches,
        columns: CONTACT_EXPORT_COLUMNS.map(column => ({ ...column, key: String(column.key) })),
        creator: 'Con la tuya, contribuyente',
        sheetName: 'Contactos',
        row: contact => Object.fromEntries(
          CONTACT_EXPORT_COLUMNS.map(column => [
            String(column.key),
            contactExportCell(contact, String(column.key)),
          ]),
        ),
      })
      responseStream = xlsx.stream
      await Promise.all([sendStream(event, responseStream), xlsx.completed])
    }
    else {
      responseStream = createTextExportStream(format, batches, {
        csvHeader: contactCsvHeader(),
        csvRows: contactCsvRows,
        vcardRows: contactVcardRows,
      })
      await sendStream(event, responseStream)
    }

    outcome = 'completed'
  }
  catch (error) {
    if (controller.signal.aborted && event.node.res.destroyed) {
      outcome = 'disconnected'
      return
    }
    console.error('Error exporting contacts:', error)
    if (event.node.res.headersSent) {
      if (!event.node.res.destroyed) event.node.res.destroy(error as Error)
      return
    }
    throw createError({ statusCode: 500, statusMessage: 'Failed to export contacts' })
  }
  finally {
    event.node.req.off('aborted', abort)
    event.node.res.off('close', abort)
    release()
    console.info(`[contacts/export] finish format=${format} outcome=${outcome} rows=${exportedRows} ms=${Date.now() - startedAt}`)
  }
})
