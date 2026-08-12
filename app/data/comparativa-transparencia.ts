/**
 * Comparativa · Plataformas que vigilan al Estado uruguayo.
 *
 * A diferencia de ~/data/comparativa-alertas (donde la plataforma actúa de árbitro
 * neutral y NO figura en la tabla), acá SÍ estamos adentro: la comparativa incluye a
 * conlatuya/gastos.gub.uy. Eso obliga a una regla extra, que es la que hace que la
 * página valga algo:
 *
 *   1. Somos parte interesada y se dice arriba de todo (SELF_DISCLOSURE), no en una
 *      nota al pie.
 *   2. Cada ficha lleva `limits` — incluida la nuestra, que es la más larga.
 *   3. Ningún número sobre un tercero se estima: sale de su propio sitio o de su
 *      propio endpoint público, con la URL en `sources` y la fecha en `verifiedOn`.
 *      Cuando una cifra viene de un endpoint del propio sitio se dice así, textual
 *      ("su endpoint de estadísticas devuelve…"), para que se pueda reproducir.
 *   4. `bestFor` reparte el mérito: para varias necesidades la respuesta correcta NO
 *      somos nosotros, y la página lo dice con el enlace al lado.
 *
 * Precios: se muestran TAL CUAL los publica cada sitio, con su moneda y sin
 * convertir. Lo que no está rotulado se marca (`currencyUnlabeled`), no se adivina.
 *
 * Verificación: agosto 2026, con `curl` contra cada sitio (ver VERIFIED_ON).
 */

export interface Bi { es: string, en: string }

/** 'parcial' existe porque varias capacidades acá son a medias de verdad (código
 *  abierto de una app de la suite, export sólo para pagos, etc.). */
export type Tri = 'si' | 'no' | 'parcial' | 'desconocido'

/** Quién la hace. Ordena la página: nosotros primero (con el aviso), después la
 *  sociedad civil, después el Estado — que es fuente, no competencia. */
export type Group = 'nosotros' | 'ciudadana' | 'oficial'

/** Qué hay que hacer para usarla. */
export type Access = 'libre' | 'registro' | 'freemium' | 'oficial'

export interface Metric {
  label: Bi
  value: string
  /** De dónde salió el número, para poder reproducirlo. */
  source: Bi
}

export interface Capabilities {
  /** Ficha del contrato individual, no sólo el agregado. */
  perContract: Tri
  /** Análisis propio (detección, indicadores, curaduría), no espejo del dato crudo. */
  ownAnalysis: Tri
  /** Bajarse los datos sin pagar. */
  freeExport: Tri
  /** API pública documentada. */
  publicApi: Tri
  openSource: Tri
  /** Avisos por email/push/telegram de algo nuevo. */
  alerts: Tri
  /** Cubre datos más allá de compras públicas. */
  beyondProcurement: Tri
}

export interface Platform {
  id: string
  name: string
  url: string
  group: Group
  /** Es la nuestra: dispara el aviso de parte interesada en la ficha. */
  isUs?: boolean
  tagline: Bi
  /** Quién la opera, con las palabras del propio sitio cuando las hay. */
  operator: Bi
  /** Qué datos cubre. */
  scope: Bi
  access: Access
  priceText: Bi
  /** El sitio publica el precio sin etiqueta de moneda. */
  currencyUnlabeled?: boolean
  capabilities: Capabilities
  metrics: Metric[]
  /** Para qué es la mejor de todas. Se reparte: no siempre somos nosotros. */
  bestFor: Bi
  /** Lo que no hace o hace peor. Obligatorio, también para la nuestra. */
  limits: Bi[]
  sources: string[]
  verifiedOn: string
}

/** Fecha de verificación de toda la tabla. */
export const VERIFIED_ON = '2026-08-12'

/** Aviso de parte interesada. Va arriba de la tabla, no al pie. */
export const SELF_DISCLOSURE: Bi = {
  es: 'Esta comparativa la escribimos nosotros y nosotros estamos en la tabla. Tratá lo que dice de las otras plataformas como verificable —cada dato tiene su fuente y su fecha— y lo que dice de la nuestra como lo que es: nuestra propia opinión sobre nuestro trabajo. Por eso la ficha de conlatuya es la que más limitaciones enumera, y por eso hay necesidades donde la recomendación apunta a otro sitio.',
  en: 'We wrote this comparison and we are in the table. Treat what it says about the other platforms as verifiable — every figure has its source and date — and what it says about ours as what it is: our own opinion about our own work. That is why the conlatuya entry lists the most limitations, and why for several needs the recommendation points somewhere else.',
}

export const PLATFORMS: Platform[] = [
  // ─── Nosotros ────────────────────────────────────────────────────────────────
  {
    id: 'conlatuya',
    name: 'Con la tuya, contribuyente',
    url: 'https://conlatuya.checkleaked.cc/',
    group: 'nosotros',
    isUs: true,
    tagline: {
      es: 'Cada contrato del Estado, con el precio puesto a prueba.',
      en: 'Every state contract, with its price put to the test.',
    },
    operator: {
      es: 'Proyecto independiente, sin fines de lucro y de código abierto: el repositorio es público en GitHub.',
      en: 'Independent, non-profit and open-source project: the repository is public on GitHub.',
    },
    scope: {
      es: 'Compras públicas (feed OCDS de ARCE) desde 2002, más cruces propios: RUPE, registro industrial del MIEM, omisos de JUTEP, sanciones de Defensa del Consumidor y quién gobernaba cada organismo.',
      en: 'Public procurement (ARCE OCDS feed) since 2002, plus our own cross-references: RUPE, the MIEM industrial registry, JUTEP non-filers, consumer-protection sanctions and who governed each body.',
    },
    access: 'libre',
    priceText: { es: 'Gratis, sin registro y sin plan pago.', en: 'Free, no signup, no paid tier.' },
    capabilities: {
      perContract: 'si',
      ownAnalysis: 'si',
      freeExport: 'si',
      publicApi: 'si',
      openSource: 'si',
      alerts: 'si',
      beyondProcurement: 'parcial',
    },
    metrics: [
      { label: { es: 'contratos', en: 'contracts' }, value: '2.183.440', source: { es: 'nuestro propio /api/dashboard/metrics', en: 'our own /api/dashboard/metrics' } },
      { label: { es: 'proveedores', en: 'suppliers' }, value: '42.967', source: { es: 'nuestro propio /api/dashboard/metrics', en: 'our own /api/dashboard/metrics' } },
      { label: { es: 'organismos', en: 'public bodies' }, value: '397', source: { es: 'nuestro propio /api/dashboard/metrics', en: 'our own /api/dashboard/metrics' } },
      { label: { es: 'anomalías de precio detectadas', en: 'price anomalies detected' }, value: '6.287', source: { es: 'nuestro propio /api/dashboard/metrics', en: 'our own /api/dashboard/metrics' } },
    ],
    bestFor: {
      es: 'Seguir un contrato, un proveedor o un organismo en particular, y ver si un precio se sale de la vaina contra lo que el mismo artículo costó en otras compras.',
      en: 'Following a specific contract, supplier or public body, and checking whether a price is out of line with what the same item cost in other purchases.',
    },
    limits: [
      {
        es: 'Sólo compras públicas. El presupuesto, su ejecución y los sueldos del Estado no están acá: para eso hay que ir a la OPP y a la ONSC.',
        en: 'Procurement only. The budget, its execution and public salaries are not here: for those you need OPP and ONSC.',
      },
      {
        es: 'Todo sale del feed OCDS. Lo que el organismo no publica ahí, no existe en este sitio: los oferentes que perdieron, por ejemplo, no vienen en el feed y sólo los reconstruimos leyendo actas en PDF, una por una.',
        en: 'Everything comes from the OCDS feed. What a body does not publish there does not exist here: losing bidders, for instance, are absent from the feed and we only reconstruct them by parsing award minutes in PDF, one by one.',
      },
      {
        es: 'No hacemos curaduría: mostramos 2,18 millones de contratos y señalamos los raros, pero no escribimos el caso ni le ponemos cara. Para eso GastosUy es mejor.',
        en: 'We do not curate: we show 2.18 million contracts and flag the odd ones, but we do not write up the case or give it a face. GastosUy is better at that.',
      },
      {
        es: 'Somos un proyecto chico y no somos una fuente oficial. Ante una diferencia, manda lo que publica ARCE.',
        en: 'We are a small project and not an official source. If there is a discrepancy, what ARCE publishes prevails.',
      },
    ],
    sources: ['https://conlatuya.checkleaked.cc/api/dashboard/metrics', 'https://github.com/eduair94/gastos-gub-uy', 'https://conlatuya.checkleaked.cc/developers'],
    verifiedOn: '2026-08-12',
  },

  // ─── Sociedad civil ──────────────────────────────────────────────────────────
  {
    id: 'controlciudadano',
    name: 'Control Ciudadano',
    url: 'https://controlciudadano.uy/',
    group: 'ciudadana',
    tagline: {
      es: 'Una suite de aplicaciones de control ciudadano: gasto, homicidios, robos, chapas y patentes.',
      en: 'A suite of citizen-oversight apps: spending, homicides, robberies, plates and vehicle taxes.',
    },
    operator: {
      es: 'Textual del sitio: «Creado por PhD en Lógica (@PhDenLogica). Desarrollado por ciudadanos para ciudadanos.»',
      en: 'Verbatim from the site: “Created by PhD en Lógica (@PhDenLogica). Built by citizens for citizens.”',
    },
    scope: {
      es: 'GastosUy (gasto público comentado), AlertaHomicidios (observatorio de violencia letal), AlertaRobos (mapa colaborativo), ChapasUy y PatentesUy (vehículos, SUCIVE). LeyesUy y otras siete figuran como próximas.',
      en: 'GastosUy (annotated public spending), AlertaHomicidios (lethal-violence observatory), AlertaRobos (collaborative map), ChapasUy and PatentesUy (vehicles, SUCIVE). LeyesUy and seven more are listed as upcoming.',
    },
    access: 'freemium',
    priceText: {
      es: 'Gratis (plan Ciudadano). Colaboradores: U$S 5, 10, 25 o 100 por mes, y «Pasaporte Narco» U$S 10.000 de pago único.',
      en: 'Free (Ciudadano tier). Supporters: U$S 5, 10, 25 or 100 per month, plus a one-off “Pasaporte Narco” at U$S 10,000.',
    },
    capabilities: {
      perContract: 'si',
      ownAnalysis: 'si',
      freeExport: 'no',
      publicApi: 'desconocido',
      openSource: 'parcial',
      alerts: 'si',
      beyondProcurement: 'si',
    },
    metrics: [
      {
        label: { es: 'gastos publicados en GastosUy', en: 'spending items published in GastosUy' },
        value: '277',
        source: { es: 'su propio endpoint /api/gastos/stats', en: 'their own /api/gastos/stats endpoint' },
      },
      {
        label: { es: 'suman', en: 'totalling' },
        value: '$U 52,1 M',
        source: { es: 'su propio endpoint /api/gastos/stats', en: 'their own /api/gastos/stats endpoint' },
      },
    ],
    bestFor: {
      es: 'Entender un caso de gasto llamativo de un vistazo —cada uno viene escrito, ilustrado y con el enlace a la compra oficial— y para todo lo que no son compras: homicidios, robos y vehículos.',
      en: 'Grasping a striking spending case at a glance — each one is written up, illustrated and linked to the official purchase — and for everything that is not procurement: homicides, robberies and vehicles.',
    },
    limits: [
      {
        es: 'GastosUy es una selección editorial, no un corpus: su propio endpoint de estadísticas devuelve 277 gastos publicados por 52,1 millones de pesos. No sirve para buscar un contrato cualquiera, y no pretende serlo.',
        en: 'GastosUy is an editorial selection, not a corpus: its own stats endpoint returns 277 published items totalling 52.1 million pesos. It is not for looking up an arbitrary contract, and does not claim to be.',
      },
      {
        es: 'La descarga en CSV está paga. Textual: «La exportación de datos en formato CSV es una herramienta exclusiva para nuestros Colaboradores» (planes Representante, Ilustre o Pasaporte Narco).',
        en: 'CSV download is paid. Verbatim: “Exporting data in CSV format is a tool exclusive to our Supporters” (Representante, Ilustre or Pasaporte Narco tiers).',
      },
      {
        es: 'Código abierto sólo en parte: ChapasUy publica su repositorio, el resto de la suite no.',
        en: 'Open source only in part: ChapasUy publishes its repository, the rest of the suite does not.',
      },
    ],
    sources: ['https://controlciudadano.uy/', 'https://controlciudadano.uy/gastos/', 'https://controlciudadano.uy/api/gastos/stats', 'https://github.com/jcodagnone/chapauy'],
    verifiedOn: '2026-08-12',
  },
  {
    id: 'datospublicos',
    name: 'datospublicos.uy',
    url: 'https://datospublicos.uy/',
    group: 'ciudadana',
    tagline: {
      es: 'Un buscador único sobre 68 tablas de datos públicos uruguayos.',
      en: 'A single search engine across 68 tables of Uruguayan public data.',
    },
    operator: {
      es: 'El sitio no declara quién lo opera.',
      en: 'The site does not state who operates it.',
    },
    scope: {
      es: 'El más ancho de todos. Fuentes que lista su propio pie de página: SICE/ARCE, RUPE, SENACLAFT, JUTEP, Aduanas, Parlamento, Diario Oficial, OPP y ONSC. Incluye licitaciones, adjudicaciones, declaraciones juradas, expedientes judiciales, donantes de campaña, elecciones y vínculos con el Estado.',
      en: 'The broadest of them all. Sources listed in its own footer: SICE/ARCE, RUPE, SENACLAFT, JUTEP, Customs, Parliament, Official Gazette, OPP and ONSC. It covers tenders, awards, asset declarations, court files, campaign donors, elections and state employment links.',
    },
    access: 'freemium',
    priceText: {
      es: 'Free: $0, con 5 búsquedas por día. Pro: $990 por mes (el sitio no rotula la moneda).',
      en: 'Free: $0, limited to 5 searches per day. Pro: $990 per month (the site does not label the currency).',
    },
    currencyUnlabeled: true,
    capabilities: {
      perContract: 'si',
      ownAnalysis: 'si',
      freeExport: 'no',
      publicApi: 'no',
      openSource: 'no',
      alerts: 'si',
      beyondProcurement: 'si',
    },
    metrics: [
      { label: { es: 'tablas de datos', en: 'data tables' }, value: '68', source: { es: 'su portada', en: 'their home page' } },
      { label: { es: 'adjudicaciones', en: 'awards' }, value: '1.449.675', source: { es: 'su portada', en: 'their home page' } },
      { label: { es: 'licitaciones', en: 'tenders' }, value: '639.480', source: { es: 'su portada', en: 'their home page' } },
      { label: { es: 'operaciones aduaneras', en: 'customs operations' }, value: '19.972.536', source: { es: 'su portada', en: 'their home page' } },
    ],
    bestFor: {
      es: 'Cruzar una empresa o una persona contra registros que no tienen nada que ver entre sí: aduanas, declaraciones juradas, expedientes, donaciones de campaña y parlamento, todo en una búsqueda.',
      en: 'Cross-checking a company or a person against registries that have nothing to do with each other: customs, asset declarations, court files, campaign donations and parliament, all in one search.',
    },
    limits: [
      {
        es: 'El plan gratis permite 5 búsquedas por día. Es la barrera más dura de esta tabla para uso ciudadano ocasional.',
        en: 'The free tier allows 5 searches per day. It is the hardest barrier in this table for occasional citizen use.',
      },
      {
        es: 'Lo que más se parece a un análisis —precios históricos, historial de ganadores, estimación de oferentes, exportar CSV y PDF— está todo en el plan Pro.',
        en: 'Everything resembling analysis — historical prices, winner history, bidder estimates, CSV and PDF export — sits behind the Pro tier.',
      },
      {
        es: 'No publica API ni código, y su robots.txt bloquea explícitamente /api/ y a los rastreadores de IA.',
        en: 'It publishes neither an API nor code, and its robots.txt explicitly blocks /api/ and AI crawlers.',
      },
      {
        es: 'Publica el precio como «$990» sin decir en qué moneda.',
        en: 'It prints the price as “$990” without saying in which currency.',
      },
    ],
    sources: ['https://datospublicos.uy/', 'https://datospublicos.uy/pricing', 'https://datospublicos.uy/robots.txt'],
    verifiedOn: '2026-08-12',
  },
  {
    id: 'datauy',
    name: 'DATA Uruguay',
    url: 'https://data.org.uy/',
    group: 'ciudadana',
    tagline: {
      es: 'La organización de tecnología cívica más veterana del país.',
      en: 'The country’s longest-running civic-tech organization.',
    },
    operator: {
      es: 'Asociación civil sin fines de lucro. Organiza AbreLatam y la Red de Gobierno Abierto.',
      en: 'Non-profit civil association. It runs AbreLatam and the Open Government Network.',
    },
    scope: {
      es: 'No es un buscador de gasto: hace herramientas. QueSabes.uy (pedidos de acceso a la información pública), UruguayLeaks.uy (canal de filtraciones), ATuServicio.uy (prestadores de salud), Apelatrón, PorMiBarrio.uy.',
      en: 'Not a spending search engine: it builds tools. QueSabes.uy (freedom-of-information requests), UruguayLeaks.uy (leak channel), ATuServicio.uy (health providers), Apelatrón, PorMiBarrio.uy.',
    },
    access: 'libre',
    priceText: { es: 'Gratis.', en: 'Free.' },
    capabilities: {
      perContract: 'no',
      ownAnalysis: 'si',
      freeExport: 'parcial',
      publicApi: 'desconocido',
      openSource: 'si',
      alerts: 'no',
      beyondProcurement: 'si',
    },
    metrics: [],
    bestFor: {
      es: 'Pedirle formalmente al Estado un dato que no publica (QueSabes.uy) o hacer llegar un documento de forma segura (UruguayLeaks.uy). Es el paso siguiente cuando el dato abierto no alcanza.',
      en: 'Formally requesting data the State does not publish (QueSabes.uy) or safely delivering a document (UruguayLeaks.uy). It is the next step when open data runs out.',
    },
    limits: [
      {
        es: 'No tiene una herramienta de compras públicas ni de gasto: su fuerte es el derecho de acceso, no el análisis del gasto.',
        en: 'It has no procurement or spending tool: its strength is the right of access, not spending analysis.',
      },
      {
        es: 'Varios proyectos figuran como inactivos en su propio sitio, entre ellos «Declaraciones Juradas Abiertas» y PorMiBarrio.uy.',
        en: 'Several projects are listed as inactive on their own site, among them “Declaraciones Juradas Abiertas” and PorMiBarrio.uy.',
      },
    ],
    sources: ['https://data.org.uy/', 'https://data.org.uy/proyectos/', 'https://quesabes.uy/', 'https://uruguayleaks.uy/'],
    verifiedOn: '2026-08-12',
  },

  // ─── Estado ──────────────────────────────────────────────────────────────────
  {
    id: 'comprasestatales',
    name: 'Compras Estatales (ARCE)',
    url: 'https://www.comprasestatales.gub.uy/consultas/',
    group: 'oficial',
    tagline: {
      es: 'La fuente. De acá sale el dato que todos los demás reprocesamos.',
      en: 'The source. This is where the data everyone else reprocesses comes from.',
    },
    operator: { es: 'Agencia Reguladora de Compras Estatales (ARCE).', en: 'State Procurement Regulatory Agency (ARCE).' },
    scope: {
      es: 'Llamados vigentes, adjudicaciones, RUPE (registro de proveedores), plan anual de compras y tienda virtual. Publica además el feed OCDS de datos abiertos.',
      en: 'Open calls, awards, RUPE (supplier registry), annual purchasing plan and virtual store. It also publishes the OCDS open-data feed.',
    },
    access: 'oficial',
    priceText: { es: 'Gratis.', en: 'Free.' },
    capabilities: {
      perContract: 'si',
      ownAnalysis: 'no',
      freeExport: 'si',
      publicApi: 'si',
      openSource: 'no',
      alerts: 'no',
      beyondProcurement: 'no',
    },
    metrics: [],
    bestFor: {
      es: 'Confirmar oficialmente cualquier cosa que hayas visto en otro lado, y presentarse a un llamado. Es el documento, no la interpretación.',
      en: 'Officially confirming anything you saw elsewhere, and bidding on a call. It is the record, not the interpretation.',
    },
    limits: [
      {
        es: 'Está hecho para el trámite, no para el análisis: no compara precios entre compras, no marca nada raro y la navegación histórica es incómoda.',
        en: 'Built for the transaction, not for analysis: it does not compare prices across purchases, flags nothing unusual and historical browsing is awkward.',
      },
      {
        es: 'El feed OCDS omite cosas que el propio sitio muestra en HTML: el pliego, los impuestos del total y quiénes más ofertaron.',
        en: 'The OCDS feed omits things the site itself shows in HTML: the tender document, taxes in the total and who else bid.',
      },
    ],
    sources: ['https://www.comprasestatales.gub.uy/consultas/', 'https://www.gub.uy/agencia-reguladora-compras-estatales/datos-y-estadisticas/datos-abiertos'],
    verifiedOn: '2026-08-12',
  },
  {
    id: 'observatorio',
    name: 'Observatorio de Compras Públicas',
    url: 'https://observatorio.arce.gub.uy/eportal/',
    group: 'oficial',
    tagline: {
      es: 'La lectura oficial del mercado de compras públicas, en agregados.',
      en: 'The official reading of the public procurement market, in aggregates.',
    },
    operator: { es: 'ARCE.', en: 'ARCE.' },
    scope: {
      es: 'Montos adjudicados por organismo y hasta unidad ejecutora, evolución del RUPE (proveedores nacionales vs. extranjeros) y regímenes de preferencia.',
      en: 'Awarded amounts by body down to executing unit, RUPE evolution (domestic vs. foreign suppliers) and preference regimes.',
    },
    access: 'oficial',
    priceText: { es: 'Gratis.', en: 'Free.' },
    capabilities: {
      perContract: 'no',
      ownAnalysis: 'si',
      freeExport: 'parcial',
      publicApi: 'no',
      openSource: 'no',
      alerts: 'no',
      beyondProcurement: 'no',
    },
    metrics: [],
    bestFor: {
      es: 'Citar una cifra agregada con respaldo oficial: cuánto pesa cada organismo en el total adjudicado, o cuánto del gasto se va a proveedores extranjeros.',
      en: 'Citing an aggregate figure with official backing: how much each body weighs in the awarded total, or how much spending goes to foreign suppliers.',
    },
    limits: [
      {
        es: 'Se queda en el agregado: no baja al contrato ni al proveedor individual.',
        en: 'It stops at the aggregate: it does not drill down to the individual contract or supplier.',
      },
    ],
    sources: ['https://observatorio.arce.gub.uy/eportal/', 'https://observatorio.arce.gub.uy/eportal/web/guest/montos-adjudicados'],
    verifiedOn: '2026-08-12',
  },
  {
    id: 'catalogodatos',
    name: 'Catálogo Nacional de Datos Abiertos',
    url: 'https://catalogodatos.gub.uy/',
    group: 'oficial',
    tagline: {
      es: 'El depósito del que salen casi todos los cruces de esta tabla.',
      en: 'The repository behind almost every cross-reference in this table.',
    },
    operator: { es: 'AGESIC.', en: 'AGESIC.' },
    scope: {
      es: 'Datos abiertos de organismos públicos, academia, sociedad civil y empresas. Acá viven las sanciones de Defensa del Consumidor, los omisos de JUTEP y el catálogo de artículos de ARCE que este sitio usa.',
      en: 'Open data from public bodies, academia, civil society and companies. This is where the consumer-protection sanctions, the JUTEP non-filers and the ARCE article catalogue used by this site live.',
    },
    access: 'oficial',
    priceText: { es: 'Gratis.', en: 'Free.' },
    capabilities: {
      perContract: 'no',
      ownAnalysis: 'no',
      freeExport: 'si',
      publicApi: 'si',
      openSource: 'no',
      alerts: 'no',
      beyondProcurement: 'si',
    },
    metrics: [
      { label: { es: 'conjuntos de datos', en: 'datasets' }, value: '2.691', source: { es: 'su API CKAN (package_search)', en: 'their CKAN API (package_search)' } },
      { label: { es: 'organizaciones que publican', en: 'publishing organizations' }, value: '72', source: { es: 'su API CKAN (organization_list)', en: 'their CKAN API (organization_list)' } },
    ],
    bestFor: {
      es: 'Buscar la materia prima. Si querés construir algo propio, empezá acá: tiene API CKAN abierta y descarga directa.',
      en: 'Finding the raw material. If you want to build something of your own, start here: it has an open CKAN API and direct downloads.',
    },
    limits: [
      {
        es: 'Es un depósito, no una herramienta: los archivos vienen crudos, con codificaciones y separadores inconsistentes, y nadie los cruza por vos.',
        en: 'It is a repository, not a tool: files come raw, with inconsistent encodings and separators, and nobody cross-references them for you.',
      },
    ],
    sources: ['https://catalogodatos.gub.uy/', 'https://catalogodatos.gub.uy/api/3/action/package_search?rows=0'],
    verifiedOn: '2026-08-12',
  },
  {
    id: 'opp',
    name: 'Portal de Transparencia Presupuestaria (OPP)',
    url: 'https://transparenciapresupuestaria.opp.gub.uy/',
    group: 'oficial',
    tagline: {
      es: 'El presupuesto y su ejecución, que es justo lo que falta en todo el resto de la tabla.',
      en: 'The budget and its execution — precisely what the rest of this table is missing.',
    },
    operator: { es: 'Oficina de Planeamiento y Presupuesto (OPP).', en: 'Office of Planning and Budget (OPP).' },
    scope: {
      es: 'Presupuesto y ejecución por inciso, programa, fuente de financiamiento y objeto del gasto, en el estándar internacional Open Fiscal Data Package. Participa de la iniciativa BOOST del Banco Mundial.',
      en: 'Budget and execution by agency, programme, funding source and spending object, in the international Open Fiscal Data Package standard. It takes part in the World Bank BOOST initiative.',
    },
    access: 'oficial',
    priceText: { es: 'Gratis.', en: 'Free.' },
    capabilities: {
      perContract: 'no',
      ownAnalysis: 'si',
      freeExport: 'si',
      publicApi: 'desconocido',
      openSource: 'no',
      alerts: 'no',
      beyondProcurement: 'si',
    },
    metrics: [],
    bestFor: {
      es: 'La pregunta que ninguna plataforma de compras puede contestar: cuánto le habían asignado a ese organismo, y cuánto ejecutó.',
      en: 'The question no procurement platform can answer: how much that body was allocated, and how much it actually spent.',
    },
    limits: [
      {
        es: 'Responde 403 a cualquier consulta automática, así que no pudimos verificar su cobertura ni sus cifras como con el resto de la tabla (probado el 12-08-2026). Hay que entrar con el navegador.',
        en: 'It returns 403 to any automated request, so we could not verify its coverage or figures as we did for the rest of the table (tested 2026-08-12). You have to open it in a browser.',
      },
    ],
    sources: ['https://transparenciapresupuestaria.opp.gub.uy/inicio/datos-abiertos'],
    verifiedOn: '2026-08-12',
  },
  {
    id: 'jutep',
    name: 'JUTEP y Transparencia Pública',
    url: 'https://www.gub.uy/junta-transparencia-etica-publica/',
    group: 'oficial',
    tagline: {
      es: 'Declaraciones juradas de bienes e ingresos, y transparencia pasiva.',
      en: 'Sworn declarations of assets and income, plus passive transparency.',
    },
    operator: { es: 'Junta de Transparencia y Ética Pública (JUTEP) y portal gub.uy.', en: 'Board of Transparency and Public Ethics (JUTEP) and the gub.uy portal.' },
    scope: {
      es: 'Publicación de declaraciones juradas de senadores, diputados, ministros y subsecretarios (art. 12 bis de la ley 17.060), nómina de omisos, y la sección de transparencia pasiva de cada organismo.',
      en: 'Publication of asset declarations by senators, representatives, ministers and deputy ministers (art. 12 bis of law 17,060), the list of non-filers, and each body’s passive-transparency section.',
    },
    access: 'oficial',
    priceText: { es: 'Gratis.', en: 'Free.' },
    capabilities: {
      perContract: 'no',
      ownAnalysis: 'no',
      freeExport: 'parcial',
      publicApi: 'no',
      openSource: 'no',
      alerts: 'no',
      beyondProcurement: 'si',
    },
    metrics: [],
    bestFor: {
      es: 'Ver el patrimonio declarado de un jerarca, o si directamente no lo declaró.',
      en: 'Checking an official’s declared assets, or whether they failed to declare at all.',
    },
    limits: [
      {
        es: 'Sólo una parte de los obligados publica: la ley alcanza a muchos más de los que aparecen. Y las declaraciones salen en PDF, una por una.',
        en: 'Only some of those obliged are published: the law covers many more than appear. And declarations come as PDFs, one by one.',
      },
    ],
    sources: ['https://www.gub.uy/junta-transparencia-etica-publica/politicas-y-gestion/publicacion-declaraciones-juradas-bienes-ingresos', 'https://www.gub.uy/transparencia-publica'],
    verifiedOn: '2026-08-12',
  },
]

/** Filas de la matriz. `key` mapea a Capabilities salvo 'access', que es del Platform. */
export const DIMENSIONS: { key: string, label: Bi, help?: Bi }[] = [
  { key: 'access', label: { es: 'Cómo se accede', en: 'How you get in' } },
  { key: 'perContract', label: { es: 'Ficha por contrato', en: 'Per-contract record' }, help: { es: 'El contrato individual, no sólo el total', en: 'The individual contract, not just the total' } },
  { key: 'ownAnalysis', label: { es: 'Análisis propio', en: 'Own analysis' }, help: { es: 'Detecta, compara o cura; no sólo muestra el dato', en: 'Detects, compares or curates; not just a data mirror' } },
  { key: 'freeExport', label: { es: 'Bajar los datos gratis', en: 'Free data download' } },
  { key: 'publicApi', label: { es: 'API pública', en: 'Public API' } },
  { key: 'openSource', label: { es: 'Código abierto', en: 'Open source' } },
  { key: 'alerts', label: { es: 'Alertas', en: 'Alerts' } },
  { key: 'beyondProcurement', label: { es: 'Va más allá de compras', en: 'Beyond procurement' } },
]

/** Guía por necesidad. Reparte: varias apuntan a un sitio que no es el nuestro. */
export const DECISION_GUIDE: { need: Bi, platformId: string, why: Bi }[] = [
  {
    need: { es: 'Quiero saber cuánto pagó un organismo por un artículo, y si es caro', en: 'I want to know what a body paid for an item, and whether that is expensive' },
    platformId: 'conlatuya',
    why: { es: 'Es lo único que compara ese precio contra las otras compras del mismo artículo y te dice si se sale de la vaina.', en: 'It is the only one that compares that price against other purchases of the same item and tells you if it is out of line.' },
  },
  {
    need: { es: 'Quiero cruzar una empresa contra aduanas, declaraciones juradas y expedientes', en: 'I want to cross-check a company against customs, asset declarations and court files' },
    platformId: 'datospublicos',
    why: { es: 'Es la única con esas 68 tablas juntas en un solo buscador.', en: 'It is the only one with those 68 tables together in a single search.' },
  },
  {
    need: { es: 'Quiero entender rápido un caso de gasto escandaloso', en: 'I want to quickly grasp a scandalous spending case' },
    platformId: 'controlciudadano',
    why: { es: 'GastosUy escribe y ilustra cada caso, con el enlace a la compra oficial. Nosotros no hacemos eso.', en: 'GastosUy writes up and illustrates each case, with a link to the official purchase. We do not do that.' },
  },
  {
    need: { es: 'Quiero saber cuánto le asignaron a un ministerio y cuánto ejecutó', en: 'I want to know how much a ministry was allocated and how much it executed' },
    platformId: 'opp',
    why: { es: 'El presupuesto y su ejecución no están en ninguna plataforma de compras, ni en la nuestra.', en: 'Budget and execution are in no procurement platform, ours included.' },
  },
  {
    need: { es: 'Quiero el dato oficial, sin intermediarios', en: 'I want the official record, no intermediaries' },
    platformId: 'comprasestatales',
    why: { es: 'Es la fuente. Ante cualquier diferencia con nosotros, manda ARCE.', en: 'It is the source. If anything differs from us, ARCE prevails.' },
  },
  {
    need: { es: 'El dato que busco no lo publica nadie', en: 'Nobody publishes the data I am looking for' },
    platformId: 'datauy',
    why: { es: 'QueSabes.uy te arma el pedido formal de acceso a la información pública.', en: 'QueSabes.uy helps you file the formal freedom-of-information request.' },
  },
  {
    need: { es: 'Quiero construir mi propia herramienta', en: 'I want to build my own tool' },
    platformId: 'catalogodatos',
    why: { es: 'Materia prima con API abierta. Y si querés arrancar de algo hecho, nuestro código y nuestra API también son públicos.', en: 'Raw material with an open API. And if you would rather start from something built, our code and API are public too.' },
  },
]

export const METHODOLOGY: Bi[] = [
  {
    es: 'Cada cifra sobre un tercero sale de su propio sitio o de su propio endpoint público, y la URL está en la ficha. Ninguna se estimó.',
    en: 'Every figure about a third party comes from its own site or its own public endpoint, and the URL is in the entry. None was estimated.',
  },
  {
    es: 'Los precios se muestran tal cual los publica cada sitio, con su moneda y sin convertir. Lo que no está rotulado se marca como no rotulado, no se adivina.',
    en: 'Prices are shown exactly as each site publishes them, with their currency and unconverted. What is unlabelled is marked as unlabelled, not guessed.',
  },
  {
    es: 'Todo se verificó el 12 de agosto de 2026. Las plataformas cambian: si algo quedó viejo o mal, se corrige — escribinos.',
    en: 'Everything was verified on 12 August 2026. Platforms change: if something is stale or wrong, it gets corrected — write to us.',
  },
  {
    es: 'No hay acuerdo comercial, publicidad ni vínculo de ningún tipo con ninguna de las plataformas listadas.',
    en: 'There is no commercial agreement, advertising or relationship of any kind with any of the platforms listed.',
  },
]

/** Referencias de afuera. No entran en la matriz: no compiten por el mismo dato,
 *  sirven para ver qué se hace en otros lados. Todas respondieron 200 el 12-08-2026. */
export const INTERNATIONAL: { name: string, url: string, country: Bi, what: Bi }[] = [
  {
    name: '¿Dónde van mis impuestos? (Civio)',
    url: 'https://dondevanmisimpuestos.es/',
    country: { es: 'España', en: 'Spain' },
    what: { es: 'Presupuesto del Estado explicado y navegable. Civio además litiga por el acceso a la información.', en: 'The state budget, explained and navigable. Civio also litigates for access to information.' },
  },
  {
    name: 'Querido Diário',
    url: 'https://queridodiario.ok.org.br/',
    country: { es: 'Brasil', en: 'Brazil' },
    what: { es: 'Convierte los diarios oficiales de cientos de municipios en datos buscables. El equivalente sería hacerlo con el Diario Oficial y las 19 intendencias.', en: 'Turns the official gazettes of hundreds of municipalities into searchable data. The equivalent here would be doing it with the Diario Oficial and the 19 departments.' },
  },
  {
    name: 'Portal da Transparência',
    url: 'https://portaldatransparencia.gov.br/',
    country: { es: 'Brasil', en: 'Brazil' },
    what: { es: 'El portal oficial más completo de la región: gasto, convenios, sanciones y hasta las tarjetas corporativas del gobierno.', en: 'The region’s most complete official portal: spending, agreements, sanctions and even government corporate cards.' },
  },
  {
    name: 'Presupuesto Abierto',
    url: 'https://www.presupuestoabierto.gob.ar/',
    country: { es: 'Argentina', en: 'Argentina' },
    what: { es: 'Presupuesto y ejecución en tiempo casi real, con datos abiertos descargables.', en: 'Budget and execution in near-real time, with downloadable open data.' },
  },
  {
    name: 'QuiénEsQuién.Wiki',
    url: 'https://www.quienesquien.wiki/',
    country: { es: 'México', en: 'Mexico' },
    what: { es: 'Empresas, contratos y personas conectados en un grafo: el cruce societario que a nosotros nos falta.', en: 'Companies, contracts and people connected in a graph: the corporate-ownership cross-reference we lack.' },
  },
  {
    name: 'Open Contracting Partnership',
    url: 'https://www.open-contracting.org/',
    country: { es: 'Global', en: 'Global' },
    what: { es: 'Quienes definen el estándar OCDS, que es el formato en el que Uruguay publica sus compras y del que se alimenta este sitio.', en: 'The people behind the OCDS standard — the format Uruguay publishes its procurement in, and what feeds this site.' },
  },
]
