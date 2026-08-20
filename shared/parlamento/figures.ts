/**
 * Las cifras que se dijeron en la sesión, con la prueba de que se dijeron.
 *
 * EL PROBLEMA QUE RESUELVE. Un lector pidió datos numéricos. El resumen no tiene
 * ninguno, y no es un descuido: el prompt le prohíbe las cifras al modelo, porque
 * el subtitulado automático escucha «cuatro» donde dice «catorce». Prohibirlas
 * deja al lector sin saber de cuánto se hablaba.
 *
 * LA SALIDA NO ES CONFIAR, ES VERIFICAR. El modelo escribe la cifra en su frase,
 * y después el código la busca en la transcripción. Si los dígitos no están donde
 * el modelo dice que están, la cifra se descarta. Lo que sobrevive lleva el
 * segundo del video donde suena: el lector hace clic y lo escucha.
 *
 * ESO NO LA VUELVE UN HECHO VERIFICADO, y la página lo dice. Verifica que la
 * MÁQUINA QUE ESCUCHÓ escribió ese número, no que el legislador lo dijo. El
 * subtitulado sigue pudiendo haberlo cambiado. La cifra se publica con su aviso.
 *
 * Este módulo no tiene imports ni I/O: `tests/unit/test-parlamento-figures.ts` lo
 * corre entero.
 */

export interface FigureSegment {
  t: number
  txt: string
}

/**
 * Las palabras de escala que cambian el orden de magnitud.
 *
 * Van con la cifra o no van: «160» y «160 millones» no son el mismo dato, y un
 * resumen que pierde la escala miente por un factor de un millón.
 */
const SCALE_WORDS = ['millones', 'millon', 'mil', 'billones', 'billon', '%', 'por ciento']

/** Los dígitos de un texto, sin separadores de miles ni de decimales. */
export function digitsOf(text: string): string[] {
  const out: string[] = []
  for (const m of (text ?? '').matchAll(/\d[\d.,]*/g)) {
    const clean = m[0].replace(/[.,](?=\d{3}\b)/g, '').replace(/[.,]$/, '')
    if (clean) out.push(clean)
  }
  return out
}

function fold(text: string): string {
  return (text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

/** La escala que nombra un texto, o `null` cuando la cifra es un número pelado. */
export function scaleOf(text: string): string | null {
  const folded = fold(text)
  for (const word of SCALE_WORDS) {
    if (folded.includes(word)) return word === 'por ciento' ? '%' : word
  }
  return null
}

/**
 * Dos formas de escribir el mismo número.
 *
 * El modelo escribe «1.500» y el subtitulado «1500». También pasa al revés. Se
 * comparan sin separadores, y la coma decimal se vuelve punto.
 */
export function sameNumber(a: string, b: string): boolean {
  const norm = (n: string) => n.replace(/[.,](?=\d{3}\b)/g, '').replace(',', '.')
  return norm(a) === norm(b)
}

/** Cuánto puede alejarse la escala de su número dentro del mismo segmento. */
const SCALE_DISTANCE = 40

/**
 * El segundo del video donde la transcripción dice esa cifra, o `null`.
 *
 * Busca dentro de una ventana, porque el mismo número suelto aparece cien veces
 * en seis horas de sesión: «17» es un artículo, una hora y una cantidad de
 * comisarios. La ventana es el tramo del tema, así que el número tiene que sonar
 * mientras se hablaba de eso.
 */
export function findFigureEvidence(
  segments: FigureSegment[],
  value: string,
  fromSeconds: number,
  toSeconds: number,
): number | null {
  const wanted = digitsOf(value)[0]
  if (!wanted) return null
  const scale = scaleOf(value)

  for (const seg of segments) {
    if (seg.t < fromSeconds || seg.t > toSeconds) continue
    const text = fold(seg.txt)
    for (const m of text.matchAll(/\d[\d.,]*/g)) {
      const found = m[0].replace(/[.,]$/, '')
      if (!sameNumber(found, wanted)) continue
      if (!scale) return seg.t
      // La escala tiene que estar pegada al número, no en cualquier parte.
      const after = text.slice(m.index! + m[0].length, m.index! + m[0].length + SCALE_DISTANCE)
      if (fold(after).includes(scale === '%' ? '%' : scale) || after.includes('%')) return seg.t
      if (scale === '%' && text.slice(m.index!, m.index! + m[0].length + 12).includes('por ciento')) return seg.t
    }
  }
  return null
}

/**
 * El número que no es un dato: es la mecánica de la sesión.
 *
 * EL CÓDIGO LE GANA AL MODELO ACÁ. Con la instrucción de ignorar los recuentos
 * puesta, la primera corrida devolvió «12 en 13 votos se votó el envío de la
 * exposición escrita» como si fuera un dato del país. El recuento ya tiene su
 * lugar en la ficha, y ahí dice qué se votaba.
 */
const NOISE_PATTERNS: RegExp[] = [
  // El recuento de una votación: «28 en 28».
  /\b\d{1,3}\s+en\s+\d{1,3}\b/,
  // La mecánica de sala.
  /se\s+vot|votos|votaci[oó]n|env[ií]o\s+de/i,
  // Número de resolución, de carpeta o de expediente: «11/21», «640/2026».
  /\b\d{1,4}\/\d{2,4}\b/,
  // Una fecha escrita: «26 de agosto del 2021».
  /\d{1,2}\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|setiembre|septiembre|octubre|noviembre|diciembre)/i,
  // Un artículo o una ley por su número.
  /art[ií]culo\s+\d|ley\s+(n[uú]mero|n[°º])?\s*\d/i,
]

/** `true` cuando el número describe la sesión y no lo que la sesión trata. */
export function isProceduralFigure(value: string, sentence: string): boolean {
  const text = `${value} ${sentence}`
  return NOISE_PATTERNS.some(re => re.test(text))
}

export interface FigureDraft {
  /** La cifra tal como la escribió el modelo: «160 millones», «30%». */
  value: string
  /** Una frase llana que dice qué mide esa cifra. */
  sentence: string
}

export interface VerifiedFigure extends FigureDraft {
  /** Segundo del video donde la transcripción dice el número. */
  t: number
}

export interface FigureGate {
  kept: VerifiedFigure[]
  /** Lo descartado, con el motivo, para poder auditar el filtro. */
  rejected: string[]
}

/** Cifras por tema. Más que esto es una tabla, y una tabla no es un resumen. */
export const MAX_FIGURES_PER_TOPIC = 4

/**
 * El portón de las cifras. Entra la que suena en la transcripción, y nada más.
 *
 * La frase del modelo también tiene que traer el número: una frase que describe
 * sin la cifra deja al lector sin el dato y con la ilusión de tenerlo.
 */
export function gateFigures(
  drafts: FigureDraft[],
  segments: FigureSegment[],
  fromSeconds: number,
  toSeconds: number,
): FigureGate {
  const kept: VerifiedFigure[] = []
  const rejected: string[] = []

  for (const draft of drafts) {
    const value = (draft.value ?? '').trim()
    const sentence = (draft.sentence ?? '').replace(/\s+/g, ' ').trim()
    if (!value || !sentence) {
      rejected.push(`cifra sin valor o sin frase: ${value || sentence || '(vacía)'}`)
      continue
    }
    if (!digitsOf(value).length) {
      rejected.push(`cifra sin dígitos: ${value}`)
      continue
    }
    if (!digitsOf(sentence).length) {
      rejected.push(`la frase no trae el número ("${value}"): ${sentence}`)
      continue
    }
    if (isProceduralFigure(value, sentence)) {
      rejected.push(`número de la mecánica de la sesión ("${value}"): ${sentence}`)
      continue
    }
    const t = findFigureEvidence(segments, value, fromSeconds, toSeconds)
    if (t === null) {
      rejected.push(`la transcripción no dice "${value}" en ese tramo: ${sentence}`)
      continue
    }
    if (kept.some(k => sameNumber(digitsOf(k.value)[0]!, digitsOf(value)[0]!) && k.t === t)) {
      rejected.push(`cifra repetida ("${value}")`)
      continue
    }
    kept.push({ value, sentence, t })
    if (kept.length >= MAX_FIGURES_PER_TOPIC) break
  }

  return { kept, rejected }
}

/**
 * El tramo de transcripción que le toca a cada tema.
 *
 * Va desde su minuto hasta el del tema siguiente. El último llega hasta el final.
 * Sin tope superior, una cifra del cierre de la sesión se le colgaría al primer
 * tema sólo por compartir dígitos.
 */
export function topicWindow(
  topics: { t: number }[],
  index: number,
  durationSeconds: number,
): { from: number, to: number } {
  const from = Math.max(0, (topics[index]?.t ?? 0) - 30)
  const nexts = topics
    .map(topic => topic.t)
    .filter(t => t > (topics[index]?.t ?? 0))
    .sort((a, b) => a - b)
  const to = nexts.length ? nexts[0]! : (durationSeconds || Number.MAX_SAFE_INTEGER)
  return { from, to }
}
