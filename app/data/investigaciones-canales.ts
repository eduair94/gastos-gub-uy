/**
 * Investigación · Canales 4, 10 y 12 — el ingreso publicado contra la pauta oficial.
 *
 * DOS FUENTES, Y NO SE MEZCLAN.
 *
 *   1. El INGRESO y el RESULTADO de cada canal salen de los balances contables oficiales.
 *      Los publicó Gustavo Gómez (OBSERVACOM) el 17/08/2026, en tres cuadros con la marca
 *      Info&Com. Son pesos corrientes. Acá se copian tal cual; no se recalculan.
 *   2. La PAUTA sale de la base del sitio, réplica de Compras Estatales en OCDS. Se mide
 *      por RUT de proveedor y se reparte línea por línea, con el método de todo el sitio.
 *
 * Cada cifra de pauta la reproduce scripts/verify/verify-canales-tv.ts contra Mongo.
 *
 * TRES TRAMPAS QUE YA COSTARON UNA VUELTA.
 *
 *   - Monte Carlo S.A. (21-015368-0016) NO es Canal 4. Es otro RUT del mismo grupo, con
 *     montos diez veces menores, y aparece en las listas de radio. Canal 4 es Monte Carlo
 *     TV S.A. (21-093640-0013). Sumar los dos mezcla dos empresas.
 *   - El ejercicio de Canal 4 cierra en JUNIO. Su porcentaje compara la pauta de julio a
 *     junio contra el ingreso de ese mismo ejercicio. Los canales 10 y 12 cierran en
 *     diciembre y van por año calendario.
 *   - Canal 4 y Canal 12 cobran el mismo monto al centavo en las compras de Turismo. Eso
 *     es un precio unitario que fijó el comprador, no una coincidencia entre privados.
 *
 * LO QUE NINGUNA FRASE DE ESTA PIEZA PUEDE DECIR. La pauta medida es un PISO, no un total.
 * El portal registra al proveedor que factura: si el Estado le paga a una agencia, el
 * registro nombra a la agencia. El texto dice «pauta que deja rastro» en todos lados.
 */

export interface CanalBalance {
  key: 'c4' | 'c10' | 'c12'
  /** Nombre legal del titular, tal como figura como proveedor en el portal. */
  legal: string
  rut: string
  supplierId: string
  /** Mes de cierre del ejercicio: define la ventana con la que se compara la pauta. */
  close: 'junio' | 'diciembre'
  ingresos2024: number
  ingresos2025: number
  /** Variación de ingresos publicada por la fuente, en puntos porcentuales enteros. */
  ingresosVarPct: number
  resultado2024: number
  resultado2025: number
}

export interface CanalPauta {
  key: 'c4' | 'c10' | 'c12'
  /** Pauta del ejercicio 2024, en pesos corrientes. Canal 4 va de julio a junio. */
  pauta2024: number
  /** Pauta del ejercicio 2025, en pesos corrientes. Canal 4 va de julio a junio. */
  pauta2025: number
  /** Pauta sobre ingreso del mismo ejercicio, en porcentaje. */
  share2024: number
  share2025: number
  /** Todo lo adjudicado desde 2003, en pesos corrientes sumados sin deflactar. */
  totalNominal: number
  contratos: number
  compradores: number
  primerAnio: number
  ultimoAnio: number
}

export interface CanalYear { year: number, value: number }
export interface RepartoRow { key: string, value: number, share: number }

/**
 * Balances contables 2024 y 2025, en pesos corrientes.
 * Fuente: cuadros de Info&Com publicados por Gustavo Gómez (OBSERVACOM), 17/08/2026.
 */
export const CANAL_BALANCES: CanalBalance[] = [
  { key: 'c10', legal: 'S.A. Emisoras de Televisión y Anexos SAETA', rut: '21-013421-0018', supplierId: 'R/210134210018', close: 'diciembre', ingresos2024: 1034578328, ingresos2025: 981711275, ingresosVarPct: -5, resultado2024: 10267203, resultado2025: 13666202 },
  { key: 'c12', legal: 'Sociedad Televisora Larrañaga S.A.', rut: '21-022373-0017', supplierId: 'R/210223730017', close: 'diciembre', ingresos2024: 1069394015, ingresos2025: 974630259, ingresosVarPct: -9, resultado2024: 1023599, resultado2025: -150267565 },
  { key: 'c4', legal: 'Monte Carlo TV S.A.', rut: '21-093640-0013', supplierId: 'R/210936400013', close: 'junio', ingresos2024: 848580235, ingresos2025: 895898709, ingresosVarPct: 6, resultado2024: 47961449, resultado2025: 3027313 },
]

/**
 * Pauta oficial adjudicada a cada canal, medida en la base del sitio.
 * `share` divide la pauta del ejercicio por el ingreso del MISMO ejercicio, así que
 * compara pesos del mismo año y no necesita deflactar.
 */
export const CANAL_PAUTA: CanalPauta[] = [
  { key: 'c10', pauta2024: 4885264.75, pauta2025: 2670764.75, share2024: 0.472, share2025: 0.272, totalNominal: 151482873.5, contratos: 182, compradores: 25, primerAnio: 2004, ultimoAnio: 2025 },
  { key: 'c12', pauta2024: 4646213.11, pauta2025: 2592213.11, share2024: 0.434, share2025: 0.266, totalNominal: 151210887.68, contratos: 165, compradores: 24, primerAnio: 2003, ultimoAnio: 2025 },
  { key: 'c4', pauta2024: 5327000, pauta2025: 3619213.11, share2024: 0.628, share2025: 0.404, totalNominal: 136777121.87, contratos: 166, compradores: 23, primerAnio: 2004, ultimoAnio: 2025 },
]

/**
 * Pauta a los tres canales sumada, por año, deflactada por Unidad Indexada del BCU a
 * pesos de agosto de 2026. Los pesos corrientes de años distintos no se comparan; ésta
 * es la serie que sí se compara.
 *
 * OJO CON 2015. La tabla `exchange_rates` no tiene Unidad Indexada para mayo, junio ni
 * julio de 2015. El deflactor toma el mes anterior más cercano que sí la tiene. Dejar
 * esos meses en pesos corrientes hundía 2015 en 2,6 millones y era un artefacto de la
 * tabla, no un movimiento del gasto.
 */
export const CANAL_PAUTA_REAL: CanalYear[] = [
  { year: 2012, value: 79029682 },
  { year: 2013, value: 78337112 },
  { year: 2014, value: 118263463 },
  { year: 2015, value: 58782279 },
  { year: 2016, value: 48715383 },
  { year: 2017, value: 11464312 },
  { year: 2018, value: 40720144 },
  { year: 2019, value: 39831316 },
  { year: 2020, value: 30870543 },
  { year: 2021, value: 25810638 },
  { year: 2022, value: 41326734 },
  { year: 2023, value: 34733249 },
  { year: 2024, value: 15433999 },
  { year: 2025, value: 8175996 },
]

/**
 * La compra de televisión del Ministerio de Turismo, repetida al centavo en 2024 y 2025.
 * Adjudicaciones ocds-yfs5dr-1171329 (27/08/2024) y ocds-yfs5dr-1242895 (15/05/2025).
 * Cada una totaliza 9.771.857 pesos y reparte los mismos precios unitarios.
 */
export const TURISMO_REPARTO: RepartoRow[] = [
  { key: 'c10', value: 2670764.75, share: 27.3 },
  { key: 'c12', value: 2592213.11, share: 26.5 },
  { key: 'c4', value: 2592213.11, share: 26.5 },
  { key: 'c5', value: 1916666, share: 19.6 },
]
export const TURISMO_TOTAL = 9771856.98
export const TURISMO_FICHAS = [
  { recordId: 'adjudicacion-1171329', adjudicada: '2024-08-27' },
  { recordId: 'adjudicacion-1242895', adjudicada: '2025-05-15' },
]

/**
 * La campaña nacional de Turismo de diciembre de 2023 (ocds-yfs5dr-1074739): 185
 * proveedores en una sola adjudicación de 20.189.196 pesos. Es el mejor retrato del
 * reparto entre Montevideo y el resto del país.
 */
export const CAMPANA_2023 = {
  recordId: 'adjudicacion-1074739',
  fecha: '2023-12-28',
  total: 20189195.71,
  proveedores: 185,
  tresCanales: 13600000,
  canal5: 3416000,
  resto: 3173195.71,
  restoProveedores: 181,
  tresCanalesPct: 67,
  canal5Pct: 17,
  restoPct: 16,
}

/**
 * Cifras del hueco: lo que el portal NO alcanza a mostrar.
 * `antel*` sale de medir al comprador 65-1 contra los 33 códigos de la clase
 * «Publicidad y propaganda». `claseTotal` es esa clase entera, todos los receptores.
 */
export const HUECO = {
  antelAdjudicaciones: 262,
  antelLineasPublicidad: 5,
  antelPublicidadUYU: 1537979,
  antelPrimerAnio: 2025,
  antelUltimoAnio: 2026,
  antelTV: 0,
  claseTotalUYU: 5993843545,
  claseCodigos: 33,
  claseDesde: 2004,
  claseHasta: 2026,
  /** Puesto de cada canal en el ranking de receptores que publica /pauta. */
  rankingC10: 7,
  rankingC12: 8,
  rankingC4: 10,
  rankingPrimerCanalPrivado: 7,
}

/** Cifras que encabezan la pieza. */
export const CANAL_STATS = {
  perdidaC12: 150267565,
  /** La pérdida de 2025 de Canal 12 sobre la pauta que cobró ese año. */
  perdidaVecesPauta: 58,
  /** La misma pérdida sobre todo lo que el Estado le pagó desde 2003. */
  perdidaSobreTotalPct: 99,
  /** Pauta 2025 a los tres canales, convertida al dólar promedio del año (41,087). */
  pauta2025USD: 191182,
  picoRealAnio: 2014,
  picoRealUYU: 118263463,
  ultimoRealUYU: 8175996,
  caidaRealVeces: 14,
  deflactor: 'Unidad Indexada · pesos de agosto de 2026',
}

export const CANALES_SOURCES = [
  { label: 'Gustavo Gómez (OBSERVACOM) — los tres cuadros de resultados e ingresos 2024–2025, con la marca Info&Com', url: 'https://x.com/gusgomezgermano/status/2089424906668646450' },
  { label: 'r/monte_video — el hilo donde circuló el dato', url: 'https://www.reddit.com/r/monte_video/comments/1vr500q/resultados_contables_de_los_canales_privados_de_tv/' },
  { label: 'AIN — Registro de Estados Contables: dónde se depositan los balances y cómo se consultan', url: 'https://www.gub.uy/tramites/registro-estados-contables' },
  { label: 'OBSERVACOM — Observatorio Latinoamericano de Regulación, Medios y Convergencia', url: 'https://www.observacom.org/' },
  { label: 'Compras Estatales — el portal oficial de cada adjudicación citada', url: 'https://www.comprasestatales.gub.uy/consultas/' },
]

const CANALES_CONTENT = {
  es: {
    common: {
      source: 'Balances oficiales (Info&Com) + Compras Estatales (OCDS) · verificado',
      verified: 'Fuentes verificadas',
    },
    canal: { c4: 'Canal 4 · Monte Carlo', c10: 'Canal 10 · SAETA', c12: 'Canal 12 · Teledoce', c5: 'Canal 5 · estatal' },
    file: { org: 'Canales 4, 10 y 12 de Montevideo', inciso: 'Balances 2024–2025 · pauta oficial 2003–2025', period: '2003–2025' },
    kicker: 'Investigación · Medios y pauta oficial',
    title: 'Canales 4, 10 y 12: la pauta oficial que deja rastro explica el 0,3% de su ingreso',
    dek: 'Los balances de los tres canales privados de Montevideo ya son públicos. Canal 12 perdió 150 millones de pesos en 2025. Los tres facturan cifras parecidas, entre 900 y 1.000 millones de pesos cada uno. Cruzamos ese ingreso contra lo que el Estado les paga en el portal de compras. La pauta que deja rastro no llega al 0,5% en ningún caso. El resto no se puede seguir, y acá está por qué.',
    chips: ['0,27% del ingreso · canales 10 y 12', 'La pérdida de Canal 12 = 58 veces su pauta', 'ANTEL: 5 líneas de publicidad en 22 años'],
    tiles: {
      c10: 'Pauta a Canal 10 · 2025', c10Sub: '0,27% de su ingreso ($981,7 M)',
      c12: 'Pauta a Canal 12 · 2025', c12Sub: '0,27% de su ingreso ($974,6 M)',
      c4: 'Pauta a Canal 4 · ejercicio a junio 2025', c4Sub: '0,40% de su ingreso ($895,9 M)',
      perdida: 'La pérdida de Canal 12 sobre su pauta', perdidaSub: '$150,3 M perdidos contra $2,6 M cobrados',
    },
    ctx: {
      tag: 'El punto de partida',
      title: 'Qué dicen los balances',
      p1: 'Los tres canales privados de Montevideo depositan sus estados contables. Gustavo Gómez, director ejecutivo de OBSERVACOM, publicó las cifras de 2024 y 2025 en tres cuadros con la marca Info&Com. Canal 12 informó una pérdida de 150.267.565 pesos en 2025. Canal 10 cerró con 13.666.202 de ganancia. Canal 4 cerró con 3.027.313, contra 47.961.449 el año anterior.',
      p2: 'Los ingresos son parecidos entre los tres. Canal 10 facturó 981.711.275 pesos. Canal 12 facturó 974.630.259. Canal 4 facturó 895.898.709 en su ejercicio cerrado en junio. Son unos 23 a 24 millones de dólares cada uno, en un año sin elecciones.',
      p3: 'Esta pieza no discute esas cifras. Las toma como denominador y pregunta una sola cosa: cuánto de ese ingreso es dinero público que se puede ver.',
      chart: 'Ingresos y resultado por canal (2024 y 2025)',
      colCanal: 'Canal', colIngresos: 'Ingresos 2025', colVar: 'Var. vs 2024', colResultado: 'Resultado 2025', colCierre: 'Cierre',
      reportedLabel: 'Cifra citada, no medida acá',
      reportedClaim: 'Ingresos y resultados de los balances contables 2024 y 2025 de los canales 4, 10 y 12, en pesos corrientes. Se copian tal cual; este sitio no los recalcula.',
      reportedSource: 'Gustavo Gómez (OBSERVACOM) · cuadros de Info&Com · 17/08/2026',
    },
    cruce: {
      tag: 'El cruce',
      title: 'Lo que el Estado les paga',
      intro: 'El portal de Compras Estatales publica cada adjudicación con su proveedor. Los tres canales aparecen con RUT propio. Sumar sus adjudicaciones año por año da la pauta oficial que deja rastro.',
      colCanal: 'Canal', colRut: 'RUT', colPauta: 'Pauta del ejercicio 2025', colShare: '% del ingreso', colTotal: 'Total desde 2003', colContratos: 'Contratos',
      ventanaJunio: 'ejercicio julio–junio',
      finding: 'Ninguno pasa del 0,5%. En 2025 Canal 10 cobró 2.670.765 pesos del Estado: el 0,27% de su ingreso. Canal 12 cobró 2.592.213: el 0,27%. Canal 4 cobró 3.619.213 en su ejercicio a junio: el 0,40%. Entre los tres suman unos 190 mil dólares.',
      finding2: 'La pérdida de Canal 12 en 2025 equivale a 58 veces la pauta que cobró ese año. También equivale al 99% de todo lo que el Estado le pagó en 23 años: 150.267.565 contra 151.210.888 pesos. Ese resultado no lo explica la pauta oficial.',
    },
    serie: {
      tag: 'La serie',
      title: 'La pauta a los tres canales, en pesos de hoy',
      intro: 'Los montos de años distintos no se comparan en pesos corrientes. Esta serie va deflactada por la Unidad Indexada del BCU, en pesos de agosto de 2026. Suma a los tres canales.',
      chart: 'Pauta oficial a los canales 4, 10 y 12, en pesos de agosto de 2026',
      finding: 'El pico está en 2014: 118 millones de pesos de hoy entre los tres. En 2025 fueron 8,2 millones. La pauta oficial visible a los canales cayó a la catorceava parte en once años.',
    },
    reparto: {
      tag: 'Cómo se reparte',
      title: 'El Estado divide la pauta de televisión en partes casi iguales',
      intro: 'La compra de televisión más grande de los últimos años la hace el Ministerio de Turismo. En las dos últimas contrataciones el precio unitario por canal se repite al centavo.',
      chart: 'Reparto de la compra de televisión de Turismo (2024 y 2025)',
      colCanal: 'Canal', colMonto: 'Monto', colShare: 'Parte',
      finding: 'Turismo pagó 9.771.857 pesos en cada contratación. Canal 10 se llevó el 27,3%. Canal 12 y Canal 4 se llevaron el 26,5% cada uno. Canal 5, el estatal, se llevó el 19,6%. Las dos adjudicaciones repiten el mismo precio unitario, una en agosto de 2024 y otra en mayo de 2025: en pesos corrientes el Estado pagó lo mismo, en pesos de hoy pagó menos.',
      fichaLabel: 'Ver la adjudicación',
    },
    campana: {
      tag: 'La concentración',
      title: 'Una compra, 185 proveedores, dos tercios para tres canales',
      intro: 'En diciembre de 2023 Turismo adjudicó una campaña a 185 medios de todo el país en un solo registro. Radios, canales del interior, diarios departamentales y cables entraron en la misma lista que los canales de Montevideo.',
      chart: 'Campaña nacional de Turismo, diciembre de 2023 (20,2 M de pesos)',
      barTres: 'Canales 4, 10 y 12', barC5: 'Canal 5 (estatal)', barResto: '181 medios del resto del país',
      finding: 'Los tres canales privados de Montevideo se llevaron el 67% de esa compra. Canal 5 se llevó el 17%. Los otros 181 proveedores se repartieron el 16% restante.',
      ficha: 'Ver la adjudicación completa',
    },
    trazar: {
      tag: 'Trazar el resto',
      title: 'Por qué el 99% restante no se puede seguir',
      p1: 'Los balances publican el ingreso total. No publican su composición. Con la cifra publicada no se separa la publicidad privada de los derechos de transmisión ni de la venta de programas.',
      p2: 'El portal de compras tampoco cierra el hueco. Hay tres razones, y las tres se miden.',
      r1t: 'Las empresas públicas casi no registran publicidad',
      r1: 'ANTEL aparece en el portal como comprador, pero casi no compra publicidad ahí. En los 33 códigos de la clase «Publicidad y propaganda» registra cinco líneas, entre 2025 y 2026: tres publicaciones oficiales, una esponsorización y una ornamentación de stand. Ninguna es televisión.',
      antelAdj: 'adjudicaciones de ANTEL en la base',
      antelLineas: 'líneas de publicidad, en total',
      antelMonto: 'lo que suman esas cinco líneas',
      antelTv: 'adjudicaciones de ANTEL a un canal',
      r2t: 'La pauta pasa por intermediarios',
      r2: 'En el ranking de receptores que publica /pauta, ninguno de los seis primeros es un canal privado; el primero es el propio Ministerio de Turismo. Cuando el Estado le paga a una agencia, el registro nombra a la agencia, no al medio que emitió el aviso.',
      r3t: 'El registro es de adjudicación, no de facturación',
      r3: 'El monto es lo adjudicado y la fecha es la del registro oficial, no el mes en que salió el aviso. Una adjudicación puede ejecutarse en cuotas, en otro año, o no ejecutarse.',
      p3: 'Por eso la cifra es un piso, no un total. Los 2.592.213 pesos de Canal 12 en 2025 son lo que se prueba con una ficha oficial. El techo no se conoce, y nadie lo publica.',
    },
    method: {
      tag: 'Cómo se hizo',
      title: 'Método y límites',
      p1: 'Los ingresos y los resultados se copian de los cuadros de Info&Com, sin recalcular. Son pesos corrientes, y cada canal cierra su ejercicio cuando dice la tabla.',
      p2: 'Los montos de pauta salen de la base del sitio, réplica de Compras Estatales en OCDS. Los canales se identifican por RUT de proveedor: Canal 10 es S.A. Emisoras de Televisión y Anexos SAETA (21-013421-0018), Canal 12 es Sociedad Televisora Larrañaga S.A. (21-022373-0017) y Canal 4 es Monte Carlo TV S.A. (21-093640-0013).',
      p3: 'Monte Carlo S.A. (21-015368-0016) queda afuera. Es otro RUT del mismo grupo, con montos diez veces menores, y aparece en las listas de radio. Sumarlo al canal mezclaría dos empresas.',
      p4: 'El monto por proveedor se reparte línea por línea, con el mismo método que el resto del sitio: cada ítem toma su parte del total del contrato en proporción a precio unitario por cantidad. Quedan fuera los registros por encima del tope de plausibilidad de 50.000 millones de pesos.',
      p5: 'Las dos cifras son comparables porque ninguna incluye IVA. El feed publica montos sin impuestos y un estado de resultados no cuenta el IVA como ingreso. La serie por año va deflactada por Unidad Indexada; los porcentajes sobre ingreso comparan pesos del mismo año, así que no la necesitan.',
      p6: 'El ejercicio de Canal 4 cierra en junio, así que su porcentaje compara la pauta de julio a junio contra el ingreso de ese mismo ejercicio. Los canales 10 y 12 cierran en diciembre y van por año calendario.',
    },
    explore: {
      tag: 'Seguí explorando',
      title: 'El resto de la pauta',
      intro: 'Esta pieza mira tres proveedores. La página de pauta oficial muestra toda la clase: quién paga, quién cobra y en qué formato.',
      pauta: 'Ver la pauta oficial completa',
      c10: 'Contratos de Canal 10',
      c12: 'Contratos de Canal 12',
      c4: 'Contratos de Canal 4',
    },
    sourcesTitle: 'Fuentes',
    disclaimerTitle: 'Sobre estos datos',
    disclaimer: [
      'Este es un trabajo periodístico sobre datos abiertos, no una auditoría. Los ingresos y resultados son los que publicó la fuente citada; la pauta es la que publica el Estado en su portal de compras.',
      'La pauta medida es un piso. El portal registra al proveedor que factura, así que una compra hecha a través de una agencia queda a nombre de la agencia. Cada adjudicación citada enlaza a su ficha para que cualquiera la rechequee.',
    ],
  },
  en: {
    common: {
      source: 'Official financial statements (Info&Com) + Compras Estatales (OCDS) · verified',
      verified: 'Verified sources',
    },
    canal: { c4: 'Canal 4 · Monte Carlo', c10: 'Canal 10 · SAETA', c12: 'Canal 12 · Teledoce', c5: 'Canal 5 · state-owned' },
    file: { org: 'Montevideo channels 4, 10 and 12', inciso: '2024–2025 accounts · official advertising 2003–2025', period: '2003–2025' },
    kicker: 'Investigation · Media and official advertising',
    title: 'Channels 4, 10 and 12: the official advertising that leaves a trace is 0.3% of their income',
    dek: 'The financial statements of Montevideo’s three private channels are public. Channel 12 lost 150 million pesos in 2025. All three bill similar figures, between 900 million and 1 billion pesos each. We cross that income against what the State pays them in the procurement portal. The advertising that leaves a trace never reaches 0.5%. The rest cannot be traced, and here is why.',
    chips: ['0.27% of income · channels 10 and 12', 'Channel 12’s loss = 58× its advertising', 'ANTEL: 5 advertising lines in 22 years'],
    tiles: {
      c10: 'State advertising to Channel 10 · 2025', c10Sub: '0.27% of its income ($981.7 M)',
      c12: 'State advertising to Channel 12 · 2025', c12Sub: '0.27% of its income ($974.6 M)',
      c4: 'State advertising to Channel 4 · year to June 2025', c4Sub: '0.40% of its income ($895.9 M)',
      perdida: 'Channel 12’s loss over its advertising', perdidaSub: '$150.3 M lost against $2.6 M billed',
    },
    ctx: {
      tag: 'The starting point',
      title: 'What the accounts say',
      p1: 'Montevideo’s three private channels file financial statements. Gustavo Gómez, executive director of OBSERVACOM, published the 2024 and 2025 figures in three charts branded Info&Com. Channel 12 reported a loss of 150,267,565 pesos in 2025. Channel 10 closed with a 13,666,202 profit. Channel 4 closed with 3,027,313, against 47,961,449 the year before.',
      p2: 'Income is similar across the three. Channel 10 billed 981,711,275 pesos. Channel 12 billed 974,630,259. Channel 4 billed 895,898,709 in its year ended in June. That is some 23 to 24 million dollars each, in a year without elections.',
      p3: 'This piece does not dispute those figures. It takes them as the denominator and asks one thing: how much of that income is public money you can see.',
      chart: 'Income and result per channel (2024 and 2025)',
      colCanal: 'Channel', colIngresos: 'Income 2025', colVar: 'Change vs 2024', colResultado: 'Result 2025', colCierre: 'Year end',
      reportedLabel: 'Quoted figure, not measured here',
      reportedClaim: 'Income and results from the 2024 and 2025 financial statements of channels 4, 10 and 12, in current pesos. Copied as published; this site does not recalculate them.',
      reportedSource: 'Gustavo Gómez (OBSERVACOM) · Info&Com charts · 17/08/2026',
    },
    cruce: {
      tag: 'The cross',
      title: 'What the State pays them',
      intro: 'The Compras Estatales portal publishes every award with its supplier. The three channels appear with their own tax ID. Adding their awards year by year gives the official advertising that leaves a trace.',
      colCanal: 'Channel', colRut: 'Tax ID', colPauta: 'Advertising, 2025 year', colShare: '% of income', colTotal: 'Total since 2003', colContratos: 'Contracts',
      ventanaJunio: 'July–June financial year',
      finding: 'None passes 0.5%. In 2025 Channel 10 billed the State 2,670,765 pesos: 0.27% of its income. Channel 12 billed 2,592,213: 0.27%. Channel 4 billed 3,619,213 in its year to June: 0.40%. Together they add up to some 190 thousand dollars.',
      finding2: 'Channel 12’s 2025 loss equals 58 times the advertising it billed that year. It also equals 99% of everything the State paid it in 23 years: 150,267,565 against 151,210,888 pesos. Official advertising does not explain that result.',
    },
    serie: {
      tag: 'The series',
      title: 'State advertising to the three channels, in today’s pesos',
      intro: 'Amounts from different years do not compare in current pesos. This series is deflated by the BCU’s Unidad Indexada, in pesos of August 2026. It adds the three channels together.',
      chart: 'Official advertising to channels 4, 10 and 12, in pesos of August 2026',
      finding: 'The peak is 2014: 118 million of today’s pesos across the three. In 2025 it was 8.2 million. Visible official advertising to the channels fell to a fourteenth in eleven years.',
    },
    reparto: {
      tag: 'How it is split',
      title: 'The State splits television advertising into near-equal shares',
      intro: 'The largest television buy of recent years is made by the Ministry of Tourism. In the last two contracts the unit price per channel repeats to the cent.',
      chart: 'Split of the Tourism television buy (2024 and 2025)',
      colCanal: 'Channel', colMonto: 'Amount', colShare: 'Share',
      finding: 'Tourism paid 9,771,857 pesos in each contract. Channel 10 took 27.3%. Channel 12 and Channel 4 took 26.5% each. Channel 5, the state channel, took 19.6%. Both awards repeat the same unit price, one in August 2024 and one in May 2025: in current pesos the State paid the same, in today’s pesos it paid less.',
      fichaLabel: 'View the award',
    },
    campana: {
      tag: 'The concentration',
      title: 'One buy, 185 suppliers, two thirds to three channels',
      intro: 'In December 2023 Tourism awarded a campaign to 185 outlets across the country in a single record. Radios, provincial channels, local newspapers and cable operators shared the list with the Montevideo channels.',
      chart: 'Tourism national campaign, December 2023 (20.2 M pesos)',
      barTres: 'Channels 4, 10 and 12', barC5: 'Channel 5 (state)', barResto: '181 outlets from the rest of the country',
      finding: 'The three private Montevideo channels took 67% of that buy. Channel 5 took 17%. The other 181 suppliers shared the remaining 16%.',
      ficha: 'View the full award',
    },
    trazar: {
      tag: 'Tracing the rest',
      title: 'Why the remaining 99% cannot be followed',
      p1: 'The accounts publish total income. They do not publish its composition. From the published figure you cannot separate private advertising from broadcasting rights or programme sales.',
      p2: 'The procurement portal does not close the gap either. There are three reasons, and all three are measured.',
      r1t: 'State-owned companies barely record advertising',
      r1: 'ANTEL shows up in the portal as a buyer, yet it barely buys advertising there. Across the 33 codes of the “Advertising and propaganda” class it records five lines, between 2025 and 2026: three official notices, one sponsorship and one advertising stand. None is television.',
      antelAdj: 'ANTEL awards in the data',
      antelLineas: 'advertising lines in total',
      antelMonto: 'what those five lines add up to',
      antelTv: 'ANTEL awards to any channel',
      r2t: 'Advertising flows through intermediaries',
      r2: 'In the recipient ranking published on /pauta, none of the top six is a private channel; the first is the Ministry of Tourism itself. When the State pays an agency, the record names the agency, not the outlet that aired the ad.',
      r3t: 'The record is of awards, not invoices',
      r3: 'The amount is what was awarded and the date is the official record’s, not the month the ad aired. An award may run in instalments, in another year, or not run at all.',
      p3: 'So the figure is a floor, not a total. Channel 12’s 2,592,213 pesos in 2025 are what an official file proves. The ceiling is unknown, and nobody publishes it.',
    },
    method: {
      tag: 'How it was done',
      title: 'Method and limits',
      p1: 'Income and results are copied from the Info&Com charts, not recalculated. They are current pesos, and each channel closes its year as the table says.',
      p2: 'Advertising amounts come from the site’s data, a replica of Compras Estatales in OCDS. Channels are identified by supplier tax ID: Channel 10 is S.A. Emisoras de Televisión y Anexos SAETA (21-013421-0018), Channel 12 is Sociedad Televisora Larrañaga S.A. (21-022373-0017) and Channel 4 is Monte Carlo TV S.A. (21-093640-0013).',
      p3: 'Monte Carlo S.A. (21-015368-0016) is left out. It is another tax ID of the same group, with amounts ten times smaller, and it appears in the radio lists. Adding it to the channel would mix two companies.',
      p4: 'Per-supplier amounts are apportioned line by line, with the same method as the rest of the site: each item takes its share of the contract total in proportion to unit price times quantity. Records above the 50 billion peso plausibility ceiling are excluded.',
      p5: 'Both figures are comparable because neither includes VAT. The feed publishes amounts before tax and an income statement does not count VAT as revenue. The yearly series is deflated by the Unidad Indexada; the percentages over income compare pesos of the same year, so they do not need it.',
      p6: 'Channel 4’s year ends in June, so its percentage compares July-to-June advertising against the income of that same year. Channels 10 and 12 close in December and run on calendar years.',
    },
    explore: {
      tag: 'Keep exploring',
      title: 'The rest of the advertising',
      intro: 'This piece looks at three suppliers. The official advertising page shows the whole class: who pays, who bills and in what format.',
      pauta: 'See all official advertising',
      c10: 'Channel 10 contracts',
      c12: 'Channel 12 contracts',
      c4: 'Channel 4 contracts',
    },
    sourcesTitle: 'Sources',
    disclaimerTitle: 'About this data',
    disclaimer: [
      'This is data journalism over open data, not an audit. Income and results are what the cited source published; the advertising is what the State publishes in its procurement portal.',
      'The advertising measured is a floor. The portal records the supplier that invoices, so a buy made through an agency is booked under the agency. Every award cited links to its file so anyone can re-check it.',
    ],
  },
} as const

export function canalesContent(locale: string) {
  return (CANALES_CONTENT as Record<string, typeof CANALES_CONTENT.es>)[locale] ?? CANALES_CONTENT.es
}
