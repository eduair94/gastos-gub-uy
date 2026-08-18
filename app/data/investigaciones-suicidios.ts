/**
 * Investigación · El suicidio en Uruguay: lo que el Estado mide y lo que el Estado compra.
 *
 * POR QUÉ ESTA PIEZA EXISTE EN UN SITIO DE COMPRAS PÚBLICAS. Porque el resultado de buscar
 * "suicidio" en el corpus es siete. Siete compras en 1.639.165. Ese número es medible, es
 * nuestro y no lo publica nadie más. La pieza pone al lado la serie oficial de mortalidad,
 * que el MSP publica con precisión desde 1997, y muestra la distancia entre las dos cosas.
 *
 * TRES FUENTES, SIEMPRE DECLARADAS:
 *   1. Documento oficial leído directo — la Estrategia Nacional de Prevención del Suicidio
 *      2021-2025 (PDF del MSP), la caracterización de los Objetivos Sanitarios Nacionales
 *      2030, el indicador del MIDES con la serie 2000-2019 en CSV, y las noticias del MSP
 *      de cada 17 de julio. De ahí salen todas las tasas y todos los conteos de muertes.
 *   2. Nuestra propia medición sobre el corpus — las siete compras, el ledger de Último
 *      Recurso, y la aritmética del denominador de población.
 *   3. Prensa, citada como prensa — sólo para las declaraciones de las autoridades.
 *
 * COMUNICACIÓN RESPONSABLE. La OMS pide no describir métodos, no publicar casos individuales
 * y acompañar toda cobertura con recursos de ayuda. Esta pieza cumple las tres. El objetivo 6
 * de la Estrategia Nacional se llama "restringir el acceso a medios letales" y se nombra al
 * nivel de política pública, que es como lo escribe el propio documento.
 *
 * EL DENOMINADOR ES UN HALLAZGO PROPIO, NO UNA CIFRA OFICIAL. El MSP publica la tasa y el
 * número de muertes, nunca la población que usó. Dividir una por otra la deduce. Está
 * marcado como cálculo nuestro en todos lados y la pieza dice para qué sirve: la mejora de
 * 2025 es real y el cambio de base la modera, no la infla.
 */

export type Locale = 'es' | 'en'

/** Procedencia de cada punto de la serie. Una fila del cuadro de fuentes por año. */
export type SerieSource = 'estrategia' | 'ons2030' | 'msp2023' | 'msp2024' | 'msp2025' | 'msp2026'

export interface SeriePoint {
  year: number
  /** Defunciones por suicidio. `null` cuando el MSP no publicó el dato. */
  deaths: number | null
  /** Tasa cada 100.000 habitantes. `null` en 2011, que el MSP no publica. */
  rate: number | null
  source: SerieSource
}

/**
 * Serie oficial de mortalidad por suicidio, 1997-2025.
 *
 * 1997-2019 sale de la Tabla 1 de la Estrategia Nacional 2021-2025. 2020 sale de la
 * caracterización de los Objetivos Sanitarios Nacionales 2030. 2021 y 2022 salen de la
 * presentación del MSP del 17 de julio de 2023. 2023, 2024 y 2025 salen de las noticias
 * del MSP de los tres 17 de julio siguientes.
 *
 * 2011 falta en la fuente. El MIDES lo publica como "." en su CSV y el MSP lo saltea en
 * su tabla. No lo rellenamos.
 *
 * TRAMPA: el MSP publicó 2023 dos veces. En abril de 2024 dio 754 muertes y 21,1 como
 * dato preliminar. En julio de 2024 dio 763 y 21,39 como dato final. Acá va el final.
 */
export const SERIE: SeriePoint[] = [
  { year: 1997, deaths: 468, rate: 14.24, source: 'estrategia' },
  { year: 1998, deaths: 522, rate: 15.76, source: 'estrategia' },
  { year: 1999, deaths: 461, rate: 13.82, source: 'estrategia' },
  { year: 2000, deaths: 570, rate: 17.02, source: 'estrategia' },
  { year: 2001, deaths: 504, rate: 15.04, source: 'estrategia' },
  { year: 2002, deaths: 690, rate: 20.62, source: 'estrategia' },
  { year: 2003, deaths: 538, rate: 16.12, source: 'estrategia' },
  { year: 2004, deaths: 525, rate: 15.71, source: 'estrategia' },
  { year: 2005, deaths: 507, rate: 15.12, source: 'estrategia' },
  { year: 2006, deaths: 545, rate: 16.23, source: 'estrategia' },
  { year: 2007, deaths: 588, rate: 17.51, source: 'estrategia' },
  { year: 2008, deaths: 536, rate: 15.94, source: 'estrategia' },
  { year: 2009, deaths: 531, rate: 15.72, source: 'estrategia' },
  { year: 2010, deaths: 550, rate: 16.19, source: 'estrategia' },
  { year: 2011, deaths: null, rate: null, source: 'estrategia' },
  { year: 2012, deaths: 608, rate: 17.74, source: 'estrategia' },
  { year: 2013, deaths: 555, rate: 16.13, source: 'estrategia' },
  { year: 2014, deaths: 601, rate: 17.40, source: 'estrategia' },
  { year: 2015, deaths: 643, rate: 18.55, source: 'estrategia' },
  { year: 2016, deaths: 715, rate: 20.54, source: 'estrategia' },
  { year: 2017, deaths: 688, rate: 19.70, source: 'estrategia' },
  { year: 2018, deaths: 710, rate: 20.25, source: 'estrategia' },
  { year: 2019, deaths: 723, rate: 20.55, source: 'estrategia' },
  { year: 2020, deaths: 718, rate: 20.30, source: 'ons2030' },
  { year: 2021, deaths: 758, rate: 21.60, source: 'msp2023' },
  { year: 2022, deaths: 823, rate: 23.20, source: 'msp2023' },
  { year: 2023, deaths: 763, rate: 21.39, source: 'msp2024' },
  { year: 2024, deaths: 764, rate: 21.35, source: 'msp2025' },
  { year: 2025, deaths: 668, rate: 19.16, source: 'msp2026' },
]

/**
 * Las tres muertes violentas, comparadas por el propio MSP en el mismo documento.
 *
 * 2019 sale de la Estrategia Nacional; 2020, de la caracterización de los Objetivos
 * Sanitarios Nacionales 2030. Son los dos años en que el Estado publicó las tres tasas
 * juntas, así que son los dos años que se pueden comparar sin mezclar fuentes.
 */
export const VIOLENTAS = [
  { year: 2019, suicidio: 20.55, transito: 12.0, homicidio: 11.2 },
  { year: 2020, suicidio: 20.30, transito: 10.7, homicidio: 9.9 },
]

/**
 * El denominador implícito. Cálculo NUESTRO: muertes ÷ tasa × 100.000.
 *
 * El MSP nunca publica la población que usa. La aritmética la deduce y expone un quiebre:
 * hasta 2024 el denominador crece por encima de los 3.510.305 habitantes que el INE fija
 * como máximo histórico del país (año 2020, revisión 2025 con base en el Censo 2023).
 * En 2025 cae a 3,49 millones. Ese salto es un cambio de base, no un cambio demográfico.
 */
export const DENOMINADOR = [
  { year: 2019, implied: 3_518_248 },
  { year: 2020, implied: 3_536_946 },
  { year: 2021, implied: 3_509_259 },
  { year: 2022, implied: 3_547_414 },
  { year: 2023, implied: 3_566_620 },
  { year: 2024, implied: 3_578_454 },
  { year: 2025, implied: 3_486_430 },
]

/** Máximo histórico de población del país, INE revisión 2025 sobre el Censo 2023. */
export const INE_MAX = { year: 2020, people: 3_510_305 }

/** Tasa de 2025 recalculada con el denominador implícito de 2024. Cálculo nuestro. */
export const RATE_2025_OLD_BASE = 18.67

/**
 * Las siete compras.
 *
 * Medición propia del 17 de agosto de 2026 sobre 2.185.037 registros y 1.639.165 ocids,
 * con la expresión /suicid/i sobre los siete campos de texto del registro: descripción y
 * clasificación de los ítems adjudicados, título de la adjudicación, y título, descripción
 * e ítems del llamado.
 *
 * `award` es el monto adjudicado en pesos corrientes del año, sin ajustar por inflación.
 * `null` significa que el corpus tiene el llamado y no tiene la adjudicación.
 */
export interface CompraSuicidio {
  ocid: string
  year: number
  awardYear?: number
  buyer: string
  supplier: string | null
  award: number | null
  key: string
}

export const COMPRAS: CompraSuicidio[] = [
  { ocid: 'ocds-yfs5dr-187653', year: 2008, buyer: 'Dirección General de la Salud (MSP)', supplier: 'DEL ESTE SOL S.R.L.', award: 24_680, key: 'guia2008' },
  { ocid: 'ocds-yfs5dr-339508', year: 2012, buyer: 'Dirección Nacional de Sanidad Policial', supplier: 'ÚLTIMO RECURSO', award: 213_000, key: 'curso2012' },
  { ocid: 'ocds-yfs5dr-497746', year: 2015, awardYear: 2016, buyer: 'Dirección Nacional de Sanidad Policial', supplier: 'ÚLTIMO RECURSO', award: 4_540_800, key: 'linea2015' },
  { ocid: 'ocds-yfs5dr-1004831', year: 2022, buyer: 'Consejo Directivo Central (ANEP)', supplier: null, award: null, key: 'guia2022' },
  { ocid: 'ocds-yfs5dr-i418911', year: 2024, buyer: 'Intendencia de Montevideo', supplier: 'ÚLTIMO RECURSO', award: 95_000, key: 'taller2024ur' },
  { ocid: 'ocds-yfs5dr-i418912', year: 2024, buyer: 'Intendencia de Montevideo', supplier: 'INSTITUTO URUGUAYO DE NORMAS TÉCNICAS', award: 79_900, key: 'taller2024unit' },
  { ocid: 'ocds-yfs5dr-i418913', year: 2024, buyer: 'Intendencia de Montevideo', supplier: 'INSTITUTO URUGUAYO DE NORMAS TÉCNICAS', award: 79_900, key: 'taller2024unitbis' },
]

/** Escala del corpus el día de la medición. */
export const CORPUS = {
  releases: 2_185_037,
  ocids: 1_639_165,
  from: 2002,
  to: 2026,
  measured: '2026-08-17',
  suicidOcids: 7,
  /** Suma alternativa, si los dos registros idénticos del taller fueran una sola compra. No se publica: contradice el conteo de siete. */
  suicidUyu: 4_953_380,
  /** La suma publicada. Cuenta cada registro una vez, igual que `suicidOcids`. */
  suicidUyuMax: 5_033_280,
}

/**
 * Comparadores medidos con la misma expresión regular sobre los mismos siete campos.
 *
 * Los montos son aproximados: el corpus arrastra el artefacto de suma global (cantidad ×
 * precio unitario) en una minoría de líneas. La cantidad de compras es exacta.
 */
export const COMPARADORES = [
  { key: 'suicid', ocids: 7, uyu: 5_033_280 },
  { key: 'saludMental', ocids: 167, uyu: 198_626_547 },
  { key: 'desfibrilador', ocids: 2540, uyu: 493_663_582 },
]

/**
 * Todo lo que el Estado le adjudicó a Último Recurso, la ONG especializada.
 *
 * Buscado por identificador de proveedor (R/216621110018), no por nombre: el corpus la
 * escribe con uno y con dos espacios. Incluye contratos cuyo texto no dice "suicidio".
 */
export const ULTIMO_RECURSO = {
  supplierId: 'R/216621110018',
  awards: 9,
  uyu: 5_652_598,
  from: 2012,
  to: 2024,
  buyers: ['Dirección Nacional de Sanidad Policial', 'UTE', 'Intendencia de Montevideo'],
  rows: [
    { year: 2012, buyer: 'Sanidad Policial', uyu: 213_000, key: 'curso' },
    { year: 2016, buyer: 'Sanidad Policial', uyu: 4_540_800, key: 'linea' },
    { year: 2023, buyer: 'UTE', uyu: 558_250, key: 'ute' },
    { year: 2023, buyer: 'Intendencia de Montevideo', uyu: 97_500, key: 'imcurso' },
    { year: 2023, buyer: 'Intendencia de Montevideo', uyu: 14_000, key: 'impost1' },
    { year: 2023, buyer: 'Intendencia de Montevideo', uyu: 22_448, key: 'impost2' },
    { year: 2024, buyer: 'Intendencia de Montevideo', uyu: 105_000, key: 'imcurso2' },
    { year: 2024, buyer: 'Intendencia de Montevideo', uyu: 95_000, key: 'imtaller' },
    { year: 2024, buyer: 'Intendencia de Montevideo', uyu: 6_600, key: 'impost3' },
  ],
}

/**
 * Los recursos humanos que la Estrategia Nacional 2021-2025 pide para poder funcionar.
 *
 * Están en el capítulo 6 del PDF, "Estimación de requerimientos". No hay un peso en todo
 * el documento: hay horas semanales, y el texto dice que los ministerios las aportarán
 * "de forma gradual".
 */
export const ESTRATEGIA_HORAS = [
  { key: 'secretaria', hours: 20 },
  { key: 'estadistica', hours: 20 },
  { key: 'comunicacion', hours: 10 },
  { key: 'territorial', hours: 10 },
  { key: 'prevencion', hours: 10 },
  { key: 'capacitadores', hours: 3 },
  { key: 'webmant', hours: 3 },
]

/** Suma de las horas semanales del cuadro. */
export const ESTRATEGIA_TOTAL_HORAS = 76

/** La cronología normativa. Cada eslabón es un documento público. */
export interface HitoNorma {
  date: string
  key: string
  url: string
}

export const NORMAS: HitoNorma[] = [
  { date: '2004-10-21', key: 'decreto378', url: 'https://www.impo.com.uy/bases/decretos/378-2004/1' },
  { date: '2007-01-12', key: 'ley18097', url: 'https://www.gub.uy/presidencia/institucional/normativa/ley-n-18097-fecha-12012007' },
  { date: '2011-01-01', key: 'plan2011', url: 'https://www.asse.com.uy/aucdocumento.aspx?10652%2C76651=' },
  { date: '2011-08-26', key: 'decreto305', url: 'https://www.impo.com.uy/bases/decretos/305-2011' },
  { date: '2012-12-26', key: 'ordenanza801', url: 'https://www.gub.uy/ministerio-salud-publica/comunicacion/publicaciones/estrategia-nacional-prevencion-suicidio-2021-2025' },
  { date: '2017-08-24', key: 'ley19529', url: 'https://www.impo.com.uy/salud-mental/' },
  { date: '2018-01-01', key: 'lineaVida', url: 'https://www.gub.uy/ministerio-salud-publica/comunicacion/publicaciones/estrategia-nacional-prevencion-suicidio-2021-2025' },
  { date: '2020-04-01', key: 'linea1920', url: 'https://www.gub.uy/ministerio-salud-publica/comunicacion/publicaciones/estrategia-nacional-prevencion-suicidio-2021-2025' },
  { date: '2021-01-01', key: 'estrategia2125', url: 'https://www.gub.uy/ministerio-salud-publica/sites/ministerio-salud-publica/files/documentos/publicaciones/MSP_ESTRATEGIA_NACIONAL_PREVENCION_SUICIDIO_2021_2025.pdf' },
  { date: '2026-07-17', key: 'estrategia2630', url: 'https://www.gub.uy/ministerio-salud-publica/comunicacion/noticias/suicidios-uruguay-nueva-orientacion-politicas-publicas-ante-evolucion' },
]

/** Líneas de ayuda que funcionan hoy en Uruguay, sin costo y las 24 horas. */
export const AYUDA = [
  { key: 'vida', phone: '0800 0767 · *0767' },
  { key: 'apoyo', phone: '0800 1920' },
  { key: 'emergencia', phone: '911' },
]

export const SU_SOURCES = [
  {
    key: 'oficial',
    items: [
      { label: 'MSP — Estrategia Nacional de Prevención del Suicidio 2021-2025 (PDF, serie 1997-2019 y capítulo de requerimientos)', url: 'https://www.gub.uy/ministerio-salud-publica/sites/ministerio-salud-publica/files/documentos/publicaciones/MSP_ESTRATEGIA_NACIONAL_PREVENCION_SUICIDIO_2021_2025.pdf' },
      { label: 'MSP — Objetivos Sanitarios Nacionales 2030, "Incidencia de suicidio" (PDF, datos 2020 y tablas por edad y departamento)', url: 'https://www.gub.uy/ministerio-salud-publica/sites/ministerio-salud-publica/files/2022-06/FINAL%20Incidencia%20de%20suicidios.pdf' },
      { label: 'MSP — Suicidios en Uruguay: nueva orientación de las políticas públicas (17/07/2025, datos 2024)', url: 'https://www.gub.uy/ministerio-salud-publica/comunicacion/noticias/suicidios-uruguay-nueva-orientacion-politicas-publicas-ante-evolucion' },
      { label: 'MSP — 17 de julio, Día Nacional de Prevención de Suicidio (17/07/2024, datos 2023 finales)', url: 'https://www.gub.uy/ministerio-salud-publica/comunicacion/noticias/17-julio-dia-nacional-prevencion-suicidio' },
      { label: 'MSP — 17 de julio, día nacional para la prevención del suicidio (17/07/2023, datos 2021 y 2022)', url: 'https://www.gub.uy/ministerio-salud-publica/comunicacion/noticias/17-julio-dia-nacional-para-prevencion-del-suicidio-salud-mental-prioridad' },
      { label: 'MSP — Quiebre de la tendencia en los datos preliminares sobre el suicidio en 2023 (11/04/2024)', url: 'https://www.gub.uy/ministerio-salud-publica/comunicacion/noticias/quiebre-tendencia-datos-preliminares-sobre-suicidio-2023' },
      { label: 'MIDES — Tasa de mortalidad por suicidios consumados cada 100.000 habitantes, por sexo (CSV, 2000-2019)', url: 'https://www.gub.uy/ministerio-desarrollo-social/indicador/tasa-mortalidad-suicidios-consumados-cada-100000-habitantes-sexo-total-pais' },
      { label: 'INE — Estimaciones y proyecciones de población, revisión 2025 sobre el Censo 2023', url: 'https://www.gub.uy/instituto-nacional-estadistica/comunicacion/noticias/estimaciones-proyecciones-poblacion-revision-2025' },
      { label: 'IMPO — Decreto 378/004, creación de la Comisión Nacional Honoraria de Prevención del Suicidio', url: 'https://www.impo.com.uy/bases/decretos/378-2004/1' },
      { label: 'Presidencia — Ley 18.097, Día Nacional de Prevención del Suicidio', url: 'https://www.gub.uy/presidencia/institucional/normativa/ley-n-18097-fecha-12012007' },
      { label: 'IMPO — Ley 19.529 de Salud Mental (texto vigente)', url: 'https://www.impo.com.uy/salud-mental/' },
      { label: 'OPS — Prevención del suicidio, página temática regional', url: 'https://www.paho.org/es/temas/prevencion-suicidio' },
    ],
  },
  {
    key: 'prensa',
    items: [
      { label: 'Subrayado — Hubo 668 muertes por suicidio en 2025 (17/07/2026)', url: 'https://www.subrayado.com.uy/hubo-668-muertes-suicidio-2025-el-msp-senala-indicadores-preocupantes-todo-el-pais-n1013000' },
      { label: 'El Observador — Uruguay registró la menor cantidad de muertes por suicidio en diez años (17/07/2026)', url: 'https://www.elobservador.com.uy/nacional/uruguay-registro-la-menor-tasa-suicidios-diez-anos-pero-el-msp-mantiene-la-alerta-y-pide-evitar-triunfalismo-n6051098' },
      { label: 'Ámbito — Bajaron los suicidios, pero la tasa continúa entre las más altas del continente (17/07/2026)', url: 'https://www.ambito.com/uruguay/bajaron-los-suicidios-pero-la-tasa-continua-las-mas-altas-del-continente-n6300838' },
      { label: 'la diaria — En 2022 aumentó la tasa de suicidios en Uruguay (24/03/2023)', url: 'https://ladiaria.com.uy/salud/articulo/2023/3/en-2022-aumento-la-tasa-de-suicidios-en-uruguay-y-expertos-llaman-a-entender-el-problema-como-un-fenomeno-colectivo-cultural-y-multifactorial/' },
      { label: 'Naciones Unidas — América, la única región del mundo donde crece el suicidio (10/09/2025)', url: 'https://news.un.org/es/story/2025/09/1540421' },
    ],
  },
]

export const SU_CONTENT = {
  es: {
    kicker: 'Investigación propia · datos abiertos',
    title: 'Siete compras contra el suicidio en veinticuatro años',
    dek: 'Uruguay mide su tasa de suicidio con precisión y la publica desde 1997. En 1.639.165 compras del Estado desde 2002, la palabra aparece siete veces. La Estrategia Nacional 2021-2025 no pide plata: pide horas semanales.',
    fileScope: '1.639.165 compras buscadas',
    filePeriod: '1997 → 2025',
    fileSource: 'MSP · MIDES · INE · corpus OCDS',
    chips: ['668 muertes en 2025', '19,16 cada 100.000', '7 compras en 24 años', 'Estrategia sin presupuesto'],

    ayudaTag: 'Antes de seguir',
    ayudaTitle: 'Si estás pasando por esto, hay a quién llamar',
    ayudaP: 'Las tres líneas son gratuitas y funcionan las 24 horas, en todo el país. Atienden a la persona en crisis y también a quien la acompaña.',
    ayudaLabels: {
      vida: 'Línea Vida — atención en crisis, gestionada por ASSE desde 2018',
      apoyo: 'Línea de apoyo emocional — ASSE, MSP y Voluntariado Juntos, desde abril de 2020',
      emergencia: 'Emergencia — riesgo inmediato',
    },
    ayudaNota: 'Esta pieza sigue las recomendaciones de la OMS para comunicar sobre suicidio. No describe métodos. No publica casos individuales. El único método que nombra es el objetivo 6 de la Estrategia Nacional, "restringir el acceso a medios letales", porque es una política pública y está escrito así en el documento oficial.',

    statHead: 'Compras del Estado que mencionan el suicidio, desde 2002',
    statSub: 'sobre 1.639.165 compras publicadas en el registro de Compras Estatales',
    tiles: [
      { n: '668', l: 'muertes en 2025', s: 'la cifra más baja en diez años, según el MSP' },
      { n: '19,16', l: 'cada 100.000 habitantes', s: 'la tasa más baja desde 2015 (18,55)' },
      { n: '79%', l: 'de las muertes son de varones', s: 'y 72% de los intentos son de mujeres' },
      { n: '$ 5,03 M', l: 'adjudicados en 24 años', s: 'pesos corrientes, sin ajustar por inflación' },
    ],

    serieTag: 'La serie',
    serieTitle: 'Veintiocho años medidos, y un quiebre en 2015',
    serie: [
      'El Ministerio de Salud Pública publica la mortalidad por suicidio desde 1997. La serie tiene un solo agujero: 2011, que el MSP saltea en su tabla y el MIDES publica como un punto en su CSV. No lo rellenamos.',
      'Hasta 2014 la tasa se mueve en una banda estrecha. El promedio 1997-2014 es 16,25 cada 100.000 habitantes y el máximo del período es 20,62, en 2002. Desde 2015 la banda se rompe hacia arriba: 18,55 ese año, 20,54 al siguiente, y nunca vuelve por debajo de 19 hasta hoy.',
      'El pico es 2022: 823 muertes y 23,20 cada 100.000, el valor más alto de toda la serie. Después baja tres años seguidos. En 2025 hubo 668 muertes y la tasa fue 19,16, la más baja desde 2015.',
      'La caída es real y el propio MSP pidió no leerla como un triunfo. La tasa de 2025 sigue por encima de cualquier año anterior a 2015. El nivel al que volvió es el nivel en que empezó el problema.',
    ],
    serieChart: 'Tasa de suicidio en Uruguay, 1997-2025',
    serieChartHelp: 'Cada 100.000 habitantes. Fuente: MSP, Estadísticas Vitales y División Epidemiología. 2011 sin dato publicado.',
    serieLabel: 'Tasa de suicidio',
    serieUnit: 'cada 100.000 hab.',

    denomTag: 'Precisión',
    denomTitle: 'El MSP publica la tasa y no publica la población',
    denom: [
      'La tasa depende de dos números: las muertes y la población. El MSP publica el primero y nunca el segundo. Se puede deducir: muertes dividido tasa, por cien mil.',
      'Hecha esa cuenta, aparece un salto. La tasa de 2024 (21,35 con 764 muertes) implica una población de 3.578.454 personas. La de 2025 (19,16 con 668 muertes) implica 3.486.430. La población del país no puede caer 2,6% en un año.',
      'El INE, con base en el Censo 2023, fija el máximo histórico de población en 3.510.305 personas, alcanzado en 2020, y proyecta un descenso lento desde entonces. Los denominadores implícitos de 2020 a 2024 están todos por encima de ese máximo: vienen de la revisión anterior de las proyecciones. El de 2025 está por debajo: viene de la nueva.',
      'La consecuencia importa y va en un solo sentido. Un denominador más chico levanta la tasa. Con la base de 2024, las 668 muertes de 2025 darían 18,67 en vez de 19,16. El cambio de base no infla la mejora de 2025: la modera.',
      'Esto es una cuenta nuestra, no un dato del MSP. La publicamos porque cualquiera puede rehacerla con los dos números que el ministerio sí publica.',
    ],
    denomColYear: 'Año',
    denomColImplied: 'Población implícita',
    denomNote: 'Cálculo propio: muertes ÷ tasa × 100.000, con las cifras que publica el MSP.',

    violentasTag: 'La escala',
    violentasTitle: 'Mata más que el tránsito y más que los homicidios',
    violentas: [
      'El propio MSP hace esta comparación en dos documentos oficiales, y son los dos únicos años en que publicó las tres tasas juntas.',
      'En 2019 el suicidio fue 20,55 cada 100.000 habitantes, los siniestros de tránsito 12,0 y los homicidios 11,2. En 2020 fue 20,3 contra 10,7 y 9,9. Los dos años, el suicidio casi iguala la suma de los otros dos.',
      'La diferencia está en lo que el Estado compra para cada uno. El tránsito tiene una unidad nacional, campañas, obra vial y control. El homicidio tiene todo el presupuesto del Ministerio del Interior. El suicidio tiene siete compras en veinticuatro años.',
    ],
    violentasChart: 'Muertes violentas en Uruguay',
    violentasColCausa: 'Causa de muerte',
    violentasLabels: { suicidio: 'Suicidio', transito: 'Siniestros de tránsito', homicidio: 'Homicidios' },

    comprasTag: 'La medición',
    comprasTitle: 'Las siete compras, una por una',
    compras: [
      'Buscamos la raíz "suicid" en los siete campos de texto de cada registro: la descripción y la clasificación de los ítems adjudicados, el título de la adjudicación, y el título, la descripción y los ítems del llamado. Sobre 2.185.037 registros, agrupados en 1.639.165 compras, aparecen siete. Una cada 234.166.',
      'Tres son de la Dirección Nacional de Sanidad Policial y del MSP, y son las más viejas. Una es de ANEP y no tiene adjudicación cargada. Las tres últimas son de la Intendencia de Montevideo, del mismo día de 2024.',
      'La más grande es de 2015. Sanidad Policial llamó a Licitación Abreviada por "un servicio de respuesta de prevención y postvención de suicidio cumpliendo funciones para la D.N.S.P. en todo el territorio nacional". El ítem del pliego es una línea telefónica por 24 meses. La adjudicación quedó registrada en marzo de 2016, a Último Recurso, por 4.540.800 pesos. Es la única vez en el corpus en que el Estado licitó una línea de prevención.',
      'Sumadas, las adjudicaciones dan 5.033.280 pesos corrientes en dieciséis años. Ese total cuenta cada registro una vez, igual que el conteo de siete compras. Dos de los registros de la Intendencia son idénticos: mismo adjudicatario, mismo monto, misma fecha, mismo texto. Si fueran una sola compra cargada dos veces, el total sería 4.953.380 y las compras serían seis.',
    ],
    comprasCols: { year: 'Año', buyer: 'Organismo', object: 'Objeto', supplier: 'Adjudicatario', award: 'Adjudicado' },
    comprasItems: {
      guia2008: '4.000 ejemplares de una guía sobre suicidio',
      curso2012: 'Capacitación en prevención y posvención para unos 70 técnicos',
      linea2015: 'Servicio de respuesta de prevención y postvención: línea telefónica, 24 meses',
      guia2022: '3.500 ejemplares de la Guía de Promoción de Salud y Prevención de Conductas Suicidas',
      taller2024ur: 'Taller de sensibilización sobre suicidio',
      taller2024unit: 'Taller de sensibilización sobre suicidio',
      taller2024unitbis: 'Taller de sensibilización sobre suicidio (registro idéntico al anterior)',
    },
    comprasSinAdj: 'sin adjudicación en el registro',
    comprasNota: 'El taller adjudicado al Instituto Uruguayo de Normas Técnicas figura así en la clasificación propia de la Intendencia. No pudimos confirmar el objeto con una segunda fuente y lo publicamos como está cargado.',

    contrasteTag: 'El contraste',
    contrasteTitle: 'Siete compras, y 2.540 desfibriladores',
    contraste: [
      'Un número solo no dice nada. Medimos otros dos con exactamente la misma expresión regular y los mismos siete campos.',
      '"Salud mental" aparece en 167 compras, por unos 199 millones de pesos. Casi todo ese dinero es una sola cosa: servicios residenciales de atención, sobre todo del INAU. Es internación, no prevención.',
      '"Desfibrilador" aparece en 2.540 compras, por unos 494 millones de pesos. Es el otro dispositivo del Estado contra una muerte súbita y evitable, y tiene una ley que lo obliga.',
      'La comparación no dice que el Estado deba comprar menos desfibriladores. Dice que cuando una política se convierte en una compra, deja rastro y se puede auditar. La prevención del suicidio casi no deja rastro en este registro.',
    ],
    contrasteLabels: { suicid: 'Mencionan el suicidio', saludMental: 'Mencionan la salud mental', desfibrilador: 'Mencionan desfibriladores' },
    contrasteChart: 'Compras del Estado por tema, 2002-2026',

    ongTag: 'El proveedor',
    ongTitle: 'Casi todo lo compró la misma ONG',
    ong: [
      'Último Recurso es la organización uruguaya especializada en prevención y posvención del suicidio. Buscamos todo lo que el Estado le adjudicó, por identificador de proveedor y no por nombre: el corpus la escribe con uno y con dos espacios.',
      'Son nueve adjudicaciones entre 2012 y 2024, por 5.652.598 pesos corrientes, de tres compradores: Sanidad Policial, UTE y la Intendencia de Montevideo. Cuatro de ellas no dicen "suicidio" en el texto, así que no entran en las siete: dicen "talleres de postvención", "curso capacitación" o "contratación de servicios profesionales".',
      'Dos hechos ordenan esta tabla. El primero: el 80% del total es un solo contrato, la línea telefónica de 2016. El segundo: desde 2016 no hay una sola compra del gobierno nacional. Las siete adjudicaciones posteriores son de una empresa pública y de una intendencia.',
    ],
    ongCols: { year: 'Año', buyer: 'Comprador', object: 'Objeto', uyu: 'Adjudicado' },
    ongItems: {
      curso: 'Curso de capacitación',
      linea: 'Arrendamiento de línea telefónica, 24 meses',
      ute: 'Contratación de servicios profesionales y viáticos',
      imcurso: 'Curso y taller',
      impost1: 'Talleres de postvención',
      impost2: 'Talleres de postvención',
      imcurso2: 'Curso de capacitación',
      imtaller: 'Taller de sensibilización sobre suicidio',
      impost3: 'Talleres de postvención',
    },

    estrategiaTag: 'La política',
    estrategiaTitle: 'La Estrategia Nacional no pide plata: pide horas',
    estrategia: [
      'La Comisión Nacional Honoraria de Prevención del Suicidio existe desde 2004, creada por el Decreto 378/004. La integran cuatro ministerios: Salud Pública, que la preside, Interior, Educación y Cultura, y Desarrollo Social. Es honoraria, así que sus integrantes no cobran por ese cargo.',
      'La comisión escribió tres planes: 2011-2015, 2016-2020 y 2021-2025. El último es un PDF de 33 páginas con siete objetivos, y no tiene una sola cifra de dinero.',
      'Lo que sí tiene es un capítulo llamado "Estimación de requerimientos para fortalecer la infraestructura y gestión". Ahí pide una secretaría técnico-administrativa de 20 horas semanales, un estadístico de 20, un comunicador de 10, un coordinador territorial de 10, un docente de prevención de 10, capacitadores por 3 horas promedio y un informático de 3 horas de mantenimiento. Setenta y seis horas semanales, para todo el país.',
      'El texto agrega cómo se conseguirían: los ministerios que integran la comisión los aportarán "de forma gradual", o se buscará un convenio con otras organizaciones. La acción 5.1 de la propia estrategia reconoce el problema y propone modificar el decreto de creación "asegurando fuentes de ingreso".',
      'En julio de 2026 el MSP informó que está evaluando esa estrategia para diseñar la siguiente, 2026-2030.',
    ],
    estrategiaColRole: 'Perfil solicitado',
    estrategiaColHours: 'Horas semanales',
    estrategiaRoles: {
      secretaria: 'Secretaría técnico-administrativa con formación en salud',
      estadistica: 'Profesional en Estadística, para procesar datos e informes',
      comunicacion: 'Profesional de comunicación, para la estrategia comunicacional',
      territorial: 'Coordinación operativa de descentralización territorial',
      prevencion: 'Docente de prevención, para sensibilización y capacitación',
      capacitadores: 'Capacitadores para el dictado de cursos (promedio variable)',
      webmant: 'Informático, mantenimiento del portal web',
    },
    estrategiaHorasNota: '76 horas semanales en total. El cuadro pide además un informático por 30 horas semanales durante dos meses, para desarrollar el portal web; por ser temporal, no entra en la suma.',
    estrategiaFinding: 'La estrategia nacional del país con una de las tasas más altas del continente se sostiene con setenta y seis horas semanales de perfiles a tiempo parcial, sin partida asignada y sin órgano con presupuesto propio.',
    estrategiaFindingKicker: 'El hallazgo',

    normasTag: 'Lo que sí existe',
    normasTitle: 'Veintidós años de decisiones, y dos líneas que funcionan',
    normasIntro: 'La ausencia en el registro de compras no es ausencia de política. Es que casi nada de esta política pasa por una compra: pasa por decretos, ordenanzas, prestaciones del sistema de salud y sueldos.',
    normas: {
      decreto378: 'El Decreto 378/004 crea la Comisión Nacional Honoraria de Prevención del Suicidio, con cuatro ministerios y una comisión asesora de ASSE y la Universidad de la República.',
      ley18097: 'La Ley 18.097 declara el 17 de julio Día Nacional de Prevención del Suicidio. Desde entonces, el MSP publica ese día las cifras del año anterior.',
      plan2011: 'Se lanza el primer Plan Nacional de Prevención del Suicidio, 2011-2015, con cinco ejes estratégicos.',
      decreto305: 'El Decreto 305/011 incorpora prestaciones psicoterapéuticas y psicosociales al sistema de salud, incluidas las dirigidas a personas con intento de autoeliminación y a sus familias. No es una compra: es una prestación obligatoria para todos los prestadores.',
      ordenanza801: 'La Ordenanza 801 crea el registro y la notificación obligatoria del intento de autoeliminación. Es el sistema que produce las cifras de intentos que el MSP publica cada año.',
      ley19529: 'La Ley 19.529 de Salud Mental ordena sustituir el modelo asilar por dispositivos comunitarios. Su plazo de cierre pasó de 2025 a 2029.',
      lineaVida: 'Empieza a funcionar la Línea Vida (0800 0767 y *0767), atención en crisis las 24 horas en todo el país, gestionada por ASSE. No aparece en el registro de compras: la paga el presupuesto de ASSE.',
      linea1920: 'Se crea la línea de apoyo emocional 0800 1920, en el marco de la pandemia, entre ASSE, el MSP y Voluntariado Juntos. Funciona 24 horas y es gratuita para todos los usuarios del sistema de salud.',
      estrategia2125: 'Se publica la Estrategia Nacional de Prevención del Suicidio 2021-2025, con siete objetivos y sin presupuesto asignado.',
      estrategia2630: 'El MSP informa que evalúa la estrategia vencida para diseñar la siguiente, 2026-2030, y anuncia que la comunicación responsable será uno de sus ejes.',
    },

    intentosTag: 'El otro número',
    intentosTitle: 'Seis mil ciento cuarenta intentos en un año',
    intentos: [
      'La notificación del intento de autoeliminación es obligatoria desde 2012. Ese registro produce la segunda cifra del informe anual, y se mueve en dirección contraria a la primera.',
      'En 2025 se registraron 6.140 intentos, hechos por 5.144 personas. La tasa de personas fue 147,56 cada 100.000 habitantes: 205,02 entre mujeres y 86,40 entre varones. Del total de personas, 3.685 fueron mujeres y 1.459 varones.',
      'La distribución es el espejo exacto de la mortalidad. El 79% de las muertes son de varones. El 72% de los intentos son de mujeres.',
      'La prensa informó que los intentos aumentaron en 436 casos respecto de 2024. No pudimos reconstruir esa diferencia: el MSP publicó para 2024 una tasa de intentos de 161,74 cada 100.000 habitantes, y para 2025 una de 147,56, pero las dos no están calculadas sobre la misma unidad. Una cuenta episodios y la otra, personas. Sin los conteos crudos de 2024 no se pueden comparar.',
    ],

    limitesTitle: 'Lo que no pudimos verificar',
    limites: [
      'Las tasas por departamento de 2025. El MSP las presentó en la conferencia del 17 de julio de 2026, y la presentación que publica en PDF es una imagen sin capa de texto. Las últimas tasas departamentales legibles son las de 2024.',
      'Los conteos crudos de intentos de autoeliminación de 2024. Sin ellos no se puede contrastar el aumento de 436 casos que informó la prensa.',
      'Si los dos registros idénticos de la Intendencia de Montevideo son una compra cargada dos veces o dos compras iguales del mismo día. Publicamos el total conservador y también el otro.',
      'El gasto real en prevención del suicidio. No está en este registro y no está publicado en ningún lado como partida: se reparte entre sueldos de ASSE, prestaciones obligatorias del sistema de salud y horas de funcionarios de cuatro ministerios. Que no se pueda sumar es, en sí mismo, parte del hallazgo.',
    ],

    sourcesTag: 'Dónde chequear',
    sourcesTitle: 'Todo esto es público',
    sourcesP: 'La serie de mortalidad está en dos PDF del MSP y en un CSV del MIDES. Las siete compras están en el registro de Compras Estatales, con su identificador. Nada de esto requiere un pedido de acceso a la información.',
    srcOficial: 'Documentos del Estado y organismos internacionales',
    srcPrensa: 'Prensa, citada como prensa',
  },
  en: {
    kicker: 'Own investigation · open data',
    title: 'Seven purchases against suicide in twenty-four years',
    dek: 'Uruguay measures its suicide rate precisely and has published it since 1997. Across 1,639,165 state purchases since 2002, the word appears seven times. The 2021-2025 National Strategy does not ask for money: it asks for weekly hours.',
    fileScope: '1,639,165 purchases searched',
    filePeriod: '1997 → 2025',
    fileSource: 'Health Ministry · MIDES · INE · OCDS corpus',
    chips: ['668 deaths in 2025', '19.16 per 100,000', '7 purchases in 24 years', 'Strategy with no budget'],

    ayudaTag: 'Before you read on',
    ayudaTitle: 'If you are going through this, there is someone to call',
    ayudaP: 'All three lines are free and open 24 hours, nationwide. They support the person in crisis and the people around them.',
    ayudaLabels: {
      vida: 'Línea Vida — crisis care, run by ASSE since 2018',
      apoyo: 'Emotional support line — ASSE, Health Ministry and Voluntariado Juntos, since April 2020',
      emergencia: 'Emergency — immediate risk',
    },
    ayudaNota: 'This piece follows WHO guidance on reporting suicide. It describes no methods. It publishes no individual cases. The only method it names is objective 6 of the National Strategy, "restricting access to lethal means", because that is public policy and that is how the official document words it.',

    statHead: 'State purchases mentioning suicide, since 2002',
    statSub: 'out of 1,639,165 purchases published in the state procurement record',
    tiles: [
      { n: '668', l: 'deaths in 2025', s: 'the lowest figure in ten years, per the Health Ministry' },
      { n: '19.16', l: 'per 100,000 people', s: 'the lowest rate since 2015 (18.55)' },
      { n: '79%', l: 'of deaths are men', s: 'and 72% of attempts are women' },
      { n: '$ 5.03 M', l: 'awarded in 24 years', s: 'nominal pesos, not inflation-adjusted' },
    ],

    serieTag: 'The series',
    serieTitle: 'Twenty-eight measured years, and a break in 2015',
    serie: [
      'The Health Ministry has published suicide mortality since 1997. The series has one hole: 2011, which the ministry skips in its table and MIDES publishes as a dot in its CSV. We do not fill it in.',
      'Until 2014 the rate moves inside a narrow band. The 1997-2014 average is 16.25 per 100,000 people and the period high is 20.62, in 2002. From 2015 the band breaks upward: 18.55 that year, 20.54 the next, and it never falls back below 19.',
      'The peak is 2022: 823 deaths and 23.20 per 100,000, the highest value in the whole series. Then it falls three years running. In 2025 there were 668 deaths and the rate was 19.16, the lowest since 2015.',
      'The fall is real and the ministry itself asked that it not be read as a victory. The 2025 rate is still above every year before 2015. The level it returned to is the level at which the problem started.',
    ],
    serieChart: 'Suicide rate in Uruguay, 1997-2025',
    serieChartHelp: 'Per 100,000 people. Source: Health Ministry, Vital Statistics and Epidemiology Division. No figure published for 2011.',
    serieLabel: 'Suicide rate',
    serieUnit: 'per 100,000 people',

    denomTag: 'Precision',
    denomTitle: 'The ministry publishes the rate and not the population',
    denom: [
      'A rate depends on two numbers: deaths and population. The ministry publishes the first and never the second. It can be derived: deaths divided by rate, times one hundred thousand.',
      'Run that arithmetic and a jump appears. The 2024 rate (21.35 on 764 deaths) implies a population of 3,578,454. The 2025 rate (19.16 on 668 deaths) implies 3,486,430. A country\'s population cannot fall 2.6% in one year.',
      'The statistics institute, working from the 2023 census, puts the country\'s all-time population peak at 3,510,305 people, reached in 2020, and projects a slow decline since. The implied denominators from 2020 to 2024 all sit above that peak: they come from the previous projection round. The 2025 one sits below it: it comes from the new one.',
      'The consequence matters and it runs one way. A smaller denominator raises the rate. On the 2024 base, the 668 deaths of 2025 would give 18.67 instead of 19.16. The change of base does not inflate the 2025 improvement: it dampens it.',
      'This is our arithmetic, not a ministry figure. We publish it because anyone can redo it with the two numbers the ministry does publish.',
    ],
    denomColYear: 'Year',
    denomColImplied: 'Implied population',
    denomNote: 'Our own calculation: deaths ÷ rate × 100,000, using the figures the ministry publishes.',

    violentasTag: 'The scale',
    violentasTitle: 'It kills more than road crashes and more than homicides',
    violentas: [
      'The ministry itself makes this comparison in two official documents, and those are the only two years in which it published all three rates together.',
      'In 2019 suicide was 20.55 per 100,000 people, road crashes 12.0 and homicides 11.2. In 2020 it was 20.3 against 10.7 and 9.9. In both years suicide nearly equals the sum of the other two.',
      'The difference is in what the State buys for each. Road safety has a national agency, campaigns, road works and enforcement. Homicide has the entire police budget. Suicide has seven purchases in twenty-four years.',
    ],
    violentasChart: 'Violent deaths in Uruguay',
    violentasColCausa: 'Cause of death',
    violentasLabels: { suicidio: 'Suicide', transito: 'Road crashes', homicidio: 'Homicides' },

    comprasTag: 'The measurement',
    comprasTitle: 'The seven purchases, one by one',
    compras: [
      'We searched the stem "suicid" across the seven text fields of every record: the description and classification of awarded line items, the award title, and the tender title, description and items. Across 2,185,037 records grouped into 1,639,165 purchases, seven come back. One in 234,166.',
      'Three belong to the police health directorate and the health ministry, and they are the oldest. One belongs to the national education body and has no award recorded. The last three belong to the Montevideo city government, all from the same day in 2024.',
      'The largest is from 2015. The police health directorate tendered "a suicide prevention and postvention response service operating for the D.N.S.P. across the whole national territory". The line item is a telephone line for 24 months. The award was recorded in March 2016, to Último Recurso, for 4,540,800 pesos. It is the only time in the corpus that the State tendered a prevention line.',
      'Added up, the awards come to 5,033,280 nominal pesos over sixteen years. That total counts every record once, the same way the count of seven purchases does. Two of the city records are identical: same supplier, same amount, same date, same text. If they were one purchase filed twice, the total would be 4,953,380 and the count would be six.',
    ],
    comprasCols: { year: 'Year', buyer: 'Public body', object: 'Object', supplier: 'Supplier', award: 'Awarded' },
    comprasItems: {
      guia2008: '4,000 copies of a guide on suicide',
      curso2012: 'Prevention and postvention training for about 70 staff',
      linea2015: 'Prevention and postvention response service: telephone line, 24 months',
      guia2022: '3,500 copies of the Health Promotion and Suicidal Behaviour Prevention Guide',
      taller2024ur: 'Suicide awareness workshop',
      taller2024unit: 'Suicide awareness workshop',
      taller2024unitbis: 'Suicide awareness workshop (record identical to the previous one)',
    },
    comprasSinAdj: 'no award in the record',
    comprasNota: 'The workshop awarded to the Uruguayan Standards Institute is recorded that way in the city government\'s own classification. We could not confirm the object with a second source and publish it as filed.',

    contrasteTag: 'The contrast',
    contrasteTitle: 'Seven purchases, and 2,540 defibrillators',
    contraste: [
      'One number on its own says nothing. We measured two others with exactly the same regular expression and the same seven fields.',
      '"Mental health" appears in 167 purchases, worth some 199 million pesos. Almost all of that money is one thing: residential care services, mostly from the child welfare institute. That is institutional care, not prevention.',
      '"Defibrillator" appears in 2,540 purchases, worth some 494 million pesos. It is the State\'s other device against a sudden, preventable death, and a law mandates it.',
      'The comparison does not say the State should buy fewer defibrillators. It says that when a policy becomes a purchase, it leaves a trail and can be audited. Suicide prevention barely leaves a trail in this record.',
    ],
    contrasteLabels: { suicid: 'Mention suicide', saludMental: 'Mention mental health', desfibrilador: 'Mention defibrillators' },
    contrasteChart: 'State purchases by topic, 2002-2026',

    ongTag: 'The supplier',
    ongTitle: 'Almost all of it was bought from the same NGO',
    ong: [
      'Último Recurso is the Uruguayan organisation specialised in suicide prevention and postvention. We searched everything the State awarded it, by supplier identifier rather than by name: the corpus writes it with one space and with two.',
      'Nine awards between 2012 and 2024, worth 5,652,598 nominal pesos, from three buyers: the police health directorate, the power utility and the Montevideo city government. Four of them do not say "suicide" in their text, so they are not among the seven: they say "postvention workshops", "training course" or "professional services".',
      'Two facts organise this table. First: 80% of the total is a single contract, the 2016 telephone line. Second: since 2016 there is not one purchase from central government. The seven later awards come from a state-owned company and a city government.',
    ],
    ongCols: { year: 'Year', buyer: 'Buyer', object: 'Object', uyu: 'Awarded' },
    ongItems: {
      curso: 'Training course',
      linea: 'Telephone line rental, 24 months',
      ute: 'Professional services and travel allowances',
      imcurso: 'Course and workshop',
      impost1: 'Postvention workshops',
      impost2: 'Postvention workshops',
      imcurso2: 'Training course',
      imtaller: 'Suicide awareness workshop',
      impost3: 'Postvention workshops',
    },

    estrategiaTag: 'The policy',
    estrategiaTitle: 'The National Strategy does not ask for money: it asks for hours',
    estrategia: [
      'The National Honorary Commission for Suicide Prevention has existed since 2004, created by Decree 378/004. Four ministries sit on it: Health, which chairs it, Interior, Education and Culture, and Social Development. It is honorary, so its members are not paid for that role.',
      'The commission wrote three plans: 2011-2015, 2016-2020 and 2021-2025. The last one is a 33-page PDF with seven objectives, and it does not carry a single money figure.',
      'What it does carry is a chapter titled "Estimate of requirements to strengthen infrastructure and management". There it asks for a technical-administrative secretariat at 20 weekly hours, a statistician at 20, a communications professional at 10, a territorial coordinator at 10, a prevention teacher at 10, trainers at an average of 3 hours and an IT technician at 3 hours of maintenance. Seventy-six weekly hours, for the whole country.',
      'The text adds how they would be obtained: the member ministries will supply them "gradually", or an agreement will be sought with other organisations. Action 5.1 of the strategy itself acknowledges the problem and proposes amending the founding decree "securing sources of income".',
      'In July 2026 the ministry reported that it is evaluating that strategy in order to design the next one, 2026-2030.',
    ],
    estrategiaColRole: 'Profile requested',
    estrategiaColHours: 'Weekly hours',
    estrategiaRoles: {
      secretaria: 'Technical-administrative secretariat with health training',
      estadistica: 'Statistics professional, to process data and reports',
      comunicacion: 'Communications professional, for the communication strategy',
      territorial: 'Operational coordination of territorial decentralisation',
      prevencion: 'Prevention teacher, for awareness and training',
      capacitadores: 'Trainers to deliver courses (variable average)',
      webmant: 'IT technician, web portal maintenance',
    },
    estrategiaHorasNota: '76 weekly hours in total. The table also asks for an IT technician at 30 weekly hours for two months to build the web portal; being temporary, it is not in the sum.',
    estrategiaFinding: 'The national strategy of the country with one of the highest rates on the continent runs on seventy-six weekly hours of part-time profiles, with no assigned funding and no body with a budget of its own.',
    estrategiaFindingKicker: 'The finding',

    normasTag: 'What does exist',
    normasTitle: 'Twenty-two years of decisions, and two lines that work',
    normasIntro: 'Absence from the procurement record is not absence of policy. It is that almost none of this policy runs through a purchase: it runs through decrees, ordinances, health-system benefits and salaries.',
    normas: {
      decreto378: 'Decree 378/004 creates the National Honorary Commission for Suicide Prevention, with four ministries and an advisory board from ASSE and the national university.',
      ley18097: 'Law 18,097 declares 17 July the National Suicide Prevention Day. Since then the ministry publishes the previous year\'s figures on that date.',
      plan2011: 'The first National Suicide Prevention Plan, 2011-2015, is launched with five strategic pillars.',
      decreto305: 'Decree 305/011 adds psychotherapeutic and psychosocial benefits to the health system, including those for people who have attempted suicide and their families. It is not a purchase: it is a mandatory benefit for every provider.',
      ordenanza801: 'Ordinance 801 creates the register and mandatory notification of suicide attempts. This is the system that produces the attempt figures the ministry publishes each year.',
      ley19529: 'The Mental Health Act 19,529 orders the asylum model replaced by community services. Its closure deadline moved from 2025 to 2029.',
      lineaVida: 'Línea Vida starts operating (0800 0767 and *0767), 24-hour crisis care nationwide, run by ASSE. It does not appear in the procurement record: ASSE\'s own budget pays for it.',
      linea1920: 'The 0800 1920 emotional support line is created during the pandemic by ASSE, the health ministry and Voluntariado Juntos. It runs 24 hours and is free for every health-system user.',
      estrategia2125: 'The National Suicide Prevention Strategy 2021-2025 is published, with seven objectives and no assigned budget.',
      estrategia2630: 'The ministry reports it is evaluating the expired strategy to design the next one, 2026-2030, and announces responsible communication as one of its pillars.',
    },

    intentosTag: 'The other number',
    intentosTitle: 'Six thousand one hundred and forty attempts in one year',
    intentos: [
      'Notification of a suicide attempt has been mandatory since 2012. That register produces the second figure in the annual report, and it moves in the opposite direction to the first.',
      'In 2025, 6,140 attempts were recorded, made by 5,144 people. The rate of people was 147.56 per 100,000: 205.02 among women and 86.40 among men. Of the total, 3,685 were women and 1,459 men.',
      'The distribution is the exact mirror of mortality. 79% of deaths are men. 72% of attempts are women.',
      'The press reported that attempts rose by 436 cases against 2024. We could not reconstruct that difference: the ministry published an attempt rate of 161.74 per 100,000 for 2024 and 147.56 for 2025, but the two are not computed on the same unit. One counts episodes and the other counts people. Without the raw 2024 counts they cannot be compared.',
    ],

    limitesTitle: 'What we could not verify',
    limites: [
      'The 2025 rates by department. The ministry presented them at the 17 July 2026 briefing, and the deck it publishes as a PDF is an image with no text layer. The most recent readable departmental rates are those for 2024.',
      'The raw 2024 suicide-attempt counts. Without them the 436-case rise reported by the press cannot be checked.',
      'Whether the two identical Montevideo records are one purchase filed twice or two identical purchases on the same day. We publish the conservative total and the other one too.',
      'Actual spending on suicide prevention. It is not in this record and it is not published anywhere as a budget line: it is spread across ASSE salaries, mandatory health-system benefits and staff hours at four ministries. That it cannot be added up is itself part of the finding.',
    ],

    sourcesTag: 'Where to check',
    sourcesTitle: 'All of this is public',
    sourcesP: 'The mortality series sits in two ministry PDFs and one MIDES CSV. The seven purchases sit in the state procurement record, each with its identifier. None of this requires a freedom-of-information request.',
    srcOficial: 'State documents and international bodies',
    srcPrensa: 'Press, cited as press',
  },
} as const

export function suContent(locale: string) {
  return SU_CONTENT[(locale === 'en' ? 'en' : 'es') as Locale]
}
