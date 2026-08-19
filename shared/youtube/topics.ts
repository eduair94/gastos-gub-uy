/**
 * Qué cuenta como «gasto público o política» en el título de un video, y a qué
 * partido nombra.
 *
 * Vive en `shared/` porque lo leen tres lugares y tienen que dar el MISMO número:
 * la página `/canales-youtube` para filtrar el feed en vivo, el job nocturno que
 * remide cada canal, y el test que ata las dos cosas.
 *
 * TRAMPA, y ya la pagamos con la búsqueda de prensa por proveedor: comparar por
 * SUBCADENA convierte a «OSE» en «José» y a «ley» en «Bradley». Acá se compara por
 * PALABRA COMPLETA sobre el título sin tildes. Por eso los términos van sin tilde
 * y en minúscula, y el test lo exige.
 */

export const TOPIC_TERMS = [
  // Compras y plata
  'licitacion', 'adjudicacion', 'compra', 'compra directa', 'contrato', 'presupuesto',
  'presupuestal', 'rendicion de cuentas', 'deficit', 'gasto', 'impuesto', 'tarifa',
  'subsidio', 'fideicomiso', 'salario', 'sueldo', 'jubilacion', 'inflacion', 'economia',
  'obra publica',
  // Instituciones
  'ministerio', 'ministro', 'ministra', 'intendencia', 'intendente', 'senado', 'senador',
  'senadora', 'diputado', 'parlamento', 'comision', 'sesion', 'presidencia', 'presidente',
  'gobierno', 'oposicion', 'bancada', 'legislador', 'ley', 'decreto', 'tribunal de cuentas',
  'jutep', 'auditoria', 'transparencia', 'corrupcion',
  // Empresas públicas y organismos que aparecen por sigla
  'ute', 'antel', 'ancap', 'ose', 'asse', 'bps', 'inau', 'mides', 'bcu',
  // Actores políticos
  'partido', 'frente amplio', 'coalicion', 'blanco', 'colorado', 'cabildo', 'sindicato',
  'pit-cnt', 'paro', 'eleccion', 'plebiscito', 'referendum', 'politica', 'politico',
] as const

/**
 * Partidos por su NOMBRE, nunca por sus dirigentes.
 *
 * Una tabla de personas envejece cada elección y vuelve el conteo imposible de
 * reproducir. «Cabildo abierto» también nombra una asamblea vecinal, así que ese
 * conteo puede traer falsos positivos: la ficha lo dice y la muestra se revisa a mano.
 */
export const PARTY_TERMS = {
  fa: ['frente amplio'],
  pn: ['partido nacional'],
  pc: ['partido colorado'],
  ca: ['cabildo abierto'],
  pi: ['partido independiente'],
  is: ['identidad soberana'],
  coalicion: ['coalicion republicana'],
} as const

export type PartyKey = keyof typeof PARTY_TERMS

/** Minúsculas y sin tildes, que es como están escritos los términos. */
export function normalizeTitle(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/**
 * Un término por palabra completa, con el plural español detrás.
 *
 * `(es|s)?` cubre las dos formas: «senador» alcanza a «senadores» y «gasto» a
 * «gastos». Sin eso el término singular no matchea el titular plural, que es como
 * se escriben casi todos.
 *
 * Los términos son letras, números, espacios y guiones —nada de metacaracteres—,
 * así que se interpolan sin escapar. El test lo exige, para que agregar un término
 * con un paréntesis no arme una expresión regular rota en silencio.
 */
const TOPIC_PATTERNS: RegExp[] = TOPIC_TERMS.map(term =>
  new RegExp(`(^|[^a-z0-9])${term}(es|s)?($|[^a-z0-9])`),
)

/** Un título habla de gasto o política si alguno de los términos aparece entero. */
export function matchesTopic(title: string): boolean {
  const t = normalizeTitle(title)
  return TOPIC_PATTERNS.some(re => re.test(t))
}

/** Cuántos títulos de la muestra nombran a cada partido. Los ceros no se guardan. */
export function countPartyMentions(titles: string[]): Partial<Record<PartyKey, number>> {
  const normalized = titles.map(normalizeTitle)
  const out: Partial<Record<PartyKey, number>> = {}
  for (const key of Object.keys(PARTY_TERMS) as PartyKey[]) {
    const terms = PARTY_TERMS[key]
    const n = normalized.filter(t => terms.some(term => t.includes(term))).length
    if (n > 0) out[key] = n
  }
  return out
}

/** Los dos números que publica la ficha de un canal, sobre una muestra de títulos. */
export function measureTitles(titles: string[]): {
  n: number
  topicHits: number
  mentions: Partial<Record<PartyKey, number>>
} {
  return {
    n: titles.length,
    topicHits: titles.filter(matchesTopic).length,
    mentions: countPartyMentions(titles),
  }
}
