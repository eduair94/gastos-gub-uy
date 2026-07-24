import type { Readable } from 'node:stream'
import { createError, defineEventHandler, getQuery, sendStream, setHeader } from 'h3'
import { connectToDatabase } from '../../utils/database'
import {
  buildProcurementFilter,
  procurementCsvHeader,
  procurementCsvRows,
  procurementExportCell,
  PROCUREMENT_EXPORT_COLUMNS,
  procurementSort,
  procurementVcardRows,
  serializeProcurementContact,
  PROC_CONTACTS_MAX_TIME_MS,
  PROC_EXPORT_CAP,
  PROC_EXPORT_META,
  type ProcExportFormat,
  type PublicProcurementContact,
} from '../../utils/procurement-contacts'
import {
  acquireHeavyExportSlot,
  createTextExportStream,
  createXlsxExportStream,
  EXPORT_BATCH_SIZE,
} from '../../utils/heavy-export'
import { ProcurementContactModel } from '../../../../shared/models/procurement_contacts'

const FORMATS: ProcExportFormat[] = ['csv', 'xlsx', 'json', 'vcf']

async function* procurementBatches(
  filter: Record<string, unknown>,
  query: Record<string, unknown>,
  signal: AbortSignal,
): AsyncGenerator<PublicProcurementContact[]> {
  const cursor = ProcurementContactModel.find(filter)
    .sort(procurementSort(query))
    .limit(PROC_EXPORT_CAP)
    .maxTimeMS(PROC_CONTACTS_MAX_TIME_MS)
    .lean()
    .cursor({ batchSize: EXPORT_BATCH_SIZE })

  try {
    let rows: PublicProcurementContact[] = []
    for await (const doc of cursor) {
      if (signal.aborted) break
      rows.push(serializeProcurementContact(doc as never))
      if (rows.length < EXPORT_BATCH_SIZE) continue
      yield rows
      rows = []
    }
    if (rows.length && !signal.aborted) yield rows
  }
  finally {
    await cursor.close().catch(() => undefined)
  }
}

/**
 * Whole matching purchasing-contact export, capped with an explicit header.
 * Cursor batches and the streaming XLSX writer keep heap usage bounded.
 */
export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const format = String(query.format ?? 'csv').toLowerCase() as ProcExportFormat
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
    const filter = buildProcurementFilter(query)
    const total = await ProcurementContactModel.countDocuments(
      filter,
      { maxTimeMS: PROC_CONTACTS_MAX_TIME_MS },
    )
    exportedRows = Math.min(total, PROC_EXPORT_CAP)

    if (total > PROC_EXPORT_CAP) {
      setHeader(event, 'X-Export-Truncated', String(PROC_EXPORT_CAP))
    }
    setHeader(event, 'X-Export-Limit', String(PROC_EXPORT_CAP))
    setHeader(event, 'X-Export-Total', String(total))

    const meta = PROC_EXPORT_META[format]
    const date = new Date().toISOString().slice(0, 10)
    setHeader(event, 'content-type', meta.contentType)
    setHeader(event, 'content-disposition', `attachment; filename="contactos-compras-${date}.${meta.ext}"`)
    setHeader(event, 'cache-control', 'public, max-age=300')

    console.info(`[contactos/export] start format=${format} rows=${exportedRows} truncated=${total > PROC_EXPORT_CAP}`)
    const batches = procurementBatches(filter, query, controller.signal)

    if (format === 'xlsx') {
      const xlsx = createXlsxExportStream({
        batches,
        columns: PROCUREMENT_EXPORT_COLUMNS.map(column => ({ ...column, key: String(column.key) })),
        creator: 'Con la tuya, contribuyente',
        sheetName: 'Contactos de compras',
        row: contact => Object.fromEntries(
          PROCUREMENT_EXPORT_COLUMNS.map(column => [
            String(column.key),
            procurementExportCell(contact, String(column.key)),
          ]),
        ),
      })
      responseStream = xlsx.stream
      await Promise.all([sendStream(event, responseStream), xlsx.completed])
    }
    else {
      responseStream = createTextExportStream(format, batches, {
        csvHeader: procurementCsvHeader(),
        csvRows: procurementCsvRows,
        vcardRows: procurementVcardRows,
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
    console.error('Error exporting purchasing contacts:', error)
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
    console.info(`[contactos/export] finish format=${format} outcome=${outcome} rows=${exportedRows} ms=${Date.now() - startedAt}`)
  }
})
