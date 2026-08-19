/**
 * Las reglas que hacen publicable el resumen de una sesión del Parlamento.
 *
 * El texto de origen son subtítulos AUTOMÁTICOS y el resumen lo escribe un modelo:
 * dos máquinas en fila. Nada de lo que sale de ahí es un hecho verificado. Lo que
 * publicamos es «de esto se habló, y este es el minuto para escucharlo».
 *
 * De acá salen las tres defensas:
 *
 *   1. `chunkSegments` corta la transcripción por tiempo, y devuelve el segundo
 *      real de cada bloque. Ese segundo es el que va a la ficha. Al modelo NUNCA
 *      se le pide un timestamp: en la primera prueba devolvió minutos que no
 *      existían y en desorden.
 *   2. `findOpinion` rechaza la frase que opina. El modelo, con la instrucción de
 *      no opinar, igual escribió «esto es una buena noticia». Un resumen del
 *      Parlamento que califica es propaganda, así que la frase se corta y queda
 *      registrada.
 *   3. `findRiskyNumbers` marca las cifras exactas. El ASR escucha «cuatro» donde
 *      dice «catorce». Una cifra con dos decimales salida de un subtítulo
 *      automático es una cifra inventada.
 */

export interface TranscriptSegment {
  /** Segundo del video en que arranca el segmento. */
  t: number
  txt: string
}

export interface TranscriptBlock {
  /** Segundo en que arranca el bloque. Es el que viaja al tema. */
  tStart: number
  tEnd: number
  text: string
  words: number
}

/**
 * Bloques de ~`targetWords` palabras. El corte es por palabras y no por tiempo
 * porque el largo del prompt lo fijan las palabras: media hora de sesión con un
 * orador pausado y media hora de debate cruzado no ocupan lo mismo.
 */
export function chunkSegments(segments: TranscriptSegment[], targetWords = 1400): TranscriptBlock[] {
  const out: TranscriptBlock[] = []
  if (!segments.length) return out

  let buf: string[] = []
  let words = 0
  let tStart = segments[0]!.t

  for (const s of segments) {
    const w = s.txt.trim().split(/\s+/).filter(Boolean).length
    if (!w) continue
    buf.push(s.txt.trim())
    words += w
    if (words >= targetWords) {
      out.push({ tStart, tEnd: s.t, text: buf.join(' '), words })
      buf = []
      words = 0
      tStart = s.t
    }
  }
  if (buf.length) {
    out.push({ tStart, tEnd: segments[segments.length - 1]!.t, text: buf.join(' '), words })
  }
  return out
}

/**
 * Palabras que convierten un resumen en una opinión.
 *
 * No es una lista de estilo: es la línea entre informar y militar. Cada una salió
 * de una prueba real o del vocabulario que el repo ya prohíbe en prosa publicada.
 */
const OPINION_TERMS = [
  // Valoración explícita
  'buena noticia', 'mala noticia', 'lamentablemente', 'afortunadamente', 'por suerte',
  'grave error', 'acertadamente', 'correctamente', 'injusto', 'injusta', 'justos', 'justas',
  'escandaloso', 'escandalosa', 'histórico', 'historico', 'histórica', 'historica',
  'impactante', 'vergonzoso', 'vergonzosa', 'brillante', 'un logro', 'un fracaso',
  // Adhesión disfrazada de crónica. Las cinco salieron de la primera corrida real.
  'se celebró', 'se celebro', 'genera esperanza', 'esperanza para', 'es importante',
  'son importantes', 'es fundamental', 'fortalece', 'permite avanzar', 'busca mantener viva',
  'representa al país', 'representa al pais',
  // Certeza sin fuente
  'sin duda', 'claramente', 'obviamente', 'debería', 'deberia',
  'es preocupante', 'preocupante', 'alarmante', 'positivo para', 'negativo para',
]

const OPINION_PATTERNS = OPINION_TERMS.map(t => new RegExp(`(^|[^a-záéíóúñ0-9])${t}($|[^a-záéíóúñ0-9])`, 'i'))

/** Devuelve el término de opinión encontrado, o null si el texto informa sin calificar. */
export function findOpinion(text: string): string | null {
  const t = (text ?? '').toLowerCase()
  for (const [i, re] of OPINION_PATTERNS.entries()) {
    if (re.test(t)) return OPINION_TERMS[i]!
  }
  return null
}

/**
 * Cifras que no se pueden sostener con un subtítulo automático.
 *
 * Pasa el año (1985, 2026) y el número chico escrito con palabras. No pasa el
 * monto, el porcentaje con decimales ni el conteo de votos: eso hay que ir a
 * buscarlo al diario de sesión, que es el documento oficial.
 */
const RISKY_NUMBER = /(\d+(?:[.,]\d+)?\s*(?:millones|mil millones|%)|\d{1,3}(?:[.,]\d{3})+|\d+[.,]\d+)/i

export function findRiskyNumbers(text: string): string | null {
  const m = (text ?? '').match(RISKY_NUMBER)
  if (!m) return null
  // Un año suelto es seguro: 1985 o 2026 no se confunden en el subtitulado.
  if (/^\d{4}$/.test(m[1]!.replace(/[.,]/g, '')) && Number(m[1]) > 1800 && Number(m[1]) < 2100) return null
  return m[1]!
}

export interface TopicDraft {
  title: string
  explanation: string
  whyItMatters?: string
  t: number
}

/**
 * Saca la oración que trae una cifra que el subtitulado pudo haber inventado.
 *
 * Descartar el TEMA entero por una cifra le costaba al lector lo más importante
 * de la sesión: en la primera corrida se perdió la cuota de género en la música
 * porque el resumen decía «30%». Se corta la oración, no el tema, y la ficha ya
 * avisa que las cifras exactas hay que ir a buscarlas al video.
 */
export function stripRiskyNumbers(text: string): { text: string, removed: string[] } {
  const removed: string[] = []
  const sentences = (text ?? '').split(/(?<=[.!?])\s+/)
  const kept = sentences.filter((sentence) => {
    const risky = findRiskyNumbers(sentence)
    if (risky) {
      removed.push(risky)
      return false
    }
    return true
  })
  return { text: kept.join(' ').replace(/\s+/g, ' ').trim(), removed }
}

export interface GateResult<T> {
  kept: T[]
  /** Lo que se descartó, con el motivo, para poder auditar el filtro. */
  rejected: string[]
}

/**
 * Dos títulos que hablan de lo mismo.
 *
 * El modelo devolvió «Nuevos cupos para mujeres y disidencias en la música» y
 * «Más mujeres y disidencias en la música» como temas distintos de la misma
 * sesión: son el mismo asunto contado dos veces, y el lector lo lee como si el
 * Senado lo hubiera tratado dos veces.
 *
 * Se comparan las palabras con contenido, sin tildes. Si comparten dos tercios,
 * es el mismo tema y queda el primero, que es el que trae el minuto más temprano.
 */
export function sameTopic(a: string, b: string): boolean {
  const words = (s: string) => new Set(
    s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .split(/[^a-z0-9]+/).filter(w => w.length > 3 && !STOPWORDS.has(w)),
  )
  const wa = words(a)
  const wb = words(b)
  if (wa.size === 0 || wb.size === 0) return false
  const shared = [...wa].filter(w => wb.has(w)).length
  return shared / Math.min(wa.size, wb.size) >= 0.66
}

/**
 * El portón. Un tema entra sólo si informa: sin opinión, sin cifras que el ASR
 * pueda haber inventado y con un minuto que exista dentro del video.
 */
export function gateTopics(topics: TopicDraft[], durationSeconds: number): GateResult<TopicDraft> {
  const kept: TopicDraft[] = []
  const rejected: string[] = []

  for (const topic of topics) {
    // La cifra se saca de su oración; el tema sobrevive.
    const explanation = stripRiskyNumbers(topic.explanation)
    const why = stripRiskyNumbers(topic.whyItMatters ?? '')
    const cleaned: TopicDraft = {
      ...topic,
      explanation: explanation.text,
      whyItMatters: why.text,
    }
    for (const n of [...explanation.removed, ...why.removed]) {
      rejected.push(`cifra sin respaldo ("${n}") quitada de: ${topic.title}`)
    }

    // La opinión no se limpia: si el resumen califica, el resumen no sirve.
    const opinion = findOpinion(`${cleaned.title} ${cleaned.explanation} ${cleaned.whyItMatters}`)
    if (opinion) {
      rejected.push(`opinión ("${opinion}"): ${topic.title}`)
      continue
    }
    if (!Number.isFinite(cleaned.t) || cleaned.t < 0 || (durationSeconds > 0 && cleaned.t > durationSeconds)) {
      rejected.push(`minuto fuera del video (${cleaned.t}s): ${topic.title}`)
      continue
    }
    if (!cleaned.title.trim() || !cleaned.explanation.trim()) {
      rejected.push(`tema sin contenido tras el filtro: ${topic.title || '(sin título)'}`)
      continue
    }
    const twin = kept.find(k => sameTopic(k.title, cleaned.title))
    if (twin) {
      rejected.push(`repetido de "${twin.title}": ${cleaned.title}`)
      continue
    }
    kept.push(cleaned)
  }

  return { kept, rejected }
}

/**
 * Afina el minuto de un tema buscando dónde lo nombra la transcripción.
 *
 * El bloque cubre veinte minutos, así que su primer segundo puede mandar al
 * lector muy lejos de lo que fue a escuchar. Se buscan las palabras distintivas
 * del título dentro del bloque y de su vecino. Si aparecen juntas, ese segundo
 * es mejor. Si no aparecen, queda el del bloque: nunca se inventa un minuto.
 */
const STOPWORDS = new Set([
  'de', 'del', 'la', 'el', 'los', 'las', 'en', 'y', 'a', 'para', 'por', 'con', 'sobre',
  'un', 'una', 'que', 'se', 'su', 'sus', 'al', 'lo', 'mas', 'sin', 'ante', 'entre',
])

function fold(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

export function refineTimestamp(
  title: string,
  segments: TranscriptSegment[],
  blockStart: number,
  windowSeconds = 1800,
): number {
  const words = fold(title).split(/[^a-z0-9]+/).filter(w => w.length > 4 && !STOPWORDS.has(w))
  if (words.length < 2) return blockStart

  let best: number | null = null
  let bestScore = 1
  for (const seg of segments) {
    if (seg.t < blockStart - 60 || seg.t > blockStart + windowSeconds) continue
    const text = fold(seg.txt)
    const score = words.filter(w => text.includes(w)).length
    if (score > bestScore) {
      bestScore = score
      best = seg.t
    }
  }
  // Con una sola coincidencia no alcanza: «salud» aparece en toda la sesión.
  return best ?? blockStart
}

/**
 * Texto con el encoding roto.
 *
 * Una corrida devolvió «situaci\nuevon» y «debati"» donde iban las tildes: el
 * texto llegó con los bytes partidos. No pasó de nuevo, así que no se sabe dónde
 * se rompió — y por eso hay una guarda en vez de un arreglo. Publicar un resumen
 * ilegible es peor que no publicar la sesión.
 */
export function looksMojibake(text: string): boolean {
  const t = text ?? ''
  if (!t) return false
  // El reemplazo de Unicode y los pares clásicos de UTF-8 leído como Latin-1.
  if (/[\uFFFD]/.test(t)) return true
  if (/[ÃÂ][\u0080-\u00BF]/.test(t)) return true
  // Un salto de línea dentro de un campo que es una frase. El titular, el resumen
  // y cada tema son frases y nunca llevan saltos: aquella corrida los metió justo
  // donde iban las tildes («situaci\nuevon»).
  if (t.includes('\n')) return true
  // La otra cara del mismo desastre, vista en una segunda corrida: una barra
  // invertida pegada a una letra, donde iba la tilde («m\sica», «situaci\»).
  // La comilla no sirve de señal: «dijo "no"» es texto legítimo.
  if (/[a-záéíóúñ]\\/i.test(t)) return true
  return false
}

/** `4530` → `1:15:30`. Para el enlace al minuto y para mostrarlo al lado. */
export function formatTimestamp(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`
}

/** El enlace que abre el video en ese minuto. Es la prueba de cada tema. */
export function youtubeAt(videoId: string, seconds: number): string {
  return `https://www.youtube.com/watch?v=${videoId}&t=${Math.max(0, Math.floor(seconds))}s`
}

/**
 * La fecha de la sesión sale del título cuando la cámara la escribe, porque el
 * video se sube al otro día y la fecha de publicación miente por un día.
 *
 *   «Cámara de Senadores| 18/08/2026 | República Oriental del Uruguay»
 *   «Cámara de Representantes. Sesión especial. Lunes 17 de agosto de 2026, hora 09:00»
 */
const MONTHS: Record<string, number> = {
  enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5,
  julio: 6, agosto: 7, setiembre: 8, septiembre: 8, octubre: 9, noviembre: 10, diciembre: 11,
}

export function sessionDateFromTitle(title: string, fallback: Date): Date {
  const numeric = title.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (numeric) {
    const [, d, m, y] = numeric
    const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)))
    if (!Number.isNaN(date.getTime())) return date
  }
  const written = title.toLowerCase().match(/(\d{1,2})\s+de\s+([a-záéíóú]+)\s+de\s+(\d{4})/)
  if (written) {
    const month = MONTHS[written[2]!.normalize('NFD').replace(/[̀-ͯ]/g, '')]
    if (month !== undefined) {
      const date = new Date(Date.UTC(Number(written[3]), month, Number(written[1])))
      if (!Number.isNaN(date.getTime())) return date
    }
  }
  return fallback
}
