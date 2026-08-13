/**
 * Resoluciones del Tribunal de Cuentas — parser de la ficha HTML.
 *
 * El TC es el auditor del propio Estado: cuando se pronuncia sobre una compra, lo hace
 * con nombre y apellido del organismo y del llamado. Su archivo es público y sus fichas
 * viven en ids secuenciales (`resoluciones_busqueda.php?id=N`), servidas en UTF-8.
 *
 * POR QUÉ ESTO SE PUEDE CRUZAR CON EL CORPUS (medido, no supuesto):
 * la resolución identifica la compra como «Licitación Pública Nº 5/2021» y nuestros
 * releases guardan exactamente ese formato en `tender.title` ("Compra Directa 5/2021").
 * Con el organismo, la clave ⟨organismo, método, número/año⟩ resultó ambigua en apenas
 * el 4,4% de 51.841 claves del corpus. El caso de control (Casinos · Licitación Pública
 * 5/2021 → ocid 890500, "ACONDICIONAMIENTO … TREINTA Y TRES") cruzó exacto.
 *
 * LÍMITE QUE HAY QUE RESPETAR AL PUBLICAR: la ficha HTML trae sólo el VISTO — el
 * encabezado del expediente y qué se estaba mirando. El fallo (si el gasto se observó,
 * por cuánto, con qué fundamento) está en el PDF. Así que de acá NO se puede afirmar
 * "el TC observó este gasto": lo único afirmable es que el TC se pronunció sobre esta
 * compra, con el enlace a la resolución para que se lea.
 */

export interface TcrProcurementRef {
  /** "Licitación Pública", "Compra Directa", … tal como lo nombra la resolución. */
  method: string
  /** Número dentro del método para ese organismo y año. */
  number: string
  year: number
  /** Cómo se arma el `tender.title` del corpus: "Licitación Pública 5/2021". */
  titleForm: string
}

export interface ParsedTcrResolution {
  /** Fecha de la resolución. */
  date: string | null
  /** Jerarquía tal cual: "Administración Central / MEF / Dirección General de Casinos". */
  organismPath: string | null
  /** Último tramo de la jerarquía — el organismo que compró. */
  organism: string | null
  /** Taxonomía del asunto: "Contrataciones de Bienes y Servicios / Licitaciones Públicas". */
  subject: string | null
  /** Expediente electrónico, p. ej. "E.E. 3387/22". */
  expediente: string | null
  /** El VISTO: qué se estaba mirando. Es lo único que publica el HTML. */
  visto: string | null
  /** URL del PDF con el fallo completo. */
  pdfUrl: string | null
  /** Referencia a la compra, cuando la resolución la nombra. */
  procurement: TcrProcurementRef | null
  /** ¿El asunto es de contrataciones? Lo demás (sueldos, balances) no nos toca. */
  isProcurement: boolean
}

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'', nbsp: ' ',
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', ntilde: 'ñ',
  Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú', Ntilde: 'Ñ',
  uuml: 'ü', Uuml: 'Ü', ordm: 'º', ordf: 'ª', deg: '°', laquo: '«', raquo: '»',
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&([a-zA-Z]+);/g, (m, name) => ENTITIES[name] ?? m)
}

function text(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim()
}

/**
 * Métodos como los nombra el TC, y con qué forma los guarda el corpus.
 *
 * No son la misma cadena: el TC escribe "Compra Directa por Excepción Nº 7/2020" y
 * `tender.title` guarda "Compra Directa 7/2020" (medido sobre 120.000 títulos: las
 * primeras palabras son sólo "Compra", "Licitación" y un "Llamado" suelto). El
 * calificativo se reconoce para no perder la resolución, pero el título que se busca
 * es SIEMPRE la forma del corpus — si no, el cruce falla en silencio.
 */
const METHODS: Array<{ tcr: string, corpus: string }> = [
  { tcr: 'Licitación Pública', corpus: 'Licitación Pública' },
  { tcr: 'Licitación Abreviada', corpus: 'Licitación Abreviada' },
  { tcr: 'Compra Directa', corpus: 'Compra Directa' },
  { tcr: 'Compra por Excepción', corpus: 'Compra por Excepción' },
  { tcr: 'Concurso de Precios', corpus: 'Concurso de Precios' },
]

/**
 * Encuentra la compra que nombra la resolución. Devuelve null cuando la prosa no la
 * identifica — es el caso normal en resoluciones que no son de contrataciones, y una
 * referencia inventada terminaría colgándole a un contrato el pronunciamiento de otro.
 */
export function extractProcurementRef(prose: string): TcrProcurementRef | null {
  if (!prose) return null
  for (const { tcr, corpus } of METHODS) {
    const flexible = tcr
      .replace(/[óúí]/g, c => (c === 'ó' ? '[oó]' : c === 'ú' ? '[uú]' : '[ií]'))
      .replace(/\s+/g, '\\s+')
    // Tres formas, todas vistas en el archivo:
    //   "Licitación Pública Nº 5/2021" · "Licitación Pública 5/2021"
    //   "Compra Directa por Excepción Nº 7/2020" — calificativo en el medio, que sólo
    //   se acepta si viene seguido del marcador Nº: sin él, cualquier número suelto de
    //   la prosa se colaría como número de llamado.
    // El número puede traer sufijo ("21bis"), y 21 ≠ 21bis: son compras distintas.
    const num = '(\\d{1,5}(?:\\s*(?:bis|ter))?)\\s*/\\s*(\\d{2,4})'
    const re = new RegExp(
      `${flexible}(?:\\s*(?:N[º°o.]*\\s*)${num}|(?:\\s+[a-zA-ZáéíóúñÁÉÍÓÚÑ]+){1,3}\\s*N[º°o.]*\\s*${num}|\\s+${num})`,
      'i',
    )
    const m = re.exec(prose)
    if (!m) continue
    // Sólo uno de los tres grupos alternativos matchea; el resto queda undefined.
    const number = (m[1] ?? m[3] ?? m[5])?.replace(/\s+/g, '') ?? ''
    const rawYear = m[2] ?? m[4] ?? m[6] ?? ''
    if (!number || !rawYear) continue
    const method = corpus
    // "5/21" y "5/2021" son el mismo llamado; el corpus guarda el año en cuatro dígitos.
    const year = rawYear.length === 2 ? 2000 + Number(rawYear) : Number(rawYear)
    if (!Number.isInteger(year) || year < 2000 || year > 2100) continue
    return { method, number, year, titleForm: `${method} ${number}/${year}` }
  }
  return null
}

export function parseTcrResolution(html: string, id: number): ParsedTcrResolution {
  const empty: ParsedTcrResolution = {
    date: null, organismPath: null, organism: null, subject: null,
    expediente: null, visto: null, pdfUrl: null, procurement: null, isProcurement: false,
  }
  if (!html || !/Resultado B[úu]squeda Resoluciones/i.test(html)) return empty

  const dateM = /Fecha Resoluci[óo]n\s*(\d{2}\/\d{2}\/\d{4})/i.exec(text(html))
  const date = dateM ? dateM[1]! : null

  // Los dos <div> azules debajo de la fecha: jerarquía del organismo y taxonomía del
  // asunto. Se toman por su color, que es lo único estable en este HTML.
  const blues = [...html.matchAll(/<div[^>]*color:\s*#214F9F[^>]*>([\s\S]*?)<\/div>/gi)]
    .map(m => text(m[1]!))
    .filter(Boolean)
  const organismPath = blues.find(b => b.includes('/') && !/Fecha Resoluci/i.test(b)) ?? null
  const subject = blues.find(b => b !== organismPath && b.includes('/') && !/Fecha Resoluci/i.test(b)) ?? null

  const bodyM = /<p>\s*(?:<p>)?\s*([\s\S]*?)<\/p>/i.exec(html.slice(html.indexOf('mostrar_div')))
  const visto = bodyM ? text(bodyM[1]!) || null : null

  const expM = visto ? /\(?\s*(E\.?\s?E\.?\s*[\d.\-/]+)/i.exec(visto) : null
  const expediente = expM ? expM[1]!.replace(/\s+/g, ' ').trim() : null

  const pdfM = /href="((?:archivos\/)?resoluciones_\d+_[^"]+\.pdf)"/i.exec(html)
  const pdfUrl = pdfM ? new URL(pdfM[1]!, 'https://www.tcr.gub.uy/').toString() : null

  const procurement = extractProcurementRef(visto ?? '')
  // El asunto es la señal fuerte; el número de llamado en la prosa, la de respaldo.
  const isProcurement = /contrataci|licitaci|compra/i.test(subject ?? '') || procurement !== null

  return {
    date,
    organismPath,
    organism: organismPath ? (organismPath.split('/').pop() ?? '').trim() || null : null,
    subject,
    expediente,
    visto,
    pdfUrl: pdfUrl ?? (id ? null : null),
    procurement,
    isProcurement,
  }
}

/**
 * Clave normalizada del organismo. La MISMA función la usa el job al escribir y el
 * endpoint al leer: si divergen, el panel de la ficha del organismo queda mudo sin error.
 */
export function organismKey(name: string | null | undefined): string | null {
  if (!name) return null
  const key = String(name)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
  return key || null
}
