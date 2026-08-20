/**
 * El portón de las cifras: entra la que suena en la transcripción, y nada más.
 *
 * El caso que abre el archivo es real. La Asamblea General del 15/07/2026 habló
 * de 160 millones de dólares en juicios por medicamentos, y el resumen publicaba
 * el tema sin la cifra.
 *
 * Corré:
 *   npx tsx tests/unit/test-parlamento-figures.ts
 */
import assert from 'node:assert/strict'
import {
  belongsToTopic,
  digitsOf,
  dropRepeatedFigures,
  findFigureEvidence,
  gateFigures,
  isDateLike,
  isProceduralFigure,
  sameNumber,
  scaleOf,
  topicWindow,
} from '../../shared/parlamento/figures'

// ─── Leer el número ──────────────────────────────────────────────────────────

assert.deepEqual(digitsOf('160 millones de dólares'), ['160'])
assert.deepEqual(digitsOf('costó 1.250.000 pesos'), ['1250000'], 'los separadores de miles se van')
assert.deepEqual(digitsOf('un aumento de 3,5%'), ['3,5'], 'la coma decimal NO es separador de miles')
assert.deepEqual(digitsOf('sin números'), [])
assert.deepEqual(digitsOf('los artículos 2, 3, 4 y 5'), ['2', '3', '4', '5'])

assert.equal(scaleOf('160 millones'), 'millones')
assert.equal(scaleOf('30%'), '%')
assert.equal(scaleOf('30 por ciento'), '%', 'la escala escrita en palabras es la misma')
assert.equal(scaleOf('17 comisarios'), null, 'un número pelado no tiene escala')

// El modelo escribe «1.500» y el subtitulado «1500». Es el mismo número.
assert.equal(sameNumber('1.500', '1500'), true)
assert.equal(sameNumber('1500', '1.500'), true)
assert.equal(sameNumber('3,5', '3.5'), true)
assert.equal(sameNumber('160', '1600'), false)

// ─── La prueba en la transcripción ───────────────────────────────────────────

const segments = [
  { t: 100, txt: 'buenas tardes, damos comienzo a la sesión' },
  { t: 900, txt: 'se gastaron más de 160 millones de dólares en juicios de amparo' },
  { t: 1500, txt: 'el artículo 160 del reglamento dice otra cosa' },
  { t: 2400, txt: 'la cuota sería de 30% de la programación musical' },
  { t: 3000, txt: 'son 1500 familias las que esperan' },
]

assert.equal(findFigureEvidence(segments, '160 millones', 0, 4000), 900)
// El mismo número sin la escala es OTRO dato: 160 millones no es el artículo 160.
assert.equal(findFigureEvidence(segments, '160 millones', 1400, 4000), null, 'el artículo 160 no alcanza')
assert.equal(findFigureEvidence(segments, '160', 1400, 4000), 1500, 'sin escala, el 160 pelado sí')
assert.equal(findFigureEvidence(segments, '30%', 0, 4000), 2400)
assert.equal(findFigureEvidence(segments, '1.500', 0, 4000), 3000, 'el separador de miles no rompe el cruce')
assert.equal(findFigureEvidence(segments, '999 millones', 0, 4000), null, 'lo que no suena no entra')
assert.equal(findFigureEvidence(segments, 'sin dígitos', 0, 4000), null)
// La ventana manda: la cifra tiene que sonar mientras se hablaba del tema.
assert.equal(findFigureEvidence(segments, '160 millones', 1000, 4000), null)

// ─── El número que es mecánica de sala ───────────────────────────────────────

// Las cuatro salieron de la primera corrida real, con la instrucción de
// ignorarlas puesta en el prompt.
assert.equal(isProceduralFigure('12 en 13', '12 en 13 votos se votó el envío de la exposición escrita.'), true)
assert.equal(isProceduralFigure('13 12', '13 12 votos se votó el envío de la exposición escrita.'), true)
assert.equal(isProceduralFigure('11/21', 'Se considera la resolución 11/21 del grupo Mercado Común.'), true)
assert.equal(isProceduralFigure('26 de agosto del 2021', 'La resolución es del 26 de agosto del 2021.'), true)
assert.equal(isProceduralFigure('184', 'La redacción dada por el artículo 184 de la ley.'), true)

// El reloj de la sesión y la lista de oradores tampoco son un dato.
assert.equal(isProceduralFigure('10 horas', 'Se llevan 10 horas de sesión.'), true)
assert.equal(isProceduralFigure('22', 'Hay 22 oradores anotados de un total de 70.'), true)
assert.equal(isProceduralFigure('20 horas', 'Faltarían 20 horas más si se sigue al mismo ritmo.'), true)

// Y el dato del país no se toca.
assert.equal(isProceduralFigure('160 millones', 'Los juicios de amparo alcanzaron los 160 millones de dólares.'), false)
assert.equal(isProceduralFigure('2.200', 'Más de 2.200 acciones judiciales iniciadas en 2025.'), false)
assert.equal(isProceduralFigure('40%', 'En Uruguay disminuyó un 40% la natalidad en 10 años.'), false)
assert.equal(isProceduralFigure('8000', 'Hay unas 8000 personas con la visión totalmente comprometida.'), false)

// ─── El portón ───────────────────────────────────────────────────────────────

const gated = gateFigures(
  [
    { value: '160 millones', sentence: 'Se gastaron más de 160 millones de dólares en juicios por medicamentos.' },
    { value: '999 millones', sentence: 'El presupuesto sería de 999 millones de dólares.' },
    { value: '30%', sentence: 'La cuota sería de 30% de la programación.' },
    { value: '', sentence: 'Una frase sin cifra.' },
    { value: '1500', sentence: 'Muchas familias esperan una solución.' },
  ],
  segments,
  0,
  4000,
)

const kept = gated.kept.map(f => f.value)
assert.deepEqual(kept, ['160 millones', '30%'], 'sólo entra lo que la transcripción dice')
assert.equal(gated.kept[0]!.t, 900, 'la cifra viaja con el segundo donde suena')
assert.equal(gated.kept[1]!.t, 2400)
// Lo descartado queda registrado, con el motivo.
assert.ok(gated.rejected.some(r => r.includes('999 millones')), 'la cifra inventada se registra')
assert.ok(gated.rejected.some(r => r.includes('la frase no trae el número')), 'la frase sin número también')
assert.equal(gated.rejected.length, 3)

assert.deepEqual(gateFigures([], segments, 0, 4000), { kept: [], rejected: [] })

// ─── El año suelto y el tema ajeno ───────────────────────────────────────────

// Las tres salieron del homenaje a Circe Maia. Un año no dice de cuánto se hablaba.
assert.equal(isDateLike('2023'), true)
assert.equal(isDateLike('1972'), true)
// El período de años del Plan Quinquenal tampoco dice de cuánto se hablaba.
assert.equal(isDateLike('2025-2029'), true)
assert.equal(isDateLike('160 millones'), false)
assert.equal(isDateLike('2.200'), false, 'un número de cuatro dígitos con punto no es un año')
assert.equal(isDateLike('30%'), false)
assert.equal(isDateLike('sin dígitos'), false)

// El tramo de un tema llega hasta el tema siguiente, y eso puede ser media hora.
// En la sesión del 18/08 el tramo del tema arrocero se tragó una exposición sobre
// enfermería y le colgó «20.262 auxiliares de enfermería».
const arrocero = {
  title: 'Conexión ferroviaria para el sector arrocero',
  explanation: 'Se planteó recuperar servicios ferroviarios para conectar la producción arrocera con el puerto.',
  t: 1898,
}
assert.equal(belongsToTopic('En la zona este está el 70% de la producción nacional de arroz.', arrocero, 1988), true)
assert.equal(belongsToTopic('Hay 20.262 auxiliares de enfermería en actividad en Uruguay.', arrocero, 2235), false)
// Pegada al minuto del tema, la cifra es suya aunque las palabras no crucen.
assert.equal(belongsToTopic('Son 8.000 los que esperan.', arrocero, 1950), true)
assert.equal(belongsToTopic('Son 8.000 los que esperan.', arrocero, 2400), false)
assert.equal(belongsToTopic('Son 8.000 los que esperan.', arrocero, null), false, 'sin minuto no hay vínculo')

const offTopic = gateFigures(
  [
    { value: '160 millones', sentence: 'Los juicios por medicamentos alcanzaron 160 millones de dólares.' },
    { value: '1987', sentence: 'La obra se publicó en 1987.' },
  ],
  segments,
  0,
  4000,
  { title: 'Juicios por medicamentos caros', explanation: 'Se habló del gasto en juicios de amparo.', t: 880 },
)
assert.deepEqual(offTopic.kept.map(f => f.value), ['160 millones'])
assert.ok(offTopic.rejected.some(r => r.includes('fecha, no es una cifra')))

// ─── La misma cifra en dos temas ─────────────────────────────────────────────

// Dos temas que arrancan cerca aceptan la misma cifra por cercanía. El lector la
// leería como dos datos distintos.
const repeated = dropRepeatedFigures([
  [{ value: '9345', sentence: 'Se terminaron 9345 soluciones habitacionales.', t: 1444 }],
  [
    { value: '9.345', sentence: 'Fueron 9.345 las soluciones terminadas.', t: 1444 },
    { value: '19674', sentence: 'Hay 19674 soluciones en ejecución.', t: 1449 },
  ],
])
assert.equal(repeated[0]!.length, 1, 'la primera se queda con la cifra')
assert.deepEqual(repeated[1]!.map(f => f.value), ['19674'], 'la repetida se cae, la propia queda')
assert.deepEqual(dropRepeatedFigures([[], []]), [[], []])

// La misma frase con otra cifra es un solo hecho: salió tres veces, una por número.
const sameSentence = dropRepeatedFigures([[
  { value: '2500', sentence: 'El bono de 2500 pesos alcanzó a 114.337 estudiantes.', t: 1679 },
  { value: '114337', sentence: 'El bono de 2500 pesos alcanzó a 114.337 estudiantes.', t: 1679 },
]])
assert.equal(sameSentence[0]!.length, 1)

// ─── El tramo de cada tema ───────────────────────────────────────────────────

const topics = [{ t: 100 }, { t: 900 }, { t: 2400 }]
assert.deepEqual(topicWindow(topics, 0, 4000), { from: 70, to: 900 })
assert.deepEqual(topicWindow(topics, 1, 4000), { from: 870, to: 2400 })
assert.deepEqual(topicWindow(topics, 2, 4000), { from: 2370, to: 4000 }, 'el último llega hasta el final')
assert.equal(topicWindow([{ t: 10 }], 0, 0).from, 0, 'el tramo nunca arranca en negativo')

console.log('✓ parlamento/figures: dígitos, escala, prueba en la transcripción y portón')
