/**
 * Prensa sobre las compras de un organismo.
 *
 * POR QUÉ POR ORGANISMO Y NO POR PROVEEDOR — medido el 2026-08-13, y el resultado
 * decidió el diseño entero:
 *
 *   proveedor  SURYPARK/TERCIR/EDATIR → 0 notas (los proveedores que importan no tienen prensa)
 *              MOTOCICLO → 100 notas de choques de motos en Cuba y México
 *              DIVINO → "Divino Salvador del Mundo"; TA TA → tokens cripto
 *   organismo  ASSE → 51 notas, 30 nombrando al organismo desde medios uruguayos,
 *              y del tipo "ASSE cerró la licitación de traslados: ¿cuál fue la mejor oferta?"
 *
 * Exigir contexto estatal tampoco salva al proveedor: «DIVINO + ministerio» devuelve
 * "ministerio de acólito" de una parroquia. Y pedir la forma jurídica mata la señal real.
 * Por eso acá NO existe la búsqueda por empresa: atribuirle a una importadora uruguaya un
 * choque en Villa Clara sería fabricar la asociación, que es peor que no mostrar nada.
 *
 * Lo que se publica es una BÚSQUEDA, no una curaduría: no verificamos el contenido de las
 * notas ni las respaldamos. Por eso cada resultado sale con su medio, su fecha y su enlace.
 */

export interface NewsItem {
  title: string
  link: string
  source: string
  /** ISO. Null si el feed no trajo fecha parseable. */
  publishedAt: string | null
}

/** Términos que hacen que la nota sea sobre COMPRAS y no sobre cualquier otra cosa. */
export const PROCUREMENT_TERMS = '(licitación OR "compra directa" OR adjudicación OR "compras públicas" OR contrato)'

/**
 * PROBADO Y DESCARTADO: exigir además un término de compras en el TITULAR.
 *
 * Limpiaba el ruido menor —"ASSE abre llamado para Licenciado/a en Enfermería" entra hoy
 * porque la nota menciona un contrato en el cuerpo— pero se llevaba puesta justo la
 * periodística que más vale: «Traslados no médicos de ASSE: empresa que trabaja para el
 * prestador desde 2021 pasó de cobrar más de 12.000…» (la diaria) no usa ninguna de esas
 * palabras en el titular.
 *
 * El costo estaba invertido: una nota fuera de tema pero correctamente atribuida al
 * organismo molesta poco, y el panel avisa que es una búsqueda. Perder la investigación
 * sobre el precio de un contrato es perder el motivo por el que existe el panel.
 */

/**
 * Medios uruguayos (y los portales del propio Estado). Si la nota no es de acá,
 * difícilmente sea de este organismo: "Intendencia de Salto" tiene homónimos y
 * "ASSE" aparece en siglas de otros países.
 */
const UY_SOURCE = /\.uy\b|montevideo portal|subrayado|el pa[ií]s|la diaria|b[uú]squeda|brecha|el observador|lared21|el telégrafo|el telegrafo|la mañana|la manana|caras y caretas|rep[uú]blica|gub\.uy|presidencia|el eco|diario cambio/i

export function buildQuery(organismName: string): string {
  return `"${organismName}" ${PROCUREMENT_TERMS}`
}

export function newsRssUrl(organismName: string): string {
  const q = encodeURIComponent(buildQuery(organismName))
  // gl/ceid uruguayos: sin eso el feed devuelve prensa de toda la región.
  return `https://news.google.com/rss/search?q=${q}&hl=es-419&gl=UY&ceid=UY:es-419`
}

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'', nbsp: ' ', ndash: '–', mdash: '—',
}

function decode(raw: string): string {
  return raw
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&([a-zA-Z]+);/g, (m, n) => ENTITIES[n] ?? m)
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * Google News pega " - Medio" al final del titular. Se saca para que el titular se lea
 * como en el diario y para que el medio no cuente como parte del texto al filtrar.
 */
function stripSourceSuffix(title: string, source: string): string {
  if (!source) return title
  const suffix = ` - ${source}`
  return title.endsWith(suffix) ? title.slice(0, -suffix.length).trim() : title
}

export function parseNewsRss(xml: string): NewsItem[] {
  if (!xml) return []
  const out: NewsItem[] = []
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const block = m[1]!
    const source = decode((/<source[^>]*>([\s\S]*?)<\/source>/.exec(block) ?? [])[1] ?? '')
    const rawTitle = decode((/<title>([\s\S]*?)<\/title>/.exec(block) ?? [])[1] ?? '')
    const link = decode((/<link>([\s\S]*?)<\/link>/.exec(block) ?? [])[1] ?? '')
    const pub = decode((/<pubDate>([\s\S]*?)<\/pubDate>/.exec(block) ?? [])[1] ?? '')
    if (!rawTitle || !link) continue
    const when = pub ? new Date(pub) : null
    out.push({
      title: stripSourceSuffix(rawTitle, source),
      link,
      source,
      publishedAt: when && !Number.isNaN(when.getTime()) ? when.toISOString() : null,
    })
  }
  return out
}

/**
 * Se queda con lo que de verdad es sobre este organismo: medio uruguayo Y el nombre del
 * organismo en el titular. Es un filtro duro a propósito — un falso positivo acá cuelga
 * una noticia ajena de la ficha de un organismo, y eso no se arregla con una aclaración.
 *
 * `aliases` cubre cómo lo escribe la prensa: la ficha dice "Administración de los
 * Servicios de Salud del Estado" y el diario escribe "ASSE".
 */
export function filterRelevant(items: NewsItem[], organismName: string, aliases: string[] = []): NewsItem[] {
  const needles = [organismName, ...aliases].map(norm).filter(n => n.length >= 3)
  if (!needles.length) return []
  const seen = new Set<string>()
  return items.filter((item) => {
    if (!UY_SOURCE.test(item.source)) return false
    const title = norm(item.title)
    // Palabra completa, no substring: buscando "ANT" como substring, "ANTES" matchea y
    // le cuelga al organismo una noticia que no es suya. Pasó en la primera medición.
    if (!needles.some(n => new RegExp(`(^|[^A-Z0-9])${escapeRe(n)}([^A-Z0-9]|$)`).test(title))) return false
    // El mismo hecho lo replican varios medios; el titular normalizado alcanza para dedupe.
    if (seen.has(title)) return false
    seen.add(title)
    return true
  })
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Cómo nombra la prensa a cada organismo. Es una tabla CURADA y no una sigla derivada,
 * porque las siglas uruguayas son convencionales, no mecánicas: "Administración Nacional
 * de Usinas y Trasmisiones Eléctricas" es UTE, no ANUTE, y ningún algoritmo saca eso.
 *
 * Derivarlas además era peligroso: la sigla automática de ANTEL daba "ANT", que como
 * substring matchea "ANTES" y le colgaría al organismo cualquier titular. Por eso acá
 * sólo entran nombres que la prensa usa de verdad, y el match es por palabra completa.
 *
 * La clave se compara normalizada (sin tildes, mayúsculas) contra el nombre del organismo.
 */
const KNOWN_ALIASES: Array<{ match: RegExp, aliases: string[] }> = [
  { match: /USINAS Y TRASMISIONES|USINAS Y TRANSMISIONES/, aliases: ['UTE'] },
  { match: /OBRAS SANITARIAS DEL ESTADO/, aliases: ['OSE'] },
  { match: /NACIONAL DE TELECOMUNICACIONES/, aliases: ['ANTEL'] },
  { match: /COMBUSTIBLE, ?ALCOHOL Y PORTLAND|COMBUSTIBLE ALCOHOL Y PORTLAND/, aliases: ['ANCAP'] },
  { match: /NACIONAL DE PUERTOS/, aliases: ['ANP'] },
  { match: /SERVICIOS DE SALUD DEL ESTADO/, aliases: ['ASSE'] },
  { match: /BANCO DE PREVISION SOCIAL/, aliases: ['BPS'] },
  { match: /BANCO DE LA REPUBLICA ORIENTAL/, aliases: ['BROU'] },
  { match: /BANCO DE SEGUROS DEL ESTADO/, aliases: ['BSE'] },
  { match: /CORREOS/, aliases: ['Correo Uruguayo'] },
  { match: /TRANSPORTE Y OBRAS PUBLICAS/, aliases: ['MTOP'] },
  { match: /MINISTERIO DE SALUD PUBLICA/, aliases: ['MSP'] },
  { match: /ECONOMIA Y FINANZAS/, aliases: ['MEF'] },
  { match: /DESARROLLO SOCIAL/, aliases: ['MIDES'] },
  { match: /GANADERIA, ?AGRICULTURA Y PESCA|GANADERIA AGRICULTURA Y PESCA/, aliases: ['MGAP'] },
  { match: /VIVIENDA/, aliases: ['MVOT', 'MVOTMA'] },
  { match: /INDUSTRIA, ?ENERGIA Y MINERIA|INDUSTRIA ENERGIA Y MINERIA/, aliases: ['MIEM'] },
  { match: /EDUCACION Y CULTURA/, aliases: ['MEC'] },
  { match: /DEFENSA NACIONAL/, aliases: ['MDN'] },
  { match: /^MINISTERIO DEL INTERIOR/, aliases: ['Ministerio del Interior'] },
  { match: /CONSEJO DIRECTIVO CENTRAL|ADMINISTRACION NACIONAL DE EDUCACION PUBLICA/, aliases: ['ANEP', 'Codicen'] },
  { match: /UNIVERSIDAD DE LA REPUBLICA/, aliases: ['Udelar'] },
  { match: /INSTITUTO DEL NINO Y ADOLESCENTE/, aliases: ['INAU'] },
  { match: /AGENCIA DE GOBIERNO ELECTRONICO|AGESIC/, aliases: ['Agesic'] },
  { match: /INSTITUTO NACIONAL DE COLONIZACION/, aliases: ['INC'] },
  { match: /ADMINISTRACION DE FERROCARRILES/, aliases: ['AFE'] },
  { match: /PRIMARIA/, aliases: ['Primaria'] },
]

/**
 * Siglas con las que la prensa nombra a este organismo. Vacío cuando no hay una conocida:
 * es preferible perder notas que inventar una sigla que matchee otra cosa.
 */
export function organismAliases(name: string): string[] {
  const key = norm(name)
  const out = new Set<string>()
  for (const { match, aliases } of KNOWN_ALIASES) {
    if (match.test(key)) aliases.forEach(a => out.add(a))
  }
  return [...out]
}
