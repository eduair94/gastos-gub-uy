/**
 * Investigación · El datacenter de Google, buscado en los registros del Estado.
 *
 * POR QUÉ ESTA PIEZA EXISTE EN UN SITIO DE COMPRAS PÚBLICAS. Porque el resultado de buscarlo
 * es cero, y ese cero se explica: no es una obra que el Estado compre, es una inversión privada
 * en zona franca. El Estado no la paga; la exonera, la autoriza y le vende electricidad. La
 * pieza publica esa búsqueda fallida y el rastro que sí existe, que está en el Diario Oficial y
 * en el expediente ambiental, no en el registro de compras.
 *
 * TODO LO QUE AFIRMA VIENE DE UNA DE TRES FUENTES, y la página dice siempre cuál:
 *   1. Documento oficial leído directo — la Resolución 65/024 del MEF en el Diario Oficial
 *      Nº 31.379 y la Ficha IAR del expediente ambiental. Son los datos duros: padrones,
 *      superficies, fechas, empleo.
 *   2. Nuestra propia medición sobre el corpus — el cero, y el gasto del Estado en alojamiento.
 *   3. Prensa, citada como prensa — inversión, energía, y los contratos con UTE, que no pudimos
 *      leer en su fuente primaria. Van marcados como tales y NO se mezclan con lo anterior.
 *
 * La cifra de energía (560 GWh/año) es de prensa citando un informe técnico del expediente: no
 * está en la Ficha IAR, que es el resumen que el expediente publica para la ciudadanía. Esa
 * ausencia es un hallazgo de la pieza y por eso se dice, en vez de rellenarla con el número.
 */

export interface TimelineEntry {
  date: string
  key: string
  /** 'oficial' = documento del Estado leído directo; 'prensa' = crónica. */
  source: 'oficial' | 'prensa'
  url: string
}

/** La cadena de decisiones públicas, cada una con el documento donde consta. */
export const TIMELINE: TimelineEntry[] = [
  { date: '2009-09-07', key: 'zf2009', source: 'oficial', url: 'https://www.impo.com.uy/diariooficial/2024/03/08/documentos.pdf' },
  { date: '2020-10-13', key: 'zf2020', source: 'oficial', url: 'https://www.impo.com.uy/diariooficial/2024/03/08/documentos.pdf' },
  { date: '2023-10-24', key: 'esia', source: 'oficial', url: 'https://www.ambiente.gub.uy/oan/wp-content/uploads/2023/11/EsIA-Teros-24102023.pdf' },
  { date: '2024-02-28', key: 'zf2024', source: 'oficial', url: 'https://www.impo.com.uy/diariooficial/2024/03/08/documentos.pdf' },
  { date: '2024-07-25', key: 'aap', source: 'oficial', url: 'https://www.ambiente.gub.uy/oan/wp-content/uploads/2023/11/Resolucion-Ministerial-644-2024.pdf' },
  { date: '2024-08-30', key: 'obra', source: 'prensa', url: 'https://en.mercopress.com/2024/08/30/foundation-stone-laid-for-google-s-data-center-in-uruguay' },
]

/** Lo que buscamos en el corpus y no está. Medido el 2026-08-14 sobre 2.184.330 registros. */
export const CORPUS_SEARCH = [
  { key: 'eleanor', hits: 0 },
  { key: 'pdlc', hits: 0 },
  { key: 'ruta101', hits: 0 },
  { key: 'llamados', hits: 0 },
]

/** Lo que el Estado sí gasta en alojar sus propios servidores. Medido el 2026-08-14. */
export const HOSTING = {
  awards: 16,
  uyu: 102_500_000,
  buyers: 11,
  from: '2025-05-07',
  to: '2026-08-06',
  antelUyu: 75_800_000,
  antelAllUyu: 4_614_000_000,
  antelContracts: 1138,
  antelBuyers: 99,
}

export const DC_SOURCES = [
  {
    key: 'oficial',
    items: [
      { label: 'Diario Oficial Nº 31.379 — Resolución 65/024 del MEF (ampliación de la zona franca)', url: 'https://www.impo.com.uy/diariooficial/2024/03/08/documentos.pdf' },
      { label: 'Ministerio de Ambiente — expediente del proyecto "Teros"', url: 'https://www.ambiente.gub.uy/oan/proyectos/proyecto-google-datacenter/' },
      { label: 'Ficha IAR del proyecto (padrones, superficie, empleo, obras)', url: 'https://www.ambiente.gub.uy/oan/wp-content/uploads/2023/11/Ficha-IAR.pdf' },
      { label: 'Resolución Ministerial 644-2024 — autorización ambiental previa', url: 'https://www.ambiente.gub.uy/oan/wp-content/uploads/2023/11/Resolucion-Ministerial-644-2024.pdf' },
      { label: 'Ley 15.921 de Zonas Francas (IMPO)', url: 'https://www.impo.com.uy/bases/leyes/15921-1987' },
    ],
  },
  {
    key: 'prensa',
    items: [
      { label: 'MercoPress — piedra fundamental y monto de la inversión (30/08/2024)', url: 'https://en.mercopress.com/2024/08/30/foundation-stone-laid-for-google-s-data-center-in-uruguay' },
      { label: 'Montevideo Portal — las siete condiciones de la autorización (25/07/2024)', url: 'https://www.montevideo.com.uy/Noticias/Las-siete-condiciones-que-le-puso-el-gobierno-a-Google-para-autorizar-el-data-center-uc895100' },
      { label: 'Infobae — autorización y empleo previsto (25/07/2024)', url: 'https://www.infobae.com/america/america-latina/2024/07/25/uruguay-autorizo-la-construccion-de-un-data-center-de-google-que-empleara-hasta-800-personas/' },
      { label: 'Intendencia de Canelones — inicio de la construcción', url: 'https://www.imcanelones.gub.uy/noticias/google-inicia-construccion-su-centro-datos-parque-las-ciencias-canelones' },
      { label: 'Montevideo Portal — cifras del Data Center de ANTEL en Pando (16/05/2016)', url: 'https://www.montevideo.com.uy/Noticias/El-nuevo-Data-Center-Internacional-de-Antel-sera-el-gran-disco-duro-de-Uruguay--uc308478' },
    ],
  },
]

export type Locale = 'es' | 'en'

export const DC_CONTENT = {
  es: {
    kicker: 'Investigación propia · registros públicos',
    title: 'El datacenter que no está en las compras del Estado',
    dek: 'Buscamos la obra más grande que se está construyendo en Canelones en los 2,18 millones de registros de compras públicas. No aparece: ni la empresa, ni el parque, ni la ruta. El rastro está en otro lado, y es público.',
    fileScope: '2.184.330 registros buscados',
    filePeriod: '2009 → 2026',
    fileSource: 'Diario Oficial · expediente ambiental · corpus OCDS',
    chips: ['Resolución 65/024', 'Proyecto "Teros"', 'Padrones 47.827-47.832', 'Cero en compras'],

    statHead: 'Registros del datacenter en el corpus de compras públicas',
    statSub: 'sobre 2.184.330 adjudicaciones publicadas desde 2002',
    tiles: [
      { n: 'US$ 850 M', l: 'inversión anunciada', s: 'según la prensa, no consta en el expediente' },
      { n: '32,5 ha', l: 'del predio', s: 'padrones 47.763 y 47.827 a 47.832' },
      { n: '50', l: 'personas en operación', s: 'dice la ficha oficial del proyecto' },
      { n: '0', l: 'registros en compras', s: 'ni como proveedor ni como comprador' },
    ],

    buscamosTag: 'La búsqueda',
    buscamosTitle: 'Qué buscamos, y por qué no está',
    buscamos: [
      'Un datacenter de esta escala mueve obra civil, energía, agua, caminos y permisos. Si algo de eso lo hubiera comprado el Estado, tendría que estar en el registro de compras públicas. Buscamos por el nombre de la empresa que figura en el expediente ambiental —Eleanor Applications S.R.L., no "Google"—, por el nombre del parque, por la ruta y el kilómetro, y por los llamados que mencionaran un centro de datos en ese lugar.',
      'No hay nada. Cero como proveedor, cero como comprador, cero llamados. Y el cero es correcto: no es una obra pública. Es una inversión privada dentro de una zona franca, así que el Estado no la paga. Lo que hace es otra cosa: la exonera de impuestos, le autoriza el uso del suelo, le aprueba el impacto ambiental y le vende la electricidad.',
      'Por eso esta investigación no busca una compra. Busca las decisiones públicas que la hicieron posible, que están todas publicadas y casi nunca se leen juntas.',
    ],
    colBuscado: 'Qué buscamos',
    colResultado: 'Registros',
    searchItems: {
      eleanor: 'Eleanor Applications S.R.L. como proveedor o comprador',
      pdlc: '"Parque de las Ciencias" en proveedores, compradores o ítems',
      ruta101: '"Ruta 101" o "Ciudad de la Costa" en ítems y llamados',
      llamados: 'Llamados que mencionen un centro de datos en esa ubicación',
    },

    rastroTag: 'El rastro que sí existe',
    rastroTitle: 'Quince años de decisiones, en el Diario Oficial',
    rastroIntro: 'Cada eslabón de esta cadena es un documento público. Los cuatro primeros los leímos directo; el último es prensa y va marcado como tal.',
    timeline: {
      zf2009: 'El Poder Ejecutivo autoriza a Parque de las Ciencias S.A. a explotar una zona franca privada bajo la Ley 15.921, en el padrón 46.779 de Canelones.',
      zf2020: 'Primera ampliación: la zona franca pasa de 51 hectáreas 3.469 metros a 80 hectáreas 5.841 metros, sumando ocho padrones que se fusionan en el 47.763. Es el terreno donde se anunció el proyecto.',
      esia: 'Se presenta el Estudio de Impacto Ambiental del proyecto "Teros" ante el Ministerio de Ambiente. El titular es Eleanor Applications S.R.L.; el nombre "Google" no aparece en la carátula.',
      zf2024: 'Resolución 65/024 del Ministerio de Economía: la zona franca se amplía a 83 hectáreas 6.136 metros 88 decímetros con seis padrones nuevos, el 47.827 al 47.832. El texto dice que la propietaria de esos predios es Eleanor Applications S.R.L. y le da 180 días para constituir la servidumbre del artículo 13 de la ley de zonas francas. Son exactamente los padrones donde va el datacenter.',
      aap: 'El Ministerio de Ambiente firma la Resolución Ministerial 644-2024 y otorga la autorización ambiental previa, con siete condiciones. Entre ellas, que la autorización caduca si la obra no empieza en dos años.',
      obra: 'Se coloca la piedra fundamental. La inversión anunciada es de más de 850 millones de dólares.',
    },
    sourceOficial: 'Documento oficial',
    sourcePrensa: 'Prensa',

    fichaTag: 'Lo que dice el expediente',
    fichaTitle: 'Y lo que la ficha para la ciudadanía no dice',
    ficha: [
      'La Ficha IAR es el resumen que el expediente publica para que cualquiera entienda el proyecto sin leer 104 páginas. Ahí está lo concreto: el predio son 32,5 hectáreas; la obra de la primera etapa dura 26 meses y hay 32 meses más hasta la última; trabajarán entre 300 y 400 personas con un pico de 800; y en operación, cincuenta. También que el proyecto construye su propia subestación eléctrica y que tendrá generadores diésel para los cortes.',
      'Lo que esa ficha no trae son las dos cifras por las que el proyecto fue discutido: cuánta agua y cuánta energía consume. La primera tiene una explicación conocida —el proyecto original preveía 7.600 metros cúbicos diarios de agua potable, se reformuló tras la sequía de 2023 y hoy la refrigeración es por aire—. La segunda no: la demanda eléctrica que la prensa atribuye a un informe técnico del expediente, 560 gigavatios hora por año y unos 48 megavatios, no aparece en el resumen que el Estado publica para explicar el proyecto.',
      'No decimos que esté escondida: puede estar en las 104 páginas del informe completo, cuyo PDF tiene la codificación rota y no pudimos leer. Decimos que el documento hecho para que la ciudadanía entienda el proyecto omite el número que define su impacto.',
    ],

    condicionesTag: 'La letra chica',
    condicionesTitle: 'Las siete condiciones de la autorización',
    condicionesIntro: 'La autorización ambiental no fue un permiso liso. La prensa que leyó la resolución detalló cinco de las siete condiciones; las otras dos las resumió. Las listamos como están publicadas, señalando cuáles quedaron sin detalle.',
    condiciones: [
      'Plazo máximo de dos años: la autorización caduca si la obra no empieza en ese lapso.',
      'Prohibición de usar el camino Gonzalo "Gonchi" Rodríguez durante la construcción.',
      'Actualizar el Plan de Gestión Ambiental con los programas de residuos de obra, manejo del tránsito, relacionamiento comunitario y gestión de efluentes.',
      'Ejecutar la obra estrictamente según lo presentado y aprobado, sin apartarse de la resolución.',
      'Presentar análisis de monitoreo, proyecto ejecutivo y cronograma dentro de los 45 días del inicio de las obras.',
      'Poner información a disposición de la Dirección Nacional de Calidad Ambiental (sin más detalle en la crónica).',
      'Elaborar planes de mitigación ante los riesgos ambientales detectados (sin más detalle en la crónica).',
    ],
    condicionesNota: 'No pudimos contrastar esta lista contra el texto de la resolución: el PDF que publica el Ministerio está escaneado y no tiene capa de texto legible. Por eso van atribuidas a la crónica y no al documento.',

    contrasteTag: 'El contraste',
    contrasteTitle: 'Lo que el Estado sí paga por alojar sus servidores',
    contraste: [
      'Mientras el datacenter más grande del país se construye sin pagar impuestos, el Estado le paga a otro por guardar sus propios datos. En el corpus hay 16 adjudicaciones cuyo objeto es alojamiento en centro de datos, por 102,5 millones de pesos, de once organismos: Presidencia, la Fiscalía General, la DGI, Casinos, el MIDES, OSE, UTE, la UTEC, la Intendencia de Colonia.',
      'Casi todo eso lo cobra ANTEL —75,8 millones—, que es una empresa del propio Estado y tiene su propio centro de datos, el Ing. José Luis Massera, en el Polo Tecnológico Industrial de Pando: mismo departamento y misma ruta 101 que el de Google, a unos kilómetros. Sumando todos sus rubros, ANTEL le facturó al Estado 4.614 millones de pesos en 1.138 contratos con 99 organismos.',
      'La comparación entre los dos edificios ordena la escala del asunto. El del Estado se inauguró en 2016 por unos 50 millones de dólares: 12.000 metros cuadrados, mil racks y 12 megavatios, que en su momento se explicaron como el consumo de una ciudad de 14.000 habitantes. El de Google se anuncia en más de 850 millones y la prensa le atribuye una demanda de unos 48 megavatios: cuatro veces la potencia del datacenter soberano del país, en manos privadas y sin pagar impuestos.',
      'No hay nada irregular en eso: es el Estado comprándose a sí mismo un servicio que necesita. Lo que muestra el contraste es dónde queda cada uno en el mismo terreno: uno paga por alojar sus datos, el otro se instala exonerado a alojar los del mundo.',
    ],

    limitesTitle: 'Lo que no pudimos verificar',
    limites: [
      'Los tres contratos que, según Búsqueda, UTE cerró con Google para el suministro eléctrico: no son compras del Estado sino ventas, así que no están en este registro, y la nota está detrás de un muro de pago.',
      'La investigación del Pulitzer Center sobre cómo se aprobó el proyecto: su sitio devolvió un error 403 a nuestro pedido.',
      'El texto completo de la Resolución 644-2024 y del Informe Ambiental Resumen: los dos PDF están escaneados o con la codificación rota. Las siete condiciones que citamos vienen de la prensa que sí las leyó.',
    ],

    sourcesTag: 'Dónde chequear',
    sourcesTitle: 'Todo esto es público',
    sourcesP: 'La resolución de la zona franca está en el Diario Oficial del 8 de marzo de 2024. El expediente ambiental completo está en el Observatorio Ambiental Nacional. Nada de esto requiere un pedido de acceso a la información.',
    srcOficial: 'Documentos del Estado',
    srcPrensa: 'Prensa citada como prensa',
  },
  en: {
    kicker: 'Own investigation · public records',
    title: 'The data center that is not in state procurement',
    dek: 'We searched for the largest construction under way in Canelones across 2.18 million public procurement records. It is not there: not the company, not the park, not the road. The trail is elsewhere, and it is public.',
    fileScope: '2,184,330 records searched',
    filePeriod: '2009 → 2026',
    fileSource: 'Official Gazette · environmental file · OCDS corpus',
    chips: ['Resolution 65/024', 'Project "Teros"', 'Plots 47,827-47,832', 'Zero in procurement'],

    statHead: 'Records of the data center in the procurement corpus',
    statSub: 'out of 2,184,330 awards published since 2002',
    tiles: [
      { n: 'US$ 850 M', l: 'announced investment', s: 'per the press; not in the official file' },
      { n: '32.5 ha', l: 'of land', s: 'plots 47,763 and 47,827 to 47,832' },
      { n: '50', l: 'people in operation', s: 'per the project\'s own official summary' },
      { n: '0', l: 'procurement records', s: 'neither as supplier nor as buyer' },
    ],

    buscamosTag: 'The search',
    buscamosTitle: 'What we looked for, and why it is not there',
    buscamos: [
      'A data center this size moves civil works, power, water, roads and permits. If the State had bought any of it, it would be in the procurement record. We searched by the company named in the environmental file — Eleanor Applications S.R.L., not "Google" — by the park\'s name, by the road and kilometre, and by tenders mentioning a data center at that location.',
      'There is nothing. Zero as supplier, zero as buyer, zero tenders. And the zero is correct: this is not public works. It is a private investment inside a free zone, so the State does not pay for it. It does something else: it exempts it from taxes, authorises the land use, approves the environmental impact and sells it electricity.',
      'So this investigation is not looking for a purchase. It looks for the public decisions that made it possible, all of them published and almost never read together.',
    ],
    colBuscado: 'What we searched',
    colResultado: 'Records',
    searchItems: {
      eleanor: 'Eleanor Applications S.R.L. as supplier or buyer',
      pdlc: '"Parque de las Ciencias" in suppliers, buyers or line items',
      ruta101: '"Ruta 101" or "Ciudad de la Costa" in items and tenders',
      llamados: 'Tenders mentioning a data center at that location',
    },

    rastroTag: 'The trail that does exist',
    rastroTitle: 'Fifteen years of decisions, in the Official Gazette',
    rastroIntro: 'Every link in this chain is a public document. We read the first four directly; the last is press and is labelled as such.',
    timeline: {
      zf2009: 'The Executive authorises Parque de las Ciencias S.A. to run a private free zone under Law 15,921, on plot 46,779 in Canelones.',
      zf2020: 'First expansion: the free zone grows from 51 hectares 3,469 metres to 80 hectares 5,841 metres, adding eight plots merged into 47,763. This is the land where the project was announced.',
      esia: 'The environmental impact study for project "Teros" is filed with the Ministry of Environment. The applicant is Eleanor Applications S.R.L.; the name "Google" does not appear on the cover.',
      zf2024: 'Resolution 65/024 of the Ministry of Economy: the free zone expands to 83 hectares 6,136 metres 88 decimetres with six new plots, 47,827 through 47,832. The text states that the owner of those plots is Eleanor Applications S.R.L. and gives it 180 days to register the easement required by article 13 of the free-zone law. These are exactly the plots where the data center goes.',
      aap: 'The Ministry of Environment signs Ministerial Resolution 644-2024 granting prior environmental authorisation, with seven conditions — including that the authorisation lapses if works do not start within two years.',
      obra: 'The foundation stone is laid. The announced investment is over 850 million dollars.',
    },
    sourceOficial: 'Official document',
    sourcePrensa: 'Press',

    fichaTag: 'What the file says',
    fichaTitle: 'And what the citizens\' summary does not',
    ficha: [
      'The IAR summary is the document the file publishes so anyone can understand the project without reading 104 pages. The concrete facts are there: the site is 32.5 hectares; stage one takes 26 months of works and there are 32 more months to the last stage; between 300 and 400 people will work on it, peaking at 800; and in operation, fifty. Also that the project builds its own electrical substation and will have diesel generators for outages.',
      'What that summary does not carry are the two figures the project was argued over: how much water and how much energy it consumes. The first has a known explanation — the original project foresaw 7,600 cubic metres of drinking water a day, it was reformulated after the 2023 drought and cooling is now air-based. The second does not: the electricity demand the press attributes to a technical report in the file, 560 gigawatt-hours a year and about 48 megawatts, does not appear in the summary the State publishes to explain the project.',
      'We are not saying it is hidden: it may well be in the 104 pages of the full report, whose PDF has broken encoding and which we could not read. We are saying the document written for citizens to understand the project omits the number that defines its impact.',
    ],

    condicionesTag: 'The fine print',
    condicionesTitle: 'The seven conditions of the authorisation',
    condicionesIntro: 'The environmental authorisation was not a plain permit. The press that read the resolution detailed five of the seven conditions and summarised the other two. We list them as published, flagging which ones were left without detail.',
    condiciones: [
      'A two-year deadline: the authorisation lapses if works do not start within it.',
      'A ban on using the Gonzalo "Gonchi" Rodríguez road during construction.',
      'Updating the Environmental Management Plan with programmes for construction waste, traffic management, community relations and effluent management.',
      'Executing the works strictly as submitted and approved, without departing from the resolution.',
      'Filing monitoring analyses, the executive project and a schedule within 45 days of the start of works.',
      'Making information available to the National Environmental Quality Directorate (no further detail in the report).',
      'Drawing up mitigation plans for the environmental risks identified (no further detail in the report).',
    ],
    condicionesNota: 'We could not check this list against the text of the resolution: the PDF the Ministry publishes is scanned and has no readable text layer. That is why it is attributed to the news report and not to the document.',

    contrasteTag: 'The contrast',
    contrasteTitle: 'What the State does pay to host its own servers',
    contraste: [
      'While the country\'s largest data center is built tax-free, the State pays someone else to keep its own data. The corpus holds 16 awards for data-center hosting, worth 102.5 million pesos, from eleven public bodies: the Presidency, the Prosecutor General, the tax office, the casinos directorate, the social development ministry, the water utility, the power utility, the technological university, the Colonia city government.',
      'Almost all of it is billed by ANTEL — 75.8 million — a state-owned company with its own data center, the Ing. José Luis Massera, in the Pando Technological Industrial Park: same department and same Route 101 as Google\'s, a few kilometres away. Across all its lines, ANTEL billed the State 4,614 million pesos in 1,138 contracts with 99 public bodies.',
      'Comparing the two buildings sets the scale. The State\'s was built for about 50 million dollars, has 12,000 square metres and 12 megawatts. Google\'s is announced at over 850 million and the press attributes to it a demand of about 48 megawatts: four times the power of the country\'s sovereign data center, in private hands and tax-free.',
      'There is nothing irregular in that: it is the State buying itself a service it needs. What the contrast shows is where each one stands on the same ground: one pays to host its data, the other settles in tax-exempt to host the world\'s.',
    ],

    limitesTitle: 'What we could not verify',
    limites: [
      'The three contracts that, according to Búsqueda, the power utility signed with Google for electricity supply: they are sales rather than state purchases, so they are not in this record, and the article sits behind a paywall.',
      'The Pulitzer Center investigation into how the project was approved: its site returned a 403 error to our request.',
      'The full text of Resolution 644-2024 and of the Environmental Summary Report: both PDFs are scanned or broken. The seven conditions we cite come from the press that did read them.',
    ],

    sourcesTag: 'Where to check',
    sourcesTitle: 'All of this is public',
    sourcesP: 'The free-zone resolution is in the Official Gazette of 8 March 2024. The full environmental file is at the National Environmental Observatory. None of this requires a freedom-of-information request.',
    srcOficial: 'State documents',
    srcPrensa: 'Press, cited as press',
  },
} as const

export function dcContent(locale: string) {
  return DC_CONTENT[(locale === 'en' ? 'en' : 'es') as Locale]
}
