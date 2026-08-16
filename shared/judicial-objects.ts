/**
 * Qué objeto del gasto del Presupuesto Nacional es plata que el Estado paga por perder un juicio.
 *
 * Módulo PURO: sin I/O, sin imports. Lo carga el loader (src/jobs/load-judicial-spending.ts) y lo
 * verifica tests/unit/test-judicial-objects.ts.
 *
 * LA REGLA VA POR CÓDIGO, NUNCA POR TEXTO. El nombre publicado del mismo objeto cambia de año a año
 * («Complemento reparación func. al amparo A21Ley16736» en 2011 es «Reparación p/Sentencias
 * Judiciales y complemento A21L16736» en 2016) y once objetos ajenos contienen las mismas palabras.
 * El código es la clave estable; el texto sirve para auditar, no para decidir.
 *
 * DOS TRAMPAS QUE CAMBIAN LA CIFRA PUBLICADA:
 *
 *   1. «al amparo de» no es un amparo. El objeto 152.27 se llama «Medicamentos al amparo Ordenanza
 *      692/16 MSP»: ahí «amparo» es la preposición jurídica «bajo», no la acción judicial. Son 125
 *      millones en 2019 que no corresponden.
 *   2. El subgrupo del objeto 711 se llama «Sent.Judic.y Acontecimientos Graves o Imprevistos», y
 *      ese segundo tramo (objeto 713) son 4.500 millones por año de imprevistos que no tienen nada
 *      de judicial. Filtrar por subgrupo multiplica la cifra por diez. Se filtra por objeto.
 */

/** El motivo judicial que el nombre oficial del objeto declara. */
export type JudicialCategory = 'sentencia' | 'acuerdo' | 'amparo' | 'indemnizacion'

export interface JudicialObject {
  /** Código del objeto del gasto, canónico (`711`, `45.7`, `42.614`). */
  code: string
  category: JudicialCategory
  /** Nombre corto nuestro, estable entre años. El publicado varía. */
  label: string
  /**
   * `true` cuando el nombre oficial declara una causa judicial. `false` cuando el objeto es una
   * indemnización que el presupuesto no atribuye a ninguna sentencia — se publica aparte y con la
   * salvedad puesta, nunca sumada al titular.
   */
  judicial: boolean
}

/**
 * Los objetos que cuentan. Cada uno se verificó contra el nombre que OPP publica en 2011-2021.
 *
 * `judicial: true` es el titular de la página: el nombre oficial dice sentencia, acuerdo judicial o
 * amparo judicial. `judicial: false` es el objeto 793 «Indemnizaciones», que el presupuesto no
 * atribuye: puede ser una condena, puede ser una expropiación. Se muestra en su propia fila.
 */
const INCLUDED: Record<string, Omit<JudicialObject, 'code'>> = {
  // «Sentencias Judiciales A52 L17930» — la partida central. El art. 52 de la Ley 17.930 es el que
  // habilita a la Contaduría a pagar las condenas contra el Estado.
  '711': { category: 'sentencia', label: 'Sentencias judiciales', judicial: true },
  // «Reparación p/Sentencias Judiciales y complemento A21L16736» — reparación salarial a
  // funcionarios que ganaron el juicio.
  '45.7': { category: 'sentencia', label: 'Reparación por sentencias judiciales', judicial: true },
  // «Pago de sentencia con condena a futuro» — la condena que sigue devengando cada mes.
  '42.614': { category: 'sentencia', label: 'Sentencia con condena a futuro (A35 L18046)', judicial: true },
  '42.617': { category: 'sentencia', label: 'Sentencia con condena a futuro (A52 L17930)', judicial: true },
  // «Acuerdo o Convenio Judicial» — el Estado transa antes del fallo.
  '714': { category: 'acuerdo', label: 'Acuerdo o convenio judicial', judicial: true },
  // «Medicamentos oncologicos por amparos judiciales» — el paciente le gana un amparo al MSP y el
  // Estado compra el medicamento que se negaba a cubrir.
  '152.2': { category: 'amparo', label: 'Medicamentos oncológicos por amparos judiciales', judicial: true },
  // «Articulos medicos quirúrgicos p/ gastos por amparos judicial» — lo mismo, en insumos.
  '194.1': { category: 'amparo', label: 'Artículos médico-quirúrgicos por amparos judiciales', judicial: true },
  // «Indemnizaciones» — sin causa declarada. Fuera del titular, ver `judicial`.
  '793': { category: 'indemnizacion', label: 'Indemnizaciones (causa no declarada)', judicial: false },
}

/**
 * Los objetos que comparten palabra y NO entran, con el motivo. Existe para que el test falle
 * cuando OPP publica un objeto judicial nuevo: cualquier código cuyo nombre traiga una palabra
 * judicial y no esté ni en INCLUDED ni acá es un caso sin decidir.
 */
export const EXCLUDED_LOOKALIKES: Record<string, string> = {
  '42.126': 'Partida salarial del Poder Judicial, no una condena.',
  '42.128': 'Incremento salarial a funcionarios judiciales.',
  '48.35': 'Incremento salarial del Poder Judicial (L.18.719).',
  '152.27': '«Medicamentos al amparo Ordenanza 692/16 MSP»: «al amparo de» es «bajo», no un amparo judicial.',
  '279': 'Mantenimiento y reparaciones edilicias.',
  '513.26': 'Reparación a familiares por violencia doméstica: es una prestación del Estado, no una condena contra él.',
  '513.9': 'Jubilaciones y pensiones de magistrados.',
  '522.2': 'Fondo Permanente de Indemnización del MGAP: compensa animales sacrificados en campañas sanitarias, por ley y sin juicio.',
  '578.5': 'Indemnización por despido y seguro de desempleo: obligación laboral, no una condena.',
  '713': 'Acontecimientos Graves o Imprevistos. Comparte subgrupo con el 711 y no tiene nada de judicial.',
  '749.4': 'Convenio colectivo con funcionarios del Poder Judicial.',
  '749.5': 'Convenio colectivo con el Poder Judicial.',
  '793.1': 'Pasivos militares — indemnización de la L.17.949: prestación por ley, no una condena.',
  '794.1': 'Mantenimiento y reparaciones en el exterior.',
}

/** Las palabras que obligan a decidir un objeto. Sólo el test las usa. */
export const JUDICIAL_WORD_RE = /sentenc|judicial|condena|indemniz|amparo|laudo|litig|juicio|resarc|reparaci/i

/**
 * El código tal como lo publica OPP → forma canónica.
 *
 * Llega como número (`711`, `45.7`) o como texto (`"711.0"`, `"793.0"`), según el año y el tipo de
 * columna del datastore. `711.0` y `711` son el mismo objeto.
 */
export function normalizeObjectCode(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === '') return null
  const n = typeof raw === 'number' ? raw : Number(String(raw).trim().replace(',', '.'))
  if (!Number.isFinite(n)) return null
  // String(45.7) === '45.7' y String(711) === '711': alcanza para quitar el `.0` sin tocar los
  // decimales significativos.
  return String(n)
}

/** El objeto judicial de ese código, o `null` si no cuenta. */
export function classifyJudicialObject(rawCode: unknown): JudicialObject | null {
  const code = normalizeObjectCode(rawCode)
  if (!code) return null
  const hit = INCLUDED[code]
  return hit ? { code, ...hit } : null
}

/** Los códigos que el loader pide al datastore. */
export const JUDICIAL_OBJECT_CODES: string[] = Object.keys(INCLUDED)

/** Los códigos del titular — los que el nombre oficial ata a un juicio. */
export const JUDICIAL_CORE_CODES: string[] = Object.entries(INCLUDED)
  .filter(([, v]) => v.judicial)
  .map(([k]) => k)
