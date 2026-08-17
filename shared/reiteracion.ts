/**
 * El texto de una resolución de reiteración, convertido en los datos que la ficha publica.
 *
 * POR QUÉ ESTE ARCHIVO DECIDE TODO. La reiteración del gasto es el único documento del
 * corpus que declara, con sus propias palabras, que el Tribunal de Cuentas observó una
 * compra. Dice quién observó, cuándo, por qué motivo y qué norma se habría incumplido. Nada
 * de eso necesita un modelo de lenguaje.
 *
 * POR QUÉ HAY VARIOS PATRONES Y NO UNO. Cada organismo redacta su propia resolución. Una
 * muestra de un documento por año devolvió nueve maneras distintas de decir lo mismo:
 *
 *   UTE 2026        «la contratación fue observada por el Tribunal de Cuentas … por <motivo>»
 *   Intendencias    «observa el gasto al programa 203, rubro 1.9.3 … no cumple con Art. 15°»
 *   Rotulado 2021   «Motivo de Observación: <motivo>»
 *   Pasiva 2013     «fue observado el gasto … por falta de disponibilidad»
 *   Nominal 2011    «La observación del Tribunal de Cuentas al gasto»
 *
 * Un solo patrón leería una época y perdería las otras. Por eso la detección va en capas: se
 * confirma que HAY observación, y recién después se intenta el motivo. Un documento puede
 * quedar en `observed: true` con `reason: null`, y eso es correcto: sabemos que lo observaron
 * y no sabemos por qué.
 *
 * LO QUE NO SE PUEDE AFIRMAR, Y ES EL PUNTO. Reiterar un gasto observado es un acto LEGAL,
 * previsto por el artículo 114 del TOCAF: el ordenador puede disponerlo bajo su
 * responsabilidad. Observado no quiere decir ilegal.
 */

export interface ParsedReiteracion {
  /** El documento evidencia una observación del Tribunal de Cuentas o su Contador Delegado. */
  observed: boolean
  /** El motivo declarado, normalizado. `null` cuando el texto no lo dice. */
  reason: string | null
  resolutionNumber: string | null
  /** ISO `YYYY-MM-DD`, para ordenar. */
  resolutionDate: string | null
  /**
   * Artículos del TOCAF que la observación señala como incumplidos. NUNCA incluye el 114 ni
   * el 211: ésos son la facultad de reiterar, no la norma incumplida. Confundirlos diría que
   * el organismo violó el artículo que lo habilita.
   */
  breachedArticles: string[]
  /** El artículo que el organismo invoca para reiterar. Casi siempre el 114. */
  authorityArticle: string | null
  observedBy: 'tribunal' | 'contador-delegado' | null
}

function empty(): ParsedReiteracion {
  return {
    observed: false,
    reason: null,
    resolutionNumber: null,
    resolutionDate: null,
    breachedArticles: [],
    authorityArticle: null,
    observedBy: null,
  }
}

/**
 * Las formas en que un documento afirma que hubo observación. Cada una tiene que nombrar al
 * Tribunal de Cuentas o a su Contador Delegado: «observaciones» a secas aparece en contextos
 * que no son éste.
 */
const OBSERVED_PATTERNS: RegExp[] = [
  // «fue observada/observado … por el Tribunal de Cuentas / el Contador Delegado»
  /observad[ao]\s+(?:el\s+gasto\s+)?por\s+(?:el|la)\s+(?:Contador|Tribunal|Contadur[ií]a)/i,
  // «la observación formulada/realizada/planteada por el Tribunal…»
  /observaci[oó]n(?:es)?\s+(?:formulad|realizad|plantead|efectuad)\w*\s+por\s+(?:el|la)\s+(?:Contador|Tribunal|Contadur[ií]a)/i,
  // «La observación del Tribunal de Cuentas al gasto»
  /observaci[oó]n(?:es)?\s+de[l]?\s+(?:Contador|Tribunal)/i,
  // «el Contador Delegado … observa/ha observado el gasto». El hueco usa `.` y no `[^.]`
  // porque el texto real trae abreviaturas con punto en el medio: «a Fs. 223, observa».
  /(?:Contador|Tribunal|Contadur[ií]a).{0,160}?\bobserv(?:a|ó|an|aron|ado)\b/i,
  // «Reitérese el gasto observado por Resolución adoptada por el Tribunal de Cuentas»
  /gasto\s+observado.{0,120}?(?:Tribunal\s+de\s+Cuentas|Contador\s+Delegado)/i,
  // «Motivo de Observación:» — el documento lo rotula.
  /Motivo\s+de\s+Observaci[oó]n\s*:/i,
  // «fue observado el gasto …» en pasiva, sin nombrar al órgano en la misma frase.
  /\bfue\s+observad[ao]\s+el\s+gasto\b/i,
]

/** «intervenida sin observaciones» es lo contrario de una observación. */
const NOT_OBSERVED = /sin\s+observaciones/i

/**
 * De dónde sale el motivo, en orden de confianza. El primero que matchea gana.
 *
 * El orden importa: el rótulo explícito es el más confiable, y la prosa suelta el que más se
 * equivoca. Poner la prosa primero haría que un documento rotulado se leyera por el peor
 * camino disponible.
 */
const REASON_PATTERNS: RegExp[] = [
  // «Motivo de Observación: Contravenir lo establecido en el Artículo 48 …»
  /Motivo\s+de\s+Observaci[oó]n\s*:\s*(?<reason>[^.]+)/i,
  // «… por no contar con disponibilidad presupuestal.» / «por falta de disponibilidad …»
  /\bpor\s+(?<reason>(?:no\s+\w+|falta\s+de|carecer|no\s+existir|insuficien\w*)[^.;]*)/i,
  // «… rubro 1.9.9 por no existir disponibilidad suficiente y contraviene al artículo 15º»
  /\b(?<reason>no\s+cumple\s+con\s+[^.;]+)/i,
]

const RESOLUTION = /Resoluci[oó]n\s+(?:N[°ºo]\s*)?(?<num>\d{1,5}\/\d{4})/i
const DATE_SLASH = /fecha\s+(?<d>\d{1,2})\/(?<m>\d{1,2})\/(?<y>\d{4})/i
/** El 114 y el 211 habilitan a reiterar. No son la norma incumplida. */
const AUTHORITY_ARTICLES = new Set(['114', '211'])
/**
 * El artículo del TOCAF, en todas sus grafías: «artículo 114 del TOCAF», «Art. 15° del
 * T.O.C.A.F», «Artículo 48 lit c) Numeral 1 del TOCAF». El hueco antes de TOCAF acepta punto
 * porque la sigla misma viene punteada.
 */
const ARTICLE = /\bart(?:[ií]culo)?s?\.?\s*(?<n>\d{1,3})\s*[°ºo]?.{0,60}?T\.?\s*O\.?\s*C\.?\s*A\.?\s*F/gi

/**
 * Donde termina el motivo y empieza la norma. El texto real encadena las dos cosas: «por no
 * existir disponibilidad suficiente Y CONTRAVIENE al artículo 15º del TOCAF». La segunda
 * mitad ya se guarda aparte, en `breachedArticles`, así que dejarla adentro del motivo
 * partiría en dos grupos la misma causal.
 */
const REASON_TAIL = /\s+(?:y\s+)?(?:contravien\w*|no\s+cumple\s+con|incumpl\w*|seg[uú]n\s+lo)\b.*$/i

/** Una misma causal llega con caja y puntuación distintas. Se agrupa por esta forma. */
export function normalizeReason(reason: string): string {
  return reason
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(REASON_TAIL, '')
    .replace(/[.;,\-–—\s]+$/, '')
    .trim()
}

function findReason(flat: string): string | null {
  for (const re of REASON_PATTERNS) {
    const m = re.exec(flat)
    const raw = m?.groups?.reason
    if (!raw) continue
    const norm = normalizeReason(raw)
    // Un motivo de dos palabras no explica nada, y uno larguísimo se comió media resolución.
    if (norm.length < 8 || norm.length > 220) continue
    return norm
  }
  return null
}

function findArticles(flat: string): { breached: string[], authority: string | null } {
  const breached: string[] = []
  let authority: string | null = null
  ARTICLE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = ARTICLE.exec(flat)) !== null) {
    const n = m.groups?.n
    if (!n) continue
    if (AUTHORITY_ARTICLES.has(n)) {
      authority = authority ?? n
      continue
    }
    if (!breached.includes(n)) breached.push(n)
  }
  return { breached, authority }
}

export function parseReiteracion(text: string): ParsedReiteracion {
  const flat = (text ?? '').replace(/\s+/g, ' ').trim()
  if (!flat) return empty()

  const matched = OBSERVED_PATTERNS.some(re => re.test(flat))
  if (!matched) return empty()
  // «intervenida sin observaciones» sólo descarta cuando es lo ÚNICO que el documento dice
  // del asunto. Una resolución puede contar que una etapa pasó sin observaciones y que otra
  // sí fue observada.
  if (NOT_OBSERVED.test(flat) && !/\bfue\s+observad|observa\s+el\s+gasto|Motivo\s+de\s+Observaci/i.test(flat)) {
    return empty()
  }

  const observedBy: ParsedReiteracion['observedBy'] = /Contador\s+(?:Delegado|Auditor)|Contadur[ií]a\s+Central/i.test(flat)
    ? 'contador-delegado'
    : 'tribunal'

  const { breached, authority } = findArticles(flat)
  const d = DATE_SLASH.exec(flat)?.groups

  return {
    observed: true,
    reason: findReason(flat),
    resolutionNumber: RESOLUTION.exec(flat)?.groups?.num ?? null,
    resolutionDate: d ? `${d.y}-${d.m.padStart(2, '0')}-${d.d.padStart(2, '0')}` : null,
    breachedArticles: breached,
    authorityArticle: authority,
    observedBy,
  }
}
