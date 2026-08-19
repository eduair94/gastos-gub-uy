/**
 * Vivienda promovida (Ley 18.795) — datos y contenido.
 *
 * POR QUÉ ESTA INVESTIGACIÓN NO SE PARECE A LAS OTRAS. Todas las demás piezas del sitio
 * arrancan en un número del registro de compras estatales. Esta arranca en su ausencia: la
 * vivienda promovida no es una compra, es un tributo que el Estado decide no cobrar. No genera
 * contratos y por lo tanto no deja una sola línea en el corpus OCDS que este sitio indexa.
 * Esa ausencia es el hallazgo, no una limitación del método.
 *
 * REGLAS DE TÉRMINO, fijadas para toda la pieza y para su traducción:
 *   `gasto tributario`        la estimación que publica la DGI
 *   `renuncia fiscal`         sólo dentro de citas, porque la fuente usa esa palabra
 *   `vivienda promovida`      el régimen
 *   `declaratoria promocional` el acto del Poder Ejecutivo que otorga los beneficios
 *   `año móvil`               la ventana de doce meses que usa la ANV
 * Tres unidades de conteo que NUNCA se mezclan: `proyecto`, `obra`, `vivienda`.
 * Cinco estados que NUNCA se mezclan: ingresado, en estudio, promovido, en construcción, terminado.
 *
 * CUATRO TRAMPAS VERIFICADAS QUE ESTE ARCHIVO YA EVITA. Cambiarlas rompe la pieza:
 *
 *   1. NUNCA el 25% junto al par 2.845 / 2.411 en el mismo bloque. Ese par da 18%, no 25%,
 *      porque 2.845 es el promedio del DEPARTAMENTO de Canelones y el 25% es la LOCALIDAD de
 *      Ciudad de la Costa, que está por encima de su departamento. El lector que divida ve un
 *      error de aritmética que no existe. Van separados y cada uno nombra su unidad geográfica.
 *   2. NUNCA sumar las líneas de la DGI para dar un total del régimen. La DGI publica cinco
 *      líneas separadas y ningún renglón consolidado. La suma sería una cifra nuestra.
 *   3. NUNCA una sola línea continua 2019–2025 para un mismo impuesto. La DGI revisa hacia
 *      atrás y sus ediciones no coinciden. Una serie por edición, rotulada.
 *   4. La serie de precios arranca en 2012, no en 2011. Ningún texto puede decir «desde 2011».
 */

export const VP_MEASURED_ON = '2026-08-17'

// ── El embudo: de lo ingresado a lo levantado ────────────────────────────────

/**
 * OJO CON LAS FECHAS DE CORTE. Los dos primeros peldaños son al 31/07/2026 y el resto al
 * 30/04/2026. Son cortes distintos y no se restan entre sí. Por eso el gráfico los rotula.
 */
export interface FunnelStep { key: string, n: number, cut: string }
export const VP_FUNNEL: FunnelStep[] = [
  { key: 'ingresadas', n: 63248, cut: '2026-07-31' },
  { key: 'promovidas', n: 52713, cut: '2026-07-31' },
  { key: 'obraIniciada', n: 43487, cut: '2026-04-30' },
  { key: 'terminadas', n: 30525, cut: '2026-04-30' },
]

export const VP_STOCK = {
  proyectosPromovidos: 1824,
  viviendasPromovidas: 52713,
  proyectosEnEstudio: 186,
  viviendasEnEstudio: 10535,
  proyectosIngresados: 2200,
  proyectosNoRealizados: 190,
  terminadas: 30525,
  enConstruccion: 12962,
  sinIniciar: 5541,
  obrasIniciadas: 1693,
  obrasFinalizadas: 1263,
  pctProyectosIniciados: 92.0,
  pctViviendasIniciadas: 88.7,
  declaracionesVenta: 26242,
  pctMontevideoVentas: 79.7,
  terminadasCanelones: 2390,
  cortePrincipal: '2026-04-30',
  corteStock: '2026-07-31',
}

/** El único punto histórico verificado, para dar escala al stock actual. */
export const VP_STOCK_2015 = { terminadas: 2867, enConstruccion: 6245, proyectosConObra: 336, cut: '2015-12-31' }

// ── El gasto tributario que estima la DGI ────────────────────────────────────

/**
 * Una serie POR EDICIÓN del informe, nunca empalmadas.
 *
 * La DGI revisa sus cifras hacia atrás y sus proyecciones fallan en las dos direcciones: el
 * IRAE de 2022 se proyectó en 993 millones y se estimó después en 637; el de 2024 se proyectó
 * en 816 y se estimó después en 1.227. Empalmar las ediciones en una línea continua borraría
 * exactamente eso, que es información sobre la calidad del dato.
 *
 * Todo en PESOS URUGUAYOS CORRIENTES, que es como la DGI lo publica. No se convierte a dólares
 * ni se deflacta: las dos operaciones exigen una fuente que la DGI no da.
 */
export interface TaxPoint { year: number, value: number, projected?: boolean }
export interface TaxSeries { edition: string, points: TaxPoint[] }
export interface TaxLine { key: string, dgiCode: string, series: TaxSeries[] }

export const VP_TAX_LINES: TaxLine[] = [
  {
    key: 'iva',
    dgiCode: 'A_59',
    series: [{
      edition: '2021-2024',
      points: [
        { year: 2021, value: 2311012242 }, { year: 2022, value: 2657456991 },
        { year: 2023, value: 3399976790 }, { year: 2024, value: 3710558979, projected: true },
      ],
    }],
  },
  {
    key: 'irae',
    dgiCode: 'B_19',
    series: [
      {
        edition: '2019-2022',
        points: [
          { year: 2019, value: 492345162 }, { year: 2020, value: 886125612 },
          { year: 2021, value: 876546335 }, { year: 2022, value: 993170794, projected: true },
        ],
      },
      {
        edition: '2021-2024',
        points: [
          { year: 2021, value: 905241767 }, { year: 2022, value: 637015036 },
          { year: 2023, value: 796619924 }, { year: 2024, value: 816292363, projected: true },
        ],
      },
      {
        edition: '2022-2025',
        points: [
          { year: 2022, value: 639115091 }, { year: 2023, value: 804191664 },
          { year: 2024, value: 1226819063 }, { year: 2025, value: 1334286720, projected: true },
        ],
      },
    ],
  },
  {
    key: 'patrimonio',
    dgiCode: 'C_10',
    series: [
      {
        edition: '2019-2022',
        points: [
          { year: 2019, value: 139417129 }, { year: 2020, value: 151336445 },
          { year: 2021, value: 186307426 }, { year: 2022, value: 202537708, projected: true },
        ],
      },
      {
        edition: '2021-2024',
        points: [
          { year: 2021, value: 189048063 }, { year: 2022, value: 240968044 },
          { year: 2023, value: 286116502 }, { year: 2024, value: 307301859, projected: true },
        ],
      },
    ],
  },
  {
    key: 'itp',
    dgiCode: 'G_4',
    series: [
      {
        edition: '2019-2022',
        points: [
          { year: 2019, value: 81355918 }, { year: 2020, value: 87426608 },
          { year: 2021, value: 115285099 }, { year: 2022, value: 135138889, projected: true },
        ],
      },
      {
        edition: '2021-2024',
        points: [
          { year: 2021, value: 105712603 }, { year: 2022, value: 170698086 },
          { year: 2023, value: 265056617 }, { year: 2024, value: 281861986, projected: true },
        ],
      },
      {
        edition: '2022-2025',
        points: [
          { year: 2022, value: 172486986 }, { year: 2023, value: 265815247 },
          { year: 2024, value: 376581498 }, { year: 2025, value: 451418435, projected: true },
        ],
      },
    ],
  },
  {
    key: 'irnr',
    dgiCode: 'F_10',
    series: [{
      edition: '2021-2024',
      points: [
        { year: 2021, value: 3470837 }, { year: 2022, value: 4282760 },
        { year: 2023, value: 5092908 }, { year: 2024, value: 5775120, projected: true },
      ],
    }],
  },
]

export const VP_TAX_FACTS = {
  /** La DGI declaró que sus fuentes permiten estimaciones confiables recién desde 2015. */
  primerEjercicioConfiable: 2015,
  empresasBeneficiariasIrae2024: 240,
  pedidoInformesFecha: '2026-04-14',
  respuestaDgiFecha: '2026-05-14',
  diputado: 'Gustavo Salle Lorier',
}

// ── Precio y metraje: la serie de la ANV para Montevideo ─────────────────────

/**
 * Precio promedio de venta por metro cuadrado CONSTRUIDO, Montevideo, por semestre.
 *
 * Las dos monedas van juntas o no va ninguna: en dólares la serie sube y en unidades indexadas
 * no. Publicar sólo el dólar contaría media historia.
 *
 * `n` es la cantidad de casos del semestre. 2012_1 tiene SEIS: se muestra y se marca, y ningún
 * título puede apoyarse en él. 2026_1 es un semestre PARCIAL, cerrado al 01/05/2026.
 */
export interface PriceRow { period: string, usd: number, ui: number, m2: number, n: number, report: string, partial?: boolean, thin?: boolean }
export const VP_PRICES_MVD: PriceRow[] = [
  { period: '2012_1', usd: 1337, ui: 11144, m2: 63, n: 6, report: 'N° 36', thin: true },
  { period: '2012_2', usd: 1396, ui: 11094, m2: 67, n: 71, report: 'N° 36' },
  { period: '2013_1', usd: 1514, ui: 11339, m2: 67, n: 192, report: 'N° 36' },
  { period: '2013_2', usd: 1728, ui: 13901, m2: 66, n: 277, report: 'N° 36' },
  { period: '2017_1', usd: 1884, ui: 14879, m2: 64, n: 824, report: 'N° 50' },
  { period: '2021_2', usd: 2026, ui: 17302, m2: 63, n: 145, report: 'N° 36' },
  { period: '2022_1', usd: 2013, ui: 15682, m2: 60, n: 778, report: 'N° 50' },
  { period: '2024_1', usd: 2301, ui: 14918, m2: 60, n: 1206, report: 'N° 50' },
  { period: '2024_2', usd: 2263, ui: 15441, m2: 59, n: 1254, report: 'N° 50' },
  { period: '2025_1', usd: 2318, ui: 15515, m2: 58, n: 1133, report: 'N° 50' },
  { period: '2025_2', usd: 2415, ui: 15075, m2: 59, n: 1118, report: 'N° 50' },
  { period: '2026_1', usd: 2477, ui: 15073, m2: 59, n: 380, report: 'N° 50', partial: true },
]

/** Contexto nacional, un punto: año móvil a abril de 2026. */
export const VP_PRICE_NACIONAL = { usd: 2450, ui: 15369, varUsd: 6.3, varUi: -1.3, ventana: 'año móvil a abril de 2026' }

/**
 * El sobre legal del área habitable, para superponer a la serie de metraje.
 *
 * ADVERTENCIA QUE VA AL PIE DEL GRÁFICO: el sobre legal es ÁREA HABITABLE y la serie de la ANV
 * es ÁREA CONSTRUIDA. Son dos medidas distintas. La banda es contexto normativo, no la misma
 * variable.
 */
export const VP_AREA_ENVELOPE = [
  { from: 2011, min: 32, max: 107, norm: 'Decreto 355/011' },
  { from: 2018, min: 35, max: 125, norm: 'Decreto 249/018, del 13/08/2018' },
  { from: 2020, min: 25, max: 40, norm: 'Decreto 129/020, del 16/04/2020 — tipología de un ambiente' },
]

// ── Tipología ────────────────────────────────────────────────────────────────

/** Precio promedio por tipología, Montevideo, año móvil a abril de 2026, en dólares. */
export const VP_BY_TYPE = [
  { key: 'monoambiente', usd: 97051 },
  { key: 'uno', usd: 126774 },
  { key: 'dos', usd: 166175 },
  { key: 'tres', usd: 254890 },
]
/** El mismo informe anota 254.980 en su Cuadro 4. Publicamos la prosa y declaramos la diferencia. */
export const VP_TRES_DORM_DISCREPANCIA = 254980

/**
 * Composición de lo aprobado, abril 2020 a diciembre 2024, todo el país.
 *
 * 10% y 61% son las dos cifras del mismo debate y las dos son correctas: el 10% cuenta
 * monoambientes, el 61% suma monoambientes más un dormitorio. No se elige una.
 */
export const VP_COMPOSICION = {
  total: 22706,
  monoambiente: 2268,
  unDormitorio: 11674,
  resto: 8764,
  pctMonoambiente: 10,
  pctUnoYMono: 61,
  desde: '2020-04',
  hasta: '2024-12',
}

// ── Ciudad de la Costa ───────────────────────────────────────────────────────

/**
 * LEER LA TRAMPA 1 DE LA CABECERA ANTES DE TOCAR ESTE BLOQUE.
 *
 * `brechaLocalidad` (25%) compara la LOCALIDAD Ciudad de la Costa contra Montevideo.
 * `porDepartamento` compara DEPARTAMENTOS. Nunca en el mismo párrafo.
 */
export const VP_COSTA = {
  brechaLocalidadUsd: 25,
  brechaLocalidadUi: 26,
  brechaAnteriorUsd: 28,
  brechaAnteriorUi: 29,
  informeActual: 'N° 50, mayo de 2026, año móvil a abril de 2026',
  informeAnterior: 'N° 49, enero de 2026, año móvil a diciembre de 2025',
  varCanelonesUsd: 11.1,
  varCanelonesUi: 3.2,
  varCostaUsd: 9.8,
  varCostaUi: 2.1,
  pctDeclaracionesCanelones2025: 71,
  terminadasCanelones: 2390,
}

/** Precio por m² construido por departamento, año móvil a abril de 2026. Seis departamentos:
 *  la ANV excluye a los que tienen menos de diez declaraciones juradas en el período. */
export const VP_POR_DEPARTAMENTO = [
  { key: 'canelones', usd: 2845, ui: 17885 },
  { key: 'montevideo', usd: 2411, ui: 15125 },
  { key: 'maldonado', usd: 2173, ui: 13531 },
  { key: 'colonia', usd: 2108, ui: 0 },
  { key: 'tacuarembo', usd: 1932, ui: 0 },
  { key: 'salto', usd: 1843, ui: 0 },
]

// ── Entre Todos: el canal que sí apuntaba a la población objetivo ────────────

export const VP_ENTRE_TODOS = {
  proyectosIngresados: 76,
  viviendasAprox: 4950,
  terminadas2022a2024: 376,
  enObra: 488,
  garantiasSiga: 9,
  fideicomisoUsd: 10_000_000,
  devueltoRentasGeneralesUsd: 9_000_000,
  devueltoAnio: 2024,
  decretoCreacion: 'Decreto 59/022, del 7 de febrero de 2022',
  decretoCambio: 'Decreto 130/026, promulgado el 12/06/2026 y publicado el 25/06/2026',
  articulosModificados: [3, 7, 8, 10, 11, 14],
}

// ── El estudio causal ────────────────────────────────────────────────────────

export const VP_ESTUDIO_CAUSAL = {
  autor: 'Nicolás González-Pampillón',
  revista: 'Regional Science and Urban Economics 92 (2022)',
  efectoPct: 12,
  distanciaMetros: 200,
  inversionPctPib: 1.5,
  datosHasta: 2018,
  /** El documento de trabajo del CEP-LSE de 2019 decía «entre 12 y 17%». Se cita la arbitrada. */
  cifraBorrador: '12 a 17%',
}

export const VP_FECOVI = {
  renunciaUsd2023: 106_000_000,
  pctEjecucionVivienda: 29,
  ejecucionDirectaUsd2023: 372_000_000,
  autor: 'Cooperativa Comuna, a pedido del Consejo Directivo de FECOVI',
  fecha: 'julio de 2025',
}

// ── Contenido ────────────────────────────────────────────────────────────────

export interface VpSource { outlet: string, title: string, url: string, date?: string }

const FUENTES: VpSource[] = [
  { outlet: 'IMPO', title: 'Ley 18.795 — Acceso a la vivienda de interés social', url: 'https://www.impo.com.uy/bases/leyes/18795-2011', date: '2011-08-17' },
  { outlet: 'IMPO', title: 'Decreto 355/011, reglamentario de la Ley 18.795', url: 'https://www.impo.com.uy/bases/decretos/355-2011', date: '2011-10-11' },
  { outlet: 'Agencia Nacional de Vivienda', title: 'Informe de precios de viviendas promovidas — Ley 18.795, N° 50', url: 'https://www.anv.gub.uy/sites/default/files/2026-06/INFORME_DE_PRECIOS_%20202605.pdf', date: '2026-05' },
  { outlet: 'Ministerio de Economía y Finanzas', title: 'Montos de exoneraciones fiscales en el régimen previsto en el artículo 4 de la Ley 18.795 (pedido de informes)', url: 'https://www.gub.uy/ministerio-economia-finanzas/institucional/informacion-gestion/pedidos-informes/montos-exoneraciones-fiscales-regimen-previsto', date: '2026-05-14' },
  { outlet: 'El Observador', title: 'Ciudad de la Costa: qué viene después del auge de la vivienda promovida con el precio del metro cuadrado 25% más caro que en Montevideo', url: 'https://www.elobservador.com.uy/cafe-y-negocios/ciudad-la-costa-que-viene-despues-del-auge-la-vivienda-promovida-y-las-casas-precios-mas-altos-que-montevideo-n6054161', date: '2026-08-17' },
  { outlet: 'El Observador', title: 'Vivienda promovida: estudio cuestiona exoneraciones fiscales para la construcción de monoambientes', url: 'https://www.elobservador.com.uy/economia-y-empresas/vivienda-promovida-estudio-cuestiona-exoneraciones-fiscales-construccion-monoambientes-n6001803', date: '2025-05-30' },
  { outlet: 'la diaria', title: 'El 55,4% de los apartamentos nuevos para vivienda construidos en Montevideo en 2025 tienen menos de 40 metros cuadrados', url: 'https://ladiaria.com.uy/politica/articulo/2026/6/el-554-de-los-apartamentos-nuevos-para-vivienda-construidos-en-montevideo-en-2025-tienen-menos-de-40-metros-cuadrados/', date: '2026-06-11' },
  { outlet: 'la diaria', title: 'Ministerio de Vivienda aplicará parte de la Ley de Vivienda Promovida mediante el programa Entre Todos y delegará otras funciones al MEF', url: 'https://ladiaria.com.uy/politica/articulo/2025/8/ministerio-de-vivienda-aplicara-parte-de-la-ley-de-vivienda-promovida-mediante-el-programa-entre-todos-y-delegara-otras-funciones-al-mef/', date: '2025-08-14' },
  { outlet: 'Regional Science and Urban Economics', title: 'González-Pampillón, N. — Spillover effects from new housing supply (vol. 92, 2022)', url: 'https://doi.org/10.1016/j.regsciurbeco.2021.103759', date: '2022' },
  { outlet: 'Ministerio de Vivienda y Ordenamiento Territorial', title: 'Plan Quinquenal de Vivienda y Hábitat 2025-2029', url: 'https://www.anv.gub.uy/sites/default/files/2025-09/PLAN_QUINQUENAL_2026_2029.pdf', date: '2025-09' },
  { outlet: 'IMPO', title: 'Decreto 130/026, modificativo del Decreto 59/022 (programa Entre Todos)', url: 'https://www.impo.com.uy/bases/decretos/130-2026', date: '2026-06-25' },
  { outlet: 'IMPO', title: 'Ley 20.446, Presupuesto Nacional — artículos 414 y 415', url: 'https://www.impo.com.uy/bases/leyes/20446-2025', date: '2026-01-08' },
]

interface VpText {
  kicker: string
  titulo: string
  bajada: string
  scope: string
  origin: string
  portada: { parrafos: string[] }
  ausencia: { titulo: string, parrafos: string[] }
  regimen: { titulo: string, parrafos: string[] }
  construido: { titulo: string, dek: string, parrafos: string[] }
  fiscal: { titulo: string, dek: string, parrafos: string[] }
  producto: { titulo: string, dek: string, parrafos: string[] }
  precio: { titulo: string, dek: string, parrafos: string[] }
  costa: { titulo: string, dek: string, parrafos: string[] }
  entreTodos: { titulo: string, parrafos: string[] }
  contradicciones: { titulo: string, dek: string, puntos: { t: string, d: string }[] }
  noSePuede: { titulo: string, dek: string, grupos: { titulo: string, puntos: string[] }[] }
  cierre: { titulo: string, parrafos: string[] }
  labels: Record<string, string>
  fuentesTitulo: string
}

const ES: VpText = {
  kicker: 'Con la tuya, contribuyente · Investigaciones',
  titulo: 'La vivienda que el Estado no compra',
  bajada: 'La Ley 18.795 exonera impuestos a quien construye vivienda promovida. Es la política de vivienda más grande de los últimos quince años y no deja un solo contrato en el registro de compras estatales. Esto es lo que sí se puede medir, y lo que el Estado no publica.',
  scope: 'Régimen de vivienda promovida, Ley 18.795, 2011–2026',
  origin: 'ANV, DGI, IMPO, MVOT y prensa citada. Ninguna cifra sale del corpus de compras estatales, y eso es el punto.',

  portada: {
    parrafos: [
      'Este sitio mide lo que el Estado compra. Cada peso que aparece acá tiene un contrato, un proveedor y un expediente que se puede abrir. La vivienda promovida no tiene nada de eso: no es una compra, es un impuesto que el Estado decide no cobrar. No genera contratos, no pasa por el sistema de compras estatales y por lo tanto no deja rastro en el registro que este sitio indexa.',
      'Esa ausencia es el motivo de esta pieza. El régimen lleva quince años, promovió 52.713 viviendas y terminó 30.525. La estimación de lo que el Estado resignó por él la publica la Dirección General Impositiva en cinco líneas separadas, sin ningún renglón consolidado, y sólo desde el ejercicio 2015 en adelante, porque antes sus fuentes no permitían una estimación confiable.',
      'Cuando un diputado quiso saber cuánto se había exonerado entre 2012 y 2025, tuvo que pedírselo al Ministerio de Economía. El Ministerio de Vivienda le había contestado antes que sólo podía informar el IVA, porque no tenía los otros datos.',
    ],
  },

  ausencia: {
    titulo: 'Por qué esta investigación no trae una tabla de contratos',
    parrafos: [
      'Las demás investigaciones de este sitio terminan en un buscador donde cualquiera puede repetir la consulta. Esta no puede. El Estado no le paga a nadie para que construya vivienda promovida: le perdona tributos a quien la construye por su cuenta y la vende en el mercado. El dinero nunca entra ni sale de una cuenta pública, así que no hay ordenador del gasto, no hay adjudicación y no hay ocid.',
      'Lo que sí aparece en el registro de compras son las obras que el Ministerio de Vivienda y la Agencia Nacional de Vivienda contratan a su nombre, que son otra cosa y otro presupuesto. Confundir las dos es el error más común cuando se discute vivienda en Uruguay.',
      'Un régimen de exoneraciones es una decisión de política pública tan legítima como una licitación. La diferencia es de control: una licitación deja un expediente que se audita, y una exoneración deja una estimación que se publica agregada, tarde y sin abrir por territorio ni por tipo de vivienda.',
    ],
  },

  regimen: {
    titulo: 'Qué dice la ley, y quién firma',
    parrafos: [
      'El artículo 4 de la Ley 18.795 faculta al Poder Ejecutivo a otorgar siete beneficios, de los literales A) a G). La ley no exonera por sí misma: habilita. Los tributos que nombra son los que gravan la renta, el Impuesto al Patrimonio, el Impuesto al Valor Agregado y el Impuesto a las Trasmisiones Patrimoniales.',
      'La exoneración del IVA a la importación no está en la ley. Está en el artículo 10, literal e), del Decreto 355/011, en la redacción que le dio el Decreto 129/020. Alcanza sólo al IVA y no a los aranceles.',
      'El artículo 5 crea la Comisión Asesora de Inversiones en Vivienda de Interés Social. La Agencia Nacional de Vivienda actúa como órgano asesor de esa comisión y debe pronunciarse en forma preceptiva sobre cada iniciativa. Los dos pronunciamientos son preceptivos y ninguno es vinculante: la declaratoria promocional la dicta el Poder Ejecutivo.',
      'El Decreto 355/011 se promulgó el 6 de octubre de 2011 y lo firmó José Mujica en Consejo de Ministros. IMPO registra once decretos que lo tocan: el base y diez modificativos, el último de febrero de 2022. El Plan Quinquenal del actual gobierno cuenta cuatro cambios reglamentarios. Cuentan cosas distintas, y cualquiera de los dos números obliga a decir cuál se está contando.',
    ],
  },

  construido: {
    titulo: 'Qué se construyó',
    dek: 'Lo aprobado y lo levantado no son lo mismo, y la distinción se pierde todo el tiempo.',
    parrafos: [
      'Al 31 de julio de 2026 la Agencia Nacional de Vivienda cuenta 1.824 proyectos promovidos, con 52.713 viviendas. Otros 186 proyectos, con 10.535 viviendas, seguían en estudio. Ingresaron 2.200 proyectos en total y 190 no se llevaron a cabo, por desistimiento del inversor o por revocación.',
      'Al 30 de abril de 2026 había 30.525 viviendas terminadas y 12.962 en construcción. Iniciaron obra 1.616 proyectos, que involucran 1.693 obras, de las cuales 1.263 finalizaron. La cantidad de proyectos terminados no coincide con la de obras terminadas porque un proyecto puede incluir varias obras. No iniciaron obra 141 proyectos, con 5.541 viviendas.',
      'Para dar escala: al 31 de diciembre de 2015 el régimen llevaba 2.867 viviendas terminadas y 6.245 en construcción. El grueso de lo que hoy existe se levantó después.',
      'La ANV mide por visitas de sus arquitectos a las obras, no por registro administrativo. Y publica stock acumulado en cada informe, no flujo anual: por eso este sitio no publica una serie de viviendas terminadas por año. Restar dos informes consecutivos daría ese flujo, pero sería un cálculo nuestro sobre la serie de otro.',
    ],
  },

  fiscal: {
    titulo: 'Cuánto resigna el Estado',
    dek: 'Cinco líneas separadas, dos ediciones que no coinciden y ningún total publicado.',
    parrafos: [
      'La Dirección General Impositiva estima el gasto tributario del régimen en cinco líneas: IVA, IRAE, Impuesto al Patrimonio, Impuesto a las Trasmisiones Patrimoniales e IRNR. Publica cada una por separado y no publica un renglón consolidado de la Ley 18.795. Sumarlas produciría una cifra nuestra, no una cifra oficial, así que acá no se suman.',
      'La línea más cara es la exoneración de IVA sobre las ventas de viviendas nuevas amparadas: 3.399.976.790 pesos en 2023, según la edición 2021-2024. La que más crece en términos relativos es la del Impuesto a las Trasmisiones Patrimoniales, que en la edición 2022-2025 se multiplica por 2,6 entre 2022 y 2025.',
      'La DGI revisa sus propias cifras entre ediciones y sus proyecciones fallan en las dos direcciones. El IRAE de 2022 se proyectó en 993.170.794 pesos y después se estimó en 637.015.036: la proyección quedó un 55% por encima. El de 2024 se proyectó en 816.292.363 y después se estimó en 1.226.819.063: quedó un 33% por debajo. No es un error del organismo; es el límite de titular con una proyección.',
      'El 14 de abril de 2026 el diputado Gustavo Salle Lorier pidió al Ministerio de Economía los montos exonerados entre 2012 y 2025 de IRAE, Impuesto al Patrimonio e ITP. En el escrito consignó que el Ministerio de Vivienda le había respondido antes que sólo podía informar el IVA, porque no poseía los otros datos. El Ministerio de Economía contestó el 14 de mayo remitiendo lo informado por la DGI: una serie que arranca en 2015 y excluye 2025, porque las estimaciones de ese ejercicio todavía no habían sido elevadas para su aprobación.',
      'El gasto tributario mide el valor de la excepción, no la recaudación que se obtendría si la excepción se eliminara. Lo dice la propia DGI en su informe. Cualquier lectura del tipo «esta plata podría haber ido a otra cosa» excede lo que la fuente sostiene.',
    ],
  },

  producto: {
    titulo: 'Qué unidad se construyó',
    dek: 'El régimen cambió de producto sin cambiar de ley.',
    parrafos: [
      'El sobre legal del área habitable elegible fue de 32 a 107 metros cuadrados en 2011. El Decreto 249/018, de agosto de 2018, lo llevó a 35–125 y declaró como motivo adecuar el reglamento a la Ley 19.581, que había modificado los mínimos habitacionales. El Decreto 129/020, de abril de 2020, incorporó una tipología nueva de 25 a 40 metros cuadrados para unidades de un ambiente.',
      'Entre abril de 2020 y diciembre de 2024, el 61% de las viviendas promovidas aprobadas en el país son monoambientes o de un dormitorio: 13.942 de 22.706. Algo más del 50% son de un dormitorio, 11.674, y el 10% son monoambientes, 2.268. La cifra es de un estudio de las arquitectas Alina del Castillo y Graciela Lamoglie, de la Facultad de Arquitectura, Diseño y Urbanismo, informado por El Observador.',
      'El 10% y el 61% son las dos cifras del mismo debate y las dos son correctas. El 10% cuenta monoambientes. El 61% suma monoambientes más un dormitorio. Elegir una y callar la otra es lo que convierte el dato en munición.',
      'Las autoras proponen regular el porcentaje de viviendas a promover según la cantidad de dormitorios, para evitar que las intervenciones respondan sólo a maximizar la rentabilidad del suelo. El director nacional de Vivienda, Milton Machado, atribuyó la tendencia a un cambio cultural y estructural de las familias uruguayas y se manifestó contrario a prohibir los monoambientes por ley.',
    ],
  },

  precio: {
    titulo: 'A qué precio, y para quién',
    dek: 'En dólares la serie sube. En unidades indexadas, no. Las dos se publican.',
    parrafos: [
      'La ANV publica el precio promedio de venta por metro cuadrado construido de vivienda promovida en Montevideo, por semestre, desde 2012. En dólares pasó de 1.396 en el segundo semestre de 2012 a 2.477 en el primero de 2026. En unidades indexadas, la misma serie va de 11.094 a 15.073, y su punto más alto no es el último: es 17.302, del segundo semestre de 2021.',
      'El promedio nacional del año móvil a abril de 2026 es de 2.450 dólares y 15.369 unidades indexadas por metro cuadrado construido. Subió 6,3% en dólares y bajó 1,3 en unidades indexadas contra el año móvil anterior. Las dos monedas cuentan historias distintas y por eso van juntas.',
      'El metraje promedio de la unidad vendida en Montevideo cayó de 64 metros cuadrados en el primer semestre de 2017 a 59 en el primero de 2026. La caída y la incorporación del monoambiente al reglamento coinciden en el tiempo. Ningún estudio verificado establece que una cosa haya causado la otra.',
      'Los inversores presentaron 26.242 declaraciones juradas de venta hasta el 1 de mayo de 2026, y Montevideo concentra el 79,7%.',
      'Una investigación de la Universidad de la República presentada a la Comisión Asesora de Vivienda concluye que sólo los quintiles cuarto y quinto de ingresos pueden acceder a crédito hipotecario para comprar una de estas viviendas. Desde el tercer quintil se puede acceder por alquiler, afectando hasta el 30% del ingreso del hogar. El mismo equipo concluye que, con los datos analizados, no es posible determinar que haya habido una mejora de la asequibilidad para los destinatarios explícitos en el texto de la ley.',
      'El único estudio causal arbitrado sobre el régimen es de Nicolás González-Pampillón, publicado en Regional Science and Urban Economics en 2022. Mide que el régimen subió un 12% el precio de la vivienda existente cercana, por un aumento de un desvío estándar en la intensidad de exposición, y que el efecto se desvanece a unos 200 metros de la frontera. El autor señala que no hubo reglas explícitas sobre las características socioeconómicas de compradores o inquilinos, y que los desarrolladores terminaron construyendo para hogares de ingresos medios y altos. Sus datos de precios llegan hasta 2018, antes del tramo de mayor volumen del régimen.',
    ],
  },

  costa: {
    titulo: 'Ciudad de la Costa',
    dek: 'El caso donde se ve el producto que el régimen terminó produciendo.',
    parrafos: [
      'Canelones es el departamento con el precio por metro cuadrado construido más alto del país en vivienda promovida: 2.845 dólares y 17.885 unidades indexadas en el año móvil a abril de 2026, contra 2.411 y 15.125 de Montevideo, y 2.450 del total del país. El cuadro cubre seis departamentos, porque la ANV excluye a los que tienen menos de diez declaraciones juradas en el período.',
      'La ANV atribuye la evolución del departamento a una localidad concreta. En Ciudad de la Costa el metro cuadrado construido de vivienda promovida es 25% más caro que en Montevideo medido en dólares, y 26% medido en unidades indexadas.',
      'La brecha se achicó. El informe anterior, sobre el año móvil a diciembre de 2025, la medía en 28% y 29%. Y la localidad crece menos que su departamento: Canelones subió 11,1% en dólares y 3,2% en unidades indexadas contra el año móvil anterior, mientras Ciudad de la Costa subió 9,8% y 2,1%. El titular del auge describe un movimiento que ya está desacelerando.',
      'El 71% de las declaraciones juradas de venta de Canelones del año 2025 corresponden a viviendas de Ciudad de la Costa, y la propia ANV aclara que ese registro es menor al de informes anteriores. En agosto de 2026 circuló en prensa un 87% para esa misma participación. Ese número no está en el informe de la ANV que las notas citan por su nombre, y no encontramos documento público que lo sostenga.',
      'El cierre devuelve la pieza a su eje. No existe ninguna cifra oficial de cuánto impuesto se resignó en Ciudad de la Costa, ni de cuántas viviendas promovidas se terminaron ahí. La DGI no abre el gasto tributario por territorio y la ANV abre las viviendas terminadas por departamento, no por localidad. El único dato territorial de obra es departamental: 2.390 viviendas terminadas en todo Canelones al 30 de abril de 2026.',
    ],
  },

  entreTodos: {
    titulo: 'El canal que sí apuntaba a la población objetivo',
    parrafos: [
      'Dentro del régimen, el Estado diseñó un programa dirigido: Entre Todos — Sueños en Obra, creado por el Decreto 59/022 en febrero de 2022. Según el balance que el actual Ministerio de Vivienda hizo de la gestión anterior, ese canal no funcionó como se esperaba.',
      'En Entre Todos las familias nunca accedieron por sorteo público. La única vía, desde el inicio, fue un listado de aspirantes que las propias empresas promotoras presentaban al ministerio. Al cierre de 2024 el programa registraba 76 proyectos ingresados por unas 4.950 viviendas, con 376 terminadas entre 2022 y 2024 y 488 en obra.',
      'Se otorgaron nueve garantías SiGa Entre Todos, ocho de ellas firmadas a fines de febrero de 2025. Ningún proyecto usó cofinanciamiento del ministerio. De los 10 millones de dólares transferidos en 2022 al fideicomiso de coinversión, 9 millones volvieron a rentas generales a fines de 2024, a solicitud del Ministerio de Economía, porque no se concretó ningún proyecto de coinversión.',
      'El ministerio califica el impacto del programa como limitado y lo atribuye a demoras en la configuración de los instrumentos. Señala además que la localización de varios proyectos en zonas sin servicios es un aspecto crítico que lo diferencia de los demás programas. Todos estos juicios son del Ministerio de Vivienda sobre la gestión anterior, y así hay que leerlos.',
      'El Decreto 130/026, publicado el 25 de junio de 2026, dio nueva redacción a seis artículos del decreto que creó el programa. El nuevo artículo 14 ya no fija porcentaje ni plazo para el aporte económico: remite a la Ley 13.728 y deja que la Dirección Nacional de Vivienda defina las condiciones según la disponibilidad presupuestal. El texto anterior sí fijaba cifras, hasta 30% del precio financiado por un mínimo de cinco años.',
      'Varias notas de julio de 2026 sostienen que ese decreto obliga a destinar al menos la mitad de las viviendas a llamados públicos del ministerio. Ninguno de los seis artículos modificados contiene ese porcentaje. Y ningún decreto de 2026 modificó el Decreto 355/011: lo que cambió en 2026 es el programa Entre Todos, no el régimen general.',
    ],
  },

  contradicciones: {
    titulo: 'Dónde las fuentes no cierran',
    dek: 'Van en el cuerpo y no al pie, porque muestran cómo se lee una fuente oficial.',
    puntos: [
      { t: 'La ANV se contradice consigo misma, tres veces en el mismo informe', d: 'En el informe N° 50 el Cuadro 2 da 2.173 dólares para Maldonado y la prosa de la página 4 dice 2.108, que es el valor de Colonia. La prosa dice 254.890 dólares para tres dormitorios en Montevideo y el Cuadro 4 dice 254.980. La prosa da 15.379 unidades indexadas para Montevideo en el primer semestre de 2026 y el Cuadro 3 da 15.073. En los tres casos publicamos el cuadro y lo citamos como cuadro.' },
      { t: 'El conteo de viviendas no cierra entre fuentes', d: 'La ANV publica 1.824 proyectos promovidos con 52.713 viviendas sobre 2.200 ingresados. Ámbito publicó en marzo de 2026, con datos de la ANV, 2.110 proyectos presentados y 62.000 viviendas proyectadas, de las cuales 47.000 aprobadas. Son cortes y definiciones distintas de «promovido». Publicamos los dos, con su fecha, sin elegir.' },
      { t: 'El gasto tributario de la ANV y el de la DGI no son comparables', d: 'La ANV mide devolución de IVA compras sobre costos directos de obra. La DGI mide, en su línea A_59, la exoneración de IVA sobre las ventas. Son dos conceptos distintos: nunca se suman y nunca se comparan sin decir esto.' },
      { t: 'El estudio causal tiene dos cifras según la versión', d: 'El documento de trabajo del CEP-LSE de noviembre de 2019 dice «entre 12 y 17%». La versión arbitrada, publicada en 2022, dice 12%. Citamos la arbitrada y declaramos que existe la otra.' },
    ],
  },

  noSePuede: {
    titulo: 'Lo que no se puede afirmar',
    dek: 'Cada pregunta que quedó sin respuesta, y el motivo por el que no la tiene.',
    grupos: [
      {
        titulo: 'Sobre el dinero',
        puntos: [
          'Cuánto costó el régimen en total. La DGI publica cinco líneas separadas y ningún renglón consolidado. Sumarlas produce una cifra nuestra.',
          'Cuánto costó en dólares. La DGI publica pesos corrientes. Convertir exige un tipo de cambio de otra fuente y comparar años exige deflactar. Ninguna de las dos operaciones está en la fuente.',
          'Cuánto costó entre 2012 y 2014. La DGI declaró que sus fuentes permiten estimaciones confiables recién desde el ejercicio 2015.',
          'Cuánto costó en 2025 y 2026. El dato de 2025 es proyección en todas las ediciones disponibles. Para 2026 no existe estimación.',
          'Cuánto se resignó en Ciudad de la Costa, en Canelones o en cualquier departamento. La DGI no abre el gasto tributario por territorio.',
          'Cuánto exonera una vivienda, y cuánto cuestan los monoambientes. La DGI no abre por unidad ni por tipología.',
        ],
      },
      {
        titulo: 'Sobre las viviendas',
        puntos: [
          'Cuántas se terminaron cada año. La ANV publica stock acumulado, no flujo. La resta entre informes sería cálculo nuestro.',
          'Cuántas se alquilan. La declaratoria obliga al inversor a declarar los contratos de arrendamiento ante la ANV. La ANV publica sólo las declaraciones juradas de venta. El dato existe en poder del Estado y no se difunde.',
          'Cuántas están vacías o en alquiler temporario. El Censo 2023 mide viviendas desocupadas pero no las cruza con el régimen, y no hay fuente oficial de alquiler temporario.',
          'Quién compró. La ANV no abre por tipo de comprador, residencia ni destino declarado. El estudio de la Udelar dice quién puede comprar, no quién compró.',
          'Cuántas se terminaron en Ciudad de la Costa. La ANV abre las terminadas por departamento, no por localidad.',
        ],
      },
      {
        titulo: 'Sobre las causas',
        puntos: [
          'Si el régimen abarató la vivienda promovida. El único estudio causal arbitrado mide el derrame sobre el stock existente cercano, no el precio de la unidad exonerada.',
          'Si el efecto de 12% sigue vigente. Los datos de precios de ese estudio llegan hasta 2018, antes del tramo de mayor volumen.',
          'Si el cambio reglamentario de 2020 causó la caída del metraje. Las dos cosas coinciden en el tiempo y ningún estudio verificado establece la causa.',
        ],
      },
      {
        titulo: 'Sobre lo que buscamos y no encontramos',
        puntos: [
          'No hallamos ningún informe del Tribunal de Cuentas ni de la Auditoría Interna de la Nación sobre el régimen. Buscamos en el sitio del Tribunal, en su buscador de resoluciones, en sus memorias anuales y en la página de observaciones del Parlamento. Sólo aparece el dictamen sobre el balance de la ANV como organismo. Esto se publica como búsqueda sin resultado, no como afirmación de que la auditoría no existe.',
          'El texto del reglamento vigente, la Resolución Ministerial 774/2022, no se pudo leer: el PDF que publica la ANV es un escaneo sin capa de texto.',
          'El 87% de participación de Ciudad de la Costa en las ventas de Canelones circuló en prensa sin documento público que lo sostenga.',
        ],
      },
    ],
  },

  cierre: {
    titulo: 'El encuadre, y va escrito',
    parrafos: [
      'Nada de lo anterior describe una irregularidad. El artículo 4 de la Ley 18.795 faculta al Poder Ejecutivo a otorgar los beneficios, y cada declaratoria promocional es un acto suyo, previo pronunciamiento preceptivo de la Agencia Nacional de Vivienda y de la Comisión Asesora. La discusión es sobre el diseño de una política pública, no sobre su legalidad.',
      'Lo que esta pieza sí sostiene es más simple. Quince años después, el Estado no puede decir cuánto le costó el régimen en total, ni cuánto costó por vivienda, ni dónde. Puede decir cuántas viviendas se levantaron, porque las visita un arquitecto. La asimetría entre esas dos capacidades es una decisión, no un accidente, y es la que hace que este texto no pueda terminar en un buscador.',
    ],
  },

  labels: {
    funnel: 'De lo ingresado a lo terminado',
    funnelHelp: 'Los dos primeros peldaños son al 31/07/2026 y el resto al 30/04/2026. Cortes distintos: no se restan entre sí.',
    taxChart: 'Gasto tributario estimado por la DGI, por impuesto',
    taxHelp: 'Pesos uruguayos corrientes. Una serie por edición del informe, nunca empalmadas: la DGI revisa hacia atrás. El último punto de cada edición es proyección.',
    priceChart: 'Precio de venta por metro cuadrado construido, Montevideo',
    priceHelp: 'Vivienda promovida, por semestre. En dólares la serie sube; en unidades indexadas, no. 2012_1 tiene 6 casos y 2026_1 es un semestre parcial.',
    areaChart: 'Metraje promedio de la unidad vendida, Montevideo',
    areaHelp: 'Área construida, en metros cuadrados. El sobre legal del reglamento mide área habitable, que es otra medida: va como contexto, no como la misma variable.',
    typeChart: 'Precio promedio por tipología, Montevideo',
    typeHelp: 'Año móvil a abril de 2026, en dólares. El mismo informe anota 254.980 para tres dormitorios en su Cuadro 4.',
    compChart: 'Composición de lo aprobado, abril 2020 a diciembre 2024',
    compHelp: 'Sobre 22.706 viviendas, todo el país. Estudio de FADU-Udelar informado por El Observador.',
    deptChart: 'Precio por metro cuadrado construido, por departamento',
    deptHelp: 'Año móvil a abril de 2026. Seis departamentos: la ANV excluye a los que tienen menos de diez declaraciones juradas en el período.',
    sources: 'Fuentes',
    iva: 'IVA',
    irae: 'IRAE',
    patrimonio: 'Impuesto al Patrimonio',
    itp: 'Trasmisiones Patrimoniales',
    irnr: 'IRNR',
    monoambiente: 'Monoambiente',
    uno: '1 dormitorio',
    dos: '2 dormitorios',
    tres: '3 dormitorios',
    resto: 'Dos o más dormitorios',
    canelones: 'Canelones',
    montevideo: 'Montevideo',
    maldonado: 'Maldonado',
    colonia: 'Colonia',
    tacuarembo: 'Tacuarembó',
    salto: 'Salto',
    ingresadas: 'Ingresadas',
    promovidas: 'Promovidas',
    obraIniciada: 'Con obra iniciada',
    terminadas: 'Terminadas',
    usd: 'Dólares',
    ui: 'Unidades indexadas',
  },
  fuentesTitulo: 'Fuentes',
}

const EN: VpText = {
  kicker: 'Con la tuya, contribuyente · Investigations',
  titulo: 'The housing the state does not buy',
  bajada: 'Law 18.795 waives taxes for developers who build promoted housing. It is Uruguay\'s largest housing policy of the past fifteen years and it leaves not one contract in the public procurement record. This is what can be measured, and what the state does not publish.',
  scope: 'Promoted housing regime, Law 18.795, 2011–2026',
  origin: 'ANV, DGI, IMPO, MVOT and the press cited. No figure comes from the procurement corpus, and that is the point.',

  portada: {
    parrafos: [
      'This site measures what the state buys. Every peso here has a contract, a supplier and a file anyone can open. Promoted housing has none of that: it is not a purchase, it is a tax the state chooses not to collect. It generates no contracts, never passes through the procurement system, and therefore leaves no trace in the record this site indexes.',
      'That absence is the reason for this piece. The regime is fifteen years old, it promoted 52,713 homes and finished 30,525. The estimate of what the state gave up is published by the tax office in five separate lines, with no consolidated total, and only from the 2015 tax year onward, because before that its sources did not allow a reliable estimate.',
      'When a member of parliament wanted to know how much had been waived between 2012 and 2025, he had to ask the Ministry of Economy. The Housing Ministry had previously replied that it could only report VAT, because it did not hold the other data.',
    ],
  },

  ausencia: {
    titulo: 'Why this investigation carries no table of contracts',
    parrafos: [
      'Every other investigation on this site ends in a search anyone can repeat. This one cannot. The state pays nobody to build promoted housing: it forgives taxes to whoever builds it privately and sells it on the market. The money never enters or leaves a public account, so there is no spending officer, no award and no ocid.',
      'What does appear in the procurement record are the works the Housing Ministry and the National Housing Agency contract in their own name, which are a different thing on a different budget. Confusing the two is the commonest error in Uruguay\'s housing debate.',
      'A tax-exemption regime is as legitimate a policy instrument as a tender. The difference is oversight: a tender leaves a file that can be audited, and an exemption leaves an estimate published in aggregate, late, and not broken down by territory or housing type.',
    ],
  },

  regimen: {
    titulo: 'What the law says, and who signs',
    parrafos: [
      'Article 4 of Law 18.795 empowers the Executive to grant seven benefits, from paragraph A) to G). The law does not exempt by itself: it enables. The taxes it names are those on income, the wealth tax, VAT and the property transfer tax.',
      'The import VAT exemption is not in the law. It is in article 10, paragraph e), of Decree 355/011, as worded by Decree 129/020. It covers only VAT, not customs duties.',
      'Article 5 creates the Advisory Commission on Social-Interest Housing Investment. The National Housing Agency acts as adviser to that commission and must rule on every initiative. Both opinions are mandatory to obtain and neither is binding: the promotional declaration is issued by the Executive.',
      'Decree 355/011 was enacted on 6 October 2011 and signed by José Mujica in cabinet. IMPO records eleven decrees touching it: the base decree and ten amendments, the last from February 2022. The current government\'s Five-Year Plan counts four regulatory changes. They count different things, and either number obliges you to say which.',
    ],
  },

  construido: {
    titulo: 'What was built',
    dek: 'Approved and built are not the same, and the distinction is lost constantly.',
    parrafos: [
      'As of 31 July 2026 the National Housing Agency counts 1,824 promoted projects, with 52,713 homes. Another 186 projects, with 10,535 homes, were still under review. In total 2,200 projects entered and 190 did not proceed, through investor withdrawal or revocation.',
      'As of 30 April 2026 there were 30,525 homes finished and 12,962 under construction. Works began on 1,616 projects, involving 1,693 building works, of which 1,263 were completed. The count of finished projects differs from finished works because one project may include several works. Works never began on 141 projects, with 5,541 homes.',
      'For scale: as of 31 December 2015 the regime had 2,867 homes finished and 6,245 under construction. Most of what exists today was built afterwards.',
      'The ANV measures through site visits by its own architects, not from an administrative register. And it publishes cumulative stock in each report, not annual flow: that is why this site publishes no series of homes finished per year. Subtracting two consecutive reports would give that flow, but it would be our calculation on someone else\'s series.',
    ],
  },

  fiscal: {
    titulo: 'What the state gives up',
    dek: 'Five separate lines, editions that do not agree, and no published total.',
    parrafos: [
      'The tax office estimates the regime\'s tax expenditure in five lines: VAT, corporate income tax, wealth tax, property transfer tax and non-resident income tax. It publishes each separately and publishes no consolidated line for Law 18.795. Adding them would produce our figure, not an official one, so they are not added here.',
      'The costliest line is the VAT exemption on sales of new covered homes: 3,399,976,790 pesos in 2023, per the 2021-2024 edition. The fastest-growing in relative terms is the property transfer tax, which in the 2022-2025 edition multiplies by 2.6 between 2022 and 2025.',
      'The tax office revises its own figures between editions, and its projections miss in both directions. Corporate income tax for 2022 was projected at 993,170,794 pesos and later estimated at 637,015,036: the projection was 55% too high. For 2024 it was projected at 816,292,363 and later estimated at 1,226,819,063: 33% too low. This is not an error by the agency; it is the limit of headlining with a projection.',
      'On 14 April 2026 deputy Gustavo Salle Lorier asked the Ministry of Economy for the amounts waived between 2012 and 2025 under corporate income tax, wealth tax and property transfer tax. In the filing he recorded that the Housing Ministry had previously answered it could only report VAT, because it held no other data. The Ministry of Economy replied on 14 May, forwarding the tax office figures: a series starting in 2015 and excluding 2025, because that year\'s estimates had not yet been submitted for approval.',
      'Tax expenditure measures the value of the exception, not the revenue that would be collected if the exception were removed. The tax office says so in its own report. Any reading along the lines of "this money could have gone elsewhere" exceeds what the source supports.',
    ],
  },

  producto: {
    titulo: 'What kind of unit was built',
    dek: 'The regime changed product without changing law.',
    parrafos: [
      'The eligible habitable-area envelope ran from 32 to 107 square metres in 2011. Decree 249/018, of August 2018, moved it to 35–125 and stated its purpose was to align the regulation with Law 19.581, which had changed minimum housing standards. Decree 129/020, of April 2020, added a new 25-to-40 square metre type for studio units.',
      'Between April 2020 and December 2024, 61% of the promoted homes approved nationwide are studios or one-bedroom units: 13,942 of 22,706. Slightly over 50% are one-bedroom, 11,674, and 10% are studios, 2,268. The figure comes from a study by architects Alina del Castillo and Graciela Lamoglie, of the Faculty of Architecture, Design and Urbanism, reported by El Observador.',
      'The 10% and the 61% are the two figures of the same argument and both are correct. The 10% counts studios. The 61% adds studios and one-bedroom units. Picking one and omitting the other is what turns the datum into ammunition.',
      'The authors propose regulating the share of promoted housing by number of bedrooms, to prevent developments from responding only to maximising land returns. The national housing director, Milton Machado, attributed the trend to a cultural and structural change in Uruguayan families and said he opposed banning studios by law.',
    ],
  },

  precio: {
    titulo: 'At what price, and for whom',
    dek: 'In dollars the series rises. In inflation-indexed units, it does not. Both are published.',
    parrafos: [
      'The ANV publishes the average sale price per square metre built of promoted housing in Montevideo, by half-year, from 2012. In dollars it went from 1,396 in the second half of 2012 to 2,477 in the first half of 2026. In inflation-indexed units the same series runs from 11,094 to 15,073, and its peak is not the last point: it is 17,302, in the second half of 2021.',
      'The national average for the rolling year to April 2026 is 2,450 dollars and 15,369 indexed units per square metre built. It rose 6.3% in dollars and fell 1.3 in indexed units against the previous rolling year. The two currencies tell different stories, which is why they travel together.',
      'The average floor area of the unit sold in Montevideo fell from 64 square metres in the first half of 2017 to 59 in the first half of 2026. The fall and the addition of the studio type to the regulation coincide in time. No verified study establishes that one caused the other.',
      'Investors filed 26,242 sworn sale declarations up to 1 May 2026, and Montevideo accounts for 79.7%.',
      'Research by the University of the Republic presented to the Housing Advisory Commission concludes that only the fourth and fifth income quintiles can obtain mortgage credit to buy one of these homes. From the third quintile access is possible through renting, taking up to 30% of household income. The same team concludes that, with the data analysed, it is not possible to determine that affordability improved for the beneficiaries the law explicitly names.',
      'The only peer-reviewed causal study of the regime is by Nicolás González-Pampillón, published in Regional Science and Urban Economics in 2022. It measures that the regime raised the price of nearby existing housing by 12%, for a one-standard-deviation increase in exposure intensity, and that the effect fades about 200 metres from the boundary. The author notes there were no explicit rules on the socioeconomic characteristics of buyers or tenants, and that developers ended up building for middle and high income households. His price data run to 2018, before the regime\'s highest-volume stretch.',
    ],
  },

  costa: {
    titulo: 'Ciudad de la Costa',
    dek: 'The case where the product the regime actually produced becomes visible.',
    parrafos: [
      'Canelones is the department with the highest price per square metre built in promoted housing in the country: 2,845 dollars and 17,885 indexed units in the rolling year to April 2026, against 2,411 and 15,125 for Montevideo, and 2,450 for the country as a whole. The table covers six departments, because the ANV excludes those with fewer than ten sworn declarations in the period.',
      'The ANV attributes the department\'s trajectory to one locality. In Ciudad de la Costa the square metre built of promoted housing is 25% more expensive than in Montevideo measured in dollars, and 26% measured in indexed units.',
      'The gap narrowed. The previous report, covering the rolling year to December 2025, measured it at 28% and 29%. And the locality is growing more slowly than its department: Canelones rose 11.1% in dollars and 3.2% in indexed units against the previous rolling year, while Ciudad de la Costa rose 9.8% and 2.1%. The boom in the headline describes a movement already slowing.',
      '71% of Canelones\' 2025 sworn sale declarations correspond to homes in Ciudad de la Costa, and the ANV itself notes that this count is lower than in earlier reports. In August 2026 a figure of 87% for that same share circulated in the press. That number is not in the ANV report the articles cite by name, and we found no public document supporting it.',
      'The close returns the piece to its axis. There is no official figure for how much tax was given up in Ciudad de la Costa, nor for how many promoted homes were finished there. The tax office does not break tax expenditure down by territory, and the ANV breaks finished homes down by department, not by locality. The only territorial construction figure is departmental: 2,390 homes finished in all of Canelones as of 30 April 2026.',
    ],
  },

  entreTodos: {
    titulo: 'The channel that did aim at the target population',
    parrafos: [
      'Inside the regime, the state designed a targeted programme: Entre Todos — Sueños en Obra, created by Decree 59/022 in February 2022. According to the current Housing Ministry\'s assessment of the previous administration, that channel did not work as expected.',
      'In Entre Todos families never gained access by public ballot. From the start the only route was a list of applicants that the developer firms themselves submitted to the ministry. By the end of 2024 the programme recorded 76 projects entered for some 4,950 homes, with 376 finished between 2022 and 2024 and 488 under construction.',
      'Nine SiGa Entre Todos guarantees were granted, eight of them signed in late February 2025. No project used ministry co-financing. Of the 10 million dollars transferred in 2022 to the co-investment trust, 9 million returned to general revenue in late 2024, at the Ministry of Economy\'s request, because no co-investment project materialised.',
      'The ministry describes the programme\'s impact as limited and attributes it to delays in setting up the instruments. It also notes that the siting of several projects in areas without services is a critical aspect distinguishing it from the ministry\'s other programmes. All these judgements are the Housing Ministry\'s about the previous administration, and must be read that way.',
      'Decree 130/026, published on 25 June 2026, re-worded six articles of the decree that created the programme. The new article 14 no longer sets a percentage or a term for the economic contribution: it refers to Law 13.728 and lets the National Housing Directorate define conditions according to budget availability. The previous text did set figures, up to 30% of the financed price for a minimum of five years.',
      'Several July 2026 articles claim the decree requires at least half the homes to go to public ministry calls. None of the six amended articles contains that percentage. And no 2026 decree amended Decree 355/011: what changed in 2026 is the Entre Todos programme, not the general regime.',
    ],
  },

  contradicciones: {
    titulo: 'Where the sources do not agree',
    dek: 'These go in the body, not in a footnote, because they show how an official source is read.',
    puntos: [
      { t: 'The ANV contradicts itself three times in the same report', d: 'In report N° 50, Table 2 gives 2,173 dollars for Maldonado while the prose on page 4 says 2,108, which is Colonia\'s value. The prose says 254,890 dollars for three-bedroom units in Montevideo and Table 4 says 254,980. The prose gives 15,379 indexed units for Montevideo in the first half of 2026 and Table 3 gives 15,073. In all three we publish the table and cite it as the table.' },
      { t: 'The count of homes does not agree across sources', d: 'The ANV publishes 1,824 promoted projects with 52,713 homes out of 2,200 entered. Ámbito published in March 2026, using ANV data, 2,110 projects submitted and 62,000 homes projected, of which 47,000 approved. These are different cut-offs and different definitions of "promoted". We publish both, with their dates, without choosing.' },
      { t: 'The ANV\'s tax expenditure and the tax office\'s are not comparable', d: 'The ANV measures VAT refunds on direct construction costs. The tax office measures, in line A_59, the VAT exemption on sales. They are two different concepts: never added, and never compared without saying this.' },
      { t: 'The causal study has two figures depending on the version', d: 'The CEP-LSE working paper of November 2019 says "between 12 and 17%". The peer-reviewed version, published in 2022, says 12%. We cite the peer-reviewed one and declare that the other exists.' },
    ],
  },

  noSePuede: {
    titulo: 'What cannot be asserted',
    dek: 'Every question left unanswered, and why it has no answer.',
    grupos: [
      {
        titulo: 'About the money',
        puntos: [
          'What the regime cost in total. The tax office publishes five separate lines and no consolidated one. Adding them produces our figure.',
          'What it cost in dollars. The tax office publishes current pesos. Converting requires an exchange rate from another source and comparing years requires deflating. Neither operation is in the source.',
          'What it cost between 2012 and 2014. The tax office stated its sources allow reliable estimates only from the 2015 tax year.',
          'What it cost in 2025 and 2026. The 2025 figure is a projection in every available edition. For 2026 no estimate exists.',
          'What was given up in Ciudad de la Costa, in Canelones or in any department. The tax office does not break tax expenditure down by territory.',
          'What one home is exempted, and what studios cost. The tax office breaks the figure down neither per unit nor by housing type.',
        ],
      },
      {
        titulo: 'About the homes',
        puntos: [
          'How many were finished each year. The ANV publishes cumulative stock, not flow. Subtracting reports would be our calculation.',
          'How many are rented out. The promotional declaration requires investors to declare tenancy contracts to the ANV. The ANV publishes only the sworn sale declarations. The data exists in the state\'s hands and is not released.',
          'How many sit empty or on short-term rental. The 2023 census measures unoccupied dwellings but does not cross that with the regime, and there is no official short-term-rental source.',
          'Who bought. The ANV does not break the figure down by buyer type, residence or declared use. The university study says who can buy, not who bought.',
          'How many were finished in Ciudad de la Costa. The ANV breaks finished homes down by department, not by locality.',
        ],
      },
      {
        titulo: 'About causes',
        puntos: [
          'Whether the regime made promoted housing cheaper. The only peer-reviewed causal study measures the spillover onto nearby existing stock, not the price of the exempted unit.',
          'Whether the 12% effect still holds. That study\'s price data run to 2018, before the highest-volume stretch.',
          'Whether the 2020 regulatory change caused the fall in floor area. The two coincide in time and no verified study establishes cause.',
        ],
      },
      {
        titulo: 'About what we looked for and did not find',
        puntos: [
          'We found no report by the Court of Auditors or the national internal audit office on the regime. We searched the Court\'s site, its resolutions search, its annual reports and parliament\'s objections page. Only the opinion on the ANV\'s balance sheet as a body appears. This is published as a search without result, not as a claim that no audit exists.',
          'The text of the regulation in force, Ministerial Resolution 774/2022, could not be read: the PDF the ANV publishes is a scan with no text layer.',
          'The 87% share of Ciudad de la Costa in Canelones sales circulated in the press with no public document supporting it.',
        ],
      },
    ],
  },

  cierre: {
    titulo: 'The framing, stated outright',
    parrafos: [
      'None of the above describes an irregularity. Article 4 of Law 18.795 empowers the Executive to grant the benefits, and each promotional declaration is an act of the Executive, following mandatory opinions from the National Housing Agency and the Advisory Commission. The argument is about the design of a public policy, not about its legality.',
      'What this piece does hold is simpler. Fifteen years on, the state cannot say what the regime cost in total, nor per home, nor where. It can say how many homes were built, because an architect visits them. The asymmetry between those two capabilities is a choice, not an accident, and it is why this text cannot end in a search box.',
    ],
  },

  labels: {
    funnel: 'From entered to finished',
    funnelHelp: 'The first two steps are as of 31/07/2026 and the rest as of 30/04/2026. Different cut-offs: they are not subtracted from one another.',
    taxChart: 'Tax expenditure estimated by the tax office, by tax',
    taxHelp: 'Current Uruguayan pesos. One series per report edition, never spliced: the tax office revises backwards. The last point of each edition is a projection.',
    priceChart: 'Sale price per square metre built, Montevideo',
    priceHelp: 'Promoted housing, by half-year. In dollars the series rises; in indexed units it does not. 2012_1 has 6 cases and 2026_1 is a partial half-year.',
    areaChart: 'Average floor area of the unit sold, Montevideo',
    areaHelp: 'Built area, in square metres. The regulation\'s envelope measures habitable area, a different measure: it appears as context, not as the same variable.',
    typeChart: 'Average price by unit type, Montevideo',
    typeHelp: 'Rolling year to April 2026, in dollars. The same report records 254,980 for three-bedroom units in its Table 4.',
    compChart: 'Composition of what was approved, April 2020 to December 2024',
    compHelp: 'Out of 22,706 homes, nationwide. FADU-Udelar study reported by El Observador.',
    deptChart: 'Price per square metre built, by department',
    deptHelp: 'Rolling year to April 2026. Six departments: the ANV excludes those with fewer than ten sworn declarations in the period.',
    sources: 'Sources',
    iva: 'VAT',
    irae: 'Corporate income tax',
    patrimonio: 'Wealth tax',
    itp: 'Property transfer tax',
    irnr: 'Non-resident income tax',
    monoambiente: 'Studio',
    uno: '1 bedroom',
    dos: '2 bedrooms',
    tres: '3 bedrooms',
    resto: 'Two or more bedrooms',
    canelones: 'Canelones',
    montevideo: 'Montevideo',
    maldonado: 'Maldonado',
    colonia: 'Colonia',
    tacuarembo: 'Tacuarembó',
    salto: 'Salto',
    ingresadas: 'Entered',
    promovidas: 'Promoted',
    obraIniciada: 'Works started',
    terminadas: 'Finished',
    usd: 'Dollars',
    ui: 'Indexed units',
  },
  fuentesTitulo: 'Sources',
}

export function vpContent(locale: string): VpText {
  return locale === 'en' ? EN : ES
}

export function vpSources(): VpSource[] {
  return FUENTES
}
