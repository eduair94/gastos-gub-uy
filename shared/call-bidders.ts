/**
 * Quiénes se presentaron — leído del bloque "Proveedores participantes" que la ficha
 * de una compra ADJUDICADA publica en HTML.
 *
 * Por qué existe además de shared/acta-bidders.ts: el acta en PDF enumera las ofertas
 * en apenas ~8% de los casos, y sobre esa cobertura un indicador por organismo absuelve
 * al opaco. Esta fuente es otra cosa: medido el 2026-08-12 sobre 30 adjudicaciones de
 * 2008, 2013, 2018, 2022 y 2025, las 30 publican el bloque (6/6 por año). Con esa
 * cobertura el indicador de oferente único SÍ se sostiene.
 *
 * La página es server-side y UTF-8 (verificado: "Genérico" viaja como C3 A9), sin login
 * ni JavaScript. El markup es estable y anclable por el <caption> del propio bloque:
 *
 *   <table class="table"><caption class="sr-only">Proveedores participantes</caption>
 *   <thead><tr><th>Tipo</th><th>Nro. Documento</th><th>Nombre Proveedor</th></tr></thead>
 *   <tbody><tr><td>RUT</td><td>210936040017</td><td>ABACOM LIMITADA</td></tr>…
 *
 * OJO: una compra todavía ABIERTA no trae el bloque. Eso NO es "no hubo competencia" —
 * es "todavía no se publicó", y el llamador debe distinguirlo (por eso `found`).
 */

/** Un oferente tal como lo publica la ficha. */
export interface CallBidder {
  /** "RUT" para uruguayos; "Genérico" para extranjeros (id fiscal de su país). */
  docType: string
  /** Documento tal cual, sin normalizar: puede ser "NL8483280B01" o "ES-B09714759". */
  docNumber: string
  name: string
  /**
   * RUT de 12 dígitos cuando lo es, para poder cruzar contra `supplier_patterns`.
   * Null en extranjeros y en cualquier documento que no sean 12 dígitos exactos —
   * 8 dígitos es una CÉDULA y confundirlas colisiona empresas distintas.
   */
  rut: string | null
}

export interface ParsedCallBidders {
  /** ¿La ficha publicó el bloque con al menos un oferente? */
  found: boolean
  bidders: CallBidder[]
}

const CAPTION = /<caption[^>]*>\s*Proveedores participantes\s*<\/caption>/i
const HEADING = /Proveedores participantes/i

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'', nbsp: ' ',
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', ntilde: 'ñ',
  Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú', Ntilde: 'Ñ',
  uuml: 'ü', Uuml: 'Ü', ordm: 'º', ordf: 'ª', deg: '°',
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name] ?? m)
}

function cellText(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim()
}

/**
 * 12 dígitos exactos = RUT. Menos es cédula (persona física) y más es basura;
 * ambos casos se descartan antes que arriesgar un cruce equivocado. Es la misma
 * regla que usa el cruce de sanciones de Defensa del Consumidor.
 */
export function rutFromDocument(docType: string, docNumber: string): string | null {
  if (!/rut/i.test(docType)) return null
  const digits = String(docNumber ?? '').replace(/\D/g, '')
  return digits.length === 12 ? digits : null
}

/** ¿Es una fila de oferente y no un encabezado o una fila vacía? */
function isBidderRow(cells: string[]): boolean {
  if (cells.length < 3) return false
  const [type, doc, name] = cells
  if (!name || !type) return false
  // El <thead> a veces viaja dentro del <tbody> en páginas viejas.
  if (/^tipo$/i.test(type) || /^nombre/i.test(name)) return false
  if (!doc) return false
  return true
}

/**
 * Extrae los oferentes de la ficha de una compra. Devuelve `found:false` cuando el
 * bloque no está (compra abierta, o ficha sin publicar) — nunca inventa una lista vacía
 * como si fuera un hecho.
 */
export function parseCallBidders(html: string): ParsedCallBidders {
  if (!html || !HEADING.test(html)) return { found: false, bidders: [] }

  // Anclar en el <caption> del bloque; si esta ficha no lo trae, caer al encabezado
  // y tomar la primera tabla que le sigue.
  let start = -1
  const byCaption = CAPTION.exec(html)
  if (byCaption) {
    start = html.lastIndexOf('<table', byCaption.index)
  }
  else {
    const h = HEADING.exec(html)
    if (h) start = html.indexOf('<table', h.index)
  }
  if (start === -1) return { found: false, bidders: [] }

  const end = html.indexOf('</table>', start)
  if (end === -1) return { found: false, bidders: [] }
  const table = html.slice(start, end)

  const bidders: CallBidder[] = []
  const seen = new Set<string>()
  for (const row of table.match(/<tr[\s\S]*?<\/tr>/gi) ?? []) {
    const cells = (row.match(/<t[dh][\s\S]*?<\/t[dh]>/gi) ?? []).map(cellText)
    if (!isBidderRow(cells)) continue
    const docType = cells[0]!
    const docNumber = cells[1]!
    const name = cells[2]!
    // La misma empresa puede aparecer dos veces cuando la ficha lista por ítem.
    const key = `${docNumber}|${name}`.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    bidders.push({ docType, docNumber, name, rut: rutFromDocument(docType, docNumber) })
  }

  return { found: bidders.length > 0, bidders }
}
