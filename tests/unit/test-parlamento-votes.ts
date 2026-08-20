/**
 * Las reglas que convierten «se debatió» en «se aprobó» o «no se aprobó».
 *
 * Cada caso de acá es texto REAL del subtitulado automático de la sesión del
 * Senado del 2026-08-18 (video uwT7te8CmBc, 59 recuentos) y de la de Diputados
 * del mismo día (ZyixIkw5CE4, 25 recuentos). Los dos casos que abren el archivo
 * son los que marcó un lector: el resumen contaba el debate y se callaba el
 * resultado.
 *
 * Corré:
 *   npx tsx tests/unit/test-parlamento-votes.ts
 */
import assert from 'node:assert/strict'
import {
  CHAMBER_SEATS,
  classifyTally,
  findVoteMoments,
  isGenericSubject,
  isProceduralContext,
  matchVotesToTopics,
  seatsOf,
  sharedWords,
  topicOutcome,
  type LabelledVote,
} from '../../shared/parlamento/votes'

// ─── El recuento ─────────────────────────────────────────────────────────────

assert.deepEqual(classifyTally(27, 27), { result: 'afirmativa', majority: 'unanimidad' })
assert.deepEqual(classifyTally(24, 26), { result: 'afirmativa', majority: 'dos-tercios' })
assert.deepEqual(classifyTally(17, 28), { result: 'afirmativa', majority: 'simple' })
// «Se vota 11 en 28 negativo», dijo la presidencia. El cálculo coincide.
assert.deepEqual(classifyTally(11, 28), { result: 'negativa', majority: 'simple' })
assert.deepEqual(classifyTally(0, 28), { result: 'negativa', majority: 'simple' })
// La mitad justa no alcanza: la mayoría simple pide MÁS de la mitad.
assert.equal(classifyTally(14, 28).result, 'negativa')
assert.equal(classifyTally(15, 28).result, 'afirmativa')

assert.equal(seatsOf('senadores'), 31)
assert.equal(seatsOf('representantes'), 99)
assert.equal(seatsOf('cámara inventada'), 130, 'una cámara desconocida usa el techo de la Asamblea')
assert.equal(CHAMBER_SEATS.asamblea, 130)

// ─── Encontrar las votaciones en la transcripción ────────────────────────────

// El caso que marcó el lector: el resumen decía que se «debatió y votó» la
// designación del rector de la UTEC y no decía si lo designaron.
const utec = findVoteMoments([
  { t: 21860, txt: 'como rector al señor Carlos Ignacio Batiani Dichiero.' },
  { t: 21874, txt: 'Se está considerando el artículo único. 27 en 27.' },
  { t: 21876, txt: '27 en 27. Por tanto, queda aprobada.' },
], 'senadores')
assert.equal(utec.length, 1, 'la línea que rueda en pantalla repite el recuento: se pliega')
assert.equal(utec[0]!.inFavor, 27)
assert.equal(utec[0]!.present, 27)
assert.equal(utec[0]!.result, 'afirmativa')
assert.equal(utec[0]!.majority, 'unanimidad')
assert.equal(utec[0]!.t, 21874, 'queda el primer segundo, que es donde se cantó')
assert.ok(utec[0]!.context.includes('Batiani'), 'el contexto trae lo que se votaba')

// El otro caso del lector: las ocho horas anuales para actividades escolares.
const escolares = findVoteMoments([
  { t: 25630, txt: 'quiere que lo tenemos que votar en general. Ahí está.' },
  { t: 25635, txt: 'Lo votamos en general. 28 en 28.' },
], 'senadores')
assert.equal(escolares.length, 1)
assert.equal(escolares[0]!.result, 'afirmativa')

// Dos votaciones distintas con el mismo recuento, a treinta segundos una de otra.
// Por eso la ventana de plegado es de veinte segundos y no de dos minutos.
const seguidas = findVoteMoments([
  { t: 942, txt: 'Corresponde votar el envío de la solicitud. 15 en 16.' },
  { t: 943, txt: 'La solicitud de envío, perdón. 15 en 16.' },
  { t: 974, txt: 'un ómnibus de la cooperativa UCOT. Eh, votamos el envío 15 en 16.' },
], 'senadores')
assert.equal(seguidas.length, 2, 'el repetido de un segundo se pliega; el de treinta no')
assert.deepEqual(seguidas.map(v => v.t), [942, 974])

// ─── La basura que hay que tirar ─────────────────────────────────────────────

// Un número de ley leído en voz alta. Ningún cuerpo tiene 202 bancas.
assert.equal(
  findVoteMoments([{ t: 100, txt: 'votamos el artículo 8 en 202 de la ley' }], 'representantes').length,
  0,
  'los presentes no pueden pasar las bancas de la cámara',
)
// El mismo par, en la Cámara equivocada.
assert.equal(findVoteMoments([{ t: 100, txt: 'se vota 72 en 75' }], 'senadores').length, 0)
assert.equal(findVoteMoments([{ t: 100, txt: 'se vota 72 en 75' }], 'representantes').length, 1)
// Sin verbo de votar cerca, dos números no son una votación.
assert.equal(
  findVoteMoments([{ t: 100, txt: 'llegaron 20 en 30 delegaciones al puerto' }], 'senadores').length,
  0,
)
// Los votos a favor no pueden pasar a los presentes.
assert.equal(findVoteMoments([{ t: 100, txt: 'votamos 30 en 20' }], 'senadores').length, 0)
// Un cuerpo de dos no existe.
assert.equal(findVoteMoments([{ t: 100, txt: 'votamos 1 en 2' }], 'senadores').length, 0)
assert.deepEqual(findVoteMoments([], 'senadores'), [])

// ─── La votación de trámite ──────────────────────────────────────────────────

// Once licencias de la sesión de Diputados del 18/08 salieron marcadas como
// decisiones de la cámara. La fórmula de Diputados es «se está votando. 68 en
// 69», sin decir qué, así que el modelo no tiene de dónde agarrarse.
assert.equal(isProceduralContext('Sin otro particular, saludo usted muy atentamente, senadora Bettiana Díaz Rey. Votamos la licencia. 24 en 25.'), true)
assert.equal(isProceduralContext('del 2026 convocándose el suplente siguiente señor Shintangen. Se está votando. 67 en 68.'), true)
assert.equal(isProceduralContext('Se está votando. 72 en 75 afirmativo. Y vamos a comenzar con las licencias.'), true)
assert.equal(isProceduralContext('Se vota el envío de la exposición escrita. 20 en 20.'), true)
assert.equal(isProceduralContext('para solicitar un cuarto intermedio de 20 minutos. Votamos la moción. 13 en 13.'), true)
assert.equal(isProceduralContext('Que se levante la sesión, señor presidente, está votando. 64 en 65.'), true)

// El asunto que escribió el modelo también es evidencia: en la sesión del 19/08 la
// fórmula quedó fuera de la cola del contexto y estas dos entraron como decisiones.
assert.equal(isProceduralContext('licencia del representante Walter Servini'), true)
assert.equal(isProceduralContext('convocatoria'), true)
assert.equal(isProceduralContext('convocándose al suplente siguiente'), true)

// Y lo que sí decide algo no se toca.
assert.equal(isProceduralContext('Se está considerando el artículo único. 27 en 27. Por tanto, queda aprobada.'), false)
assert.equal(isProceduralContext('Lo votamos en general. 28 en 28.'), false)
assert.equal(isProceduralContext('en el cargo de fiscal letrado departamental a la doctora Graciani. Se está considerando 20 en 20.'), false)
assert.equal(isProceduralContext('sin perjuicio económico. Votamos el sustitutivo 28 en 28.'), false)
assert.equal(isProceduralContext('artículos 170, 173, 174, 175, 176, 182 y 183'), false, 'desglosar artículos decide algo')
// Sólo se mira la cola: el trámite de hace cinco minutos no es lo que se vota.
assert.equal(
  isProceduralContext('Votamos la licencia del senador Pérez. 24 en 25. ' + 'x'.repeat(200) + ' Votamos el proyecto en general. 28 en 28.'),
  false,
  'la marca vieja no alcanza',
)

// ─── Atar cada votación a su tema ────────────────────────────────────────────

const vote = (subject: string, scope: LabelledVote['scope'], t: number, inFavor: number, present: number): LabelledVote => ({
  t,
  inFavor,
  present,
  subject,
  scope,
  context: '',
  ...classifyTally(inFavor, present),
})

const topics = [
  { title: 'Designación del rector de la UTEC', explanation: 'El Senado trató la venia para el rector de la Universidad Tecnológica.', t: 19600 },
  { title: 'Horas pagas para actividades escolares', explanation: 'Se trató un régimen de horas anuales para actividades escolares de los hijos.', t: 25000 },
  { title: 'Situación del hospital de Maldonado', explanation: 'Se pidió información sobre la emergencia del hospital.', t: 600 },
]

const votes = [
  vote('designación de Carlos Ignacio Batiani como rector de la UTEC', 'general', 21874, 27, 27),
  vote('proyecto sobre horas anuales para actividades escolares', 'general', 25635, 28, 28),
  vote('licencia de la senadora Díaz Rey', 'tramite', 23692, 24, 25),
]

const matched = matchVotesToTopics(votes, topics)
assert.equal(matched[0], 0, 'la venia va al tema del rector')
assert.equal(matched[1], 1, 'las horas escolares van a su tema')
assert.equal(matched[2], -1, 'una licencia no es tema de nadie')

// La pista del modelo: la presidencia dijo sólo «lo votamos en general» y el
// proyecto se había nombrado media hora antes. No hay palabras que cruzar.
const generic = { ...vote('proyecto de ley en general', 'general', 25635, 28, 28), topicHint: 1 }
assert.equal(matchVotesToTopics([generic], topics)[0], 1, 'sin palabras compartidas, manda la pista')
// La pista tiene que respetar el orden de la sesión: primero se discute, después
// se vota. Una pista hacia adelante se tira, y NADA la reemplaza: el reloj no ata
// votaciones. El resumen cuenta ocho temas de seis horas, así que el tema en
// curso casi nunca es el que se está votando.
const backwards = { ...vote('proyecto de ley en general', 'general', 700, 28, 28), topicHint: 1 }
assert.equal(matchVotesToTopics([backwards], topics)[0], -1, 'no se vota lo que todavía no se trató')
// Una pista fuera de rango no rompe nada: se cae al cruce por palabras.
const outOfRange = { ...vote('designación del rector de la UTEC', 'general', 21874, 27, 27), topicHint: 99 }
assert.equal(matchVotesToTopics([outOfRange], topics)[0], 0)

// LA TRAMPA QUE COSTÓ UNA CORRIDA. El modelo mandó la venia de una fiscal al tema
// de los ascensos policiales: dos venias seguidas, asuntos distintos. Un asunto
// que nombra algo tiene que coincidir con el tema, aunque el modelo diga que sí.
const wrongHint = {
  ...vote('Designación de fiscal letrado departamental a la doctora Graciani Martínez', 'general', 3567, 20, 20),
  topicHint: 2,
}
assert.equal(matchVotesToTopics([wrongHint], topics)[0], -1, 'el asunto que no coincide no se ata a nada')
assert.equal(isGenericSubject('Proyecto de ley en general'), true)
assert.equal(isGenericSubject('artículo único'), true, 'la fórmula de sala no nombra el asunto')
assert.equal(isGenericSubject('designación de rector de la UTEC'), false)

// Una sola palabra compartida es casualidad: «situación» aparece en toda sesión.
assert.equal(
  matchVotesToTopics([vote('situación de una empresa del este', 'general', 900, 20, 20)], topics)[0],
  -1,
)
assert.equal(sharedWords('rector de la UTEC', 'Designación del rector'), 1)
// El singular tosco: la presidencia habla en plural y el resumen en singular.
assert.equal(
  sharedWords(
    'Venia para conferir ascenso a Comisario General',
    'Ascensos en la Policía Nacional. Se concedieron venias para el ascenso de comisarios mayores.',
  ),
  3,
  'venias/venia, ascensos/ascenso y comisarios/comisario cruzan',
)
assert.equal(sharedWords('el proyecto en general', 'proyecto general de ley'), 0, 'las palabras de trámite no cuentan')

// ─── El resultado del tema ───────────────────────────────────────────────────

assert.equal(topicOutcome([]), 'sin-votacion', 'sin votación no se afirma nada')
assert.equal(topicOutcome([vote('venia', 'general', 10, 27, 27)]), 'aprobado')
assert.equal(topicOutcome([vote('venia', 'general', 10, 11, 28)]), 'rechazado')
// Un aditivo rechazado no vuelve rechazado el proyecto que lo contiene.
assert.equal(
  topicOutcome([vote('aditivo al artículo 1', 'parcial', 10, 11, 28), vote('proyecto en general', 'general', 20, 28, 28)]),
  'aprobado',
)
// Sin votación de alcance general, los parciales tienen que coincidir.
assert.equal(topicOutcome([vote('artículo 1', 'parcial', 10, 28, 28), vote('artículo 2', 'parcial', 20, 27, 28)]), 'aprobado')
assert.equal(topicOutcome([vote('artículo 1', 'parcial', 10, 28, 28), vote('aditivo', 'parcial', 20, 11, 28)]), 'mixto')
assert.equal(topicOutcome([vote('aditivo', 'parcial', 10, 11, 28)]), 'rechazado')

console.log('✓ parlamento/votes: recuento, basura descartada, atado al tema y resultado')
