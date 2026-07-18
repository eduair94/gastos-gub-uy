/**
 * Investigación · TV Ciudad — el canal municipal de la Intendencia de Montevideo.
 *
 * Verdad de la base (Compras Estatales / OCDS): TV Ciudad NO es un comprador ni un
 * proveedor. Es una dependencia dentro de la Intendencia (comprador buyer.id = 98-1)
 * financiada por presupuesto, no por licitación. Por eso su costo real —unos USD 8 a
 * 10 millones al año según la prensa y la Rendición de Cuentas— no aparece como
 * contratos. Lo que SÍ deja rastro son ~20 registros de compras que nombran al canal:
 * equipamiento (switcher, editores, sistema de medios), vehículos, insumos. Casi todos
 * son llamados (tender.description) sin monto adjudicado en el propio registro; la
 * adjudicación queda en un expediente aparte cuyo título no menciona a TV Ciudad.
 *
 * Método: el ledger sale de la base (verificado ficha por ficha, comprador 98-1). El
 * presupuesto, la publicidad, el contrato de la NBA y los recortes vienen de prensa
 * citada (El Observador, La Mañana, Montevideo Portal) — son contexto, no dato de la
 * base, y se marcan como tal. Se lidera con lo verificable y se deja explícito el
 * subconteo: es un producto de transparencia, no una auditoría.
 */

export interface TvcLedgerRow {
  /** `compra` = adjudicación con monto en el registro; `llamado` = llamado, el monto vive en otro expediente. */
  kind: 'compra' | 'llamado'
  cat: 'equipamiento' | 'insumos' | 'obra' | 'vehiculo'
  ocid: string
  id: string
  date: string
  year: number
  /** Vacío en los llamados (aún sin adjudicatario en este registro). */
  supplier: string
  /** classification.description (compras) o tender.description (llamados) — lo que se compró para el canal. */
  desc: string
  /** UYU. 0 en los llamados: el monto adjudicado no está en este registro. */
  amount: number
  url: string
}
export interface TvcBudgetLine { key: string, spend: number }
export interface TvcNewsCase { key: string, amountText: string, source: string, url: string, date: string }

/**
 * Cifras de contexto. El presupuesto y la publicidad son de la Rendición de Cuentas de
 * la IM y de la prensa (El Observador), NO de la base de compras. `dbRecords`/`dbTotal`
 * sí salen de la base (comprador 98-1, texto "TV Ciudad", tope de plausibilidad 5e10).
 */
export const TVC_STATS = {
  presupuesto2023UYU: 304000000,
  presupuesto2023USD: '7,6',
  presupuesto2026UYU: 405000000,
  presupuesto2026USD: '10',
  presupuestoAumentoPct: 33,
  publicidad2024UYU: 15441547,
  publicidad2020UYU: 2919146,
  publicidadMult: 5,
  /** $15,4 M (publicidad 2024) sobre el costo anual $304 M (2023) ≈ 5%. El Observador citó ~3% para 2023 ($10,6 M); acá se usa la razón consistente con las cifras mostradas. */
  publicidadSharedPct: 5,
  recorte2025Pct: 10,
  dbRecords: 20,
  dbPriced: 2,
  dbTotalUYU: 347250,
  yearSpan: '2009–2025',
}

/**
 * Composición del presupuesto anual de TV Ciudad (Rendición de Cuentas IM, 2023).
 * Fuente: El Observador. Es presupuesto, NO contratos de la base — se muestra para dar
 * escala; suma ≈ $304 M.
 */
export const TVC_BUDGET: TvcBudgetLine[] = [
  { key: 'personal', spend: 184000000 },
  { key: 'funcionamiento', spend: 104000000 },
  { key: 'inversion', spend: 16000000 },
]
export const TVC_BUDGET_TOTAL = TVC_BUDGET.reduce((s, b) => s + b.spend, 0)

const ficha = (id: string) => `https://www.comprasestatales.gub.uy/consultas/detalle/mostrar-llamado/1/id/${id}`

/**
 * Registros de la base (comprador 98-1) cuyo texto nombra a "TV Ciudad", verificados
 * ficha por ficha. Dos son adjudicaciones con monto (imprenta); el resto son llamados
 * de equipamiento/vehículos/obra sin monto adjudicado en el propio registro. Ilustra
 * qué compra el canal, no cuánto cuesta: su costo es presupuestal.
 */
export const TVC_LEDGER: TvcLedgerRow[] = [
  { kind: 'compra', cat: 'insumos', ocid: 'ocds-yfs5dr-i436702', id: 'i436702', date: '2024-07-15', year: 2024, supplier: 'MERALIR S A', desc: 'Libro «Cocinemos» de TV Ciudad (impresión)', amount: 280400, url: ficha('i436702') },
  { kind: 'compra', cat: 'insumos', ocid: 'ocds-yfs5dr-i430434', id: 'i430434', date: '2024-05-22', year: 2024, supplier: 'PITTAMIGLIO SCARCHELLI SANTIAGO J.', desc: 'Recetario del programa de TV Ciudad (impresión)', amount: 66850, url: ficha('i430434') },
  { kind: 'llamado', cat: 'equipamiento', ocid: 'ocds-yfs5dr-i395511', id: 'i395511', date: '2023-06-06', year: 2023, supplier: '', desc: 'Sistema de gestión de medios audiovisuales para TV Ciudad', amount: 0, url: ficha('i395511') },
  { kind: 'llamado', cat: 'equipamiento', ocid: 'ocds-yfs5dr-i341563', id: 'i341563', date: '2021-10-13', year: 2021, supplier: '', desc: 'Switcher de producción para el estudio de TV Ciudad', amount: 0, url: ficha('i341563') },
  { kind: 'llamado', cat: 'vehiculo', ocid: 'ocds-yfs5dr-i453064', id: 'i453064', date: '2025-10-23', year: 2025, supplier: '', desc: 'Camión doble cabina, destino TV Ciudad', amount: 0, url: ficha('i453064') },
  { kind: 'llamado', cat: 'vehiculo', ocid: 'ocds-yfs5dr-i453068', id: 'i453068', date: '2025-02-26', year: 2025, supplier: '', desc: 'Camión cabina simple, destino TV Ciudad', amount: 0, url: ficha('i453068') },
  { kind: 'llamado', cat: 'equipamiento', ocid: 'ocds-yfs5dr-i480983', id: 'i480983', date: '2025-11-25', year: 2025, supplier: '', desc: '3 computadores de escritorio especiales, destino TV Ciudad', amount: 0, url: ficha('i480983') },
  { kind: 'llamado', cat: 'equipamiento', ocid: 'ocds-yfs5dr-i480609', id: 'i480609', date: '2025-11-20', year: 2025, supplier: '', desc: 'Discos duros para NAS Synology para TV Ciudad', amount: 0, url: ficha('i480609') },
  { kind: 'llamado', cat: 'equipamiento', ocid: 'ocds-yfs5dr-i194179', id: 'i194179', date: '2012-11-29', year: 2012, supplier: '', desc: '2 editores no lineales (filmación) para TV Ciudad', amount: 0, url: ficha('i194179') },
  { kind: 'llamado', cat: 'equipamiento', ocid: 'ocds-yfs5dr-i142639', id: 'i142639', date: '2009-06-12', year: 2009, supplier: '', desc: '4 editores no lineales (filmación) para TV Ciudad de la I.M.M.', amount: 0, url: ficha('i142639') },
  { kind: 'llamado', cat: 'obra', ocid: 'ocds-yfs5dr-i189078', id: 'i189078', date: '2012-05-29', year: 2012, supplier: '', desc: 'Reforma de los accesos a TV Ciudad', amount: 0, url: ficha('i189078') },
]

/** Casos que llegaron a la prensa (contexto verificado en prensa, NO en la base de compras). */
export const TVC_NEWS: TvcNewsCase[] = [
  { key: 'presupuesto', amountText: '≈ USD 8–10 M/año', source: 'El Observador · La Mañana', url: 'https://www.elobservador.com.uy/nacional/los-recortes-tv-ciudad-ascienden-al-10-del-presupuesto-y-una-las-ediciones-del-informativo-dejara-salir-al-aire-n5986874', date: '2023–2026' },
  { key: 'publicidad', amountText: '$15,4 M en 2024 · ×5', source: 'El Observador', url: 'https://www.elobservador.com.uy/nacional/ingresos-publicidad-tv-ciudad-se-multiplicaron-cinco-2020-2024-quienes-pautan-el-canal-la-intendencia-n5992800', date: '2024' },
  { key: 'nba', amountText: 'US$ 165–230 k', source: 'El Observador', url: 'https://www.elobservador.com.uy/nota/nba-por-tv-ciudad-cuanto-costo-la-clausula-confidencial-y-dos-posturas-de-jerarcas-20216221560', date: '2022' },
  { key: 'recortes', amountText: '−10% del presupuesto', source: 'El Observador', url: 'https://www.elobservador.com.uy/nacional/intendencia-montevideo-aplica-recortes-cultura-y-el-sindicato-tv-ciudad-se-declara-preconflicto-n5986685', date: '2025' },
]

export const TVC_SOURCES = [
  { label: 'El Observador — Ingresos por publicidad ×5 (2020–2024): quiénes pautan en el canal', url: 'https://www.elobservador.com.uy/nacional/ingresos-publicidad-tv-ciudad-se-multiplicaron-cinco-2020-2024-quienes-pautan-el-canal-la-intendencia-n5992800' },
  { label: 'El Observador — Los recortes en TV Ciudad ascienden al 10% del presupuesto', url: 'https://www.elobservador.com.uy/nacional/los-recortes-tv-ciudad-ascienden-al-10-del-presupuesto-y-una-las-ediciones-del-informativo-dejara-salir-al-aire-n5986874' },
  { label: 'El Observador — La NBA por TV Ciudad: cuánto costó y la cláusula confidencial', url: 'https://www.elobservador.com.uy/nota/nba-por-tv-ciudad-cuanto-costo-la-clausula-confidencial-y-dos-posturas-de-jerarcas-20216221560' },
  { label: 'La Mañana — TV Ciudad: el millonario canal de la Intendencia de Montevideo', url: 'https://www.xn--lamaana-7za.uy/politica/tv-ciudad-el-millonario-canal-de-la-intendencia-de-montevideo-redobla-la-propaganda-politica/' },
  { label: 'Montevideo · Portal institucional — TV Ciudad', url: 'https://montevideo.gub.uy/index.php/institucional/dependencias/tv-ciudad' },
  { label: 'Compras Estatales — cada registro del ledger enlaza a su ficha oficial', url: 'https://www.comprasestatales.gub.uy/consultas/' },
]

const TVC_CONTENT = {
  es: {
    common: {
      source: 'Compras Estatales (OCDS) + prensa citada · verificado',
      verified: 'Fuentes verificadas',
      readMore: 'Seguir leyendo',
    },
    cat: { equipamiento: 'Equipamiento', insumos: 'Insumos e imprenta', obra: 'Obra', vehiculo: 'Vehículos' },
    budget: { personal: 'Sueldos y personal', funcionamiento: 'Funcionamiento', inversion: 'Equipamiento e inversión' },
    kind: { compra: 'Adjudicado', llamado: 'Llamado' },
    file: { org: 'Intendencia de Montevideo', inciso: 'TV Ciudad · dependencia del comprador 98-1', period: '2009–2025' },
    kicker: 'Investigación · Gasto departamental',
    title: 'TV Ciudad: cuánto cuesta el canal de la Intendencia y por qué casi no deja rastro en las compras',
    dek: 'El canal municipal cuesta entre USD 8 y 10 millones al año, pero ese dinero es presupuestal: no se licita, y por eso apenas aparece en la base de Compras Estatales. Acá está lo que sí queda registrado —el equipamiento y los insumos que nombran al canal, ficha por ficha— y lo que reportó la prensa: el presupuesto, la publicidad, la NBA y los recortes.',
    chips: ['≈ USD 8–10 M/año', 'Publicidad ×5 (2020→2024)', 'Solo 20 registros lo nombran'],
    tiles: {
      presupuesto: 'Presupuesto anual', presupuestoSub: '2023 · ≈ USD 7,6 M · Rendición de Cuentas IM',
      proyecto: 'Proyecto de presupuesto', proyectoSub: '2026 · ≈ USD 10 M · +33% vs 2023',
      publicidad: 'Ingresos por publicidad', publicidadSub: '2024 · ×5 desde 2020 · ~5% de su costo',
      registros: 'Registros que lo nombran', registrosSub: 'en Compras Estatales (2009–2025)',
    },
    ctx: {
      tag: 'El contexto',
      title: 'Un canal financiado por presupuesto, no por licitación',
      p1: 'TV Ciudad es una dependencia de la Intendencia de Montevideo, no un organismo comprador con su propio número. Su costo —unos $304 millones en 2023 (≈ USD 7,6 M), y unos $405 millones proyectados para 2026 (≈ USD 10 M)— se paga con el presupuesto de la comuna: sueldos, funcionamiento y equipamiento. Por eso no existe como una lista de contratos que uno pueda sumar.',
      p2: 'La discusión política es vieja y sigue: la oposición cuestiona el gasto por el bajo rating y pide redirigir fondos a calles y saneamiento; la comuna defiende su función cultural e informativa. Esta investigación separa las dos cosas: lo que la base de compras registra (poco, pero verificable) y lo que reportó la prensa (el grueso del dinero, como contexto citado).',
    },
    disc: {
      tag: 'La escala',
      title: 'En qué se va el presupuesto de TV Ciudad',
      intro: 'La composición del presupuesto 2023 según la Rendición de Cuentas de la Intendencia (El Observador). No son contratos de la base —es presupuesto— pero da la escala real del canal, muy por encima de lo que las compras dejan ver.',
      chart: 'Presupuesto de TV Ciudad por rubro (2023)',
      finding: 'Seis de cada diez pesos son sueldos ($184 M de $304 M). La publicidad, que se multiplicó por cinco entre 2020 y 2024 hasta los $15,4 M, cubre apenas un 5% del costo del canal (era el 3% en 2023, según El Observador). El resto lo pone el contribuyente.',
    },
    ledger: {
      tag: 'La evidencia',
      title: 'Lo que la base sí registra',
      intro: 'Los registros de Compras Estatales (comprador 98-1) que nombran a TV Ciudad: equipamiento de estudio, vehículos, obra e insumos, verificados y enlazados a su ficha. Solo dos tienen monto adjudicado (imprenta); los demás son llamados cuyo monto queda en un expediente aparte. Es lo que se compra para el canal, no cuánto cuesta operarlo.',
      colDate: 'Fecha', colObjeto: 'Objeto', colSup: 'Proveedor', colCat: 'Rubro', colAmount: 'Monto', ficha: 'Ficha',
      sinMonto: 'Sin monto adjudicado',
    },
    explore: {
      tag: 'Seguí explorando',
      title: 'El resto de la Intendencia',
      intro: 'TV Ciudad es una pieza del gasto de Montevideo. Para ver el cuadro completo —el déficit, lo discrecional, todos los contratos— entrá a la investigación de la Intendencia o al buscador.',
      im: 'Ver la investigación de la Intendencia',
      buyer: 'Contratos de la Intendencia (98-1)',
      search: 'Buscar «TV Ciudad» en la base',
    },
    casos: {
      tag: 'Los casos que fueron noticia',
      title: 'Lo que salió en la prensa',
      intro: 'Cuatro frentes del debate público sobre TV Ciudad. No salen de la base de compras sino de la prensa citada; los sumamos como contexto, cada uno con su enlace.',
      presupuesto: 'El costo anual del canal, entre USD 8 y 10 millones según la Rendición de Cuentas y la prensa, cuestionado mientras se pedían fondos para calles y saneamiento.',
      publicidad: 'Los ingresos por publicidad se multiplicaron por cinco entre 2020 y 2024 (de $2,9 M a $15,4 M), pero cubren apenas un 5% del costo del canal (el 3% en 2023, según El Observador). Desde 2022 pautan sindicatos como Fenapes, Adur y Fucvam.',
      nba: 'La transmisión de la NBA por TV Ciudad tuvo una cláusula de confidencialidad (12.f). El costo —unos US$ 165 mil con playoffs y US$ 230 mil por temporada completa al año siguiente— lo hizo público el director Mauricio Zunino pese a la cláusula.',
      recortes: 'En 2025 la Intendencia recortó un 10% del presupuesto del canal: se sacó del aire una edición del informativo, se cesaron 30 a 40 jornaleros y Adeom se declaró en preconflicto.',
      note: 'Estas cifras vienen de la prensa, no de una ficha de compra: TV Ciudad no factura como un contrato único identificable en los datos abiertos. Su presupuesto es una línea del gasto de la Intendencia. Los dejamos como contexto, con su enlace a la nota.',
    },
    method: {
      tag: 'Cómo se hizo',
      title: 'Método y límites',
      p1: 'El ledger sale de la base del sitio (Compras Estatales, comprador 98-1) buscando el texto «TV Ciudad» en el título, la descripción del ítem y su clasificación. Aparecen 20 registros; se muestran los más significativos, verificados y enlazados a su ficha. Se aplica el mismo tope de plausibilidad (5e10) que en el resto del sitio, aunque acá ningún registro se acerca a ese límite.',
      p2: 'El subconteo es deliberado y explícito: el costo real del canal es presupuestal, no de licitación, y las compras de equipamiento se adjudican en expedientes cuyo título ya no menciona a TV Ciudad. Por eso el grueso del dinero está en la sección de prensa, no en el ledger. Es un trabajo de transparencia sobre datos abiertos, no una auditoría.',
    },
    sourcesTitle: 'Fuentes',
    disclaimerTitle: 'Sobre estos datos',
    disclaimer: [
      'Este es un trabajo periodístico sobre datos abiertos, no una auditoría. Los montos de compras son los que publica el Estado; el presupuesto, la publicidad y los casos mediáticos, los que publicó la prensa citada.',
      'TV Ciudad no es un comprador ni un proveedor en la base: es una dependencia de la Intendencia. El ledger muestra solo lo que las compras registran con su nombre —una fracción del costo real— y cada registro enlaza a su fuente oficial para que cualquiera lo verifique.',
    ],
  },
  en: {
    common: {
      source: 'Compras Estatales (OCDS) + cited press · verified',
      verified: 'Verified sources',
      readMore: 'Keep reading',
    },
    cat: { equipamiento: 'Equipment', insumos: 'Supplies & printing', obra: 'Works', vehiculo: 'Vehicles' },
    budget: { personal: 'Salaries & staff', funcionamiento: 'Operations', inversion: 'Equipment & investment' },
    kind: { compra: 'Awarded', llamado: 'Tender call' },
    file: { org: 'Intendencia de Montevideo', inciso: 'TV Ciudad · unit of buyer 98-1', period: '2009–2025' },
    kicker: 'Investigation · Departmental spending',
    title: 'TV Ciudad: what the city’s TV channel costs, and why it barely shows up in procurement',
    dek: 'The municipal channel costs between USD 8 and 10 million a year, but that money is budgetary: it isn’t tendered, so it barely appears in the Compras Estatales data. Here is what does get recorded — the equipment and supplies that name the channel, file by file — and what the press reported: the budget, the advertising, the NBA deal and the cuts.',
    chips: ['≈ USD 8–10 M/yr', 'Advertising ×5 (2020→2024)', 'Only 20 records name it'],
    tiles: {
      presupuesto: 'Annual budget', presupuestoSub: '2023 · ≈ USD 7.6 M · IM accounts',
      proyecto: 'Draft budget', proyectoSub: '2026 · ≈ USD 10 M · +33% vs 2023',
      publicidad: 'Advertising income', publicidadSub: '2024 · ×5 since 2020 · ~5% of its cost',
      registros: 'Records that name it', registrosSub: 'in Compras Estatales (2009–2025)',
    },
    ctx: {
      tag: 'The context',
      title: 'A channel funded by budget, not by tender',
      p1: 'TV Ciudad is a unit of the Intendencia de Montevideo, not a buyer with its own number. Its cost — about $304 million in 2023 (≈ USD 7.6 M), and some $405 million projected for 2026 (≈ USD 10 M) — is paid from the city budget: salaries, operations and equipment. That is why it does not exist as a list of contracts you can add up.',
      p2: 'The political argument is old and ongoing: the opposition questions the spend given low ratings and asks to redirect funds to streets and sanitation; the city defends its cultural and news mandate. This investigation separates the two: what the procurement data records (little, but verifiable) and what the press reported (most of the money, as cited context).',
    },
    disc: {
      tag: 'The scale',
      title: 'Where TV Ciudad’s budget goes',
      intro: 'The 2023 budget composition per the Intendencia’s accounts (El Observador). These are not contracts from the data — it is budget — but it shows the channel’s true scale, far above what procurement reveals.',
      chart: 'TV Ciudad budget by line (2023)',
      finding: 'Six of every ten pesos are salaries ($184 M of $304 M). Advertising, which multiplied fivefold between 2020 and 2024 to $15.4 M, covers barely 5% of the channel’s cost (it was 3% in 2023, per El Observador). The taxpayer covers the rest.',
    },
    ledger: {
      tag: 'The evidence',
      title: 'What the data does record',
      intro: 'The Compras Estatales records (buyer 98-1) that name TV Ciudad: studio equipment, vehicles, works and supplies, verified and linked to their file. Only two carry an awarded amount (printing); the rest are tender calls whose amount lives in a separate file. It is what is bought for the channel, not what it costs to run.',
      colDate: 'Date', colObjeto: 'Item', colSup: 'Supplier', colCat: 'Category', colAmount: 'Amount', ficha: 'File',
      sinMonto: 'No awarded amount',
    },
    explore: {
      tag: 'Keep exploring',
      title: 'The rest of the city government',
      intro: 'TV Ciudad is one piece of Montevideo’s spending. For the full picture — the deficit, the discretionary spend, every contract — open the city investigation or the explorer.',
      im: 'See the city government investigation',
      buyer: 'The city government’s contracts (98-1)',
      search: 'Search «TV Ciudad» in the data',
    },
    casos: {
      tag: 'The cases that made the news',
      title: 'What surfaced in the press',
      intro: 'Four fronts of the public debate over TV Ciudad. They come from the cited press, not the procurement data; we add them as context, each with its link.',
      presupuesto: 'The channel’s annual cost, between USD 8 and 10 million per the city accounts and the press, questioned while funds were demanded for streets and sanitation.',
      publicidad: 'Advertising income multiplied fivefold between 2020 and 2024 (from $2.9 M to $15.4 M), yet covers barely 5% of the channel’s cost (3% in 2023, per El Observador). Since 2022 unions such as Fenapes, Adur and Fucvam have advertised on it.',
      nba: 'TV Ciudad’s NBA broadcast carried a confidentiality clause (12.f). The cost — about US$165k with playoffs and US$230k for a full season the next year — was made public by director Mauricio Zunino despite the clause.',
      recortes: 'In 2025 the city cut 10% of the channel’s budget: a news edition went off air, 30 to 40 day laborers were let go, and the union Adeom declared a pre-conflict.',
      note: 'These figures come from the press, not from a procurement file: TV Ciudad does not bill as a single identifiable contract in the open data. Its budget is a line of the city’s spending. We keep them as context, each linked to its article.',
    },
    method: {
      tag: 'How it was done',
      title: 'Method and limits',
      p1: 'The ledger comes from the site’s data (Compras Estatales, buyer 98-1), searching the text «TV Ciudad» in the title, the item description and its classification. Twenty records appear; the most significant are shown, verified and linked to their file. The same plausibility cap (5e10) used across the site is applied, though no record here comes near it.',
      p2: 'The undercount is deliberate and explicit: the channel’s real cost is budgetary, not tendered, and equipment purchases are awarded in files whose titles no longer mention TV Ciudad. That is why most of the money sits in the press section, not the ledger. This is transparency work over open data, not an audit.',
    },
    sourcesTitle: 'Sources',
    disclaimerTitle: 'About this data',
    disclaimer: [
      'This is data journalism over open data, not an audit. Purchase amounts are what the State publishes; the budget, advertising and media cases are what the cited press reported.',
      'TV Ciudad is neither a buyer nor a supplier in the data: it is a unit of the city government. The ledger shows only what procurement records under its name — a fraction of the real cost — and every record links to its official source so anyone can check.',
    ],
  },
} as const

export function tvcContent(locale: string) {
  return (TVC_CONTENT as Record<string, typeof TVC_CONTENT.es>)[locale] ?? TVC_CONTENT.es
}
