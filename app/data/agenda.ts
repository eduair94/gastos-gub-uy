/**
 * La agenda del día: los indicadores oficiales, el calendario y las reglas de reuso de prensa.
 *
 * EL PEDIDO ERA UN RESUMEN DIARIO DE NOTICIAS. La respuesta honesta, después de medirlo, es que un
 * digest DIARIO de prensa no es sostenible y esta página lo dice antes que ninguna otra cosa.
 * Medición del 14/08/2026 sobre nuestro propio archivo `organism_news`: 257 notas guardadas, 0 de
 * las últimas 24 horas, 0 de 3 días, 1 de 7 días, 8 de 30. Mediana de antigüedad, 666 días. No se
 * arregla corriendo el job más seguido: de 5.496 resultados crudos del buscador quedaron 257 (4,7%
 * de paso) y la prensa uruguaya no escribe sobre compras públicas todos los días.
 *
 * LO QUE SÍ TIENE VOLUMEN DIARIO ES EL REGISTRO. Medido sobre los últimos catorce días: los días
 * hábiles cierran entre 266 y 371 adjudicaciones y los fines de semana quedan en 0 a 7. Ése es el
 * plato principal de la página; la prensa es guarnición eventual y su estado vacío es el normal.
 *
 * POR QUÉ LOS INDICADORES SON UN ARCHIVO CURADO Y NO UN JOB. Porque medimos qué haría falta y no
 * cierra: el INE no tiene API (sus 15 conjuntos abiertos no incluyen IPC, IMS ni ECH y su última
 * modificación es de 2018), sus informes llevan sufijo de versión en la URL —así que un job que
 * apunte a V.1.0 serviría el dato viejo indefinidamente sin fallar si el organismo corrige—, y el
 * sitio del BCU es SharePoint renderizado por JavaScript. Un job frágil que publica un número viejo
 * sin avisar es peor que una tabla leída a mano con su fecha de verificación a la vista. Cada fila
 * lleva `verifiedOn` y la página lo muestra.
 *
 * LO QUE SÍ ES AUTOMÁTICO viene del endpoint: el registro del día sale del corpus y la cotización
 * mensual del dólar y la Unidad Indexada salen de `exchange_rates`, que ya mantiene el job del BCU.
 *
 * DOS FECHAS, SIEMPRE. La de referencia (el período que mide) y la de publicación. Confundirlas es
 * el error más común en la cobertura de estos números y por eso son dos columnas, no una.
 */

export type Locale = 'es' | 'en'
export interface L { es: string, en: string }

export const AGENDA_REVISED_ON = '2026-08-14'

/* ------------------------------------------------------------------ */
/* Indicadores oficiales                                               */
/* ------------------------------------------------------------------ */

export interface Indicator {
  key: string
  name: L
  value: L
  /** El período que mide. */
  reference: L
  /** El día en que el organismo lo publicó. `null` cuando no figura: no se deduce. */
  published: string | null
  body: string
  url?: string
  note?: L
}

export const INDICATORS: Indicator[] = [
  {
    key: 'ipc-nivel',
    name: { es: 'IPC, índice general', en: 'CPI, general index' },
    value: { es: '118,20 (base octubre 2022 = 100)', en: '118.20 (October 2022 = 100)' },
    reference: { es: 'julio de 2026', en: 'July 2026' },
    published: '2026-08-05',
    body: 'INE',
    url: 'https://www5.ine.gub.uy/documents/Estad%C3%ADsticasecon%C3%B3micas/HTML/IPC/2026/IPC%20Julio%202026.html',
  },
  {
    key: 'ipc-mes',
    name: { es: 'IPC, variación mensual', en: 'CPI, monthly change' },
    value: { es: '0,07%', en: '0.07%' },
    reference: { es: 'julio de 2026', en: 'July 2026' },
    published: '2026-08-05',
    body: 'INE',
  },
  {
    key: 'ipc-12',
    name: { es: 'IPC, variación en 12 meses', en: 'CPI, 12-month change' },
    value: { es: '4,27%', en: '4.27%' },
    reference: { es: 'julio de 2026', en: 'July 2026' },
    published: '2026-08-05',
    body: 'INE',
  },
  {
    key: 'ipc-acum',
    name: { es: 'IPC, acumulada en el año', en: 'CPI, year to date' },
    value: { es: '3,40%', en: '3.40%' },
    reference: { es: 'julio de 2026', en: 'July 2026' },
    published: '2026-08-05',
    body: 'INE',
  },
  {
    key: 'desempleo',
    name: { es: 'Tasa de desempleo, total país', en: 'Unemployment rate, whole country' },
    value: { es: '7,0%', en: '7.0%' },
    reference: { es: 'junio de 2026', en: 'June 2026' },
    published: '2026-07-29',
    body: 'INE (ECH)',
    url: 'https://www.gub.uy/instituto-nacional-estadistica/tematica/actividad-empleo-desempleo',
    note: {
      es: 'Montevideo 6,9% e interior 7,1%. Tasa de actividad 63,9% y de empleo 59,5%.',
      en: 'Montevideo 6.9% and the interior 7.1%. Activity rate 63.9% and employment rate 59.5%.',
    },
  },
  {
    key: 'pib',
    name: { es: 'PIB, variación interanual', en: 'GDP, year-on-year change' },
    value: { es: '+0,9%', en: '+0.9%' },
    reference: { es: 'primer trimestre de 2026', en: 'first quarter of 2026' },
    published: null,
    body: 'BCU',
    url: 'https://www.bcu.gub.uy/Estadisticas-e-Indicadores/Paginas/Ultimo-informe-disponible.aspx',
    note: {
      es: 'La variación desestacionalizada contra el trimestre anterior es +0,8%: son dos medidas distintas del mismo trimestre, no una contradicción. El dato viene marcado como provisional y el BCU revisa trimestres anteriores.',
      en: 'The seasonally adjusted change against the previous quarter is +0.8%: two different measures of the same quarter, not a contradiction. The figure is flagged provisional and the central bank revises earlier quarters.',
    },
  },
  {
    key: 'ims',
    name: { es: 'Índice medio de salarios, nominal', en: 'Average wage index, nominal' },
    value: { es: '+5,16% en 12 meses', en: '+5.16% over 12 months' },
    reference: { es: 'junio de 2026', en: 'June 2026' },
    published: '2026-07-31',
    body: 'INE',
    url: 'https://www.gub.uy/instituto-nacional-estadistica/tematica/indice-medio-salarios',
    note: {
      es: 'Variación mensual 0,04% y acumulada del año 3,87%. El salario REAL —el que descuenta la inflación— no lo publicamos: el informe del INE que lo trae se trunca al abrirlo y no pudimos leer el cuadro, así que la cifra que circula queda afuera hasta poder verificarla.',
      en: 'Monthly change 0.04% and 3.87% year to date. We do not publish the REAL wage — the one net of inflation: the INE report carrying it truncates when opened and we could not read the table, so the figure in circulation stays out until we can verify it.',
    },
  },
  {
    key: 'icc',
    name: { es: 'Índice de Confianza del Consumidor', en: 'Consumer Confidence Index' },
    value: { es: '46,3 puntos', en: '46.3 points' },
    reference: { es: 'junio de 2026', en: 'June 2026' },
    published: '2026-08-01',
    body: 'Equipos Consultores + UCU Business School',
    note: {
      es: 'Bimestral, no mensual: −1,6 puntos contra abril (47,9) y −13% interanual. La comparación es contra abril, no contra mayo, como repiten varios resúmenes automáticos: en mayo no hubo medición. La ficha del estudio —telefónica, 500 casos, ±4,8% con 95% de confianza, metodología del índice de la Universidad de Michigan— corresponde al diseño publicado en el informe de abril de 2026; ninguna ola publica sus fechas de campo.',
      en: 'Bimonthly, not monthly: −1.6 points against April (47.9) and −13% year on year. The comparison is against April, not May, as several automated summaries repeat: there was no May wave. The study note — telephone, 500 cases, ±4.8% at 95% confidence, University of Michigan index methodology — belongs to the design published in the April 2026 report; no wave publishes its field dates.',
    },
  },
]

/* ------------------------------------------------------------------ */
/* Expectativas: dos mediciones de lo mismo que dan distinto           */
/* ------------------------------------------------------------------ */

/**
 * DE LAS DOS ENCUESTAS DE EXPECTATIVAS, ACÁ VA UNA SOLA, Y LA AUSENCIA DE LA OTRA ES EL DATO.
 *
 * Los números del relevamiento de analistas del Banco Central no se publican porque no los pudimos
 * abrir en su fuente: el sitio del organismo es SharePoint renderizado por JavaScript y los
 * archivos esperables devuelven 404 o no cargan. Habíamos anotado siete cifras en una primera
 * lectura y una segunda verificación no consiguió reabrir ni una. Publicar siete números que no se
 * pueden volver a mirar es exactamente lo que esta página le reprocha a la cobertura apurada.
 */
export const EXPECTATIONS_PANELS = [
  {
    key: 'ine',
    source: { es: 'INE, Encuesta de Expectativas Empresariales', en: 'INE, Business Expectations Survey' },
    published: '2026-08-07',
    reference: { es: 'julio de 2026', en: 'July 2026' },
    universe: {
      es: 'empresas privadas grandes; el INE no publica en la página de difusión la ficha con el tamaño de muestra y la tasa de respuesta, y el informe técnico completo no se pudo descargar',
      en: 'large private firms; the agency does not publish the note with sample size and response rate on the release page, and the full technical report could not be downloaded',
    },
    statistic: { es: 'media recortada al 90%', en: '90% trimmed mean' },
    values: {
      es: 'Inflación esperada para 2026, 5,0%; para el año móvil cerrado en junio de 2027, 5,3%; para el cerrado en junio de 2028, 5,4%.',
      en: 'Expected inflation for 2026, 5.0%; for the rolling year to June 2027, 5.3%; to June 2028, 5.4%.',
    },
    url: 'https://www.gub.uy/instituto-nacional-estadistica/tematica/eee-encuesta-expectativas-empresariales',
  },
]

/* ------------------------------------------------------------------ */
/* Calendario oficial                                                  */
/* ------------------------------------------------------------------ */

export interface CalendarEntry {
  key: string
  what: L
  /** ISO, o `null` cuando el organismo no anticipa el día exacto. */
  date: string | null
  approx?: L
}

export const CALENDAR: CalendarEntry[] = [
  { key: 'ippn-07', what: { es: 'IPPN de julio de 2026', en: 'Producer price index, July 2026' }, date: '2026-08-17' },
  { key: 'ech-ing-2t', what: { es: 'ECH, ingresos del 2º trimestre de 2026', en: 'Household survey, Q2 2026 incomes' }, date: '2026-08-19' },
  { key: 'ech-07', what: { es: 'Desempleo (ECH) de julio de 2026', en: 'Unemployment (household survey), July 2026' }, date: '2026-08-27' },
  { key: 'ims-07', what: { es: 'IMS de julio de 2026', en: 'Average wage index, July 2026' }, date: '2026-08-31' },
  { key: 'ipc-08', what: { es: 'IPC de agosto de 2026', en: 'CPI, August 2026' }, date: '2026-09-03' },
  { key: 'ui-09', what: { es: 'Unidad Indexada de setiembre de 2026', en: 'Indexed Unit, September 2026' }, date: '2026-09-03' },
  { key: 'eee-08', what: { es: 'Expectativas empresariales de agosto de 2026', en: 'Business expectations, August 2026' }, date: '2026-09-07' },
  { key: 'ech-08', what: { es: 'Desempleo (ECH) de agosto de 2026', en: 'Unemployment (household survey), August 2026' }, date: '2026-09-24' },
  { key: 'ipc-09', what: { es: 'IPC de setiembre de 2026', en: 'CPI, September 2026' }, date: '2026-10-05' },
  {
    key: 'pib-2t',
    what: { es: 'PIB del 2º trimestre de 2026', en: 'GDP, Q2 2026' },
    date: null,
    approx: {
      es: 'setiembre de 2026 — el BCU no anticipa el día exacto; el patrón histórico es 1T en junio, 2T en setiembre, 3T en diciembre y 4T en marzo',
      en: 'September 2026 — the central bank does not announce the exact day; the historical pattern is Q1 in June, Q2 in September, Q3 in December and Q4 in March',
    },
  },
]

/* ------------------------------------------------------------------ */
/* Semáforo de reuso                                                   */
/* ------------------------------------------------------------------ */

export interface ReuseLevel {
  key: 'verde' | 'amarillo' | 'permiso' | 'rojo'
  level: L
  detail: L
}

export const REUSE: ReuseLevel[] = [
  {
    key: 'verde',
    level: { es: 'Verde: se puede reproducir el texto', en: 'Green: the text may be reproduced' },
    detail: {
      es: 'Datos del catálogo nacional, del INE y del BCU bajo la Licencia de Datos Abiertos de Uruguay (Decreto 54/017, reglamentario del artículo 82 de la Ley 19.355): se pueden reproducir, adaptar y usar comercialmente citando proveedor, licencia, conjunto de datos y modificaciones. También el texto normativo del Diario Oficial.',
      en: 'Data from the national catalogue, the statistics institute and the central bank under Uruguay\'s Open Data Licence (Decree 54/017, implementing article 82 of Law 19,355): they may be reproduced, adapted and used commercially citing provider, licence, dataset and modifications. The same goes for the text of the Official Gazette.',
    },
  },
  {
    key: 'amarillo',
    level: { es: 'Amarillo: sólo titular, medio, fecha y enlace', en: 'Amber: headline, outlet, date and link only' },
    detail: {
      es: 'El Observador, la diaria, Subrayado, El País, Brecha y Búsqueda. Un titular con su enlace es una referencia, no una reproducción de la obra.',
      en: 'El Observador, la diaria, Subrayado, El País, Brecha and Búsqueda. A headline with its link is a reference, not a reproduction of the work.',
    },
  },
  {
    key: 'permiso',
    level: { es: 'Amarillo con permiso expreso', en: 'Amber with express permission' },
    detail: {
      es: 'Montevideo Portal declara en su robots.txt las señales de contenido search=yes, ai-train=no y use=reference, y define «search» como devolver hipervínculos y extractos breves. Titular y enlace están autorizados; entrenar o ingerir para IA, prohibido. Lo respetamos en las dos direcciones.',
      en: 'Montevideo Portal declares in its robots.txt the content signals search=yes, ai-train=no and use=reference, defining "search" as returning hyperlinks and brief extracts. Headline and link are authorised; training or ingesting for AI is not. We honour both directions.',
    },
  },
  {
    key: 'rojo',
    level: { es: 'Rojo: no se consume', en: 'Red: not consumed' },
    detail: {
      es: 'LaRed21: su robots.txt tiene Disallow: /feed para todo agente. Es el feed más rico del conjunto —entrega el artículo completo— y es justamente el que está negado.',
      en: 'LaRed21: its robots.txt has Disallow: /feed for every agent. It is the richest feed in the set — it delivers the full article — and it is precisely the one that is denied.',
    },
  },
]

export const AGENDA_SOURCES = [
  {
    key: 'oficiales',
    items: [
      { label: 'INE — IPC de julio de 2026', url: 'https://www5.ine.gub.uy/documents/Estad%C3%ADsticasecon%C3%B3micas/HTML/IPC/2026/IPC%20Julio%202026.html' },
      { label: 'INE — actividad, empleo y desempleo', url: 'https://www.gub.uy/instituto-nacional-estadistica/tematica/actividad-empleo-desempleo' },
      { label: 'INE — índice medio de salarios de junio de 2026', url: 'https://www5.ine.gub.uy/documents/Estad%C3%ADsticasecon%C3%B3micas/HTML/IMS/2026/IMS%20Junio%202026.html' },
      { label: 'INE — Encuesta de Expectativas Empresariales de julio de 2026', url: 'https://www5.ine.gub.uy/documents/Estad%C3%ADsticasecon%C3%B3micas/HTML/EEE/2026/IN-ECO-EEE-2026-M-07-V.1.0.html' },
      { label: 'INE — calendario de difusión', url: 'https://www.gub.uy/instituto-nacional-estadistica/comunicacion/calendario-actividades' },
      { label: 'BCU — último informe de cuentas nacionales', url: 'https://www.bcu.gub.uy/Estadisticas-e-Indicadores/Paginas/Ultimo-informe-disponible.aspx' },
      { label: 'BCU — cotizaciones', url: 'https://www.bcu.gub.uy/Estadisticas-e-Indicadores/Paginas/Cotizaciones.aspx' },
      { label: 'BCU — expectativas de los agentes', url: 'https://www.bcu.gub.uy/Politica-Economica-y-Mercados/Paginas/Expectativas-de-los-agentes.aspx' },
      { label: 'Diario Oficial (IMPO)', url: 'https://www.impo.com.uy/diariooficial/' },
    ],
  },
  {
    key: 'reuso',
    items: [
      { label: 'Licencia de Datos Abiertos de Uruguay (Decreto 54/017)', url: 'https://www.gub.uy/agencia-reguladora-compras-estatales/datos-y-estadisticas/datos/licencia-datos-abiertos' },
      { label: 'robots.txt de Montevideo Portal — señales de contenido', url: 'https://www.montevideo.com.uy/robots.txt' },
      { label: 'robots.txt de LaRed21 — Disallow: /feed', url: 'https://www.lr21.com.uy/robots.txt' },
      { label: 'News sitemap de El Observador', url: 'https://www.elobservador.com.uy/sitemap-news.xml' },
      { label: 'News sitemap de Búsqueda', url: 'https://www.busqueda.com.uy/sitemap-news.xml' },
    ],
  },
]

/* ------------------------------------------------------------------ */
/* Copia                                                               */
/* ------------------------------------------------------------------ */

const CONTENT = {
  es: {
    kicker: 'Todos los días',
    title: 'La agenda del día',
    dek: 'Lo que el Estado publicó hoy en el registro de compras y los indicadores oficiales con su fecha de referencia y su fecha de publicación. Un resumen diario de prensa no es sostenible: lo medimos y acá está el número.',
    chips: ['El registro, en vivo', 'Indicadores con dos fechas', 'Prensa, cuando la hay'],
    fileScope: 'Registro de compras del día, indicadores oficiales y prensa por organismo',
    filePeriod: 'Últimos catorce días del registro',
    fileSource: 'Corpus propio, INE, BCU y una búsqueda de prensa por organismo',

    introTag: 'Qué es esto',
    intro: [
      'Todos los días el Estado uruguayo publica compras, y una o dos veces por mes los organismos oficiales publican los números con los que se mide la economía. Esta página junta las dos cosas, con la fecha de cada una a la vista.',
      'Lo que no vas a encontrar acá es un resumen diario de la prensa. No porque no queramos: porque lo medimos y no da.',
    ],
    revisedOn: 'Indicadores verificados a mano el',

    todayTag: 'En vivo',
    todayTitle: 'Hoy en el registro',
    todayDek: 'Adjudicaciones que entraron al registro de compras públicas, por día de carga.',
    today: [
      'Esto sí tiene volumen todos los días. En los últimos catorce días, los días hábiles cerraron entre 266 y 371 adjudicaciones y los fines de semana quedaron entre cero y siete.',
      'El número de hoy se llena durante el día: a las nueve de la mañana suele haber unas pocas y al cierre unas trescientas. Por eso al lado va la serie de los últimos catorce días, sin la cual un número bajo se lee como una caída cuando en realidad es la hora.',
    ],
    tileToday: 'adjudicaciones cargadas hoy',
    tileTodaySub: 'el día todavía se está llenando',
    tileAmount: 'monto adjudicado hoy',
    tileAmountSub: 'normalizado a pesos, con el techo de artefactos del sitio',
    tileAvg: 'promedio de un día hábil',
    tileAvgSub: 'medido sobre los últimos catorce días',
    tilePress: 'notas de prensa guardadas en total',
    tilePressSub: 'de las cuales una es de los últimos siete días',
    seriesTitle: 'Los últimos catorce días',
    latestTitle: 'Las últimas que entraron',
    emptyToday: 'Todavía no entró ninguna adjudicación hoy',
    emptyTodayBody: 'Es lo habitual temprano en la mañana, y lo normal los fines de semana y feriados: el registro carga en días hábiles.',
    exploreCta: 'Ver todo el registro',

    fxTitle: 'La cotización que usa este sitio',
    fxDek: 'Promedio mensual del Banco Central. Es la misma con la que llevamos cualquier monto a pesos comparables.',
    fxNote: 'No es el precio de la casa de cambio: es la referencia del Banco Central. La Unidad Indexada es la que corrige por inflación, y es la que hace comparable un contrato de 2010 con uno de hoy.',
    fxUsd: 'Pesos por dólar',
    fxUi: 'Pesos por Unidad Indexada',

    noDigestTag: 'La medición, primero',
    noDigestTitle: 'Por qué esto no es un resumen diario de prensa',
    noDigestDek: 'Medición nuestra sobre nuestro propio archivo, 14 de agosto de 2026.',
    noDigest: [
      'Guardamos noticias por organismo: una búsqueda por cada uno de los 396 organismos que aparecen en el registro de compras. El archivo tiene hoy 257 notas.',
      'De esas 257, ninguna se publicó en las últimas 24 horas. Ninguna en los últimos 3 días. Una en los últimos 7. Ocho en los últimos 30. La mediana de antigüedad es de 666 días; casi dos tercios tienen más de un año y la más vieja es de 2001.',
      'Correr la búsqueda más seguido no arregla eso. El cuello no es la cadencia: de 5.496 resultados que devolvió el buscador quedaron 257 después del filtro —un 4,7% de paso— y la prensa uruguaya no escribe sobre compras públicas todos los días. Barrer los 396 organismos a diario multiplicaría por cinco la carga sobre un servicio de terceros para conseguir, según lo medido, alrededor de una nota nueva por semana en todo el sitio.',
      'Así que la prensa acá es guarnición eventual, no plato principal. Y la sección está diseñada para que estar vacía sea su estado normal.',
    ],
    noDigestFindingKicker: 'Lo que esto mide y lo que no',
    noDigestFindingTitle: 'Medimos nuestro archivo, no la prensa uruguaya',
    noDigestFinding: [
      'Lo anterior describe un corpus almacenado: una consulta por organismo, ordenada por relevancia y no por fecha, truncada a ocho ítems por organismo y filtrada al 4,7%. Las tres cosas sesgan hacia lo viejo: si un organismo tiene ocho notas históricas fuertes, una nota de ayer puede quedar afuera del corte.',
      'Lo que se puede afirmar es que el archivo tal como está guardado contiene una sola nota de los últimos siete días, y eso alcanza para concluir que un resumen diario no puede apoyarse en él. Lo que no se puede afirmar es que la prensa uruguaya haya publicado una sola nota sobre compras públicas en la semana. No lo medimos y no lo vamos a decir.',
    ],
    cadenceTitle: 'La cadencia honesta de cada capa',
    cadence: [
      { layer: 'El registro de compras', rate: 'diaria', why: 'El corpus tiene volumen diario: entre 266 y 371 adjudicaciones por día hábil.' },
      { layer: 'Los indicadores oficiales', rate: 'cuando los publica el organismo', why: 'El IPC es mensual con tres a cinco días de rezago; el desempleo, mensual con unas cuatro semanas; el PIB, trimestral. Las fechas futuras están publicadas y las mostramos.' },
      { layer: 'La prensa', rate: 'eventual', why: 'Aparece cuando aparece. El estado vacío es el normal y la sección está diseñada para eso, no para mostrar un error.' },
      { layer: 'El resumen redactado', rate: 'semanal', why: 'Ya existe: los números semanales del blog, escritos por un modelo que sólo recibe hechos cerrados del corpus y nunca titulares de terceros. No lo duplicamos: lo enlazamos.' },
    ],
    cadenceCols: { layer: 'Capa', rate: 'Cadencia', why: 'Por qué' },

    indTag: 'Cuando los publica el organismo',
    indTitle: 'Los números oficiales, con su fecha',
    indDek: 'Cada indicador con dos fechas distintas: la del período que mide y la del día en que se publicó.',
    ind: [
      'Confundir la fecha de referencia con la de publicación es el error más común en la cobertura de estos números. El IPC de julio salió el 5 de agosto; el desempleo de junio, el 29 de julio. La tabla muestra siempre las dos.',
      'Estos valores se leen a mano. El INE no tiene API —sus conjuntos de datos abiertos no incluyen IPC, IMS ni ECH— y sus informes llevan sufijo de versión en la URL, así que un job que apunte a una versión serviría el dato viejo indefinidamente sin fallar si el organismo corrige. Preferimos una tabla curada con su fecha de verificación antes que un automatismo que envejece en silencio.',
    ],
    indCols: { name: 'Indicador', value: 'Valor', reference: 'Período que mide', published: 'Publicado', body: 'Organismo' },
    indPendiente: 'no figura',

    expTag: 'Expectativas de inflación',
    expTitle: 'Qué inflación esperan los que compran y venden',
    expDek: 'Las expectativas de las empresas, publicadas. Las de los analistas, no: no pudimos abrirlas en su fuente.',
    exp: [
      'Hay dos relevamientos de expectativas de inflación en Uruguay y miden universos distintos: el Banco Central pregunta a analistas y el INE pregunta a empresas. Acá va uno solo.',
      'Las empresas esperan 5,0% para 2026, 5,3% para el año móvil que cierra en junio de 2027 y 5,4% para el siguiente. El INE resume con una media recortada al 90%, que descarta los extremos antes de promediar.',
      'Del relevamiento de analistas del Banco Central habíamos anotado siete cifras. No las publicamos: el sitio del organismo se sirve con JavaScript y los archivos esperables devuelven error, así que una segunda verificación no consiguió reabrir ni una sola. Publicar números que no se pueden volver a mirar es exactamente lo que esta página le reprocha a la cobertura apurada.',
      'Cuando el Banco Central publique de una forma que se pueda leer y verificar, las dos van a estar acá una al lado de la otra —rotuladas, no promediadas—, que es lo mismo que hacemos con las encuestas de opinión.',
    ],
    expUniverse: 'Universo',
    expStat: 'Estadístico',
    expWarn: [
      'Las expectativas empresariales son del INE, no del Banco Central. Se confunden seguido.',
      'El INE no publica en su página de difusión el tamaño de muestra ni la tasa de respuesta de esta encuesta, y su informe técnico completo no se pudo descargar. Las cifras que van arriba son las que publica; la ficha, no la tenemos.',
      'Tampoco publica las fechas de su trabajo de campo.',
    ],
    expLink: 'Y la comparación entre encuestadoras, en detalle',

    calTag: 'Calendario oficial',
    calTitle: 'Qué se publica y cuándo',
    calDek: 'Fechas publicadas por los propios organismos. Es la forma correcta de esperar un dato: no reintentar a ciegas.',
    calCols: { what: 'Publicación', date: 'Fecha' },
    calPending: 'pendiente',
    calDone: 'publicado',

    pressTag: 'Eventual',
    pressTitle: 'Prensa que menciona a un organismo del registro',
    pressDek: 'Titular, medio, fecha y enlace. Cada ítem enlaza también a la ficha del organismo en este sitio.',
    press: [
      'Esto es una búsqueda, no una curaduría: consultamos por el nombre de cada organismo del registro y guardamos lo que devuelve. Que una nota mencione a un organismo no significa que hable de una compra, y que no aparezca no significa que no exista.',
      'Cada ítem lleva una etiqueta de qué tipo de fuente es, porque un quinto de lo que devuelve la búsqueda no es prensa: sobre las 257 notas guardadas, 53 vienen de portales del propio Estado o de un partido. En un panel de ocho ítems eso pasa desapercibido; en una lista ordenada por fecha, un comunicado aparecería arriba junto a periodismo, sin distinción.',
      'Y cada ítem enlaza al organismo en nuestro registro. Si no cruza con un registro nuestro, no entra: para leer noticias sueltas hay lugares mejores que éste.',
    ],
    pressEmpty: 'No hay notas guardadas',
    pressEmptyBody: 'Es lo habitual: el archivo suma alrededor de una nota nueva por semana en todo el sitio.',
    pressWarn: [
      'Esto no es «lo que apareció desde ayer». El job de prensa reescribe el archivo entero en cada corrida y no guarda cuándo vio cada nota por primera vez, así que sólo podemos ordenar por la fecha de publicación del medio. Responder «qué es nuevo» requiere un cambio en el modelo que todavía no hicimos.',
      'La clasificación en prensa, comunicación oficial y partidaria la hacemos nosotros por el dominio del medio. Es un piso, no un censo: puede haber otros portales institucionales entre los medios cuyo nombre no delata el origen.',
      'Los enlaces guardados son redirecciones del buscador de noticias, no direcciones directas del medio, y esas redirecciones caducan.',
      'No guardamos ni mostramos el cuerpo de ninguna nota. No hay resumen automático de prensa en esta página, y no lo va a haber: sin cuerpo, un resumen sería un resumen de titulares, o sea inventar.',
    ],
    pressTypes: { prensa: 'prensa', oficial: 'comunicación oficial', partidaria: 'partidaria' },

    weeklyTag: 'Cada semana',
    weeklyTitle: 'El resumen redactado es semanal',
    weekly: [
      'El resumen escrito de lo que pasó en el registro sale una vez por semana y vive en el blog. Se genera con un modelo de lenguaje al que se le entregan únicamente hechos cerrados del corpus —organismos, proveedores, montos, fechas— y nunca titulares de terceros. Esa separación es deliberada y se mantiene.',
      'Diario no tendría sentido: el trabajo del resumen es encontrar la forma de una semana, y una semana necesita una semana.',
    ],
    weeklyProcesses: 'procesos elegibles',

    reuseTag: 'Método y reuso',
    reuseTitle: 'Cómo se arma esto y qué no tocamos',
    reuse: [
      'De los medios tomamos titular, medio, fecha y enlace, y nada más. No es una interpretación generosa de una excepción legal: es la línea que se sostiene en cualquier lectura, porque un titular con su enlace es una referencia y no una reproducción de la obra.',
      'Dos feeds uruguayos entregan el artículo completo dentro del XML. Guardarlo sería trivial y sería una violación directa del contrato de este sitio. Donde el medio publica un mapa de noticias lo preferimos al feed, porque contiene exactamente los cuatro campos que queremos y ninguno del cuerpo.',
      'Un medio nos negó expresamente el acceso a su feed en su robots.txt y no lo consumimos. Otro publica una política de reuso legible por máquina que autoriza titular y enlace y prohíbe el uso para entrenamiento: la respetamos en las dos direcciones.',
    ],
    reuseCols: { level: 'Nivel', detail: 'Qué cubre' },

    readTitle: 'Cómo leer esta página',
    read: [
      'Lo que sale del registro de compras públicas lo medimos nosotros y se puede reproducir: cada fila enlaza a la ficha del contrato y esa ficha enlaza a la página oficial del Estado.',
      'Los indicadores económicos los miden el INE, el Banco Central y, en el caso de la confianza del consumidor, una consultora privada. Nosotros los transcribimos con su organismo, su fecha de referencia y su fecha de publicación, y no los recalculamos.',
      'La prensa no la elegimos: es el resultado de una búsqueda por el nombre de cada organismo. Que una nota aparezca no implica que hable de una compra; que no aparezca no implica que no exista.',
      'No resumimos notas de otros medios. Guardamos titular, medio, fecha y enlace, y el enlace va al medio, no a una copia nuestra.',
      'Si un número de acá no coincide con el del organismo que lo publicó, el organismo tiene razón.',
    ],

    srcTitle: 'Fuentes',
    srcOficiales: 'Organismos oficiales',
    srcReuso: 'Reuso y normativa',
    colBuyer: 'Organismo',
    colSupplier: 'Proveedor',
    colAmount: 'Monto',
    colWhen: 'Cargada',
  },

  en: {
    kicker: 'Every day',
    title: 'Today\'s agenda',
    dek: 'What the state published today in the procurement record, and the official indicators with their reference date and their publication date. A daily press digest is not sustainable: we measured it and here is the number.',
    chips: ['The record, live', 'Indicators with two dates', 'Press, when there is any'],
    fileScope: 'The day\'s procurement record, official indicators and press by agency',
    filePeriod: 'The last fourteen days of the record',
    fileSource: 'Our own corpus, the statistics institute, the central bank and a press search by agency',

    introTag: 'What this is',
    intro: [
      'Every day the Uruguayan state publishes purchases, and once or twice a month the official agencies publish the numbers the economy is measured by. This page puts the two together, each with its date in plain sight.',
      'What you will not find here is a daily press digest. Not because we would not like one: because we measured it and it does not hold.',
    ],
    revisedOn: 'Indicators verified by hand on',

    todayTag: 'Live',
    todayTitle: 'Today in the record',
    todayDek: 'Awards that entered the public-procurement record, by day of loading.',
    today: [
      'This does have daily volume. Over the last fourteen days, working days closed between 266 and 371 awards and weekends stayed between zero and seven.',
      'Today\'s figure fills up over the course of the day: at nine in the morning there are usually a handful and by close around three hundred. That is why the fourteen-day series sits next to it — without it, a low number reads as a collapse when it is really just the hour.',
    ],
    tileToday: 'awards loaded today',
    tileTodaySub: 'the day is still filling up',
    tileAmount: 'amount awarded today',
    tileAmountSub: 'normalised to pesos, with the site\'s artefact ceiling',
    tileAvg: 'average for a working day',
    tileAvgSub: 'measured over the last fourteen days',
    tilePress: 'press items stored in total',
    tilePressSub: 'of which one is from the last seven days',
    seriesTitle: 'The last fourteen days',
    latestTitle: 'The most recent to arrive',
    emptyToday: 'No award has entered today yet',
    emptyTodayBody: 'That is usual early in the morning, and normal at weekends and on holidays: the record loads on working days.',
    exploreCta: 'Browse the whole record',

    fxTitle: 'The exchange rate this site uses',
    fxDek: 'Monthly average from the central bank. It is the same one we use to bring any amount to comparable pesos.',
    fxNote: 'It is not the bureau-de-change price: it is the central bank reference. The Indexed Unit is what corrects for inflation, and it is what makes a 2010 contract comparable with one from today.',
    fxUsd: 'Pesos per dollar',
    fxUi: 'Pesos per Indexed Unit',

    noDigestTag: 'The measurement first',
    noDigestTitle: 'Why this is not a daily press digest',
    noDigestDek: 'Our own measurement of our own archive, 14 August 2026.',
    noDigest: [
      'We store press items by agency: one search for each of the 396 agencies that appear in the procurement record. The archive today holds 257 items.',
      'Of those 257, none was published in the last 24 hours. None in the last 3 days. One in the last 7. Eight in the last 30. The median age is 666 days; almost two thirds are more than a year old and the oldest is from 2001.',
      'Running the search more often does not fix that. The bottleneck is not the cadence: of 5,496 raw results the search returned, 257 survived the filter — a 4.7% pass rate — and the Uruguayan press simply does not write about public procurement every day. Sweeping all 396 agencies daily would multiply the load on a third-party service fivefold to obtain, as measured, roughly one new item a week across the whole site.',
      'So press here is an occasional side dish, not the main course. And the section is designed so that being empty is its normal state.',
    ],
    noDigestFindingKicker: 'What this measures and what it does not',
    noDigestFindingTitle: 'We measured our archive, not the Uruguayan press',
    noDigestFinding: [
      'The above describes a stored corpus: one query per agency, ordered by relevance rather than date, truncated to eight items per agency and filtered down to 4.7%. All three bias it towards the old: if an agency has eight strong historical items, yesterday\'s piece can fall below the cut.',
      'What can be stated is that the archive as stored contains a single item from the last seven days, and that is enough to conclude a daily digest cannot rest on it. What cannot be stated is that the Uruguayan press published a single item about public procurement this week. We did not measure that and we will not say it.',
    ],
    cadenceTitle: 'The honest cadence of each layer',
    cadence: [
      { layer: 'The procurement record', rate: 'daily', why: 'The corpus has daily volume: between 266 and 371 awards per working day.' },
      { layer: 'The official indicators', rate: 'when the agency publishes them', why: 'The CPI is monthly with three to five days of lag; unemployment, monthly with about four weeks; GDP, quarterly. The future dates are published and we show them.' },
      { layer: 'The press', rate: 'occasional', why: 'It turns up when it turns up. The empty state is the normal one and the section is designed for that, not to show an error.' },
      { layer: 'The written summary', rate: 'weekly', why: 'It already exists: the weekly issues on the blog, written by a model that receives only closed facts from the corpus and never third-party headlines. We do not duplicate it: we link to it.' },
    ],
    cadenceCols: { layer: 'Layer', rate: 'Cadence', why: 'Why' },

    indTag: 'When the agency publishes them',
    indTitle: 'The official numbers, with their dates',
    indDek: 'Each indicator with two different dates: the period it measures and the day it was published.',
    ind: [
      'Confusing the reference date with the publication date is the commonest error in the coverage of these numbers. July\'s CPI came out on 5 August; June\'s unemployment, on 29 July. The table always shows both.',
      'These values are read by hand. The statistics institute has no API — its open datasets include neither CPI nor wage index nor household survey — and its reports carry a version suffix in the URL, so a job pointing at one version would serve the old figure indefinitely without failing if the agency issues a correction. We prefer a curated table with its verification date to an automation that ages in silence.',
    ],
    indCols: { name: 'Indicator', value: 'Value', reference: 'Period measured', published: 'Published', body: 'Agency' },
    indPendiente: 'not stated',

    expTag: 'Inflation expectations',
    expTitle: 'What inflation those who buy and sell expect',
    expDek: 'Business expectations, published. Analyst expectations, not: we could not open them at source.',
    exp: [
      'There are two inflation-expectation surveys in Uruguay and they measure different universes: the central bank asks analysts and the statistics institute asks firms. Only one is here.',
      'Firms expect 5.0% for 2026, 5.3% for the rolling year ending June 2027 and 5.4% for the next. The agency summarises with a 90% trimmed mean, which discards the extremes before averaging.',
      'From the central bank\'s analyst survey we had noted seven figures. We do not publish them: the site is served with JavaScript and the expected files return errors, so a second verification could not reopen a single one. Publishing numbers that cannot be looked at again is exactly what this page holds against hurried coverage.',
      'When the central bank publishes in a form that can be read and verified, both will sit here side by side — labelled, not averaged — which is what we do with opinion polls.',
    ],
    expUniverse: 'Universe',
    expStat: 'Statistic',
    expWarn: [
      'The business expectations are the statistics institute\'s, not the central bank\'s. The two are often confused.',
      'The agency does not publish the sample size or response rate for this survey on its release page, and its full technical report could not be downloaded. The figures above are what it publishes; the technical note, we do not have.',
      'Nor does it publish its fieldwork dates.',
    ],
    expLink: 'And the comparison between polling firms, in detail',

    calTag: 'Official calendar',
    calTitle: 'What is published and when',
    calDek: 'Dates published by the agencies themselves. This is the right way to wait for a figure: not retrying blindly.',
    calCols: { what: 'Release', date: 'Date' },
    calPending: 'pending',
    calDone: 'published',

    pressTag: 'Occasional',
    pressTitle: 'Press mentioning an agency from the record',
    pressDek: 'Headline, outlet, date and link. Each item also links to the agency\'s file on this site.',
    press: [
      'This is a search, not a curation: we query by the name of each agency in the record and store what comes back. That an item mentions an agency does not mean it is about a purchase, and that it does not appear does not mean it does not exist.',
      'Each item carries a label for what kind of source it is, because a fifth of what the search returns is not press: of the 257 stored items, 53 come from portals of the state itself or of a party. Inside an eight-item panel that goes unnoticed; in a list ordered by date, a press release would sit at the top next to journalism, undistinguished.',
      'And each item links to the agency in our record. If it does not cross with a record of ours, it does not enter: for loose news there are better places than this one.',
    ],
    pressEmpty: 'No stored items',
    pressEmptyBody: 'That is usual: the archive gains roughly one new item a week across the whole site.',
    pressWarn: [
      'This is not "what appeared since yesterday". The press job rewrites the whole archive on each run and does not record when it first saw each item, so we can only order by the outlet\'s publication date. Answering "what is new" requires a model change we have not made yet.',
      'The classification into press, official communication and party is ours, by the outlet\'s domain. It is a floor, not a census: there may be other institutional portals among the outlets whose name does not give away the origin.',
      'The stored links are news-search redirects, not direct outlet addresses, and those redirects expire.',
      'We neither store nor display the body of any item. There is no automatic press summary on this page, and there will not be: without a body, a summary would be a summary of headlines, which is to say invention.',
    ],
    pressTypes: { prensa: 'press', oficial: 'official communication', partidaria: 'party' },

    weeklyTag: 'Every week',
    weeklyTitle: 'The written summary is weekly',
    weekly: [
      'The written summary of what happened in the record comes out once a week and lives on the blog. It is generated with a language model given only closed facts from the corpus — agencies, suppliers, amounts, dates — and never third-party headlines. That separation is deliberate and it stays.',
      'Daily would make no sense: the summary\'s job is to find the shape of a week, and a week needs a week.',
    ],
    weeklyProcesses: 'eligible processes',

    reuseTag: 'Method and reuse',
    reuseTitle: 'How this is put together and what we do not touch',
    reuse: [
      'From outlets we take headline, outlet, date and link, and nothing else. This is not a generous reading of a legal exception: it is the line that holds under any reading, because a headline with its link is a reference and not a reproduction of the work.',
      'Two Uruguayan feeds deliver the full article inside the XML. Storing it would be trivial and would be a direct violation of this site\'s contract. Where an outlet publishes a news map we prefer it to the feed, because it contains exactly the four fields we want and none of the body.',
      'One outlet expressly denied us access to its feed in its robots.txt and we do not consume it. Another publishes a machine-readable reuse policy that authorises headline and link and forbids use for training: we honour both directions.',
    ],
    reuseCols: { level: 'Level', detail: 'What it covers' },

    readTitle: 'How to read this page',
    read: [
      'What comes out of the public-procurement record we measure ourselves and it can be reproduced: each row links to the contract file and that file links to the state\'s official page.',
      'The economic indicators are measured by the statistics institute, the central bank and, for consumer confidence, a private firm. We transcribe them with their agency, their reference date and their publication date, and we do not recompute them.',
      'We do not choose the press: it is the result of a search by the name of each agency. That an item appears does not imply it is about a purchase; that it does not appear does not imply it does not exist.',
      'We do not summarise other outlets\' pieces. We store headline, outlet, date and link, and the link goes to the outlet, not to a copy of ours.',
      'If a number here does not match the agency that published it, the agency is right.',
    ],

    srcTitle: 'Sources',
    srcOficiales: 'Official agencies',
    srcReuso: 'Reuse and rules',
    colBuyer: 'Agency',
    colSupplier: 'Supplier',
    colAmount: 'Amount',
    colWhen: 'Loaded',
  },
} as const

export function agendaContent(locale: string) {
  return CONTENT[(locale === 'en' ? 'en' : 'es') as Locale]
}
