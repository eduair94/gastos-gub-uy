/**
 * Investigación · "El llamado parecía competitivo" — datos y contenido.
 *
 * Fuente: el bloque "Proveedores participantes" de la ficha de cada compra en Compras
 * Estatales, raspado a `call_bidders` (src/jobs/scrape-call-bidders.ts), cruzado con las
 * adjudicaciones del feed OCDS y con `supplier_contacts` (domicilio RUPE, teléfonos).
 * Medido el 2026-08-13. Es una FOTO verificada, no una vista en vivo: por eso vive como
 * módulo estático y cada fila enlaza a su ficha oficial para re-chequear.
 *
 * TRES COSAS QUE ESTE DATASET NO DICE, y que la página tiene que decir:
 *
 * 1. El denominador. Son 4.372 compras con oferentes publicados sobre un universo de
 *    1.419.916 adjudicaciones: 0,3%. El raspado avanza de a tandas y arranca por lo
 *    reciente, así que la muestra es 2025-2026 y no es representativa de la serie larga.
 *    Ningún número de acá se puede leer como "en Uruguay pasa X".
 *
 * 2. Compartir teléfono o domicilio NO ES DELITO NI PRUEBA DE ACUERDO. Dos empresas del
 *    mismo grupo pueden presentarse legítimamente al mismo llamado. Lo que el dato muestra
 *    es más chico y más sólido: ese llamado tuvo menos oferentes independientes de los que
 *    su lista aparenta. La pregunta es para el organismo que lo adjudicó.
 *
 * 3. Los pares se filtraron para matar el falso positivo obvio: un teléfono que declaran
 *    36 empresas es una central (la terminal de ómnibus, la UAM, un operador logístico),
 *    no un vínculo. Sólo entran domicilios que declaran <= 4 proveedores y teléfonos que
 *    declaran <= 3. Con el criterio laxo eran 92 pares; con éste, 8.
 *
 * Regenerar: npx tsx tests/unit/competencia-aparente.verify.ts
 */

export interface PairFirm { name: string, rut: string }
export interface PairCall {
  id: string
  year: number
  buyer: string
  /** Oferentes que publicó la ficha. */
  bidders: number
  uyu: number
  wonA: boolean
  wonB: boolean
  /** Adjudicatarios del llamado: en una compra multi-ítem se adjudica a varios. */
  winners: number
}
export interface Pair {
  a: PairFirm
  b: PairFirm
  /** Domicilio declarado en RUPE, cuando es el mismo para las dos. */
  addr: string | null
  /** Cuántos proveedores del corpus declaran ese domicilio (<= 4 por filtro). */
  addrOwners: number
  phone: string | null
  /** Cuántos proveedores declaran ese teléfono (<= 3 por filtro). */
  phoneOwners: number
  calls: PairCall[]
}
export interface SharedBuyerRow { buyer: string, aUyu: number, aN: number, bUyu: number, bN: number }
export interface SharedBuyers {
  ra: string
  rb: string
  na: string
  nb: string
  /** Total adjudicado a cada empresa desde 2020, en todos los organismos. */
  totA: number
  totB: number
  /** Organismos donde facturan LAS DOS. */
  sharedCount: number
  /** Los tres mayores, por monto sumado. */
  shared: SharedBuyerRow[]
  combined: number
}

export interface SoleCall {
  id: string
  year: number
  buyer: string
  sup: string
  method: string | null
  uyu: number
  title: string
}

export const COVERAGE = {"probed": 5298, "withBlock": 4372, "sole": 852, "multi": 3520, "buyers": 206, "universe": 1419916, "years": [{"year": 2025, "calls": 2565, "sole": 467}, {"year": 2026, "calls": 1807, "sole": 385}]}

export const PAIRS: Pair[] = [{"a": {"name": "DECOSTAR S A","rut": "213985010015"},"b": {"name": "FULLSYSTEM S R L","rut": "214964620017"},"addr": "ARAMBURU DOMINGO 1634 C.P. 11800","addrOwners": 2,"phone": "22000222","phoneOwners": 3,"calls": [{"id": "1275681","year": 2025,"buyer": "Dirección General de Secretaría","bidders": 14,"uyu": 2613650,"wonA": false,"wonB": false,"winners": 2},{"id": "1270831","year": 2025,"buyer": "Dirección General de Casinos","bidders": 8,"uyu": 1859701,"wonA": true,"wonB": true,"winners": 7},{"id": "1306231","year": 2025,"buyer": "Facultad de Arquitectura, Diseño y Urbanismo","bidders": 16,"uyu": 712629,"wonA": false,"wonB": false,"winners": 6},{"id": "1322356","year": 2026,"buyer": "Poder Judicial","bidders": 7,"uyu": 695662,"wonA": true,"wonB": true,"winners": 6},{"id": "1296007","year": 2025,"buyer": "Contaduría General de la Nación","bidders": 8,"uyu": 518386,"wonA": true,"wonB": true,"winners": 4},{"id": "1297257","year": 2025,"buyer": "Centro Departamental de Lavalleja","bidders": 20,"uyu": 318770,"wonA": false,"wonB": false,"winners": 5},{"id": "1289266","year": 2025,"buyer": "Junta Nacional de Salud","bidders": 10,"uyu": 265115,"wonA": false,"wonB": false,"winners": 3}]},{"a": {"name": "SEVITEC LTDA","rut": "212605270011"},"b": {"name": "CONVI SOCIEDAD ANONIMA","rut": "213352490017"},"addr": null,"addrOwners": 0,"phone": "24024944","phoneOwners": 2,"calls": [{"id": "1283843","year": 2025,"buyer": "Fiscalia General de la Nación","bidders": 5,"uyu": 26075400,"wonA": false,"wonB": false,"winners": 1},{"id": "1282143","year": 2025,"buyer": "Congreso de Intendentes","bidders": 9,"uyu": 8948346,"wonA": false,"wonB": true,"winners": 1},{"id": "1309922","year": 2026,"buyer": "Instituto de Investigaciones Biológicas Clemente Estable","bidders": 8,"uyu": 3250080,"wonA": false,"wonB": false,"winners": 1},{"id": "1321945","year": 2026,"buyer": "Dirección Nacional de Vialidad","bidders": 4,"uyu": 1123770,"wonA": false,"wonB": true,"winners": 1},{"id": "1295317","year": 2025,"buyer": "Dirección Nacional de Arquitectura","bidders": 4,"uyu": 722200,"wonA": false,"wonB": false,"winners": 1},{"id": "1295327","year": 2025,"buyer": "Dirección Nacional de Arquitectura","bidders": 6,"uyu": 469000,"wonA": false,"wonB": false,"winners": 1},{"id": "1292936","year": 2025,"buyer": "Consejo de Educación Secundaria","bidders": 6,"uyu": 800,"wonA": false,"wonB": false,"winners": 1}]},{"a": {"name": "GONZALEZ MOURA S R L","rut": "030256490017"},"b": {"name": "GRUPO OD S A S","rut": "218710800016"},"addr": "DE LA ROSA, AGUSTIN 609","addrOwners": 2,"phone": null,"phoneOwners": 0,"calls": [{"id": "1340352","year": 2026,"buyer": "Banco de Previsión Social","bidders": 6,"uyu": 960000,"wonA": false,"wonB": false,"winners": 1},{"id": "1295633","year": 2025,"buyer": "Dirección Nacional de Aduanas","bidders": 3,"uyu": 892000,"wonA": true,"wonB": false,"winners": 1}]},{"a": {"name": "RUTAS DEL SOL LTDA","rut": "210572130015"},"b": {"name": "CROMIN S A","rut": "210591790017"},"addr": null,"addrOwners": 0,"phone": "25066060","phoneOwners": 2,"calls": [{"id": "1290191","year": 2025,"buyer": "Direc. General de Secretaría.","bidders": 5,"uyu": 6363636,"wonA": true,"wonB": true,"winners": 2},{"id": "1324091","year": 2026,"buyer": "Dirección de Educación","bidders": 7,"uyu": 5286746,"wonA": true,"wonB": false,"winners": 4}]},{"a": {"name": "ELECTROSISTEMAS S.A","rut": "211984310019"},"b": {"name": "UNION ELECTRICA S.A.","rut": "214679320019"},"addr": null,"addrOwners": 0,"phone": "26138514","phoneOwners": 3,"calls": [{"id": "1306554","year": 2025,"buyer": "Administración Nacional de Usinas y Trasmisiones Eléctricas","bidders": 7,"uyu": 37500001,"wonA": false,"wonB": false,"winners": 2},{"id": "1306869","year": 2025,"buyer": "Administración Nacional de Usinas y Trasmisiones Eléctricas","bidders": 10,"uyu": 18750000,"wonA": false,"wonB": false,"winners": 1}]},{"a": {"name": "CHADRE S A","rut": "160000820016"},"b": {"name": "AGENCIA CENTRAL S A","rut": "210237200015"},"addr": "BATLLE Y ORDOñEZ BVAR. JOSE 3266","addrOwners": 4,"phone": null,"phoneOwners": 0,"calls": [{"id": "1309916","year": 2026,"buyer": "Comando General del Ejército","bidders": 8,"uyu": 3140795,"wonA": true,"wonB": true,"winners": 8},{"id": "1340658","year": 2026,"buyer": "Comando General de la Armada","bidders": 5,"uyu": 522351,"wonA": true,"wonB": true,"winners": 5}]},{"a": {"name": "MERCOLUZ S A","rut": "211454500015"},"b": {"name": "FESCOMEL S.A.","rut": "218037410011"},"addr": null,"addrOwners": 0,"phone": "22000643","phoneOwners": 3,"calls": [{"id": "1292603","year": 2025,"buyer": "Administración Nacional de Usinas y Trasmisiones Eléctricas","bidders": 6,"uyu": 262232,"wonA": true,"wonB": false,"winners": 2}]},{"a": {"name": "LA FLOTTA LIMITADA","rut": "030147340014"},"b": {"name": "DECATUR S R L","rut": "212629730012"},"addr": null,"addrOwners": 0,"phone": "46422571","phoneOwners": 2,"calls": [{"id": "1324105","year": 2026,"buyer": "Universidad Tecnológica del Uruguay","bidders": 6,"uyu": 256906,"wonA": true,"wonB": false,"winners": 2}]}]

export const SOLE_BY_METHOD = [{"method": "Concurso de Precios", "sole": 522, "uyu": 396277927}, {"method": "Licitación Abreviada", "sole": 323, "uyu": 2505828536}, {"method": "Licitación Pública", "sole": 7, "uyu": 79551152}]
export const SOLE_RATE_BY_METHOD = [{"method": "Concurso de Precios", "probed": 2781, "sole": 522}, {"method": "Licitación Abreviada", "probed": 1489, "sole": 323}, {"method": "Licitación Pública", "probed": 102, "sole": 7}]
export const SOLE_TOP: SoleCall[] = [{"id": "1335874","year": 2026,"buyer": "Administración Nacional de Combustible, Alcohol y Portland","sup": "MOORINGMEN SRL","method": "Licitación Abreviada","uyu": 68247900,"title": "Licitación Abreviada 152076/2026"},{"id": "1311633","year": 2026,"buyer": "Administración Nacional de Telecomunicaciones","sup": "ELECTROSISTEMAS S.A","method": "Licitación Abreviada","uyu": 53221362,"title": "Licitación Abreviada 107757/2026"},{"id": "1312719","year": 2026,"buyer": "Administración Nacional de Combustible, Alcohol y Portland","sup": "GXC SOCIEDAD ANONIMA","method": "Licitación Abreviada","uyu": 53000000,"title": "Licitación Abreviada 450608/2026"},{"id": "1298159","year": 2025,"buyer": "Administración Nacional de Telecomunicaciones","sup": "CONVI SOCIEDAD ANONIMA","method": "Licitación Abreviada","uyu": 52336588,"title": "Licitación Abreviada 107751/2025"},{"id": "1325724","year": 2026,"buyer": "Administración Nacional de Telecomunicaciones","sup": "ABACUS S A","method": "Licitación Abreviada","uyu": 50260291,"title": "Licitación Abreviada 109026/2026"},{"id": "1339635","year": 2026,"buyer": "Administración Nacional de Combustible, Alcohol y Portland","sup": "ARKANOSOFT SA","method": "Licitación Abreviada","uyu": 50000000,"title": "Licitación Abreviada 450619/2026"},{"id": "1281748","year": 2025,"buyer": "Administración Nacional de Usinas y Trasmisiones Eléctricas","sup": "TILSOR S A","method": "Licitación Abreviada","uyu": 46053003,"title": "Licitación Abreviada 103126/2025"},{"id": "1349748","year": 2026,"buyer": "Administración Nacional de Telecomunicaciones","sup": "TILSOR S A","method": "Licitación Abreviada","uyu": 42901266,"title": "Licitación Abreviada 109118/2026"},{"id": "1281050","year": 2025,"buyer": "Administración de las Obras Sanitarias del Estado","sup": "ANCASUD SOCIEDAD ANONIMA","method": "Licitación Abreviada","uyu": 41670720,"title": "Licitación Abreviada 26410/2025"},{"id": "1324845","year": 2026,"buyer": "Administración Nacional de Telecomunicaciones","sup": "CLARAMUNT OSORES ELENA BEATRIZ","method": "Licitación Abreviada","uyu": 41000000,"title": "Licitación Abreviada 108857/2026"},{"id": "1342960","year": 2026,"buyer": "Administración Nacional de Telecomunicaciones","sup": "TEYMA URUGUAY S A","method": "Licitación Abreviada","uyu": 40855539,"title": "Licitación Abreviada 109107/2026"},{"id": "1292974","year": 2025,"buyer": "Administración Nacional de Combustible, Alcohol y Portland","sup": "LOGICALIS URUGUAY S.A.","method": "Licitación Abreviada","uyu": 39093741,"title": "Licitación Abreviada 450599/2025"},{"id": "1335733","year": 2026,"buyer": "Banco de Previsión Social","sup": "XILOPHON S.A.","method": "Licitación Abreviada","uyu": 31200000,"title": "Licitación Abreviada 589/2026"},{"id": "1284255","year": 2025,"buyer": "Banco de Previsión Social","sup": "ARNALDO C CASTRO S A","method": "Licitación Abreviada","uyu": 29256281,"title": "Licitación Abreviada 427/2025"},{"id": "1298380","year": 2025,"buyer": "Administración Nacional de Usinas y Trasmisiones Eléctricas","sup": "CONSORCIO FEPREMI II","method": "Licitación Abreviada","uyu": 26000000,"title": "Licitación Abreviada 103254/2025"}]
export const SOLE_TOTAL_UYU = 2981657615
export const SOLE_TOTAL_UYU_SIN_ATIPICO = 2304449015
export const OUTLIER = {"id": "1339091", "year": 2026, "buyer": "Administración Nacional de Usinas y Trasmisiones Eléctricas", "sup": "RAMIREZ FERNANDEZ VIRGINIA, ACOSTA LEITES LETICIA KARLA Y OTROS", "method": "Licitación Abreviada", "uyu": 677208600, "qty": 1475400, "unit": 459}

export const SHARED_BUYERS: SharedBuyers[] = [{"ra": "211984310019","rb": "214679320019","na": "ELECTROSISTEMAS S.A","nb": "UNION ELECTRICA S.A.","totA": 607038554,"totB": 791930315,"sharedCount": 9,"shared": [{"buyer": "Administración Nacional de Usinas y Trasmisiones Eléctricas","aUyu": 309261666,"aN": 15,"bUyu": 315831335,"bN": 19},{"buyer": "Banco de la República del Uruguay","aUyu": 494542,"aN": 9,"bUyu": 140922399,"bN": 14},{"buyer": "Intendencia de Montevideo","aUyu": 103387660,"aN": 30,"bUyu": 19719550,"bN": 4}],"combined": 1398968869},{"ra": "212605270011","rb": "213352490017","na": "SEVITEC LTDA","nb": "CONVI SOCIEDAD ANONIMA","totA": 1017076791,"totB": 1789710537,"sharedCount": 16,"shared": [{"buyer": "Dirección General de Casinos","aUyu": 266907112,"aN": 16,"bUyu": 20628925,"bN": 3},{"buyer": "Fiscalia General de la Nación","aUyu": 126142099,"aN": 24,"bUyu": 22748457,"bN": 6},{"buyer": "Dirección General de Secretaría","aUyu": 82424334,"aN": 40,"bUyu": 35137534,"bN": 10}],"combined": 2806787328},{"ra": "213985010015","rb": "214964620017","na": "DECOSTAR S A","nb": "FULLSYSTEM S R L","totA": 30764768,"totB": 27283240,"sharedCount": 13,"shared": [{"buyer": "Banco de la República del Uruguay","aUyu": 10731770,"aN": 48,"bUyu": 332559,"bN": 6},{"buyer": "Secretaría del Ministerio del Interior","aUyu": 3504536,"aN": 6,"bUyu": 18789,"bN": 2},{"buyer": "Intendencia de Montevideo","aUyu": 594,"aN": 1,"bUyu": 2526744,"bN": 75}],"combined": 58048008},{"ra": "211454500015","rb": "218037410011","na": "MERCOLUZ S A","nb": "FESCOMEL S.A.","totA": 98479282,"totB": 4929621,"sharedCount": 12,"shared": [{"buyer": "Intendencia de Montevideo","aUyu": 10884091,"aN": 696,"bUyu": 980,"bN": 1},{"buyer": "Administración de las Obras Sanitarias del Estado","aUyu": 1576215,"aN": 6,"bUyu": 1760879,"bN": 4},{"buyer": "Centro Hospitalario  Pereira Rossell","aUyu": 2842611,"aN": 62,"bUyu": 116820,"bN": 2}],"combined": 103408903},{"ra": "210572130015","rb": "210591790017","na": "RUTAS DEL SOL LTDA","nb": "CROMIN S A","totA": 27680934,"totB": 438135,"sharedCount": 1,"shared": [{"buyer": "Red de Atención Primaria de Rocha","aUyu": 10174850,"aN": 108,"bUyu": 438135,"bN": 34}],"combined": 28119069},{"ra": "160000820016","rb": "210237200015","na": "CHADRE S A","nb": "AGENCIA CENTRAL S A","totA": 5457091,"totB": 47478182,"sharedCount": 4,"shared": [{"buyer": "Red de Atención Primaria de Salto","aUyu": 2995998,"aN": 59,"bUyu": 3684463,"bN": 59},{"buyer": "Dirección de Educación","aUyu": 26539,"aN": 6,"bUyu": 2477951,"bN": 92},{"buyer": "Centro Auxiliar de Bella Unión","aUyu": 1987416,"aN": 18,"bUyu": 482630,"bN": 24}],"combined": 52935273},{"ra": "030256490017","rb": "218710800016","na": "GONZALEZ MOURA S R L","nb": "GRUPO OD S A S","totA": 150220674,"totB": 2540901,"sharedCount": 2,"shared": [{"buyer": "Dirección Nacional de Aduanas","aUyu": 6291033,"aN": 12,"bUyu": 200655,"bN": 1},{"buyer": "Corte Electoral","aUyu": 15600,"aN": 1,"bUyu": 259200,"bN": 1}],"combined": 152761575},{"ra": "030147340014","rb": "212629730012","na": "LA FLOTTA LIMITADA","nb": "DECATUR S R L","totA": 3484080,"totB": 1087847,"sharedCount": 9,"shared": [{"buyer": "Dirección de Educación","aUyu": 1318601,"aN": 2,"bUyu": 112727,"bN": 2},{"buyer": "Universidad Tecnológica del Uruguay","aUyu": 499636,"aN": 2,"bUyu": 148182,"bN": 3},{"buyer": "Direc. General de Secretaría.","aUyu": 289499,"aN": 2,"bUyu": 179364,"bN": 1}],"combined": 4571927}]

/**
 * El control de artefacto, medido organismo por organismo.
 *
 * `equal` son las compras donde la lista de participantes coincide EXACTAMENTE con la de
 * adjudicatarios. Que coincida no prueba nada por sí solo (si se presentó uno solo y ganó,
 * coinciden por definición); lo que decide es `withLosers`: cuántas veces el organismo
 * publicó a alguien que perdió. Con cero, su porcentaje de oferente único es incalculable.
 */
export const ARTIFACT_CHECK = [
  { buyer: 'Intendencia de Montevideo', probed: 65, multi: 4, withLosers: 0, measurable: false },
  { buyer: 'Intendencia de Maldonado', probed: 45, multi: 7, withLosers: 6, measurable: true },
  { buyer: 'Administración Nacional de Telecomunicaciones', probed: 66, multi: 30, withLosers: 18, measurable: true },
  { buyer: 'Banco de Previsión Social', probed: 1021, multi: 785, withLosers: 742, measurable: true },
  { buyer: 'Dirección Nacional de Sanidad Policial', probed: 195, multi: 164, withLosers: 159, measurable: true },
  { buyer: 'Administración de las Obras Sanitarias del Estado', probed: 250, multi: 158, withLosers: 157, measurable: true },
]

/** Llamados alcanzados por los pares, para el titular. */
export const PAIR_CALLS = PAIRS.reduce((n, p) => n + p.calls.length, 0)
/** Los que además fueron adjudicados a las dos empresas del par. */
export const PAIR_CALLS_BOTH_WON = PAIRS.reduce((n, p) => n + p.calls.filter(c => c.wonA && c.wonB).length, 0)
export const SOLE_SHARE = COVERAGE.sole / COVERAGE.withBlock

export type Locale = 'es' | 'en'

export const COMPETENCIA_CONTENT = {
  es: {
    kicker: 'Investigación propia · datos, no denuncia',
    title: 'El llamado parecía competitivo',
    dek: 'En 852 de las 4.372 compras competitivas que pudimos mirar se presentó una sola empresa. En otras 24, dos de las que competían entre sí comparten el mismo teléfono o el mismo domicilio declarado ante el Estado.',
    fileOrg: '206 organismos',
    filePeriod: '2025 – 2026',
    fileScope: '4.372 compras con oferentes publicados',
    chips: ['Oferente único', 'Oferentes vinculados', 'Método verificado', 'Datos abiertos'],
    statHead: 'Adjudicado en compras con un solo oferente',
    statSub: 'sin contar un registro atípico de $ 677 M que se explica abajo',
    tiles: [
      { n: '19,5 %', l: 'de las compras miradas', s: 'tuvieron una sola oferta' },
      { n: '8', l: 'pares de empresas', s: 'comparten teléfono o domicilio y compiten' },
      { n: '24', l: 'llamados alcanzados', s: 'por esos pares' },
      { n: '0,3 %', l: 'del corpus', s: 'es lo que alcanzamos a mirar' },
    ],

    queTag: 'Qué miramos',
    queTitle: 'Quiénes se presentaron, no sólo quién ganó',
    que: [
      'El feed de datos abiertos publica quién GANÓ cada compra, nunca quién compitió. Por eso la red flag número uno de las compras públicas —que a un llamado competitivo se presente una sola empresa— acá era imposible de medir: los campos de oferentes del estándar OCDS vienen vacíos en el 100% de los registros.',
      'La ficha HTML de cada compra sí lo publica, en un bloque llamado "Proveedores participantes" con nombre y RUT. Lo estamos raspando de a tandas. Al 13 de agosto de 2026 hay 5.298 compras miradas, de las cuales 4.372 publicaron el bloque, en 206 organismos.',
      'Sobre eso se pueden hacer dos preguntas que antes no se podían hacer: en cuántos llamados competitivos hubo una sola oferta, y si los que compiten entre sí son realmente independientes.',
    ],

    paresTag: 'Hallazgo 1',
    paresTitle: 'Las que compiten desde la misma puerta',
    paresIntro: 'Cruzamos los oferentes de cada llamado contra el domicilio que cada empresa declara en el RUPE y contra los teléfonos que publica. Ocho pares se presentaron al mismo llamado compartiendo uno de los dos. No es delito y puede tratarse de empresas del mismo grupo: lo que cambia es que ese llamado tuvo menos oferentes independientes de los que la lista aparenta.',
    paresLead: 'El caso más repetido: DECOSTAR S.A. y FULLSYSTEM S.R.L. declaran el mismo domicilio (Aramburu Domingo 1634) —son las dos únicas empresas del corpus que lo declaran— y el mismo teléfono. Se presentaron juntas a siete llamados, entre ellos uno de la Dirección General de Casinos y uno del Poder Judicial. En tres, la compra terminó adjudicada a las dos.',
    paresColLink: 'Vínculo',
    paresColCalls: 'Llamados juntas',
    paresColBoth: 'Adjudicados a ambas',
    paresPhone: 'mismo teléfono',
    paresAddr: 'mismo domicilio RUPE',
    paresOwners: (n: number) => `lo declaran ${n} empresas`,
    paresCallsTitle: 'Los 24 llamados, uno por uno',
    colCall: 'Compra',
    colBuyer: 'Organismo',
    colBidders: 'Oferentes',
    colAmount: 'Adjudicado',
    colWho: 'Ganó',
    bothWon: 'las dos',
    oneWon: 'una de las dos',
    noneWon: 'ninguna',

    grupoTag: 'Hallazgo 1 · segunda capa',
    grupoTitle: 'Y las dos le venden al mismo organismo',
    grupoIntro: 'Competir en el mismo llamado es una foto. La otra pregunta es qué pasa el resto del año: de los ocho pares, los ocho le facturan a por lo menos un organismo en común. Acá el monto adjudicado a cada una desde 2020, en el organismo donde más coinciden.',
    grupoLead: 'El caso más grande es UTE: ELECTROSISTEMAS S.A. y UNION ELECTRICA S.A. —que declaran el mismo teléfono— se reparten 625 millones de pesos del mismo organismo, casi mitad y mitad (309 millones en 15 adjudicaciones y 316 en 19). En los dos llamados donde se presentaron juntas, no ganó ninguna de las dos.',
    grupoNote: 'Que un grupo empresarial venda a través de dos sociedades es legal y frecuente. Lo que agrega este cruce es de dónde sale la plata: el mismo comprador, por dos puertas.',
    colPair: 'Empresas',
    colSharedOrgs: 'Organismos donde facturan las dos',
    colTopOrg: 'Donde más coinciden',
    colBilledPair: 'Adjudicado ahí (2020→)',

    unicoTag: 'Hallazgo 2',
    unicoTitle: 'Una sola oferta en un llamado competitivo',
    unicoIntro: 'La compra directa no necesita competencia: para eso existe. Estos tres procedimientos sí. En los tres, alrededor de una de cada cinco compras miradas recibió una sola oferta.',
    unicoNote: 'Un llamado con una sola oferta no es irregular por sí mismo —puede que el pliego describa algo que una sola empresa vende—. Es la señal que en todo el mundo se mira primero, y hasta ahora en Uruguay no se podía mirar.',
    colMethod: 'Procedimiento',
    colProbed: 'Compras miradas',
    colSole: 'Con una sola oferta',
    colShare: 'Proporción',
    topTitle: 'Las quince mayores',
    colSupplier: 'Único oferente',

    inmedibleTag: 'Lo que no se puede medir',
    inmedibleTitle: 'Cuando el bloque lista ganadores, no ofertas',
    inmedible: [
      'La Intendencia de Montevideo aparecía primera con 93,8% de oferente único. No la publicamos, y conviene explicar por qué: en sus 65 compras miradas la lista de "participantes" coincide exactamente con la de adjudicatarios, las 65 veces. Nunca publicó a nadie que perdiera.',
      'Lo verificamos contra la ficha oficial de una compra suya con tres participantes: las tres están adjudicadas, una por ítem, y la página no dice cuántas ofertas se recibieron. Ese organismo publica adjudicatarios, no ofertas. Leer ese silencio como "se presentó una sola empresa" habría fabricado el titular.',
      'El control ahora está en el código: un organismo que nunca publicó un oferente perdedor queda marcado como inmedible, que no es lo mismo que limpio. Maldonado, en cambio, sí muestra perdedores en 6 de sus 7 compras no únicas, así que su 84% mide algo real.',
    ],
    artifactCol: 'Organismo',
    artifactProbed: 'Miradas',
    artifactMulti: 'Con 2+ oferentes',
    artifactLosers: 'Publicó algún perdedor',
    artifactVerdict: 'Medible',
    yes: 'Sí',
    no: 'No',

    outlierTag: 'Un número que no usamos',
    outlierTitle: 'El registro de $ 677 millones',
    outlierP: 'La compra con un solo oferente más cara del listado es una limpieza de UTE registrada como 1.475.400 unidades a $ 459: $ 677 millones. Tiene la forma exacta del error de carga que ya documentamos en este sitio (una cantidad que multiplica un precio unitario hasta un total imposible). No lo corregimos por nuestra cuenta ni lo contamos en el total: queda listado aparte, y con su enlace, para que lo mire quien pueda corregirlo.',

    sourcesTag: 'Cómo verificarlo',
    sourcesTitle: 'Todo esto se puede rehacer',
    sourcesP: 'Cada compra enlaza a su ficha oficial. El bloque "Proveedores participantes" está a mitad de página. Los domicilios salen del RUPE, que es público. El método completo, incluidos los filtros que descartaron 84 de los 92 pares iniciales, está comentado en el módulo de datos.',
  },
  en: {
    kicker: 'Own investigation · data, not an accusation',
    title: 'The tender looked competitive',
    dek: 'In 852 of the 4,372 competitive purchases we could inspect, exactly one company bid. In another 24, two of the companies bidding against each other share a phone number or the address they filed with the State.',
    fileOrg: '206 public bodies',
    filePeriod: '2025 – 2026',
    fileScope: '4,372 purchases with published bidders',
    chips: ['Single bidding', 'Linked bidders', 'Verified method', 'Open data'],
    statHead: 'Awarded in purchases with a single bidder',
    statSub: 'excluding one $677M outlier record explained below',
    tiles: [
      { n: '19.5%', l: 'of purchases inspected', s: 'received a single offer' },
      { n: '8', l: 'pairs of firms', s: 'share a phone or address and bid together' },
      { n: '24', l: 'tenders involved', s: 'across those pairs' },
      { n: '0.3%', l: 'of the corpus', s: 'is how much we have looked at' },
    ],

    queTag: 'What we looked at',
    queTitle: 'Who showed up, not just who won',
    que: [
      'The open-data feed publishes who WON each purchase, never who competed. That makes the number-one procurement red flag — a competitive tender receiving a single offer — impossible to measure here: the OCDS bidder fields are empty on 100% of records.',
      'The HTML page for each purchase does publish it, in a block called "Proveedores participantes" listing names and tax IDs. We are scraping it in batches. As of 13 August 2026 we have inspected 5,298 purchases, of which 4,372 published the block, across 206 public bodies.',
      'That allows two questions nobody could ask before: how many competitive tenders drew a single offer, and whether the firms bidding against each other are actually independent.',
    ],

    paresTag: 'Finding 1',
    paresTitle: 'Competing from the same doorway',
    paresIntro: 'We cross-referenced each tender\'s bidders against the address every firm files in the state supplier registry (RUPE) and the phone numbers they publish. Eight pairs bid on the same tender while sharing one of the two. That is not illegal and they may belong to one corporate group: what changes is that the tender had fewer independent bidders than its list suggests.',
    paresLead: 'The most frequent case: DECOSTAR S.A. and FULLSYSTEM S.R.L. file the same address (Aramburu Domingo 1634) — the only two firms in the corpus that file it — and the same phone. They bid together on seven tenders, including one from the National Casinos Directorate and one from the Judiciary. In three, the purchase was awarded to both.',
    paresColLink: 'Link',
    paresColCalls: 'Tenders together',
    paresColBoth: 'Awarded to both',
    paresPhone: 'same phone',
    paresAddr: 'same registry address',
    paresOwners: (n: number) => `filed by ${n} firms`,
    paresCallsTitle: 'All 24 tenders',
    colCall: 'Purchase',
    colBuyer: 'Buyer',
    colBidders: 'Bidders',
    colAmount: 'Awarded',
    colWho: 'Won',
    bothWon: 'both',
    oneWon: 'one of the two',
    noneWon: 'neither',

    grupoTag: 'Finding 1 · second layer',
    grupoTitle: 'And both sell to the same buyer',
    grupoIntro: 'Bidding on the same tender is a snapshot. The other question is what happens the rest of the year: all eight pairs bill at least one public body in common. Below, what each firm was awarded since 2020 at the body where they overlap most.',
    grupoLead: 'The largest case is the state power utility: ELECTROSISTEMAS S.A. and UNION ELECTRICA S.A. — which file the same phone number — split 625 million pesos from the same buyer, almost evenly (309 million across 15 awards and 316 across 19). In the two tenders where they bid together, neither won.',
    grupoNote: 'A corporate group selling through two companies is legal and common. What this cross-reference adds is where the money comes from: one buyer, two doors.',
    colPair: 'Firms',
    colSharedOrgs: 'Bodies both bill',
    colTopOrg: 'Biggest overlap',
    colBilledPair: 'Awarded there (2020→)',

    unicoTag: 'Finding 2',
    unicoTitle: 'A single offer in a competitive tender',
    unicoIntro: 'Direct purchase needs no competition — that is the point of it. These three procedures do. In all three, roughly one in five inspected purchases drew a single offer.',
    unicoNote: 'A single-offer tender is not irregular in itself — the specification may describe something only one company sells. It is the signal every procurement watchdog looks at first, and until now it could not be looked at in Uruguay.',
    colMethod: 'Procedure',
    colProbed: 'Inspected',
    colSole: 'Single offer',
    colShare: 'Share',
    topTitle: 'The fifteen largest',
    colSupplier: 'Sole bidder',

    inmedibleTag: 'What cannot be measured',
    inmedibleTitle: 'When the block lists winners, not offers',
    inmedible: [
      'Montevideo\'s city government came first at 93.8% single bidding. We are not publishing that, and it is worth explaining why: across its 65 inspected purchases the "participants" list matches the awarded-supplier list exactly, all 65 times. It never published anyone who lost.',
      'We checked it against the official page of one of its purchases with three participants: all three were awarded, one item each, and the page does not state how many offers were received. That body publishes winners, not offers. Reading that silence as "only one company bid" would have manufactured the headline.',
      'The guard now lives in the code: a body that has never published a losing bidder is flagged as unmeasurable, which is not the same as clean. Maldonado, by contrast, does show losers in 6 of its 7 non-single tenders, so its 84% measures something real.',
    ],
    artifactCol: 'Public body',
    artifactProbed: 'Inspected',
    artifactMulti: 'With 2+ bidders',
    artifactLosers: 'Published a loser',
    artifactVerdict: 'Measurable',
    yes: 'Yes',
    no: 'No',

    outlierTag: 'A number we did not use',
    outlierTitle: 'The $677 million record',
    outlierP: 'The most expensive single-bidder purchase in the list is a UTE cleaning contract recorded as 1,475,400 units at $459: $677 million. It has the exact shape of the data-entry error this site already documents (a quantity multiplying a unit price into an impossible total). We neither correct it ourselves nor count it in the total: it is listed separately, with its link, for whoever can fix it.',

    sourcesTag: 'How to check it',
    sourcesTitle: 'All of this can be redone',
    sourcesP: 'Every purchase links to its official page, where the "Proveedores participantes" block sits halfway down. Addresses come from RUPE, which is public. The full method, including the filters that discarded 84 of the initial 92 pairs, is documented in the data module.',
  },
} as const

export function competenciaContent(locale: string) {
  return COMPETENCIA_CONTENT[(locale === 'en' ? 'en' : 'es') as Locale]
}
