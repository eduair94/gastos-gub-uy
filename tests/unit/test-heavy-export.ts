/**
 * Bounded serializers and concurrency gate for the two 50k-row exports.
 *
 * Run: npx tsx tests/unit/test-heavy-export.ts
 */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import {
  acquireHeavyExportSlot,
  createTextExportStream,
  createXlsxExportStream,
} from '../../app/server/utils/heavy-export'

async function readStream(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  return Buffer.concat(chunks)
}

async function* batches() {
  yield [{ id: '1', name: 'Uno' }]
  yield [{ id: '2', name: 'Dos' }]
}

const adapter = {
  csvHeader: 'ID,Nombre',
  csvRows: (rows: Array<{ id: string, name: string }>) => rows.map(row => `${row.id},${row.name}`).join('\r\n'),
  vcardRows: (rows: Array<{ id: string, name: string }>) => rows.map(row => `BEGIN:VCARD\r\nFN:${row.name}\r\nEND:VCARD`).join('\r\n'),
}

async function main() {
  const release = acquireHeavyExportSlot()
  assert.ok(release, 'first export acquires the worker slot')
  assert.equal(acquireHeavyExportSlot(), null, 'a concurrent export is rejected')
  release()
  release()
  const releaseAgain = acquireHeavyExportSlot()
  assert.ok(releaseAgain, 'idempotent release makes the slot reusable')
  releaseAgain()

  const csv = (await readStream(createTextExportStream('csv', batches(), adapter))).toString('utf8')
  assert.equal(csv, '\uFEFFID,Nombre\r\n1,Uno\r\n2,Dos\r\n', 'CSV header is emitted once across batches')

  const json = (await readStream(createTextExportStream('json', batches(), adapter))).toString('utf8')
  assert.deepEqual(JSON.parse(json), [{ id: '1', name: 'Uno' }, { id: '2', name: 'Dos' }])

  const vcard = (await readStream(createTextExportStream('vcf', batches(), adapter))).toString('utf8')
  assert.equal((vcard.match(/BEGIN:VCARD/g) || []).length, 2)

  const xlsx = createXlsxExportStream({
    batches: batches(),
    columns: [
      { key: 'id', header: 'ID', width: 12 },
      { key: 'name', header: 'Nombre', width: 30 },
    ],
    creator: 'Test',
    sheetName: 'Contactos',
    row: item => item,
  })
  const [xlsxBuffer] = await Promise.all([readStream(xlsx.stream), xlsx.completed])
  assert.ok(xlsxBuffer.subarray(0, 2).equals(Buffer.from('PK')), 'streaming XLSX is a zip document')

  const requireFromApp = createRequire(resolve(process.cwd(), 'app/package.json'))
  const ExcelJS = requireFromApp('exceljs')
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(xlsxBuffer as never)
  const sheet = workbook.getWorksheet('Contactos')
  assert.equal(sheet?.rowCount, 3, 'streaming XLSX contains one header plus both data rows')
  assert.equal(sheet?.getRow(3).getCell(2).value, 'Dos')

  console.log('heavy export streaming: OK')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
