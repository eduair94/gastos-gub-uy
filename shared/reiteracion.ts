/**
 * El texto de una resolución de reiteración, convertido en los cinco datos que la ficha
 * publica.
 *
 * POR QUÉ ESTE ARCHIVO DECIDE TODO. La reiteración del gasto es el único documento del
 * corpus que declara, con sus propias palabras, que el Tribunal de Cuentas observó una
 * compra. Dice quién observó, cuándo, con qué número de resolución y por qué motivo. Nada
 * de eso necesita un modelo de lenguaje: viene en una cláusula fija del RESULTANDO.
 *
 * LO QUE NO SE PUEDE AFIRMAR, Y ES EL PUNTO. Reiterar un gasto observado es un acto LEGAL,
 * previsto por el artículo 114 del TOCAF: el ordenador puede disponerlo bajo su
 * responsabilidad. Observado no quiere decir ilegal. Si el texto no trae la cláusula,
 * `observed` queda en `false` y la ficha calla el motivo. Un PDF escaneado —dos de cada
 * tres, medido— no da texto y cae en ese caso.
 */

export interface ParsedReiteracion {
  observed: boolean
  reason: string | null
  resolutionNumber: string | null
  /** ISO `YYYY-MM-DD`, para ordenar. */
  resolutionDate: string | null
  tocafArticle: string | null
  observedBy: 'tribunal' | 'contador-delegado' | null
}

const EMPTY: ParsedReiteracion = {
  observed: false,
  reason: null,
  resolutionNumber: null,
  resolutionDate: null,
  tocafArticle: null,
  observedBy: null,
}

/**
 * Dónde arranca la cláusula. Lo que sigue, hasta el punto, es todo lo que la resolución dice
 * sobre la observación.
 */
const CLAUSE = /fue\s+observad[ao]\s+por\s+(?<who>el\s+Contador\s+Delegado|el\s+Tribunal\s+de\s+Cuentas)/i
/**
 * El «por» que abre el motivo, y no el que abre el número de resolución.
 *
 * LA TRAMPA: la cláusula trae DOS «por». El primero introduce «por Resolución 1151/2025» y
 * el segundo el motivo. Tomar el primero deja el motivo con el número adentro; tomar el
 * último se rompe cuando el motivo dice «autorizado por el ordenador». Se descarta por lo
 * que viene DESPUÉS del «por», que es lo único que los distingue de verdad.
 */
const REASON_POR = /\bpor\s+(?!Resoluci[oó]n\b|el\s+Tribunal\b|el\s+Contador\b)/gi
const RESOLUTION = /Resoluci[oó]n\s+(?<num>\d{1,5}\/\d{4})/i
const DATE = /fecha\s+(?<d>\d{2})\/(?<m>\d{2})\/(?<y>\d{4})/i
const TOCAF = /art[ií]culo\s+(?<n>\d{1,3})\s+del\s+TOCAF/i

/** Una misma causal llega con caja y puntuación distintas. Se agrupa por esta forma. */
export function normalizeReason(reason: string): string {
  return reason
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[.;,]+\s*$/, '')
    .trim()
}

export function parseReiteracion(text: string): ParsedReiteracion {
  const flat = (text ?? '').replace(/\s+/g, ' ').trim()
  if (!flat) return { ...EMPTY }

  const m = CLAUSE.exec(flat)
  if (m?.index == null || !m.groups) return { ...EMPTY }

  const observedBy: ParsedReiteracion['observedBy'] = /contador\s+delegado/i.test(m.groups.who ?? '')
    ? 'contador-delegado'
    : 'tribunal'

  // La cláusula termina en el primer punto. Más allá empieza el CONSIDERANDO, que habla de
  // otra cosa.
  const after = flat.slice(m.index + m[0].length)
  const clause = after.split('.')[0] ?? ''

  REASON_POR.lastIndex = 0
  const por = REASON_POR.exec(clause)
  const reason = por ? clause.slice(por.index + por[0].length) : null

  // El número y la fecha viven en el tramo ANTERIOR al motivo. Buscarlos en todo el
  // documento agarraría las resoluciones que el ATENTO cita para delegar facultades, y la
  // ficha quedaría atada al acto equivocado.
  const mid = por ? clause.slice(0, por.index) : clause
  const d = DATE.exec(mid)?.groups

  return {
    observed: true,
    reason: reason ? normalizeReason(reason) : null,
    resolutionNumber: RESOLUTION.exec(mid)?.groups?.num ?? null,
    resolutionDate: d ? `${d.y}-${d.m}-${d.d}` : null,
    tocafArticle: TOCAF.exec(flat)?.groups?.n ?? null,
    observedBy,
  }
}
