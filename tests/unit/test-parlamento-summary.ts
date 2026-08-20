/**
 * Los invariantes de /parlamento: las reglas que separan «informar sobre una
 * sesión» de «publicar lo que una máquina creyó escuchar».
 *
 * Cada caso de acá salió de una corrida real sobre la sesión del Senado del
 * 2026-08-12, seis horas y 32.510 palabras de subtitulado automático.
 */
import assert from 'node:assert/strict'
import {
  chunkSegments,
  findOpinion,
  findRiskyNumbers,
  formatTimestamp,
  gateTopics,
  looksMojibake,
  sameTopic,
  refineTimestamp,
  sessionDateFromTitle,
  stripRiskyNumbers,
  youtubeAt,
} from '../../shared/parlamento/summary'

// ─── Troceo ──────────────────────────────────────────────────────────────────

const segments = Array.from({ length: 300 }, (_, i) => ({
  t: i * 10,
  txt: `palabra${i} de relleno para llegar al corte por palabras`,
}))

const blocks = chunkSegments(segments, 200)
assert.ok(blocks.length > 1, 'la transcripción larga se corta en varios bloques')
assert.equal(blocks[0]!.tStart, 0, 'el primer bloque arranca donde arranca el video')
for (const [i, b] of blocks.entries()) {
  assert.ok(b.tEnd >= b.tStart, `bloque ${i}: el final no puede ser anterior al inicio`)
  assert.ok(b.text.length > 0, `bloque ${i}: sin texto`)
}
// Los bloques cubren el video en orden y sin saltar hacia atrás.
for (let i = 1; i < blocks.length; i++) {
  assert.ok(blocks[i]!.tStart >= blocks[i - 1]!.tStart, 'los bloques van hacia adelante')
}
assert.deepEqual(chunkSegments([], 200), [], 'sin segmentos no hay bloques')

// ─── El filtro de opinión ────────────────────────────────────────────────────

// Las tres frases las escribió el modelo en la primera corrida real, con la
// instrucción de no opinar puesta.
assert.equal(findOpinion('Se celebró la habilitación de la planta'), 'se celebró')
assert.equal(findOpinion('Esto es importante para la zona'), 'es importante')
assert.equal(findOpinion('Genera esperanza para 300 familias'), 'genera esperanza')
assert.equal(findOpinion('Se discutió la situación del puerto'), null, 'informar no es opinar')
assert.equal(findOpinion('El Senado votó el proyecto en general'), null)

// ─── Las cifras que el subtitulado inventa ───────────────────────────────────

assert.equal(findRiskyNumbers('un aumento de 3,5%'), '3,5%')
assert.equal(findRiskyNumbers('costó 1.250.000 pesos'), '1.250.000')
assert.equal(findRiskyNumbers('se destinaron 20 millones'), '20 millones')
assert.equal(findRiskyNumbers('la ley de 1985'), null, 'un año no se confunde en el subtitulado')
assert.equal(findRiskyNumbers('votaron 20 senadores'), null, 'un entero chico no es el riesgo')

// La cifra se lleva su oración, no el tema entero: descartar el tema costaba la
// cuota de género de aquella sesión sólo porque el resumen decía «30%».
const stripped = stripRiskyNumbers('Se debatió el proyecto. La cuota sería de 30% del total. Pasa a Diputados.')
assert.ok(!stripped.text.includes('30%'), 'la oración con la cifra se va')
assert.ok(stripped.text.includes('Se debatió el proyecto'), 'el resto del tema queda')
assert.ok(stripped.text.includes('Pasa a Diputados'), 'y también lo que venía después')
// La oración cortada no se tira: viaja al bloque de cifras con su contexto.
assert.deepEqual(stripped.removed, [{ value: '30%', sentence: 'La cuota sería de 30% del total.' }])

// ─── El portón ───────────────────────────────────────────────────────────────

const gated = gateTopics([
  { title: 'Puerto de Montevideo', explanation: 'Se discutió su caída en los rankings.', whyItMatters: 'Afecta al empleo portuario.', t: 540 },
  { title: 'Frigorífico', explanation: 'Se celebró la reapertura de la planta.', whyItMatters: '', t: 1200 },
  { title: 'Presupuesto', explanation: 'Se discutió una partida para el hospital. El monto sería de 1.500.000 pesos.', whyItMatters: 'Toca la atención en la zona.', t: 1800 },
  { title: 'Fuera del video', explanation: 'Algo que pasó después del final.', whyItMatters: '', t: 99_999 },
  { title: '', explanation: '', whyItMatters: '', t: 10 },
], 22_000)

const kept = gated.kept.map(k => k.title)
assert.ok(kept.includes('Puerto de Montevideo'), 'el tema que informa entra')
assert.ok(!kept.includes('Frigorífico'), 'el tema que celebra no entra')
assert.ok(kept.includes('Presupuesto'), 'el tema con cifra entra sin la oración de la cifra')
// Un tema cuya ÚNICA oración era la cifra sí se cae: sin ella no queda nada que contar.
const onlyNumber = gateTopics([{ title: 'Partida', explanation: 'Se votó una partida de 1.500.000 pesos.', whyItMatters: '', t: 100 }], 22_000)
assert.equal(onlyNumber.kept.length, 0)
const presupuesto = gated.kept.find(k => k.title === 'Presupuesto')!
assert.ok(!presupuesto.explanation.includes('1.500.000'), 'la cifra sale de la prosa')
assert.equal(presupuesto.figures?.length, 1, 'y queda guardada aparte')
assert.equal(presupuesto.figures![0]!.value, '1.500.000')
assert.ok(presupuesto.figures![0]!.sentence.includes('El monto sería'), 'la cifra se guarda con su oración')
assert.ok(!kept.includes('Fuera del video'), 'un minuto que no existe en el video no entra')
assert.ok(!kept.includes(''), 'un tema vacío no entra')
assert.ok(gated.rejected.length >= 3, 'lo descartado queda registrado para poder auditarlo')

// El mismo asunto contado dos veces: el modelo devolvió estos dos títulos en la
// misma sesión, y el lector los leía como si el Senado lo hubiera tratado dos veces.
assert.equal(sameTopic('Nuevos cupos para mujeres y disidencias en la música', 'Más mujeres y disidencias en la música'), true)
assert.equal(sameTopic('Situación del Puerto de Montevideo', 'Habilitación de CTI neonatal en Rivera'), false)
const twins = gateTopics([
  { title: 'Cupos para mujeres y disidencias en la música', explanation: 'Se debatió el proyecto.', whyItMatters: '', t: 2800 },
  { title: 'Más mujeres y disidencias en la música', explanation: 'Se volvió sobre el mismo proyecto.', whyItMatters: '', t: 4200 },
], 22_000)
assert.equal(twins.kept.length, 1, 'el repetido no entra')
assert.equal(twins.kept[0]!.t, 2800, 'queda el primero, que trae el minuto más temprano')
assert.ok(twins.rejected.some(r => r.startsWith('repetido de')))

// ─── El minuto ───────────────────────────────────────────────────────────────

const real = [
  { t: 0, txt: 'buenas tardes, damos comienzo a la sesión' },
  { t: 600, txt: 'pasamos al asunto del puerto de montevideo y su situación' },
  { t: 1200, txt: 'ahora el proyecto sobre cuotas en espectáculos musicales' },
]
assert.equal(refineTimestamp('Puerto de Montevideo', real, 0), 600, 'el minuto se afina hasta donde se lo nombra')
assert.equal(refineTimestamp('Tema que nadie mencionó', real, 300), 300, 'sin coincidencias queda el minuto del bloque')
assert.equal(refineTimestamp('salud', real, 300), 300, 'una palabra suelta no alcanza para mover el minuto')

assert.equal(formatTimestamp(0), '0:00')
assert.equal(formatTimestamp(95), '1:35')
assert.equal(formatTimestamp(4530), '1:15:30')
assert.equal(youtubeAt('abc123', 4530), 'https://www.youtube.com/watch?v=abc123&t=4530s')

// ─── La fecha de la sesión ───────────────────────────────────────────────────

const fallback = new Date('2026-08-19T00:00:00Z')
// El video se sube al otro día, así que la fecha del título manda sobre la de publicación.
assert.equal(
  sessionDateFromTitle('Cámara de Senadores| 18/08/2026 | República Oriental del Uruguay', fallback).toISOString().slice(0, 10),
  '2026-08-18',
)
assert.equal(
  sessionDateFromTitle('Cámara de Representantes. Sesión especial. Lunes 17 de agosto de 2026, hora 09:00', fallback).toISOString().slice(0, 10),
  '2026-08-17',
)
assert.equal(sessionDateFromTitle('Sesión sin fecha en el título', fallback).toISOString(), fallback.toISOString())

// ─── La guarda de encoding ───────────────────────────────────────────────────

assert.equal(looksMojibake('El Senado debatió la situación del puerto'), false)
assert.equal(looksMojibake('El Senado debati\nuevo la situaci\nuevon'), true, 'el salto dentro de la palabra es el síntoma')
assert.equal(looksMojibake('La sesiÃ³n del Senado'), true, 'UTF-8 leído como Latin-1')
// Los campos del resumen son frases: un salto de línea ahí ya es un síntoma, y en
// aquella corrida apareció exactamente donde iban las tildes.
assert.equal(looksMojibake('Una sesión\ncon salto de línea'), true, 'una frase no lleva saltos')
assert.equal(looksMojibake(''), false, 'el campo vacío no es mojibake')
// La segunda forma del mismo desastre, de otra corrida: una barra donde iba la tilde.
assert.equal(looksMojibake('la m\\sica de la sesión'), true, 'la barra pegada a una letra')
// La comilla no alcanza como señal: una cita legítima la usa igual.
assert.equal(looksMojibake('Dijo "no" a la propuesta'), false)

console.log('✓ parlamento: troceo, opinión, cifras, portón, minutos, fechas y encoding')
