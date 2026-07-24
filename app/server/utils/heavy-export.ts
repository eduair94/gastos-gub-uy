import { PassThrough, Readable } from 'node:stream'

export const EXPORT_BATCH_SIZE = 250

let exportInProgress = false

/**
 * One heavy export at a time per dashboard worker. PM2 runs two workers, so the
 * site can still serve two downloads concurrently without letting repeated
 * clicks materialize several 50k-row exports in the same Node heap.
 */
export function acquireHeavyExportSlot(): (() => void) | null {
  if (exportInProgress) return null
  exportInProgress = true

  let released = false
  return () => {
    if (released) return
    released = true
    exportInProgress = false
  }
}

interface TextExportAdapter<T> {
  csvHeader: string
  csvRows: (rows: T[]) => string
  vcardRows: (rows: T[]) => string
}

/**
 * Serialize bounded Mongo batches instead of building the entire CSV/JSON/vCard
 * in memory. JSON remains one valid array and the CSV header is emitted once.
 */
export function createTextExportStream<T>(
  format: 'csv' | 'json' | 'vcf',
  batches: AsyncIterable<T[]>,
  adapter: TextExportAdapter<T>,
): Readable {
  async function* chunks() {
    if (format === 'csv') {
      yield `\uFEFF${adapter.csvHeader}\r\n`
      for await (const rows of batches) {
        const body = adapter.csvRows(rows)
        if (body) yield `${body}\r\n`
      }
      return
    }

    if (format === 'vcf') {
      let wroteRows = false
      for await (const rows of batches) {
        const body = adapter.vcardRows(rows)
        if (!body) continue
        wroteRows = true
        yield `${body}\r\n`
      }
      if (!wroteRows) yield '\r\n'
      return
    }

    yield '[\n'
    let first = true
    for await (const rows of batches) {
      if (!rows.length) continue
      const body = rows.map(row => JSON.stringify(row, null, 2)).join(',\n')
      yield `${first ? '' : ',\n'}${body}`
      first = false
    }
    yield '\n]\n'
  }

  return Readable.from(chunks())
}

interface XlsxColumn {
  key: string
  header: string
  width: number
}

interface XlsxExportOptions<T> {
  batches: AsyncIterable<T[]>
  columns: readonly XlsxColumn[]
  creator: string
  sheetName: string
  row: (item: T) => Record<string, string>
}

/**
 * ExcelJS's streaming writer commits every row immediately, keeping XLSX
 * memory bounded while its zip is piped to H3.
 */
export function createXlsxExportStream<T>(options: XlsxExportOptions<T>): {
  stream: PassThrough
  completed: Promise<void>
} {
  const stream = new PassThrough()
  const completed = (async () => {
    const ExcelJS = (await import('exceljs')).default
    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
      stream,
      useStyles: true,
      useSharedStrings: false,
    })
    workbook.creator = options.creator

    const worksheet = workbook.addWorksheet(options.sheetName, {
      views: [{ state: 'frozen', ySplit: 1 }],
      autoFilter: {
        from: { row: 1, column: 1 },
        to: { row: 1, column: options.columns.length },
      },
    })
    worksheet.columns = options.columns.map(column => ({ ...column }))

    const header = worksheet.getRow(1)
    header.font = { bold: true }
    header.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } }
    })
    header.commit()

    for await (const rows of options.batches) {
      for (const item of rows) worksheet.addRow(options.row(item)).commit()
    }

    worksheet.commit()
    await workbook.commit()
  })().catch((error) => {
    stream.destroy(error as Error)
    throw error
  })

  return { stream, completed }
}
