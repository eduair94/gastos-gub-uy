/**
 * Investigación · Intendencia de Montevideo — gasto discrecional y déficit.
 *
 * Foto verificada a 2026-07. Las cifras de compras salen de la base del sitio
 * (Compras Estatales / OCDS, comprador buyer.id = 98-1) y se verificaron contra el
 * portal oficial; cada contrato del ledger enlaza a su ficha. El déficit y los casos
 * mediáticos vienen de prensa citada (El Observador, Ámbito, Montevideo Portal,
 * Subrayado, La Nación, la diaria, Búsqueda) — son contexto, no dato de la base.
 *
 * "Superfluo" es un juicio editorial, no un hecho: se marca como tal, se evidencia
 * con la propia descripción del contrato y se deja el enlace para que el lector juzgue.
 * La consultoría (mayormente operativa: SAP/GRP, relleno sanitario, georreferenciación)
 * se deja FUERA del gasto discrecional, aunque sea el rubro mayor — para no inflar.
 */

export interface ImLedgerRow {
  cat: 'publicidad' | 'eventos' | 'mobiliario' | 'merchandising'
  ocid: string
  id: string
  date: string
  year: number
  supplier: string
  /** Real classification.description from the ficha (what was actually bought). */
  desc: string
  amount: number
}
export interface ImCategory { key: string, spend: number, contracts: number }
export interface ImNewsCase { key: string, amountText: string, source: string, url: string, date: string }

/** Compras rastreables del comprador 98-1, tope de plausibilidad 5e10 (excluye 1 registro corrupto de 2019). */
export const IM_STATS = {
  comprasTotal: 48593970087,
  contracts: 108287,
  medianContract: 15631,
  yearSpan: '2012–2025',
  deficit2024UYU: 3640226827,
  deficit2024USD: '82,6',
  deficit2023USD: '11,3',
  deficitAcumUSD: '497',
  deficitMult: 8,
}

/** Gasto discrecional por rubro (nivel contrato, 5e4 < monto ≤ 2e8; puede haber solapamiento leve). */
export const IM_CATEGORIES: ImCategory[] = [
  { key: 'publicidad', spend: 209581901, contracts: 520 },
  { key: 'eventos', spend: 157724779, contracts: 303 },
  { key: 'mobiliario', spend: 26280647, contracts: 128 },
  { key: 'catering', spend: 19893559, contracts: 142 },
]
/** Consultoría: el rubro mayor, pero mayormente operativo — se muestra aparte, no se suma a lo discrecional. */
export const IM_CONSULTORIA = { spend: 342996586, contracts: 286 }
export const IM_DISCRECIONAL_TOTAL = IM_CATEGORIES.reduce((s, c) => s + c.spend, 0)

/** 15 contratos verificados (buyer 98-1, proveedor y monto confirmados en la base). Ilustrativos, no exhaustivos. */
export const IM_LEDGER: ImLedgerRow[] = [
  { cat: 'publicidad', ocid: 'ocds-yfs5dr-i271252', id: 'i271252', date: '2018-09-20', year: 2018, supplier: 'SIETEVEINTE S.R.L.', desc: "Asesoramiento publicitario", amount: 13770492 },
  { cat: 'publicidad', ocid: 'ocds-yfs5dr-i384862', id: 'i384862', date: '2023-03-07', year: 2023, supplier: 'SIETEVEINTE S.R.L.', desc: "Asesoramiento publicitario", amount: 9016393 },
  { cat: 'publicidad', ocid: 'ocds-yfs5dr-i309070', id: 'i309070', date: '2020-04-03', year: 2020, supplier: 'SIETEVEINTE S.R.L.', desc: "Asesoramiento publicitario", amount: 7786885 },
  { cat: 'publicidad', ocid: 'ocds-yfs5dr-i315676', id: 'i315676', date: '2020-09-24', year: 2020, supplier: 'SIETEVEINTE S.R.L.', desc: "Asesoramiento publicitario", amount: 7377049 },
  { cat: 'publicidad', ocid: 'ocds-yfs5dr-i298544', id: 'i298544', date: '2019-12-20', year: 2019, supplier: 'SIETEVEINTE S.R.L.', desc: "Asesoramiento publicitario", amount: 7377049 },
  { cat: 'publicidad', ocid: 'ocds-yfs5dr-i290472', id: 'i290472', date: '2019-06-25', year: 2019, supplier: 'SIETEVEINTE S.R.L.', desc: "Asesoramiento publicitario", amount: 6885246 },
  { cat: 'publicidad', ocid: 'ocds-yfs5dr-i231587', id: 'i231587', date: '2016-06-14', year: 2016, supplier: 'MONTE CARLO S A', desc: "Publicidad radial", amount: 4238800 },
  { cat: 'publicidad', ocid: 'ocds-yfs5dr-i233600', id: 'i233600', date: '2016-07-27', year: 2016, supplier: 'SAETA (Emisoras de Televisión y Anexos)', desc: "Publicidad televisiva", amount: 3804100 },
  { cat: 'publicidad', ocid: 'ocds-yfs5dr-i284087', id: 'i284087', date: '2019-03-07', year: 2019, supplier: 'AMEN S.A.', desc: "Campaña publicitaria", amount: 2719754 },
  { cat: 'eventos', ocid: 'ocds-yfs5dr-i280144', id: 'i280144', date: '2019-05-08', year: 2019, supplier: 'Asociación Rural del Uruguay', desc: "Venta de entradas para espectáculos", amount: 3244539 },
  { cat: 'eventos', ocid: 'ocds-yfs5dr-i291780', id: 'i291780', date: '2019-09-13', year: 2019, supplier: 'CANCLINI VILAR FEDERICO', desc: "Carpa para espectáculos", amount: 3210000 },
  { cat: 'eventos', ocid: 'ocds-yfs5dr-i303299', id: 'i303299', date: '2020-03-06', year: 2020, supplier: 'Asociación Rural del Uruguay', desc: "Venta de entradas para espectáculos", amount: 2667500 },
  { cat: 'eventos', ocid: 'ocds-yfs5dr-i375681', id: 'i375681', date: '2022-12-16', year: 2022, supplier: 'PALLADIUM S A', desc: "Vallado para el desfile de Carnaval 2023", amount: 2573578 },
  { cat: 'merchandising', ocid: 'ocds-yfs5dr-i444887', id: 'i444887', date: '2024-11-18', year: 2024, supplier: 'LANCER S A', desc: "Remeras de algodón (naranja)", amount: 5784554 },
  { cat: 'merchandising', ocid: 'ocds-yfs5dr-i408848', id: 'i408848', date: '2023-12-13', year: 2023, supplier: 'LANCER S A', desc: "Remeras de algodón (naranja)", amount: 3794602 },
]

/** Casos mediáticos (contexto verificado en prensa, no en la base de compras). */
export const IM_NEWS: ImNewsCase[] = [
  { key: 'lali', amountText: 'USD 256.478', source: 'La Nación', url: 'https://www.lanacion.com.ar/el-mundo/revuelo-y-criticas-en-uruguay-revelan-cuanto-le-pagara-la-intendencia-de-montevideo-a-lali-esposito-nid14032023/', date: '2023' },
  { key: 'tvciudad', amountText: '≈ USD 8 M/año', source: 'Montevideo Portal', url: 'https://www.montevideo.com.uy/Noticias/-Doble-discurso-y-le-cuesta-el-rating--oposicion-sobre-la-reestructura-de-TV-Ciudad-uc944684', date: '2025' },
  { key: 'camiones', amountText: '> USD 8 M', source: 'Subrayado', url: 'https://www.subrayado.com.uy/adeom-acepto-probar-camiones-recolectores-que-cuestionaba-seguridad-lema-critico-compra-imm-n959087', date: '2024' },
  { key: 'cargos', amountText: '3 cargos', source: 'la diaria', url: 'https://ladiaria.com.uy/politica/articulo/2026/5/junta-departamental-de-montevideo-aprobo-la-creacion-de-tres-cargos-de-confianza-sin-las-mayorias-requeridas-segun-el-tribunal-de-cuentas/', date: '2026' },
]

export const IM_SOURCES = [
  { label: 'El Observador — Déficit 2024 de la IM (USD 82,6 M; acumulado USD 497,4 M)', url: 'https://www.elobservador.com.uy/nacional/en-2024-la-intendencia-montevideo-tuvo-un-deficit-us-82-millones-y-tiene-un-acumulado-us-497-millones-n6007209' },
  { label: 'Ámbito — El déficit de la IM se disparó a USD 90,4 M (2024)', url: 'https://www.ambito.com/uruguay/el-deficit-la-intendencia-montevideo-se-disparo-y-enciende-alarmas-la-gestion-electa-n6164137' },
  { label: 'Montevideo Portal — Déficit de USD 18 M en 2025 (-70%)', url: 'https://www.montevideo.com.uy/Noticias/Intendencia-de-Montevideo-tuvo-deficit-de-US-18-millones-en-2025-un-70-menos-que-2024-uc956944' },
  { label: 'Búsqueda — La IM planteó dificultades financieras al futuro gobierno', url: 'https://www.busqueda.com.uy/politica/autoridades-la-intendencia-montevideo-plantearon-al-futuro-gobierno-que-enfrentan-dificultades-financieras-n5395017' },
  { label: 'Compras Estatales — cada contrato del ledger enlaza a su ficha oficial', url: 'https://www.comprasestatales.gub.uy/consultas/' },
]

const IM_CONTENT = {
  es: {
    common: {
      source: 'Compras Estatales (OCDS) · verificado ficha por ficha',
      verified: 'Fuentes verificadas',
      readMore: 'Seguir leyendo',
    },
    cat: { publicidad: 'Publicidad y comunicación', eventos: 'Eventos y espectáculos', mobiliario: 'Mobiliario y decoración', catering: 'Catering y protocolo', merchandising: 'Indumentaria y merchandising' },
    file: { org: 'Intendencia de Montevideo', inciso: 'Comprador 98-1', period: '2012–2025' },
    kicker: 'Investigación · Gasto departamental',
    title: 'Montevideo en rojo: en qué gastó la Intendencia mientras el déficit se multiplicaba por ocho',
    dek: 'En 2024 la Intendencia de Montevideo cerró con el mayor déficit en una década — USD 82,6 millones, ocho veces el del año anterior. Mientras tanto siguió pagando publicidad, espectáculos, catering y merchandising. Acá está el gasto discrecional, contrato por contrato.',
    chips: ['Déficit 2024: USD 82,6 M', 'Compras 2012–2025', 'Cada contrato con su ficha'],
    tiles: { compras: 'Compras rastreables', comprasSub: 'Comprador 98-1 · 2012–2025 · tope de plausibilidad', deficit: 'Déficit 2024', deficitSub: 'USD 82,6 M · el mayor en 10 años', mediana: 'Contrato mediano', mult: 'Veces el déficit de 2023' },
    ctx: {
      tag: 'El contexto',
      title: 'Un déficit que se multiplicó por ocho',
      p1: 'La Rendición de Cuentas 2024 dejó a la Intendencia de Montevideo con un déficit de $3.640 millones de pesos (USD 82,6 millones según El Observador; USD 90,4 millones según Ámbito), ocho veces el de 2023 y el mayor en una década. El déficit acumulado ronda los USD 497 millones.',
      p2: 'La comuna lo atribuye a la caída de transferencias del gobierno central y a la eliminación de la Tasa de Inflamables. Ya con Mario Bergara (2025) anunció una reducción del orden del 70%, a unos USD 18 millones, mientras gestiona nuevos créditos. La pregunta de esta investigación es la otra cara: con ese rojo sobre la mesa, ¿en qué se siguió gastando lo discrecional?',
    },
    disc: {
      tag: 'Lo discrecional',
      title: 'Publicidad, espectáculos, catering, mobiliario',
      intro: 'Son los rubros que un organismo en déficit suele recortar primero. No son ilegales ni necesariamente injustificados —parte es función cultural de la comuna— pero son elásticos: se pueden postergar. Esto es lo que la Intendencia gastó en cada uno (compras con precio, 2012–2025).',
      chart: 'Gasto discrecional por rubro',
      finding: 'La consultoría es el rubro mayor (unos $343 millones), pero queda fuera de este conteo: en su mayoría es operativa (sistemas SAP/GRP, relleno sanitario, georreferenciación), no superflua. Preferimos no inflar la cifra.',
    },
    ledger: {
      tag: 'La evidencia',
      title: 'Quince contratos, uno por uno',
      intro: 'Los contratos discrecionales más grandes del período, verificados en la base y enlazados a su ficha en el sitio. La publicidad se concentra en un puñado de proveedores; el merchandising (remeras, gorros) siguió incluso en 2023 y 2024, en pleno rojo.',
      colDate: 'Fecha', colObjeto: 'Objeto', colDesc: 'Proveedor / rubro', colSup: 'Proveedor', colAmount: 'Monto', ficha: 'Ver contrato',
    },
    explore: {
      tag: 'Seguí explorando',
      title: 'Todos los contratos de la Intendencia',
      intro: 'Este informe es una foto de lo discrecional. Para ver el resto —obras, combustible, recolección, salud— entrá al detalle del organismo o al buscador.',
      allContracts: 'Ver los contratos de la Intendencia',
      compare: 'Comparar por habitante',
      search: 'Abrir en el buscador',
    },
    casos: {
      tag: 'Los casos que fueron noticia',
      title: 'Lo que ya había salido en la prensa',
      intro: 'Cuatro gastos que llegaron al debate público. No salen de la base de compras sino de la prensa citada; los sumamos como contexto.',
      lali: 'Pago a Lali Espósito por el festival gratuito «Acá estamos» en la rambla. La oposición lo llamó «pan y circo».',
      tvciudad: 'Costo anual del canal municipal TV Ciudad, cuestionado por su bajo rating mientras se pedía redirigir fondos a calles y saneamiento.',
      camiones: '16 camiones recolectores que quedaron meses sin usar por objeciones de seguridad del sindicato. «Compraron mal los camiones», dijo la oposición.',
      cargos: 'La Junta Departamental creó tres cargos de confianza sin «las mayorías requeridas», según observó el Tribunal de Cuentas.',
      note: 'Estos cuatro montos vienen de la prensa, no de una ficha: no aparecen como un contrato único identificable en los datos abiertos de compras. (La Intendencia sí compró camiones compactadores de residuos, pero en 2016, no en la compra de 2024 que se menciona.) Los dejamos como contexto, con su enlace a la nota.',
    },
    method: {
      tag: 'Cómo se hizo',
      title: 'Método y límites',
      p1: 'Las compras salen de la base del sitio (Compras Estatales, comprador 98-1). Se excluye un registro corrupto de 2019 (cantidad errónea que reporta ~$182.000 millones) y se lidera con la mediana y los totales acotados. Cada contrato del ledger se verificó en la base y enlaza a su ficha.',
      p2: '«Superfluo» es un juicio, no un hecho. Marcamos como discrecional lo que un organismo en déficit puede postergar —publicidad, espectáculos, catering, merchandising— y dejamos afuera la consultoría operativa. El lector abre cada ficha y juzga.',
    },
    sourcesTitle: 'Fuentes',
    disclaimerTitle: 'Sobre estos datos',
    disclaimer: [
      'Este es un trabajo periodístico sobre datos abiertos, no una auditoría. Los montos de compras son los que publica el Estado; los del déficit y los casos mediáticos, los que publicó la prensa citada.',
      'Marcar un gasto como «discrecional» o «superfluo» es una lectura editorial en el contexto del déficit, no una acusación de irregularidad. Cada contrato enlaza a su fuente oficial para que cualquiera lo verifique.',
    ],
  },
  en: {
    common: {
      source: 'Compras Estatales (OCDS) · verified file by file',
      verified: 'Verified sources',
      readMore: 'Keep reading',
    },
    cat: { publicidad: 'Advertising & communications', eventos: 'Events & shows', mobiliario: 'Furniture & décor', catering: 'Catering & protocol', merchandising: 'Apparel & merchandising' },
    file: { org: 'Intendencia de Montevideo', inciso: 'Buyer 98-1', period: '2012–2025' },
    kicker: 'Investigation · Departmental spending',
    title: 'Montevideo in the red: what the city government bought while its deficit multiplied eightfold',
    dek: 'In 2024 the Intendencia de Montevideo posted its biggest deficit in a decade — USD 82.6 million, eight times the year before. Meanwhile it kept paying for advertising, shows, catering and merchandising. Here is the discretionary spend, contract by contract.',
    chips: ['2024 deficit: USD 82.6 M', 'Purchases 2012–2025', 'Every contract linked to its file'],
    tiles: { compras: 'Trackable purchases', comprasSub: 'Buyer 98-1 · 2012–2025 · plausibility-capped', deficit: '2024 deficit', deficitSub: 'USD 82.6 M · biggest in 10 years', mediana: 'Median contract', mult: 'Times the 2023 deficit' },
    ctx: {
      tag: 'The context',
      title: 'A deficit that multiplied eightfold',
      p1: 'The 2024 accounts left the Intendencia de Montevideo with a deficit of $3,640 million pesos (USD 82.6 million per El Observador; USD 90.4 million per Ámbito), eight times that of 2023 and the largest in a decade. The accumulated deficit is around USD 497 million.',
      p2: 'The city blames falling central-government transfers and the end of a local levy. Under Mario Bergara (2025) it announced a ~70% cut, to about USD 18 million, while seeking new loans. This investigation asks the other side: with that red ink on the table, what discretionary spending carried on?',
    },
    disc: {
      tag: 'The discretionary part',
      title: 'Advertising, shows, catering, furniture',
      intro: 'These are the lines a body in deficit tends to cut first. They are not illegal or necessarily unjustified — some is the city’s cultural mandate — but they are elastic: they can be postponed. This is what the city spent on each (priced purchases, 2012–2025).',
      chart: 'Discretionary spend by category',
      finding: 'Consultancy is the biggest line (about $343 million), but it is kept out of this count: most of it is operational (SAP/GRP systems, landfill, georeferencing), not superfluous. We’d rather not inflate the figure.',
    },
    ledger: {
      tag: 'The evidence',
      title: 'Fifteen contracts, one by one',
      intro: 'The largest discretionary contracts of the period, verified in the data and linked to their record on the site. Advertising concentrates in a handful of suppliers; the merchandising (t-shirts, hats) continued even in 2023 and 2024, deep in the red.',
      colDate: 'Date', colObjeto: 'Item', colDesc: 'Supplier / category', colSup: 'Supplier', colAmount: 'Amount', ficha: 'View contract',
    },
    explore: {
      tag: 'Keep exploring',
      title: 'All of the city government’s contracts',
      intro: 'This report is a snapshot of the discretionary part. To see the rest — public works, fuel, waste collection, health — open the agency detail or the explorer.',
      allContracts: 'See the city government’s contracts',
      compare: 'Compare per resident',
      search: 'Open in the explorer',
    },
    casos: {
      tag: 'The cases that made the news',
      title: 'What had already surfaced in the press',
      intro: 'Four expenses that reached public debate. They come from the cited press, not the procurement data; we add them as context.',
      lali: 'Payment to singer Lali Espósito for the free festival «Acá estamos» on the waterfront. The opposition called it «bread and circuses».',
      tvciudad: 'Annual cost of the municipal channel TV Ciudad, questioned for its low ratings while funds were demanded for streets and sanitation.',
      camiones: '16 refuse trucks left unused for months over union safety objections. «They bought the trucks badly,» the opposition said.',
      cargos: 'The Departmental Board created three political appointments without «the required majorities», as the Court of Auditors noted.',
      note: 'These four figures come from the press, not from a file: they do not appear as a single identifiable contract in the open procurement data. (The city did buy refuse-compactor trucks, but in 2016 — not the 2024 purchase referenced.) We keep them as context, each linked to its article.',
    },
    method: {
      tag: 'How it was done',
      title: 'Method and limits',
      p1: 'Purchases come from the site’s data (Compras Estatales, buyer 98-1). One corrupt 2019 record (a quantity error reporting ~$182 billion) is excluded, and we lead with the median and capped totals. Every ledger contract was verified in the data and links to its file.',
      p2: '«Superfluous» is a judgement, not a fact. We flag as discretionary what a body in deficit can postpone — advertising, shows, catering, merchandising — and leave out operational consultancy. The reader opens each file and judges.',
    },
    sourcesTitle: 'Sources',
    disclaimerTitle: 'About this data',
    disclaimer: [
      'This is data journalism over open data, not an audit. Purchase amounts are what the State publishes; the deficit and media cases are what the cited press reported.',
      'Flagging spending as «discretionary» or «superfluous» is an editorial reading in the context of the deficit, not an accusation of wrongdoing. Every contract links to its official source so anyone can check.',
    ],
  },
} as const

export function imContent(locale: string) {
  return (IM_CONTENT as Record<string, typeof IM_CONTENT.es>)[locale] ?? IM_CONTENT.es
}
