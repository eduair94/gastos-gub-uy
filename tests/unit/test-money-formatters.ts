/**
 * Los formateadores memoizados tienen que dar EXACTAMENTE lo mismo que antes.
 *
 * `app/utils/money.ts` construía un `Intl.NumberFormat` por llamada. Ahora los
 * cachea, porque `formatNumber` sola era el 20% del CPU de un worker de
 * producción (perfil del 05-09-2026). La caché es una optimización pura: si
 * cambia un solo carácter de salida, cambia lo que lee la gente en el sitio.
 *
 * Esta prueba lleva la implementación VIEJA copiada abajo y compara las dos
 * sobre valores de borde y sobre un barrido grande.
 *
 * Corré: npx tsx tests/unit/test-money-formatters.ts
 */
import { formatCount, formatMoney, formatNumber } from '../../app/utils/money'

// ---------------------------------------------------------------- referencia
// Copia literal de la implementación anterior al 05-09-2026.

const CURRENCY_SYMBOL: Record<string, string> = {
  UYU: '$',
  USD: 'US$',
  EUR: '€',
  UYI: 'UI',
  UR: 'UR',
}

function oldFormatMoney(
  amount?: number | null,
  currency = 'UYU',
  opts: { compact?: boolean, decimals?: boolean } = {},
): string {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) return '—'
  const symbol = CURRENCY_SYMBOL[currency] ?? currency
  if (opts.compact && Math.abs(amount) >= 1_000_000) {
    const millions = amount / 1_000_000
    if (Math.abs(amount) >= 1_000_000_000) {
      return `${symbol} ${new Intl.NumberFormat('es-UY', {
        maximumFractionDigits: 2,
        minimumFractionDigits: 0,
      }).format(amount / 1_000_000_000)} mil M`
    }
    return `${symbol} ${new Intl.NumberFormat('es-UY', {
      maximumFractionDigits: millions >= 100 ? 0 : 1,
      minimumFractionDigits: 0,
    }).format(millions)} M`
  }
  return `${symbol} ${new Intl.NumberFormat('es-UY', {
    maximumFractionDigits: opts.decimals ? 2 : 0,
    minimumFractionDigits: opts.decimals ? 2 : 0,
  }).format(amount)}`
}

function oldFormatNumber(n?: number | null): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—'
  return new Intl.NumberFormat('es-UY').format(n)
}

function oldFormatCount(n?: number | null): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—'
  if (Math.abs(n) >= 1_000_000) {
    return `${new Intl.NumberFormat('es-UY', { maximumFractionDigits: 2 }).format(n / 1_000_000)} M`
  }
  if (Math.abs(n) >= 10_000) {
    return `${new Intl.NumberFormat('es-UY', { maximumFractionDigits: 1 }).format(n / 1000)} mil`
  }
  return new Intl.NumberFormat('es-UY').format(n)
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

// Bordes: nulos, cero, negativos, los saltos de escala, y el techo del corpus.
const VALUES: Array<number | null | undefined> = [
  null, undefined, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY,
  0, 1, -1, 0.5, -0.5, 0.005, 999, 1000, 9999, 10_000, 10_001,
  99_999, 100_000, 999_999, 1_000_000, 1_000_001, 1_500_000,
  99_999_999, 100_000_000, 999_999_999, 1_000_000_000, 1_234_567_890,
  2_193_411, 6_570_000_000_000, 30_900_000_000_000,
  -1_000_000, -1_500_000_000, 123.456, 1234.5678,
]

console.log('bordes:')
for (const v of VALUES) {
  same(`formatNumber(${v})`, formatNumber(v), oldFormatNumber(v))
  same(`formatCount(${v})`, formatCount(v), oldFormatCount(v))
  for (const cur of ['UYU', 'USD', 'EUR', 'UYI', 'UR', 'BRL']) {
    for (const opts of [{}, { compact: true }, { decimals: true }, { compact: true, decimals: true }]) {
      same(`formatMoney(${v}, ${cur}, ${JSON.stringify(opts)})`, formatMoney(v, cur, opts), oldFormatMoney(v, cur, opts))
    }
  }
}
console.log(`  ${checks} comparaciones de borde`)

// El ternario `millions >= 100` es el único punto donde la clave de caché
// depende del valor. Barrelo con densidad alrededor del salto.
console.log('salto de millions >= 100:')
const before = checks
for (let m = 90; m <= 110; m += 0.25) {
  const amount = m * 1_000_000
  same(`formatMoney(${amount}, compact)`, formatMoney(amount, 'UYU', { compact: true }), oldFormatMoney(amount, 'UYU', { compact: true }))
}
console.log(`  ${checks - before} comparaciones`)

// Barrido grande: si la caché devolviera un formateador equivocado, acá salta.
console.log('barrido de 20.000 valores:')
const before2 = checks
for (let i = 0; i < 20_000; i++) {
  const n = Math.round((Math.sin(i) * 0.5 + 0.5) * 10 ** (i % 13))
  same(`formatNumber(${n})`, formatNumber(n), oldFormatNumber(n))
  same(`formatCount(${n})`, formatCount(n), oldFormatCount(n))
  same(`formatMoney(${n}, compact)`, formatMoney(n, 'UYU', { compact: true }), oldFormatMoney(n, 'UYU', { compact: true }))
  same(`formatMoney(${n}, decimals)`, formatMoney(n, 'USD', { decimals: true }), oldFormatMoney(n, 'USD', { decimals: true }))
}
console.log(`  ${checks - before2} comparaciones`)

// Intercalá formas distintas para probar que una clave no pisa a otra.
console.log('intercalado de formas:')
const before3 = checks
for (let i = 0; i < 500; i++) {
  const n = 1_234_567 + i
  same('a', formatNumber(n), oldFormatNumber(n))
  same('b', formatMoney(n, 'UYU', { compact: true }), oldFormatMoney(n, 'UYU', { compact: true }))
  same('c', formatMoney(n, 'UYU', { decimals: true }), oldFormatMoney(n, 'UYU', { decimals: true }))
  same('d', formatCount(n), oldFormatCount(n))
  same('e', formatMoney(n * 1000, 'UYU', { compact: true }), oldFormatMoney(n * 1000, 'UYU', { compact: true }))
}
console.log(`  ${checks - before3} comparaciones`)

// -------------------------------------------------------------- rendimiento
const N = 200_000
let t = process.hrtime.bigint()
for (let i = 0; i < N; i++) oldFormatNumber(i)
const oldMs = Number(process.hrtime.bigint() - t) / 1e6

t = process.hrtime.bigint()
for (let i = 0; i < N; i++) formatNumber(i)
const newMs = Number(process.hrtime.bigint() - t) / 1e6

console.log(`\nrendimiento sobre ${N.toLocaleString('es-UY')} llamadas a formatNumber:`)
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
