/**
 * Unit tests del lector de la parte dispositiva (shared/bjn-award.ts).
 *
 * Funciones puras: sin base, sin red. Correr con:
 *   npx tsx tests/unit/test-bjn-award.ts
 *
 * Las fixtures son TEXTO REAL de 16 sentencias publicadas en la Base de Jurisprudencia Nacional,
 * bajadas el 17-08-2026 (tests/fixtures/bjn-dispositivas.json). No son ejemplos inventados: cada
 * trampa que este módulo esquiva apareció en un fallo de verdad, y el test la nombra.
 *
 * La propiedad que sostiene todo el pipeline y que este archivo prueba: el lector NUNCA propone un
 * número que no esté escrito en la parte dispositiva. El segundo pase con LLM elige entre estos
 * candidatos, así que si acá no hay candidato, no hay cifra publicable.
 */

import {
  canPublishAmount,
  parseDispositive,
  parseUyAmount,
} from '../../shared/bjn-award'
import { parseHojaInsumo, parseHojaDate, sentenciaKey } from '../../shared/bjn-hoja'

import FIXTURES from '../fixtures/bjn-dispositivas.json'

interface Fixture {
  title: string
  procedimiento: string | null
  /** La cabecera de la Hoja de Insumo, hasta «Firmantes». */
  head: string
  dispositive: string | null
}

let passed = 0
let failed = 0

function check(name: string, condition: boolean, detail = ''): void {
  if (condition) {
    passed++
    console.log(`  ✓ ${name}`)
  } else {
    failed++
    console.error(`  ✗ ${name}${detail ? ` -> ${detail}` : ''}`)
  }
}

const fixtures = FIXTURES as Fixture[]
const byPrefix = (p: string): Fixture => {
  const f = fixtures.find(x => x.title.startsWith(p))
  if (!f) throw new Error(`fixture ausente: ${p}`)
  return f
}
/** El texto de la fixture ya empieza en el marcador; se le antepone narrativa para probar el corte. */
const withNarrative = (f: Fixture): string =>
  `Vistos y considerando. La actora reclamó U$S 999.999 por daño moral y $ 88.888 por daño material. ${f.dispositive ?? ''}`

console.log('la cabecera de la Hoja de Insumo')
{
  let read = 0
  for (const f of fixtures) if (parseHojaInsumo(f.head)) read++
  check(`se leen las ${fixtures.length} cabeceras`, read === fixtures.length, `${read}/${fixtures.length}`)

  const civil = parseHojaInsumo(byPrefix('46/2023').head)!
  check('46/2023 número', civil.numero === '46/2023', civil.numero)
  check('46/2023 sede con espacios y ordinal', civil.sede === 'Tribunal Apelaciones Civil 4ºTº', civil.sede)
  check('46/2023 tipo', civil.tipo === 'DEFINITIVA')
  check('46/2023 fecha en UTC', civil.fecha?.toISOString().slice(0, 10) === '2023-03-23', String(civil.fecha))
  check('46/2023 procedimiento', civil.procedimiento === 'PROCESO CIVIL ORDINARIO', String(civil.procedimiento))
  check('46/2023 año del número', civil.anio === 2023)

  // La sede lleva espacios y la ficha cambia de forma: el ancla son los enumerados, no las
  // posiciones. Estas dos fichas convivían y rompían cualquier conteo de palabras.
  check('ficha con guiones (2-58775/2009)', parseHojaInsumo(byPrefix('i460/2011').head)?.ficha === '2-58775/2009')
  check('ficha con espacios (2 61219 2009)', parseHojaInsumo(byPrefix('318/2010').head)?.ficha === '2 61219 2009')

  // TRAMPA: las sentencias viejas de la Suprema Corte traen «Sin datos» donde va la ficha. Exigir
  // un dígito ahí dejaba 4 de cada 16 sin leer.
  const vieja = parseHojaInsumo(byPrefix('202/2004').head)!
  check('«Sin datos» se lee como ausencia, no como ficha', vieja.ficha === null, String(vieja.ficha))
  check('202/2004 igual trae sede y procedimiento', vieja.sede === 'Suprema Corte de Justicia' && vieja.procedimiento === 'RECURSO DE CASACIÓN')

  check('varias materias se separan', parseHojaInsumo(byPrefix('318/2010').head)?.materias.length === 2)
  check('fecha inválida es null', parseHojaDate('31/02/2020') === null)
  check('fecha válida', parseHojaDate('20/10/2010')?.toISOString().slice(0, 10) === '2010-10-20')
  check('la clave natural une sede y número', sentenciaKey('Tribunal Apelaciones Civil 4ºTº', '46/2023') === 'tribunal-apelaciones-civil-4-t|46-2023', sentenciaKey('Tribunal Apelaciones Civil 4ºTº', '46/2023'))

  // El fuero sale de la cabecera y decide si la sentencia entra al corpus de dinero.
  const penal = parseHojaInsumo(byPrefix('141/2020').head)!
  check('141/2020 es fuero penal', penal.procedimiento === 'PROCESO PENAL ORDINARIO', String(penal.procedimiento))
}

console.log('\nparseUyAmount')
check('872.377 es ochocientos setenta y dos mil', parseUyAmount('872.377') === 872377)
check('10.000 es diez mil, no diez', parseUyAmount('10.000') === 10000)
check('1.234,56 respeta la coma decimal', parseUyAmount('1.234,56') === 1234.56)
check('3.500 es tres mil quinientos', parseUyAmount('3.500') === 3500)
check('texto sin dígitos es null', parseUyAmount('abc') === null)

console.log('\nel corte: el fallo está al final y la narrativa no cuenta')
{
  const f = byPrefix('46/2023')
  const p = parseDispositive(withNarrative(f), f.procedimiento)
  check('encuentra el marcador', p.found)
  check('no se lleva los U$S 999.999 reclamados', !p.awardCandidates.some(c => c.amount === 999999))
  check('la narrativa queda registrada aparte', p.narrativeAmounts.some(c => c.amount === 999999))
}

console.log('\ncaso limpio: 46/2023, ASSE condenada a $ 872.377')
{
  const f = byPrefix('46/2023')
  const p = parseDispositive(withNarrative(f), f.procedimiento)
  check('el verbo es condena', p.verb === 'condena', p.verb)
  check('candidato único', p.awardCandidates.length === 1, JSON.stringify(p.awardCandidates))
  check('monto 872.377 en pesos', p.awardCandidates[0]?.amount === 872377 && p.awardCandidates[0]?.currency === 'UYU')
  check('se puede publicar', canPublishAmount(p))
}

console.log('\nTRAMPA 1 — honorarios fictos no son una indemnización')
{
  const f = byPrefix('104/1996')
  const p = parseDispositive(withNarrative(f), f.procedimiento)
  check('el fallo desestima', p.verb === 'desestima', p.verb)
  check('los $ 3.500 de honorarios fictos quedan excluidos', p.awardCandidates.length === 0, JSON.stringify(p.awardCandidates))
  check('la exclusión queda registrada con motivo', p.excluded.some(e => /honorarios/.test(e.reason)), JSON.stringify(p.excluded))
  check('NO se puede publicar cifra', !canPublishAmount(p))
}
{
  const f = byPrefix('143/2007')
  const p = parseDispositive(withNarrative(f), f.procedimiento)
  check('143/2007 confirma sin condenar', p.verb === 'confirma', p.verb)
  check('sus $25.000 de honorarios fictos quedan excluidos', p.awardCandidates.length === 0, JSON.stringify(p.awardCandidates))
  check('NO se puede publicar cifra', !canPublishAmount(p))
}

console.log('\nTRAMPA 2 — «el 60% de U$S 10.000» condena a 6.000')
{
  const f = byPrefix('202/2004')
  const p = parseDispositive(withNarrative(f), f.procedimiento)
  const pct = p.awardCandidates.find(c => c.ofPercent === 60)
  check('resuelve el porcentaje', pct?.amount === 6000, JSON.stringify(p.awardCandidates))
  check('la moneda es dólares', pct?.currency === 'USD')
  check('NO ofrece los 10.000 crudos como candidato', !p.awardCandidates.some(c => c.amount === 10000))
}

console.log('\nTRAMPA 3 y 4 — condena real sin monto (se liquida después)')
{
  const f = byPrefix('121/2012')
  const p = parseDispositive(withNarrative(f), f.procedimiento)
  check('detecta la liquidación diferida (art. 378 CGP)', p.deferredLiquidation)
  check('NO publica cifra aunque haya números en el fallo', !canPublishAmount(p))
}
{
  const f = byPrefix('278/1994')
  const p = parseDispositive(withNarrative(f), f.procedimiento)
  check('278/1994 condena a ANEP', /ANEP/i.test(p.dispositive))
  check('sin monto en el fallo, no hay candidato', p.awardCandidates.length === 0, JSON.stringify(p.awardCandidates))
}

console.log('\nTRAMPA 5 — en penal el número son años de cárcel, no pesos')
for (const p of ['141/2020', '142/2014', '170/2015', '34/2019']) {
  const f = byPrefix(p)
  const parsed = parseDispositive(withNarrative(f), f.procedimiento)
  check(`${p} se marca como penal`, parsed.isPenal)
  check(`${p} no ofrece ningún candidato de dinero`, parsed.awardCandidates.length === 0)
  check(`${p} no se puede publicar con cifra`, !canPublishAmount(parsed))
}

console.log('\nTRAMPA 6 — costas y costos no son la condena buscada')
{
  const f = byPrefix('i460/2011')
  const p = parseDispositive(withNarrative(f), f.procedimiento)
  check('i460/2011 confirma con costas y sin candidatos', p.awardCandidates.length === 0, JSON.stringify(p.awardCandidates))
}

console.log('\nsin marcador de fallo no se publica nada')
{
  const f = byPrefix('22/2011')
  check('la fixture 22/2011 no trae marcador', f.dispositive === null)
  const p = parseDispositive('Un texto cualquiera sin parte dispositiva, con $ 500.000 sueltos.', null)
  check('found es false', !p.found)
  check('no hay candidatos', p.awardCandidates.length === 0)
  check('no se puede publicar', !canPublishAmount(p))
}

console.log('\nla propiedad que sostiene el pipeline')
{
  // Todo candidato tiene que estar literalmente escrito en la parte dispositiva. Si esto se rompe,
  // el verificador LLM podría "elegir" una cifra que la sentencia no dice.
  let checked = 0
  for (const f of fixtures) {
    if (!f.dispositive) continue
    const p = parseDispositive(withNarrative(f), f.procedimiento)
    for (const c of p.awardCandidates) {
      // El texto crudo del candidato, tal cual, tiene que estar en la parte dispositiva.
      check(`«${c.raw}» está escrito en el fallo de ${f.title.slice(0, 18)}`, p.dispositive.includes(c.raw), c.raw)
      checked++
    }
  }
  check(`se revisaron candidatos de las ${fixtures.length} fixtures`, checked >= 1, `${checked}`)
}

console.log('\nninguna fixture rompe el lector')
for (const f of fixtures) {
  const p = parseDispositive(withNarrative(f), f.procedimiento)
  check(`${f.title.slice(0, 30)} parsea sin excepción`, typeof p.found === 'boolean')
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
