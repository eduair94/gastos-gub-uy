/**
 * Unit tests for the JUTEP inciso resolver (shared/jutep-incisos.ts).
 *
 * Pure functions only — no database, no network, no env. Run with:
 *   npx tsx tests/unit/test-jutep-incisos.ts
 */

import { knownIncisoCodes, maskDocument, normalizeIncisoName, resolveIncisoCode } from '../../shared/jutep-incisos'

let passed = 0
let failed = 0

function check(name: string, condition: boolean, detail = ''): void {
  if (condition) {
    passed++
    console.log(`  ✓ ${name}`)
  }
  else {
    failed++
    console.error(`  ✗ ${name}${detail ? ` -> ${detail}` : ''}`)
  }
}

console.log('🧪 JUTEP inciso resolver')
console.log('========================')

console.log('\n📊 normalizeIncisoName')
{
  check('strips accents', normalizeIncisoName('MINISTERIO DE SALUD PÚBLICA') === 'MINISTERIO DE SALUD PUBLICA')
  check('uppercases', normalizeIncisoName('poder judicial') === 'PODER JUDICIAL')
  check('collapses whitespace', normalizeIncisoName('  PODER   JUDICIAL  ') === 'PODER JUDICIAL')
  check('drops commas so a quoted field matches', normalizeIncisoName('MINISTERIO DE GANADERÍA, AGRICULTURA Y PESCA') === 'MINISTERIO DE GANADERIA AGRICULTURA Y PESCA')
  check('null-safe', normalizeIncisoName(null) === '' && normalizeIncisoName(undefined) === '')
}

console.log('\n📊 resolveIncisoCode — departmental governments')
{
  // The 19 departments map onto 80…98, the same numbering shared/organism-groups.ts uses.
  check('Montevideo -> 98', resolveIncisoCode('GOBIERNO DEPARTAMENTAL DE MONTEVIDEO') === '98')
  check('Artigas -> 80', resolveIncisoCode('GOBIERNO DEPARTAMENTAL DE ARTIGAS') === '80')
  check('Treinta y Tres -> 97', resolveIncisoCode('GOBIERNO DEPARTAMENTAL DE TREINTA Y TRES') === '97')
  check('San José, accented in the file -> 94', resolveIncisoCode('GOBIERNO DEPARTAMENTAL DE SAN JOSÉ') === '94')
  check('Paysandú accented -> 89', resolveIncisoCode('GOBIERNO DEPARTAMENTAL DE PAYSANDÚ') === '89')
  check('Paysandu unaccented, as also published -> 89', resolveIncisoCode('GOBIERNO DEPARTAMENTAL DE PAYSANDU') === '89')
}

console.log('\n📊 published typos still resolve')
{
  // These are real strings in the JUTEP file; 28 and 9 rows respectively.
  check('"DURANO" -> Durazno (84)', resolveIncisoCode('GOBIERNO DEPARTAMENTAL DE DURANO') === '84')
  check('"TACUAREMBOÓ" -> Tacuarembó (96)', resolveIncisoCode('GOBIERNO DEPARTAMENTAL DE TACUAREMBOÓ') === '96')
  check('"MINISTERIO DE ECONOMIA" unaccented -> 5', resolveIncisoCode('MINISTERIO DE ECONOMIA') === '5')
  check('"MINISTERIO DE ECONOMÍA" accented -> 5', resolveIncisoCode('MINISTERIO DE ECONOMÍA') === '5')
  check('"MINISTERIO DE INDUSTRÍA, ENERGÍA Y MINERÍA" -> 8', resolveIncisoCode('MINISTERIO DE INDUSTRÍA, ENERGÍA Y MINERÍA') === '8')
}

console.log('\n📊 national bodies verified against the corpus')
{
  check('Poder Judicial -> 16', resolveIncisoCode('PODER JUDICIAL') === '16')
  check('Ministerio del Interior -> 4', resolveIncisoCode('MINISTERIO DEL INTERIOR') === '4')
  check('Salud Pública -> 12', resolveIncisoCode('MINISTERIO DE SALUD PÚBLICA') === '12')
  check('Fiscalía General -> 33', resolveIncisoCode('FISCALÍA GENERAL DE LA NACIÓN') === '33')
  check('ANTEL -> 65', resolveIncisoCode('ANTEL') === '65')
  check('BSE -> 53', resolveIncisoCode('BANCO DE SEGUROS DEL ESTADO') === '53')
}

console.log('\n📊 never guesses')
{
  // A body that is not a procurement buyer must resolve to null, NOT to a fuzzy nearest match:
  // a wrong join would attribute one organism's omisos to another.
  check('COLEGIO MEDICO -> null (not a state buyer)', resolveIncisoCode('COLEGIO MEDICO') === null)
  check('unknown text -> null', resolveIncisoCode('ALGO QUE NO EXISTE') === null)
  check('empty -> null', resolveIncisoCode('') === null && resolveIncisoCode(null) === null)
  // A partial match must not succeed either.
  check('a prefix of a known label -> null', resolveIncisoCode('MINISTERIO DE') === null)
}

console.log('\n📊 the map itself')
{
  const codes = knownIncisoCodes()
  check('every code is a positive integer string', codes.every(c => /^\d+$/.test(c) && Number(c) > 0), codes.join(','))
  check('the 19 departments are all covered', [80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98].every(n => codes.includes(String(n))))
  check('no code is duplicated in the returned set', new Set(codes).size === codes.length)
}

console.log('\n📊 maskDocument')
{
  check('keeps only the last three digits', maskDocument('4162485') === '•••485')
  check('strips separators first', maskDocument('4.162.485-3') === '•••853', String(maskDocument('4.162.485-3')))
  check('too short -> null', maskDocument('12') === null)
  check('null-safe', maskDocument(null) === null && maskDocument(undefined) === null)
  check('never returns the full number', !String(maskDocument('4162485')).includes('4162485'))
}

console.log('\n========================')
console.log(`${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
