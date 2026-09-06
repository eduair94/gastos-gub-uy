/**
 * Investigación · Los talleres de la Intendencia de Soriano.
 *
 * POR QUÉ ESTA PIEZA EXISTE. Porque tiene dos mitades y ninguna se sostiene sola. La primera es
 * de la Junta Departamental: un pedido de informes midió $207 millones en talleres privados y un
 * camión que entró 96 veces al mismo taller. La segunda es nuestra: ese gasto no está en el
 * registro público de compras, porque la Intendencia de Soriano publica llamados y nunca publica
 * adjudicaciones. La primera mitad da la cifra. La segunda explica por qué nadie la vio antes.
 *
 * LAS CIFRAS VIENEN DE DOS FUENTES Y LA PÁGINA DICE SIEMPRE CUÁL:
 *   1. El pedido de informes del edil Diego Guevara, contestado por la Intendencia y publicado
 *      por El Observador y Soriano al día. De ahí salen los montos por taller, las 96 entradas,
 *      los tipos de reparación y el tamaño de la flota. No los medimos nosotros.
 *   2. Nuestra medición sobre el corpus OCDS, el 04-09-2026. De ahí sale el cero de
 *      adjudicaciones, la comparación entre las 19 intendencias, los llamados de compra de
 *      vehículos, el cruce con el RUPE y el conteo de resoluciones del Tribunal de Cuentas.
 *
 * TRES COSAS QUE NO SE PUEDEN ESCRIBIR EN ESTA PÁGINA, y por eso están acá arriba:
 *   - Que el Tribunal de Cuentas observó los pagos a talleres. Nuestra copia registra 13
 *     resoluciones por gastos observados de la Intendencia, pero la resolución no dice qué gasto
 *     se observó: ese detalle vive sólo en el PDF de cada expediente.
 *   - Que las empresas del RUPE son los talleres. El cruce es por nombre y departamento. El RUPE
 *     no publica el rubro y la Intendencia no publicó ningún RUT.
 *   - Que hay una irregularidad. Ningún organismo lo resolvió. La discusión es sobre control y
 *     publicidad del gasto.
 *
 * El total de "los otros 32 talleres" es una RESTA nuestra contra un total que se publicó
 * redondeado a $207 millones. Por eso va marcado como aproximado y nunca se usa para titular.
 */

export type Locale = 'es' | 'en'

/** Un taller del pedido de informes. `uyu` es lo facturado entre enero 2021 y febrero 2026. */
export interface Taller { key: string, name: string, uyu: number }

/** Los seis que concentran el gasto, según la respuesta de la Intendencia. */
export const TALLERES: Taller[] = [
  { key: 'zubiaurre', name: 'José Zubiaurre', uyu: 39_324_824 },
  { key: 'laruta', name: 'La Ruta', uyu: 35_034_386 },
  { key: 'barreto', name: 'Electromecánica Barreto', uyu: 19_136_771 },
  { key: 'ruiz', name: 'Plácido Ruiz', uyu: 18_553_431 },
  { key: 'gonzalez', name: 'Gonzalo González', uyu: 12_572_475 },
  { key: 'feller', name: 'Tornería Feller', uyu: 12_006_299 },
]

/** Cifras del pedido de informes. Ninguna es nuestra. */
export const INFORME = {
  totalUyu: 207_000_000,
  totalUsd: 5_000_000,
  talleres: 38,
  flota: 235,
  desde: '2021-01',
  hasta: '2026-02',
  /** Reparaciones del taller Zubiaurre entre enero 2021 y julio 2026. */
  reparacionesZubiaurre: 1535,
  edilesFa: 11,
}

/** El resto, por resta contra un total redondeado. Aproximado, y así se publica. */
export const OTROS_TALLERES = {
  cantidad: 32,
  uyuAprox: INFORME.totalUyu - TALLERES.reduce((s, t) => s + t.uyu, 0),
}

/** El camión del titular. Todo sale del pedido de informes. */
export const CAMION = {
  matricula: 'KOF 0132',
  marca: 'Mercedes Benz',
  taller: 'José Zubiaurre',
  entradas: 96,
  desde: '2021-01',
  hasta: '2026-07',
  meses: 66,
  entradas2025: 22,
  entradas2026: 12,
  mesesDe2026: 7,
  /** 96 entradas menos los tres tipos que la respuesta detalla. */
  sinDesglosar: 33,
  fotonMin: 62,
  fotonMax: 86,
  fotonUnidades: 7,
}

/** Los tres tipos de reparación que la respuesta detalla, sobre las 96 entradas. */
export const REPARACIONES = [
  { key: 'suspension', n: 24 },
  { key: 'motor', n: 20 },
  { key: 'frenos', n: 19 },
  { key: 'resto', n: CAMION.sinDesglosar },
]

/**
 * Lo que cada intendencia publicó en el portal del Estado desde 2021.
 * Medido el 04-09-2026 sobre `releases`, agrupando por `buyer.id`.
 * `awards` cuenta registros con adjudicación, no pesos.
 */
export const INTENDENCIAS = [
  { key: 'montevideo', name: 'Montevideo', records: 101_485, awards: 78_514 },
  { key: 'canelones', name: 'Canelones', records: 8474, awards: 4525 },
  { key: 'paysandu', name: 'Paysandú', records: 5319, awards: 1608 },
  { key: 'colonia', name: 'Colonia', records: 3702, awards: 2370 },
  { key: 'florida', name: 'Florida', records: 2614, awards: 2149 },
  { key: 'durazno', name: 'Durazno', records: 1056, awards: 148 },
  { key: 'sanjose', name: 'San José', records: 931, awards: 386 },
  { key: 'treintaytres', name: 'Treinta y Tres', records: 872, awards: 311 },
  { key: 'tacuarembo', name: 'Tacuarembó', records: 789, awards: 296 },
  { key: 'maldonado', name: 'Maldonado', records: 773, awards: 60 },
  { key: 'rionegro', name: 'Río Negro', records: 621, awards: 139 },
  { key: 'rivera', name: 'Rivera', records: 583, awards: 185 },
  { key: 'flores', name: 'Flores', records: 555, awards: 224 },
  { key: 'lavalleja', name: 'Lavalleja', records: 517, awards: 1 },
  { key: 'salto', name: 'Salto', records: 416, awards: 172 },
  { key: 'soriano', name: 'Soriano', records: 373, awards: 0 },
  { key: 'rocha', name: 'Rocha', records: 366, awards: 0 },
  { key: 'cerrolargo', name: 'Cerro Largo', records: 312, awards: 35 },
  { key: 'artigas', name: 'Artigas', records: 266, awards: 118 },
]

/** Nuestra medición sobre el corpus, toda del 04-09-2026. */
export const CORPUS = {
  fecha: '2026-09-04',
  registrosTotales: 2_170_000,
  buyerId: '95-1',
  sorianoRegistros: 548,
  sorianoDesde: 2011,
  sorianoRegistros2021: 373,
  sorianoAdjudicaciones: 0,
  sorianoPesos: 0,
  /** Llamados por reparación de vehículos o servicio de taller, en toda la serie. */
  llamadosTaller: 0,
  /** Llamados para comprar camiones o camionetas cero kilómetro desde 2021. */
  llamadosCompraVehiculos: 12,
  /** Adjudicaciones de los tres RUT del cruce RUPE, en todo el corpus. */
  adjudicacionesTalleres: 0,
}

/** Resoluciones del Tribunal de Cuentas sobre la Intendencia. Nuestra copia llega hasta 2022. */
export const TCR = {
  desde: 2018,
  hasta: 2022,
  resoluciones: 34,
  gastosObservados: 13,
  sobreTalleres: 0,
}

/** Cruce con el RUPE. Coincidencia por nombre y departamento, no confirmación. */
export interface RupeMatch { key: string, prensa: string, rupe: string, rut: string, domicilio: string }
export const RUPE_MATCHES: RupeMatch[] = [
  { key: 'zubiaurre', prensa: 'José Zubiaurre', rupe: 'ZUBIAURRE SASEN JOSE FERNANDO', rut: '180285360013', domicilio: 'Ruta 14 km 3, Mercedes' },
  { key: 'feller', prensa: 'Tornería Feller', rupe: 'TORNERIA FELLER HERMANOS SAS', rut: '220206750010', domicilio: 'Ruta 2 km 207.800, José E. Rodó' },
  { key: 'ruiz', prensa: 'Plácido Ruiz', rupe: 'RUIZ OLANO PLACIDO', rut: '180290610014', domicilio: 'Gral. Artigas 1064, Dolores' },
]

export const SOR_SOURCES = [
  {
    key: 'prensa',
    items: [
      { label: 'El Observador — un camión ingresó 96 veces al mismo taller en cinco años y medio (04/09/2026)', url: 'https://www.elobservador.com.uy/nacional/fa-pide-auditoria-reparacion-vehiculos-la-intendencia-soriano-un-camion-ingreso-96-veces-al-mismo-taller-cinco-anos-y-medio-n6056144' },
      { label: 'Soriano al día — el Frente Amplio cuestionó gastos en talleres contratados (15/08/2026)', url: 'https://www.sorianoaldia.com.uy/2026/08/15/el-frente-amplio-cuestiono-gastos-millonarios-en-talleres-contratados-por-la-intendencia-de-soriano/' },
      { label: 'Prensa Mercosur — el pedido de auditoría al Tribunal de Cuentas (04/09/2026)', url: 'https://prensamercosur.org/2026/09/04/uruguay-frente-amplio-pide-auditoria-por-millonarios-gastos-en-reparacion-de-vehiculos-de-la-intendencia-de-soriano/' },
      { label: 'Búsqueda — la imputación del intendente Besozzi (marzo 2025)', url: 'https://www.busqueda.com.uy/politica/guillermo-besozzi-exintendente-soriano-fue-imputado-varios-delitos-corrupcion-y-esta-arresto-domiciliario-n5397012' },
      { label: 'Infobae — la fiscalía pide el sobreseimiento (05/03/2026)', url: 'https://www.infobae.com/america/america-latina/2026/03/05/piden-sobreseimiento-de-intendente-uruguayo-imputado-por-varios-delitos-de-corrupcion-me-hicieron-pasar-mal/' },
    ],
  },
  {
    key: 'oficial',
    items: [
      { label: 'Portal de Compras Estatales — llamados de la Intendencia de Soriano', url: 'https://www.gub.uy/agencia-compras-contrataciones-estado/' },
      { label: 'RUPE — Registro Único de Proveedores del Estado', url: 'https://www.gub.uy/agencia-compras-contrataciones-estado/politicas-y-gestion/registro-unico-proveedores-del-estado-rupe' },
      { label: 'Tribunal de Cuentas — buscador de resoluciones', url: 'https://www.tcr.gub.uy/resoluciones_busqueda.php' },
      { label: 'Intendencia de Soriano — sitio oficial', url: 'https://www.soriano.gub.uy/' },
    ],
  },
]

export const SOR_CARD = {
  es: {
    eyebrow: 'Investigación propia · Soriano 2021–2026',
    title: 'Los talleres que el registro público no ve',
    dek: 'Un pedido de informes midió $207 millones en talleres privados y un camión que entró 96 veces al mismo taller. Nada de eso está en el registro de compras del Estado: la Intendencia de Soriano publica llamados y nunca publica adjudicaciones.',
    tags: ['96 entradas', 'cero adjudicaciones', 'Medición propia'],
  },
  en: {
    eyebrow: 'Own investigation · Soriano 2021-2026',
    title: 'The repair shops the public record cannot see',
    dek: 'A council information request measured $207 million spent on private repair shops, and one truck that entered the same shop 96 times. None of it is in the state procurement record: the Soriano departmental government publishes calls and never publishes awards.',
    tags: ['96 shop visits', 'zero awards', 'Own measurement'],
  },
} as const

export const SOR_CONTENT = {
  es: {
    kicker: 'Investigación propia · dos fuentes',
    title: 'Los talleres que el registro público no ve',
    dek: 'La Junta Departamental de Soriano midió el gasto en talleres privados y encontró un camión que entró 96 veces al mismo taller. Nosotros buscamos ese gasto en el registro de compras del Estado. No hay un peso, y la razón es medible.',
    fileScope: '2,17 millones de registros buscados',
    filePeriod: '2011 → 2026',
    fileSource: 'Pedido de informes · corpus OCDS · RUPE · Tribunal de Cuentas',
    chips: ['Intendencia de Soriano', 'KOF 0132', '38 talleres', 'Cero adjudicaciones'],

    tiles: [
      { l: 'en talleres privados', s: 'enero 2021 a febrero 2026, según el pedido de informes' },
      { l: 'entradas del KOF 0132', s: 'al taller Zubiaurre, entre enero 2021 y julio 2026' },
      { l: 'talleres contratados', s: 'seis concentran el 65% del gasto' },
      { l: 'vehículos en la flota', s: 'camiones, utilitarios y otros' },
    ],

    informeTag: 'El pedido de informes',
    informeTitle: 'Lo que contestó la Intendencia',
    informe: [
      'El edil Diego Guevara pidió el detalle del gasto en reparación de vehículos. La Intendencia contestó por escrito, con la firma del intendente interino Raúl Bruno. La respuesta dice que entre enero de 2021 y febrero de 2026 la comuna pagó $207 millones a 38 talleres privados. Son unos 5 millones de dólares.',
      'Seis talleres se llevan cerca del 65% de esa cifra. El mayor es el taller de José Zubiaurre, con $39.324.824. La misma respuesta indica que hizo 1.535 reparaciones de vehículos municipales entre enero de 2021 y julio de 2026.',
      'La bancada del Frente Amplio, de 11 ediles, votó pedir que el Tribunal de Cuentas audite cómo la Intendencia contrata talleres y proveedores externos. El pedido necesita un tercio de la Junta Departamental.',
    ],
    colTaller: 'Taller',
    colMonto: 'Facturado',
    otrosLabel: 'Los otros 32 talleres',
    informeNota: 'Los seis montos salen del pedido de informes. El renglón de los otros 32 es una resta contra el total, que se publicó redondeado a $207 millones: por eso es aproximado.',

    camionTag: 'El vehículo',
    camionTitle: 'Una entrada al taller cada 21 días',
    camion: [
      'El camión Mercedes Benz de matrícula KOF 0132 entró 96 veces al taller Zubiaurre entre enero de 2021 y julio de 2026. Son 66 meses. El promedio da una entrada cada 21 días.',
      'El ritmo sube. En 2025 el camión entró 22 veces. En los primeros siete meses de 2026 entró 12 veces. La respuesta detalla tres tipos de reparación repetidos y no cubre el resto de las entradas.',
      'No es un caso aislado. Otros siete camiones Foton suman entre 62 y 86 reparaciones cada uno en la misma ventana. El intendente Guillermo Besozzi atribuyó la frecuencia del KOF 0132 a la antigüedad del vehículo.',
    ],
    camionQuote: 'En una flota de estas dimensiones existe permanentemente un determinado número de unidades sometidas a servicio, a mantenimiento preventivo o reparación.',
    camionQuoteWho: 'Guillermo Besozzi, intendente de Soriano',
    repLabels: { suspension: 'Suspensión', motor: 'Motor', frenos: 'Frenos', resto: 'Sin desglosar' },
    repNota: 'Los tres tipos salen del pedido de informes. El renglón «sin desglosar» es la resta contra las 96 entradas: la respuesta no dice qué se reparó en las demás.',

    ceroTag: 'Nuestra medición',
    ceroTitle: 'El registro de compras del Estado no ve un peso',
    ceroHead: 'Adjudicaciones que la Intendencia de Soriano publicó desde 2021',
    ceroSub: 'sobre 373 registros suyos en el portal del Estado',
    cero: [
      'La plataforma indexa 2,17 millones de registros del portal de compras públicas desde 2002. La Intendencia de Soriano está en ese corpus con 548 registros desde 2011. Todos son llamados. Ninguno trae adjudicación, así que el total normalizado es cero.',
      'La Intendencia publica cuando abre un llamado y no publica cuando adjudica. Los $207 millones en talleres nunca entraron al registro por otra razón: en toda la serie no hay un solo llamado por reparación de vehículos ni por servicio de taller mecánico. Ese gasto salió por compra directa, sin llamado previo.',
      'Sí hay llamados para comprar vehículos. Contamos 12 desde 2021, por camiones y camionetas cero kilómetro. En 2026 la Intendencia llamó por cuatro camiones utilitarios, dos volcadoras de diez toneladas y una de tres. Sin adjudicación publicada no sabemos cuántas de esas compras se concretaron.',
    ],

    compTag: 'La comparación',
    compTitle: 'Dos intendencias de diecinueve publican cero',
    compIntro: 'Registros publicados desde 2021 y cuántos traen adjudicación. La barra mide esa proporción, no el gasto.',
    colIntendencia: 'Intendencia',
    colRegistros: 'Registros',
    colAdjudicaciones: 'Con adjudicación',
    compNota: 'Soriano y Rocha publican cero adjudicaciones. Lavalleja publica una. Las demás publican de a cientos o miles. La proporción no dice si una intendencia gasta bien: dice si su gasto se puede leer.',

    rupeTag: 'Quiénes son',
    rupeTitle: 'Tres de los seis figuran en el registro de proveedores',
    rupeIntro: 'La Intendencia no publicó el RUT de ningún taller. Buscamos los seis nombres en el RUPE, el registro público de proveedores del Estado.',
    colPrensa: 'Nombre en el pedido de informes',
    colRupe: 'Denominación social en el RUPE',
    colRut: 'RUT',
    colDomicilio: 'Domicilio',
    rupeNota: 'La coincidencia es por nombre y departamento. El RUPE no publica el rubro de la empresa, así que esto no confirma que sean los talleres. Los tres figuran en estado activo.',
    rupeExtra: 'Ninguno de los tres RUT tiene una sola adjudicación en los 2,17 millones de registros del corpus. Le venden a la Intendencia, que es justamente el comprador que no publica.',

    tcrTag: 'El Tribunal de Cuentas',
    tcrTitle: 'Ya venía observando gasto de la Intendencia',
    tcr: [
      'Nuestra copia de resoluciones del Tribunal de Cuentas cubre 2018 a 2022. En esa ventana hay 34 resoluciones sobre la Intendencia de Soriano. Trece son por gastos observados o por reiteraciones de gastos observados, trimestre a trimestre.',
      'La resolución no dice qué gasto se observó. Ese detalle vive sólo en el PDF de cada expediente. No se puede afirmar que el Tribunal observó los pagos a talleres, y esta página no lo afirma.',
    ],
    tcrFindingKicker: 'Lo que no se puede decir',
    tcrFindingBody: 'Trece resoluciones por gastos observados no son trece observaciones a los talleres. Son trece trimestres en los que la Contadora Delegada informó gastos observados de la Intendencia, sobre cualquier concepto.',

    ctxTag: 'Contexto',
    ctxTitle: 'La causa judicial del intendente es otro expediente',
    ctx: [
      'Guillermo Besozzi fue imputado en marzo de 2025 por varios delitos de corrupción y estuvo con arresto domiciliario. Ganó la elección departamental en mayo de 2025 y asumió por cuarta vez.',
      'En marzo de 2026 la fiscal Luisa Vago pidió el sobreseimiento para él y para seis jerarcas, y la causa se cerró. Ese expediente no incluye el gasto en talleres.',
      'Sobre la auditoría que pide el Frente Amplio, Besozzi dijo que le parece legítima y que la administración está tranquila frente a un eventual control.',
    ],

    limitesTitle: 'Los límites de esta pieza',
    limites: [
      'Los montos por taller, las 96 entradas y el tamaño de la flota son del pedido de informes. No los medimos nosotros y no podemos verificarlos contra el registro público, porque ahí no están.',
      'El cruce con el RUPE es por nombre y departamento. Sin el RUT que la Intendencia le factura a cada taller, la identificación no está confirmada.',
      'Nuestra copia de resoluciones del Tribunal de Cuentas llega hasta 2022. Un conteo sobre 2023 en adelante daría otro número.',
      'El total de los otros 32 talleres es una resta contra una cifra redondeada. Sirve para dimensionar, no para citar.',
      'Nada de esto describe una irregularidad probada. La discusión es sobre control y publicidad del gasto.',
    ],

    faltaTitle: 'Los cuatro datos que cierran el caso',
    falta: [
      'El RUT que la Intendencia le factura a cada taller. Confirma o descarta el cruce con el RUPE.',
      'El detalle de cada orden de compra: qué se reparó en cada una de las 96 entradas y a qué precio.',
      'La capacidad del taller municipal, que la Intendencia dice priorizar.',
      'La titularidad de los seis talleres.',
    ],
    faltaNota: 'Ninguno de los cuatro está hoy en un dato abierto. Los tres primeros los tiene que dar la Intendencia, o la auditoría del Tribunal de Cuentas si la Junta la vota.',

    sourcesTag: 'Fuentes',
    sourcesTitle: 'De dónde sale cada cifra',
    sourcesP: 'Las cifras del gasto son del pedido de informes publicado por la prensa. Las mediciones sobre el corpus, el RUPE y el Tribunal de Cuentas son nuestras, del 4 de setiembre de 2026.',
    srcPrensa: 'Prensa y pedido de informes',
    srcOficial: 'Registros oficiales',
  },

  en: {
    kicker: 'Own investigation · two sources',
    title: 'The repair shops the public record cannot see',
    dek: 'The Soriano departmental council measured spending on private repair shops and found a truck that entered the same shop 96 times. We looked for that spending in the state procurement record. Not one peso is there, and the reason is measurable.',
    fileScope: '2.17 million records searched',
    filePeriod: '2011 → 2026',
    fileSource: 'Information request · OCDS corpus · RUPE · Court of Accounts',
    chips: ['Soriano departmental government', 'KOF 0132', '38 repair shops', 'Zero awards'],

    tiles: [
      { l: 'to private repair shops', s: 'January 2021 to February 2026, per the information request' },
      { l: 'shop visits by KOF 0132', s: 'to the Zubiaurre shop, January 2021 to July 2026' },
      { l: 'repair shops hired', s: 'six take 65% of the spending' },
      { l: 'vehicles in the fleet', s: 'trucks, utility vehicles and others' },
    ],

    informeTag: 'The information request',
    informeTitle: 'What the departmental government answered',
    informe: [
      'Councillor Diego Guevara asked for the detail of vehicle repair spending. The departmental government answered in writing, signed by acting intendant Raúl Bruno. The answer says that between January 2021 and February 2026 it paid $207 million to 38 private repair shops. That is about 5 million dollars.',
      'Six shops take close to 65% of that figure. The largest is José Zubiaurre\'s shop, with $39,324,824. The same answer states it carried out 1,535 repairs of municipal vehicles between January 2021 and July 2026.',
      'The Frente Amplio caucus, 11 councillors, voted to ask the Court of Accounts to audit how the departmental government hires repair shops and outside suppliers. The request needs one third of the council.',
    ],
    colTaller: 'Repair shop',
    colMonto: 'Billed',
    otrosLabel: 'The other 32 shops',
    informeNota: 'The six amounts come from the information request. The line for the other 32 is a subtraction against the total, which was published rounded to $207 million: it is therefore approximate.',

    camionTag: 'The vehicle',
    camionTitle: 'One shop visit every 21 days',
    camion: [
      'The Mercedes Benz truck with plate KOF 0132 entered the Zubiaurre shop 96 times between January 2021 and July 2026. That is 66 months. The average is one visit every 21 days.',
      'The pace rises. In 2025 the truck went in 22 times. In the first seven months of 2026 it went in 12 times. The answer details three repeated repair types and does not cover the remaining visits.',
      'It is not an isolated case. Seven other Foton trucks add between 62 and 86 repairs each over the same window. Intendant Guillermo Besozzi attributed the frequency of the KOF 0132 to the vehicle\'s age.',
    ],
    camionQuote: 'In a fleet of these dimensions there is permanently a certain number of units under service, preventive maintenance or repair.',
    camionQuoteWho: 'Guillermo Besozzi, intendant of Soriano',
    repLabels: { suspension: 'Suspension', motor: 'Engine', frenos: 'Brakes', resto: 'Not broken down' },
    repNota: 'The three types come from the information request. The "not broken down" line is the subtraction against the 96 visits: the answer does not say what was repaired in the rest.',

    ceroTag: 'Our measurement',
    ceroTitle: 'The state procurement record sees not one peso',
    ceroHead: 'Awards published by the Soriano departmental government since 2021',
    ceroSub: 'out of its own 373 records on the state portal',
    cero: [
      'The platform indexes 2.17 million records from the public procurement portal since 2002. The Soriano departmental government is in that corpus with 548 records since 2011. All of them are calls. None carries an award, so the normalised total is zero.',
      'It publishes when it opens a call and does not publish when it awards. The $207 million on repair shops never entered the record for a second reason: in the whole series there is not one call for vehicle repair or mechanical shop services. That spending went through direct purchase, with no prior call.',
      'There are calls to buy vehicles. We counted 12 since 2021, for brand-new trucks and pickups. In 2026 it called for four utility trucks, two ten-tonne tippers and one three-tonne tipper. With no published award we do not know how many of those purchases went through.',
    ],

    compTag: 'The comparison',
    compTitle: 'Two of nineteen departmental governments publish zero',
    compIntro: 'Records published since 2021 and how many carry an award. The bar measures that ratio, not spending.',
    colIntendencia: 'Departmental government',
    colRegistros: 'Records',
    colAdjudicaciones: 'With award',
    compNota: 'Soriano and Rocha publish zero awards. Lavalleja publishes one. The rest publish hundreds or thousands. The ratio does not say whether a departmental government spends well: it says whether its spending can be read.',

    rupeTag: 'Who they are',
    rupeTitle: 'Three of the six appear in the supplier registry',
    rupeIntro: 'The departmental government published no tax ID for any shop. We searched the six names in RUPE, the public registry of state suppliers.',
    colPrensa: 'Name in the information request',
    colRupe: 'Legal name in RUPE',
    colRut: 'Tax ID',
    colDomicilio: 'Address',
    rupeNota: 'The match is by name and department. RUPE does not publish a company\'s line of business, so this does not confirm they are the shops. All three are listed as active.',
    rupeExtra: 'None of the three tax IDs has a single award in the 2.17 million records of the corpus. They sell to the departmental government, which is precisely the buyer that does not publish.',

    tcrTag: 'The Court of Accounts',
    tcrTitle: 'It was already flagging the government\'s spending',
    tcr: [
      'Our copy of Court of Accounts rulings covers 2018 to 2022. In that window there are 34 rulings on the Soriano departmental government. Thirteen concern flagged spending or repeat spending over a flag, quarter by quarter.',
      'The ruling does not say which spending was flagged. That detail lives only in the PDF of each file. It cannot be claimed that the Court flagged the payments to repair shops, and this page does not claim it.',
    ],
    tcrFindingKicker: 'What cannot be said',
    tcrFindingBody: 'Thirteen rulings on flagged spending are not thirteen objections to the repair shops. They are thirteen quarters in which the delegate comptroller reported flagged spending by the departmental government, on any item.',

    ctxTag: 'Context',
    ctxTitle: 'The intendant\'s criminal case is a separate file',
    ctx: [
      'Guillermo Besozzi was charged in March 2025 with several corruption offences and was under house arrest. He won the departmental election in May 2025 and took office for a fourth time.',
      'In March 2026 prosecutor Luisa Vago requested dismissal for him and six senior officials, and the case was closed. That file does not include the repair shop spending.',
      'On the audit the Frente Amplio is requesting, Besozzi said he considers it legitimate and that the administration is calm about eventual oversight.',
    ],

    limitesTitle: 'The limits of this piece',
    limites: [
      'The amounts per shop, the 96 visits and the fleet size come from the information request. We did not measure them and cannot verify them against the public record, because they are not there.',
      'The RUPE match is by name and department. Without the tax ID the departmental government bills each shop under, the identification is not confirmed.',
      'Our copy of Court of Accounts rulings ends in 2022. A count from 2023 onward would give a different number.',
      'The total for the other 32 shops is a subtraction against a rounded figure. It is good for scale, not for quoting.',
      'None of this describes a proven irregularity. The discussion is about control and publicity of spending.',
    ],

    faltaTitle: 'The four facts that would close the case',
    falta: [
      'The tax ID the departmental government bills each shop under. It confirms or rules out the RUPE match.',
      'The detail of each purchase order: what was repaired on each of the 96 visits and at what price.',
      'The capacity of the municipal workshop, which the departmental government says it prioritises.',
      'The ownership of the six repair shops.',
    ],
    faltaNota: 'None of the four is in open data today. The first three must come from the departmental government, or from the Court of Accounts audit if the council votes it.',

    sourcesTag: 'Sources',
    sourcesTitle: 'Where each figure comes from',
    sourcesP: 'The spending figures come from the information request published by the press. The measurements on the corpus, RUPE and the Court of Accounts are ours, dated 4 September 2026.',
    srcPrensa: 'Press and information request',
    srcOficial: 'Official records',
  },
} as const

export function sorContent(locale: string) {
  return SOR_CONTENT[(locale === 'en' ? 'en' : 'es') as Locale]
}

/** La tarjeta del índice, por idioma. Vive acá y no en `investigaciones.ts`. */
export function sorianoCard(locale: string) {
  return SOR_CARD[(locale === 'en' ? 'en' : 'es') as Locale]
}
