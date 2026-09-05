/**
 * Los formateadores de fecha memoizados tienen que dar EXACTAMENTE lo mismo.
 *
 * `app/utils/contract.ts` construía un `Intl.DateTimeFormat` por llamada, en
 * tres sitios. Ahora son tres constantes de módulo. Es el mismo defecto que se
 * arregló en `app/utils/money.ts`, donde costaba el 21% del CPU de un worker.
 *
 * Lo que NO puede cambiar, además del formato: `timeZone: 'UTC'`. El feed
 * estampa hora local uruguaya con sufijo `Z`, así que formatear en la zona del
 * lector corre las fechas de medianoche un día para atrás. Esta prueba fija ese
 * comportamiento con casos explícitos.
 *
 * Corré: npx tsx tests/unit/test-date-formatters.ts
 */
import { formatDate, formatDateLong, formatDateTime, hasTimeOfDay } from '../../app/utils/contract'

// ---------------------------------------------------------------- referencia
// Copia literal de la implementación anterior al 05-09-2026.

function oldFormatDate(d?: Date | string | null): string {
  if (!d) return '—'
  const date = d instanceof Date ? d : new Date(d)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('es-UY', {
    day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC',
  }).format(date)
}

function oldFormatDateLong(d?: Date | string | null): string {
  if (!d) return '—'
  const date = d instanceof Date ? d : new Date(d)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('es-UY', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  }).format(date)
}

function oldFormatDateTime(d?: Date | string | null): string {
  if (!d) return '—'
  const date = d instanceof Date ? d : new Date(d)
  if (Number.isNaN(date.getTime())) return '—'
  if (!hasTimeOfDay(date)) return oldFormatDate(date)
  return new Intl.DateTimeFormat('es-UY', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC',
  }).format(date)
}

// ---------------------------------------------------------------------- casos
let failures = 0
let checks = 0

function same(label: string, got: string, want: string) {
  checks += 1
  if (got === want) return
  failures += 1
  console.error(`  FAIL ${label}\n       nuevo: ${JSON.stringify(got)}\n       viejo: ${JSON.stringify(want)}`)
}

const CASES: Array<Date | string | null | undefined> = [
  null, undefined, '', 'no-es-fecha', 'NaN',
  '2026-07-01T00:00:00.000Z',
  '2026-09-30T15:00:00.000Z',
  '2002-01-01T00:00:00.000Z',
  '2026-12-31T23:59:00.000Z',
  '2024-02-29T00:00:00.000Z',
  '2026-01-01T00:30:00.000Z',
  '2026-06-15T09:05:00.000Z',
  new Date('2026-07-01T00:00:00.000Z'),
  new Date('2026-03-08T12:00:00.000Z'),
  new Date(0),
]

console.log('casos explícitos:')
for (const c of CASES) {
  same(`formatDate(${String(c)})`, formatDate(c), oldFormatDate(c))
  same(`formatDateLong(${String(c)})`, formatDateLong(c), oldFormatDateLong(c))
  same(`formatDateTime(${String(c)})`, formatDateTime(c), oldFormatDateTime(c))
}
console.log(`  ${checks} comparaciones`)

// Barrido: un día de cada mes de cada año del corpus, más horas del día.
console.log('barrido del corpus (2002-2026):')
const before = checks
for (let y = 2002; y <= 2026; y++) {
  for (let m = 0; m < 12; m++) {
    for (const [d, h, min] of [[1, 0, 0], [15, 9, 5], [28, 23, 59]] as const) {
      const iso = new Date(Date.UTC(y, m, d, h, min)).toISOString()
      same(`formatDate(${iso})`, formatDate(iso), oldFormatDate(iso))
      same(`formatDateLong(${iso})`, formatDateLong(iso), oldFormatDateLong(iso))
      same(`formatDateTime(${iso})`, formatDateTime(iso), oldFormatDateTime(iso))
    }
  }
}
console.log(`  ${checks - before} comparaciones`)

// El UTC es la razón por la que existe este código. Fijalo con un caso duro:
// medianoche del 1 de julio NO puede mostrarse como 30 de junio.
console.log('la fecha de medianoche NO se corre un día:')
const midnight = formatDate('2026-07-01T00:00:00.000Z')
if (!midnight.includes('01')) {
  console.error(`  FAIL medianoche del 1 de julio se muestra como ${JSON.stringify(midnight)}`)
  failures += 1
}
else { console.log(`  ok  ${midnight}`) }
checks += 1

// Una hora de cierre se muestra tal cual la estampó el feed, sin convertir.
const closing = formatDateTime('2026-09-30T15:00:00.000Z')
if (!closing.includes('15:00')) {
  console.error(`  FAIL el cierre de las 15:00 se muestra como ${JSON.stringify(closing)}`)
  failures += 1
}
else { console.log(`  ok  ${closing}`) }
checks += 1

// -------------------------------------------------------------- rendimiento
const N = 100_000
const sample = '2026-07-01T00:00:00.000Z'
let t = process.hrtime.bigint()
for (let i = 0; i < N; i++) oldFormatDate(sample)
const oldMs = Number(process.hrtime.bigint() - t) / 1e6
t = process.hrtime.bigint()
for (let i = 0; i < N; i++) formatDate(sample)
const newMs = Number(process.hrtime.bigint() - t) / 1e6

console.log(`\nrendimiento sobre ${N.toLocaleString('es-UY')} llamadas a formatDate:`)
console.log(`  viejo: ${oldMs.toFixed(0)} ms`)
console.log(`  nuevo: ${newMs.toFixed(0)} ms`)
console.log(`  mejora: ${(oldMs / newMs).toFixed(1)}x`)

if (failures > 0) {
  console.error(`\n${failures} de ${checks} comparaciones fallaron`)
  process.exit(1)
}
console.log(`\ntodas las ${checks.toLocaleString('es-UY')} comparaciones dieron igual`)

if (newMs > oldMs) {
  console.error('\nla version memoizada NO es mas rapida; algo esta mal')
  process.exit(1)
}
