/**
 * Cómo se votó cada asunto, sacado del recuento que canta la presidencia.
 *
 * EL PROBLEMA QUE RESUELVE. El resumen decía «se debatió la designación del
 * rector de la UTEC» y no decía si lo designaron. Un lector lo marcó. El dato
 * está en la transcripción y no se estaba usando.
 *
 * POR QUÉ ESTO SÍ SE PUEDE PUBLICAR, cuando una cifra suelta no. El recuento es
 * un ritual fijo: la presidencia dice «votamos la moción» y enseguida «26 en 27».
 * Medido sobre cuatro sesiones, el subtitulado automático lo escribe en DÍGITOS
 * y nunca en palabras: 59 recuentos en la sesión del Senado del 18/08/2026, 25 en
 * la de Diputados del mismo día. Además el par se valida solo — los votos a favor
 * no pueden pasar a los presentes, y los presentes no pueden pasar las bancas de
 * la cámara. Ese doble filtro tira la basura del tipo «8 en 202», que es un
 * número de ley leído en voz alta.
 *
 * LO QUE SIGUE SIN SER UN HECHO VERIFICADO. El recuento lo escuchó una máquina.
 * El asunto de cada votación lo escribe un modelo. Por eso cada votación viaja
 * con su segundo del video, y la página avisa arriba. La prueba es el video.
 *
 * Este módulo no tiene imports ni I/O: `tests/unit/test-parlamento-votes.ts` lo
 * corre entero.
 */

/** Bancas por cámara. Un recuento por encima de esto no es una votación. */
export const CHAMBER_SEATS: Record<string, number> = {
  senadores: 31,
  representantes: 99,
  asamblea: 130,
}

/** La Asamblea General es el techo: 99 diputados más 31 senadores. */
const MAX_SEATS = 130

/** Debajo de esto no hay cuerpo que vote: es un número suelto en una frase. */
const MIN_PRESENT = 3

/** El recuento, tal como lo escribe el subtitulado: «24 en 26». */
const TALLY = /(\d{1,3})\s+en\s+(\d{1,3})/

/**
 * El verbo que confirma que ese par de números es una votación.
 *
 * `\bvot\w*` cubre «votamos», «se vota», «votado» y «votación». «considerando»
 * entra porque la presidencia también cierra con «se está considerando el
 * artículo único. 27 en 27».
 */
const VOTE_CUE = /\bvot\w*|considerando|sufrag/i

/** Segmentos hacia atrás donde se busca el verbo. Un segmento dura ~2 segundos. */
const CUE_SEGMENTS = 4

/**
 * Segmentos hacia atrás que se guardan como contexto. De ahí sale el asunto.
 *
 * Treinta, que son unos novecientos caracteres. Quien consume el contexto lo
 * recorta: para escribir el asunto alcanzan los últimos 320 caracteres, y con
 * más el modelo se pierde y llama «general» a una licencia. Para reconocer a qué
 * tema pertenece la votación hacen falta todos: la presidencia dice «lo votamos
 * en general» y el proyecto se nombró medio minuto antes.
 */
const CONTEXT_SEGMENTS = 30

/**
 * El subtitulado repite la línea que rueda en pantalla, así que el mismo
 * recuento aparece dos o tres veces con un segundo de diferencia. Veinte
 * segundos alcanzan para plegarlos. Más no: en la sesión del 18/08 hay dos
 * votaciones distintas con «15 en 16» separadas por treinta segundos.
 */
const DEDUPE_SECONDS = 20

export interface VoteSegment {
  t: number
  txt: string
}

export type VoteResult = 'afirmativa' | 'negativa'
export type VoteMajority = 'unanimidad' | 'dos-tercios' | 'simple'

export interface VoteMoment {
  /** Segundo del video donde se cantó el recuento. */
  t: number
  inFavor: number
  present: number
  result: VoteResult
  majority: VoteMajority
  /** Lo que se dijo justo antes. Es el insumo del que sale el asunto. */
  context: string
}

/**
 * Resultado y tipo de mayoría, calculados del recuento.
 *
 * ATENCIÓN: la mayoría simple aprueba casi todo, pero no todo. Una venia de
 * ascenso militar pide dos tercios del Senado. Por eso el tipo de mayoría viaja
 * al lado del resultado: el lector ve «21 en 31, mayoría simple» y decide.
 */
export function classifyTally(inFavor: number, present: number): { result: VoteResult, majority: VoteMajority } {
  const result: VoteResult = inFavor * 2 > present ? 'afirmativa' : 'negativa'
  const majority: VoteMajority = inFavor === present
    ? 'unanimidad'
    : inFavor * 3 >= present * 2
      ? 'dos-tercios'
      : 'simple'
  return { result, majority }
}

/** Bancas de la cámara. Una cámara desconocida usa el techo de la Asamblea. */
export function seatsOf(chamber: string): number {
  return CHAMBER_SEATS[chamber] ?? MAX_SEATS
}

/**
 * Todos los recuentos de la sesión, en orden y sin repetidos.
 *
 * Tres filtros, en este orden: el par tiene que ser posible, tiene que haber un
 * verbo de votar cerca, y no puede repetir el recuento que se acaba de contar.
 */
export function findVoteMoments(segments: VoteSegment[], chamber: string): VoteMoment[] {
  const seats = seatsOf(chamber)
  const out: VoteMoment[] = []

  for (let i = 0; i < segments.length; i++) {
    const match = segments[i]!.txt.match(TALLY)
    if (!match) continue

    const inFavor = Number(match[1])
    const present = Number(match[2])
    if (!Number.isFinite(inFavor) || !Number.isFinite(present)) continue
    if (present < MIN_PRESENT || present > seats || inFavor > present) continue

    const cueWindow = segments.slice(Math.max(0, i - CUE_SEGMENTS), i + 1).map(s => s.txt).join(' ')
    if (!VOTE_CUE.test(cueWindow)) continue

    const t = segments[i]!.t
    const twin = out.find(v => v.inFavor === inFavor && v.present === present && t - v.t <= DEDUPE_SECONDS)
    if (twin) continue

    const context = segments
      .slice(Math.max(0, i - CONTEXT_SEGMENTS), i + 2)
      .map(s => s.txt)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()

    out.push({ t, inFavor, present, context, ...classifyTally(inFavor, present) })
  }

  return out
}

/**
 * La votación que sólo mueve la sesión hacia adelante.
 *
 * EL CÓDIGO LE GANA AL MODELO ACÁ. En la sesión de Diputados del 18/08/2026 el
 * modelo marcó como votación «general» once licencias y convocatorias de
 * suplentes: la fórmula de Diputados es «se está votando. 68 en 69», sin decir
 * qué. Publicar once licencias como decisiones de la cámara es ruido.
 *
 * Se mira la COLA del contexto, lo que se dijo pegado al recuento. Más atrás
 * está el debate anterior, que habla de otra cosa.
 *
 * SE MIRA TAMBIÉN EL ASUNTO que escribió el modelo. En la sesión del 19/08 la
 * fórmula quedó fuera de la cola y entraron como decisiones «licencia del
 * representante Walter Servini» y «convocatoria». El modelo no supo clasificarlo,
 * pero lo NOMBRÓ: ese nombre es evidencia igual que el contexto.
 *
 * La única marca ambigua es «licencia». En plural es la fórmula de sala. En
 * singular puede ser un proyecto de ley sobre licencias laborales, así que pide
 * al legislador al lado.
 */
const PROCEDURAL_MARKS: RegExp[] = [
  /licencias/i,
  /licencia/i,
  /suplente/i,
  // Llamar al suplente de quien pidió licencia. Junto a una votación es siempre
  // eso: la Cámara no convoca otra cosa en medio de una sesión.
  /convocatoria|convoc[aá]ndose|conv[oó]quese/i,
  /cuarto intermedio/i,
  /levant(ar|amos|ada|e)\s+la\s+sesi[oó]n/i,
  /suprimir\s+la\s+lectura/i,
  /prorrog(ar|a|amos)|pr[oó]rroga\s+de/i,
  /exposici[oó]n\s+escrita|exposiciones\s+escritas/i,
  /pedido[s]?\s+de\s+informe/i,
  /env[ií]o\s+de/i,
  /alterar\s+el\s+orden\s+del\s+d[ií]a/i,
  /sesi[oó]n\s+especial\s+para/i,
]

/** Palabras que vuelven inequívoca a «licencia»: es la de un legislador. */
const LEGISLATOR = /\b(senador|senadora|diputad|representante|legislador)/i

/** Cuánto de la cola del contexto se mira. Lo pegado al recuento, nada más. */
const PROCEDURAL_TAIL_CHARS = 170

/** `true` cuando lo que se vota es la marcha de la sesión y no una decisión. */
export function isProceduralContext(context: string): boolean {
  const tail = (context ?? '').slice(-PROCEDURAL_TAIL_CHARS)
  for (const [i, re] of PROCEDURAL_MARKS.entries()) {
    if (!re.test(tail)) continue
    // La segunda marca es «licencia» en singular: sola no alcanza.
    if (i === 1 && !LEGISLATOR.test(tail)) continue
    return true
  }
  return false
}

// ─── Atar cada votación a su tema ────────────────────────────────────────────

const STOPWORDS = new Set([
  'de', 'del', 'la', 'el', 'los', 'las', 'en', 'y', 'a', 'para', 'por', 'con', 'sobre',
  'un', 'una', 'que', 'se', 'su', 'sus', 'al', 'lo', 'mas', 'sin', 'ante', 'entre',
  // Las palabras de sala. Ninguna nombra un asunto: son la forma de votarlo. Van
  // en singular porque `singular()` corre antes que este filtro.
  'proyecto', 'senado', 'camara', 'sesion', 'articulo', 'mocion', 'general',
  'unico', 'unica', 'sustitutivo', 'aditivo', 'desglose', 'reconsideracion',
  'resolucion',
])

/**
 * Singular tosco, para que crucen «venias» y «venia».
 *
 * La presidencia habla en plural y el resumen en singular: el asunto decía
 * «venia para conferir ascenso a comisario general» y el tema decía «se
 * concedieron venias para el ascenso de comisarios mayores». Tres palabras en
 * común que no cruzaban ninguna. No es un lematizador: alcanza con que los dos
 * lados se deformen igual.
 */
function singular(word: string): string {
  if (word.length > 5 && word.endsWith('es')) return word.slice(0, -2)
  if (word.length > 4 && word.endsWith('s')) return word.slice(0, -1)
  return word
}

function contentWords(text: string): Set<string> {
  return new Set(
    (text ?? '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .split(/[^a-z0-9]+/)
      .map(singular)
      .filter(w => w.length > 4 && !STOPWORDS.has(w)),
  )
}

/** Palabras con contenido que comparten dos textos. */
export function sharedWords(a: string, b: string): number {
  const wa = contentWords(a)
  const wb = contentWords(b)
  let n = 0
  for (const w of wa) if (wb.has(w)) n++
  return n
}

/** Debajo de dos palabras compartidas, el vínculo es una casualidad. */
export const MIN_SHARED_WORDS = 2

/**
 * El asunto que no nombra nada.
 *
 * «Proyecto de ley en general», «artículo único», «sustitutivo». La presidencia
 * lo dice así porque todos en sala saben de qué se habla. No hay palabra que
 * cruzar, así que el único vínculo posible es el que da el modelo con el
 * fragmento a la vista.
 */
export function isGenericSubject(subject: string): boolean {
  return contentWords(subject).size === 0
}

/**
 * NO se ata una votación por el reloj.
 *
 * La tentación es fuerte: la cámara vota lo que estaba tratando, así que el tema
 * en curso parece la respuesta. Pero el resumen sólo cuenta ocho temas de una
 * sesión de seis horas, y lo que se vota al final casi nunca es uno de ellos. En
 * la corrida del 18/08 esa regla le colgó al proyecto de horas escolares dos
 * votaciones de un plan de ciencia y tecnología. Una votación sin evidencia de
 * a qué tema pertenece se publica en la lista de la sesión y en ningún tema.
 */

export type VoteScope = 'general' | 'parcial' | 'tramite'

export interface LabelledVote extends VoteMoment {
  /** Qué se votó, en una frase corta. Lo escribe el modelo. */
  subject: string
  scope: VoteScope
  /**
   * Índice del tema que el modelo dice que se estaba votando, o `-1`.
   *
   * Existe porque el recuento llega muchas veces sin el asunto al lado: la
   * presidencia dice «lo votamos en general» y el proyecto se nombró media hora
   * antes. Ahí no hay palabras que cruzar y el cruce por texto no encuentra nada.
   */
  topicHint?: number
}

export interface TopicLike {
  title: string
  explanation: string
  t: number
}

/**
 * A qué tema pertenece cada votación.
 *
 * Manda el texto, no el reloj: la discusión de un asunto puede empezar dos horas
 * antes de que se vote, y en el medio se votan licencias y cuartos intermedios.
 * El reloj sólo desempata entre dos temas que comparten las mismas palabras.
 *
 * Devuelve el índice del tema por cada votación, o `-1` cuando nada la reclama.
 */
export function matchVotesToTopics(votes: LabelledVote[], topics: TopicLike[]): number[] {
  return votes.map((vote) => {
    if (vote.scope === 'tramite' || !vote.subject.trim()) return -1

    const hint = vote.topicHint ?? -1
    const hinted = topics[hint]

    // ATENCIÓN: el asunto que NOMBRA algo tiene que coincidir con el tema, aunque
    // el modelo diga otra cosa. En la sesión del 18/08 el modelo mandó la venia de
    // una fiscal al tema de los ascensos policiales: dos venias seguidas, asuntos
    // distintos. Una palabra compartida alcanza, cero no.
    // Un asunto se discute antes de votarse: una pista hacia adelante está mal.
    if (hinted && vote.t >= hinted.t) {
      // «Artículo único» y «sustitutivo» no nombran nada: ahí la pista es todo lo
      // que hay, y el modelo la dio con el fragmento a la vista.
      if (isGenericSubject(vote.subject)) return hint
      if (sharedWords(vote.subject, `${hinted.title} ${hinted.explanation}`) >= 1) return hint
    }

    let best = -1
    let bestScore = MIN_SHARED_WORDS - 1
    let bestDistance = Number.POSITIVE_INFINITY

    for (const [i, topic] of topics.entries()) {
      const score = sharedWords(vote.subject, `${topic.title} ${topic.explanation}`)
      if (score < MIN_SHARED_WORDS) continue
      // El tema empieza antes que su votación; si empieza después, castiga.
      const distance = vote.t >= topic.t ? vote.t - topic.t : (topic.t - vote.t) * 4
      if (score > bestScore || (score === bestScore && distance < bestDistance)) {
        best = i
        bestScore = score
        bestDistance = distance
      }
    }
    return best
  })
}

export type TopicOutcome = 'aprobado' | 'rechazado' | 'mixto' | 'sin-votacion'

/**
 * El resultado que se muestra arriba del tema.
 *
 * Una sola votación manda. Con varias, manda la de alcance general: un aditivo
 * rechazado no vuelve rechazado el proyecto que lo contiene. Sin votación de
 * alcance general y con resultados distintos, el tema queda `mixto` y la ficha
 * las lista una por una. Nunca se inventa un veredicto único.
 */
export function topicOutcome(votes: LabelledVote[]): TopicOutcome {
  if (!votes.length) return 'sin-votacion'

  const generals = votes.filter(v => v.scope === 'general')
  if (generals.length) {
    const last = generals[generals.length - 1]!
    return last.result === 'afirmativa' ? 'aprobado' : 'rechazado'
  }

  const affirmative = votes.filter(v => v.result === 'afirmativa').length
  if (affirmative === votes.length) return 'aprobado'
  if (affirmative === 0) return 'rechazado'
  return 'mixto'
}
