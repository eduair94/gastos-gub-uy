/**
 * Leer la cabecera de una «Hoja de Insumo» de la Base de Jurisprudencia Nacional.
 *
 * Módulo PURO: sin I/O, sin imports. Lo usa src/jobs/load-bjn-condenas.ts y lo verifica
 * tests/unit/test-bjn-award.ts contra el texto real de 16 sentencias publicadas.
 *
 * La hoja abre con una tabla de etiquetas y valores que el HTML aplana a una sola línea:
 *
 *   Hoja de Insumo Número Sede Importancia Tipo 46/2023 Tribunal Apelaciones Civil 4ºTº MEDIA
 *   DEFINITIVA Fecha Ficha Procedimiento 22/03/2023 2-12345/2019 PROCESO CIVIL ORDINARIO
 *   Materias DERECHO ADMINISTRATIVO Firmantes ...
 *
 * SE ANCLA EN LOS ENUMERADOS, NO EN LAS POSICIONES. La sede lleva espacios y la ficha cambia de
 * forma entre juzgados (`2-58775/2009`, `2 61219 2009`, `489-61/2015`), así que contar palabras no
 * sirve. Importancia (ALTA/MEDIA/BAJA) y tipo (DEFINITIVA/INTERLOCUTORIA) son cerrados y funcionan
 * de mojón: lo que va entre el número y la importancia es la sede, y no hay ambigüedad posible.
 *
 * EL FUERO SALE DE ACÁ, Y DECIDE. `procedimiento` es lo que separa un juicio civil contra el Estado
 * de un proceso penal, donde «condénase» son años de cárcel. Sin cabecera legible no se publica.
 */

export interface HojaInsumo {
  /** Como lo publica el BJN: `46/2023`, a veces con letra (`i460/2011`). */
  numero: string
  /** El año del número, que es el de la sentencia. */
  anio: number | null
  /** El tribunal que falló. */
  sede: string
  importancia: 'ALTA' | 'MEDIA' | 'BAJA' | null
  tipo: 'DEFINITIVA' | 'INTERLOCUTORIA' | null
  /** Fecha del fallo, en UTC. */
  fecha: Date | null
  /** El identificador del expediente (IUE). Cambia de forma entre juzgados. */
  ficha: string | null
  /** El fuero. `PROCESO PENAL ORDINARIO` deja la sentencia fuera del corpus de dinero. */
  procedimiento: string | null
  materias: string[]
}

const HEAD_RE = new RegExp(
  [
    'N[úu]mero\\s+Sede\\s+Importancia\\s+Tipo\\s+',
    '(\\S+)\\s+', // número
    '(.+?)\\s+', // sede
    '(ALTA|MEDIA|BAJA)\\s+',
    '(DEFINITIVA|INTERLOCUTORIA)\\s+',
    'Fecha\\s+Ficha\\s+Procedimiento\\s+',
    '(\\d{2}\\/\\d{2}\\/\\d{4})\\s+', // fecha
    // Ficha: dígitos y separadores, o el literal «Sin datos» que traen las sentencias viejas de la
    // Suprema Corte (1994-2004). Exigir un dígito dejaba afuera esas cuatro de cada dieciséis.
    '((?:Sin\\s+datos)|(?:[\\d][\\d\\s\\-\\/.]*?))\\s+',
    '([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\\s.]*?)\\s+', // procedimiento, en mayúsculas
    'Materias\\s+(.*?)\\s+',
    '(?:Firmantes|Redactores|Descriptores|Resumen|Texto)',
  ].join(''),
)

/** `DERECHO PROCESAL DERECHO ADMINISTRATIVO` → las dos materias, sin inventar cortes. */
function splitMaterias(raw: string): string[] {
  const trimmed = raw.trim()
  if (!trimmed) return []
  // El BJN concatena materias sin separador. Todas empiezan con una palabra raíz conocida, así que
  // se corta ANTES de cada una en lugar de adivinar por longitud.
  const parts = trimmed.split(/\s+(?=(?:DERECHO|PROCESO|RECURSO)\b)/)
  return parts.map(p => p.trim()).filter(Boolean)
}

/** `20/10/2010` → Date UTC. Devuelve null si no es una fecha real. */
export function parseHojaDate(value: string): Date | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim())
  if (!m) return null
  const [, d, mo, y] = m
  const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)))
  if (Number.isNaN(date.getTime())) return null
  // Un 31/02 se desborda al mes siguiente; rechazarlo antes de guardarlo como fecha del fallo.
  if (date.getUTCDate() !== Number(d) || date.getUTCMonth() !== Number(mo) - 1) return null
  return date
}

export function parseHojaInsumo(fullText: string): HojaInsumo | null {
  const text = (fullText ?? '').replace(/\s+/g, ' ')
  const m = HEAD_RE.exec(text)
  if (!m) return null

  const numero = m[1]!.trim()
  const anioMatch = /\/(\d{4})$/.exec(numero)

  return {
    numero,
    anio: anioMatch ? Number(anioMatch[1]) : null,
    sede: m[2]!.trim(),
    importancia: m[3] as HojaInsumo['importancia'],
    tipo: m[4] as HojaInsumo['tipo'],
    fecha: parseHojaDate(m[5]!),
    // «Sin datos» es la ausencia del dato, no el dato.
    ficha: /^sin\s+datos$/i.test(m[6]!.trim()) ? null : (m[6]!.trim() || null),
    procedimiento: m[7]!.trim() || null,
    materias: splitMaterias(m[8] ?? ''),
  }
}

/** La clave natural de una sentencia: el tribunal la numera por año, no el país. */
export function sentenciaKey(sede: string, numero: string): string {
  const norm = (s: string): string =>
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase()
  return `${norm(sede)}|${norm(numero)}`
}
