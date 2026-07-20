/**
 * Investigaciones · Con la tuya, contribuyente — datos y contenido.
 *
 * Fuente: Compras Estatales (OCDS), réplica en la base del sitio. Los métodos de compra
 * fueron verificados a mano en el portal oficial (ficha por ficha). Es un dataset de
 * INVESTIGACIÓN — una foto verificada a una fecha, no una vista en vivo; por eso vive como
 * módulo estático y cada dato enlaza a su fuente para re-chequear.
 *
 * Sobre los montos: los totales crudos del organismo están inflados por unos pocos registros
 * con cantidades corruptas (ver DESIGN.md, "3 records = 86%"). Aquí se usa el total ajustado
 * por plausibilidad y, para los rubros, se lidera con CANTIDAD DE LÍNEAS (exacta); el gasto
 * por rubro se marca como aproximado.
 */

export interface CortesiaContract { date: string, ocid: string, idc: string, sup: string, qty: number, unit: number, tot: number }
export interface RubroMap { code: string, key: string, dgc: number, cat: 'competitivo' | 'lockin' | 'hospitalidad', verif: string, id: string }
export interface DgcYear { year: number, contracts: number, spend: number }
export interface DgcSupplier { name: string, spend: number, awards: number }

export const CORTESIA_CONTRACTS: CortesiaContract[] = [{"date":"2021-08-31","ocid":"ocds-yfs5dr-888124","idc":"888124","sup":"VIDEST S A","qty":12,"unit":88798,"tot":1065574},{"date":"2021-09-09","ocid":"ocds-yfs5dr-893881","idc":"893881","sup":"CODIGO DE BARRAS SRL","qty":12,"unit":211749,"tot":2540984},{"date":"2021-09-10","ocid":"ocds-yfs5dr-888481","idc":"888481","sup":"HERNANDEZ RODALES MARIA GIMENA","qty":12,"unit":70833,"tot":850000},{"date":"2022-01-12","ocid":"ocds-yfs5dr-924591","idc":"924591","sup":"COSTA MARTINEZ EVER MARCELO","qty":1,"unit":30000,"tot":30000},{"date":"2022-02-17","ocid":"ocds-yfs5dr-927561","idc":"927561","sup":"COSTA MARTINEZ EVER MARCELO","qty":12,"unit":73333,"tot":880000},{"date":"2022-03-15","ocid":"ocds-yfs5dr-931843","idc":"931843","sup":"COSTA MARTINEZ EVER MARCELO","qty":12,"unit":37500,"tot":450000},{"date":"2022-03-18","ocid":"ocds-yfs5dr-899479","idc":"899479","sup":"NIFELAR S A","qty":12,"unit":61475,"tot":737705},{"date":"2022-04-21","ocid":"ocds-yfs5dr-930765","idc":"930765","sup":"ALEMAN GARCIA FATIMA NOEMI","qty":12,"unit":47814,"tot":573770},{"date":"2022-06-24","ocid":"ocds-yfs5dr-954897","idc":"954897","sup":"ALEMAN GARCIA FATIMA NOEMI","qty":1,"unit":35246,"tot":35246},{"date":"2022-07-14","ocid":"ocds-yfs5dr-954898","idc":"954898","sup":"ALEMAN GARCIA FATIMA NOEMI","qty":1,"unit":35246,"tot":35246},{"date":"2023-03-09","ocid":"ocds-yfs5dr-993991","idc":"993991","sup":"NIFELAR S A","qty":13,"unit":56747,"tot":737705},{"date":"2023-04-11","ocid":"ocds-yfs5dr-972066","idc":"972066","sup":"CAFE DEL CENTRO SRL","qty":36,"unit":16697,"tot":601093},{"date":"2023-06-29","ocid":"ocds-yfs5dr-1039251","idc":"1039251","sup":"RODRIGUEZ CARDOZO MATIAS GERMAN","qty":36,"unit":81967,"tot":2950820},{"date":"2023-06-29","ocid":"ocds-yfs5dr-1050203","idc":"1050203","sup":"NAVES CRAMER CATALINA ALEJANDRA","qty":36,"unit":47814,"tot":1721311},{"date":"2023-07-19","ocid":"ocds-yfs5dr-1021823","idc":"1021823","sup":"TRIBINO BRUM CARLOS ROBERTO","qty":12,"unit":37568,"tot":450820},{"date":"2023-07-20","ocid":"ocds-yfs5dr-984499","idc":"984499","sup":"CODIGO DE BARRAS SRL","qty":12,"unit":211749,"tot":2540984},{"date":"2023-07-28","ocid":"ocds-yfs5dr-1049284","idc":"1049284","sup":"EULA BENTANCUR ANDRES ALEJANDRO","qty":36,"unit":8333,"tot":300000},{"date":"2023-07-31","ocid":"ocds-yfs5dr-1021083","idc":"1021083","sup":"MENDEZ MARTINEZ MARIA CRISTINA","qty":36,"unit":58333,"tot":2100000},{"date":"2023-07-31","ocid":"ocds-yfs5dr-1026839","idc":"1026839","sup":"ANZORENA CARRANCIO JORGE ENRIQUE","qty":12,"unit":27322,"tot":327869},{"date":"2023-07-31","ocid":"ocds-yfs5dr-1026613","idc":"1026613","sup":"NAVES CRAMER CATALINA ALEJANDRA","qty":12,"unit":51230,"tot":614754},{"date":"2023-08-09","ocid":"ocds-yfs5dr-984496","idc":"984496","sup":"ALEMAN GARCIA FATIMA NOEMI","qty":12,"unit":47814,"tot":573771},{"date":"2023-11-14","ocid":"ocds-yfs5dr-1024135","idc":"1024135","sup":"VIDEST S A","qty":12,"unit":26639,"tot":319672},{"date":"2023-11-29","ocid":"ocds-yfs5dr-1083532","idc":"1083532","sup":"NAVES CRAMER CATALINA ALEJANDRA","qty":12,"unit":58060,"tot":696721},{"date":"2023-12-19","ocid":"ocds-yfs5dr-1099250","idc":"1099250","sup":"VIDEST S A","qty":2,"unit":61475,"tot":122951},{"date":"2023-12-28","ocid":"ocds-yfs5dr-1103368","idc":"1103368","sup":"NAVES CRAMER CATALINA ALEJANDRA","qty":1,"unit":32787,"tot":32787},{"date":"2023-12-28","ocid":"ocds-yfs5dr-1103295","idc":"1103295","sup":"EULA BENTANCUR ANDRES ALEJANDRO","qty":1,"unit":11000,"tot":11000},{"date":"2023-12-28","ocid":"ocds-yfs5dr-1103242","idc":"1103242","sup":"HERNANDEZ RODALES MARIA GIMENA","qty":1,"unit":19080,"tot":19080},{"date":"2024-01-08","ocid":"ocds-yfs5dr-1102936","idc":"1102936","sup":"PASWIR  S.A","qty":1,"unit":28689,"tot":28689},{"date":"2024-01-08","ocid":"ocds-yfs5dr-1102912","idc":"1102912","sup":"ANZORENA CARRANCIO JORGE ENRIQUE","qty":1,"unit":12295,"tot":12295},{"date":"2024-01-23","ocid":"ocds-yfs5dr-1083551","idc":"1083551","sup":"CARDOSO RODRIGUEZ MATIAS SANTIAGO","qty":36,"unit":45833,"tot":1650000},{"date":"2024-04-01","ocid":"ocds-yfs5dr-1115465","idc":"1115465","sup":"RAMIREZ DEVICENTI NATALIA SOLEDAD","qty":12,"unit":54645,"tot":655738},{"date":"2024-04-18","ocid":"ocds-yfs5dr-1124657","idc":"1124657","sup":"CODIGO DE BARRAS SRL","qty":4,"unit":211749,"tot":846994},{"date":"2024-04-29","ocid":"ocds-yfs5dr-1114853","idc":"1114853","sup":"CODIGO DE BARRAS SRL","qty":12,"unit":211749,"tot":2540984},{"date":"2024-05-23","ocid":"ocds-yfs5dr-1114854","idc":"1114854","sup":"NIFELAR S A","qty":12,"unit":61475,"tot":737705},{"date":"2024-05-23","ocid":"ocds-yfs5dr-1109288","idc":"1109288","sup":"DURANTE MONTES DE OCA ALEJANDRO MANUEL","qty":12,"unit":68306,"tot":819672},{"date":"2024-05-29","ocid":"ocds-yfs5dr-1102891","idc":"1102891","sup":"ANZORENA CARRANCIO JORGE ENRIQUE","qty":1,"unit":28689,"tot":28689},{"date":"2024-09-10","ocid":"ocds-yfs5dr-1162260","idc":"1162260","sup":"GONZALEZ VIGLIANTE GERMAN CONO","qty":36,"unit":115437,"tot":4155738},{"date":"2024-10-14","ocid":"ocds-yfs5dr-1164929","idc":"1164929","sup":"HERNANDEZ KUSTER SARA LILIAN","qty":48,"unit":29167,"tot":1400000},{"date":"2024-11-06","ocid":"ocds-yfs5dr-1181116","idc":"1181116","sup":"NAVES CRAMER CATALINA ALEJANDRA","qty":12,"unit":58060,"tot":696721},{"date":"2024-11-15","ocid":"ocds-yfs5dr-1181111","idc":"1181111","sup":"DEL CAMPO MARTINEZ ESTEBAN FABIAN","qty":12,"unit":58333,"tot":700000},{"date":"2024-12-27","ocid":"ocds-yfs5dr-1206985","idc":"1206985","sup":"RAMIREZ DEVICENTI NATALIA SOLEDAD","qty":12,"unit":54645,"tot":655738},{"date":"2024-12-27","ocid":"ocds-yfs5dr-1206784","idc":"1206784","sup":"NIFELAR S A","qty":12,"unit":61475,"tot":737705},{"date":"2025-01-10","ocid":"ocds-yfs5dr-1208456","idc":"1208456","sup":"ANZORENA CARRANCIO JORGE ENRIQUE","qty":1,"unit":32459,"tot":32459},{"date":"2025-01-10","ocid":"ocds-yfs5dr-1206977","idc":"1206977","sup":"RODRIGUEZ CARDOZO MATIAS GERMAN","qty":1,"unit":122951,"tot":122951},{"date":"2025-01-13","ocid":"ocds-yfs5dr-1205251","idc":"1205251","sup":"ANZORENA CARRANCIO JORGE ENRIQUE","qty":1,"unit":24590,"tot":24590},{"date":"2025-01-13","ocid":"ocds-yfs5dr-1206978","idc":"1206978","sup":"CARDOSO RODRIGUEZ MATIAS SANTIAGO","qty":1,"unit":32000,"tot":32000},{"date":"2025-04-15","ocid":"ocds-yfs5dr-1219789","idc":"1219789","sup":"HERNANDEZ KUSTER SARA LILIAN","qty":36,"unit":68306,"tot":2459016},{"date":"2025-05-06","ocid":"ocds-yfs5dr-1219789","idc":"1219789","sup":"HERNANDEZ KUSTER SARA LILIAN","qty":36,"unit":68306,"tot":2527322},{"date":"2025-05-06","ocid":"ocds-yfs5dr-1219789","idc":"1219789","sup":"NAVES CRAMER CATALINA ALEJANDRA","qty":0,"unit":68306,"tot":2527322},{"date":"2025-05-19","ocid":"ocds-yfs5dr-1225693","idc":"1225693","sup":"COSTA MARTINEZ EVER MARCELO","qty":36,"unit":27322,"tot":983607},{"date":"2025-06-05","ocid":"ocds-yfs5dr-1220218","idc":"1220218","sup":"COSTA MARTINEZ EVER MARCELO","qty":12,"unit":60109,"tot":721311},{"date":"2025-06-20","ocid":"ocds-yfs5dr-1237511","idc":"1237511","sup":"GONZALEZ VIGLIANTE GERMAN CONO","qty":36,"unit":21630,"tot":778689},{"date":"2025-09-29","ocid":"ocds-yfs5dr-1281229","idc":"1281229","sup":"DE LOS SANTOS COLMAN JUAN CARLOS","qty":18,"unit":45833,"tot":824994},{"date":"2025-11-06","ocid":"ocds-yfs5dr-1286230","idc":"1286230","sup":"DE LOS SANTOS COLMAN JUAN CARLOS","qty":10,"unit":30000,"tot":300000},{"date":"2025-11-18","ocid":"ocds-yfs5dr-1290627","idc":"1290627","sup":"NIFELAR S A","qty":12,"unit":68306,"tot":819672},{"date":"2025-12-29","ocid":"ocds-yfs5dr-1303626","idc":"1303626","sup":"DE LOS SANTOS COLMAN JUAN CARLOS","qty":1,"unit":20000,"tot":20000},{"date":"2026-03-09","ocid":"ocds-yfs5dr-1290691","idc":"1290691","sup":"RAMIREZ DEVICENTI NATALIA SOLEDAD","qty":12,"unit":57377,"tot":688525},{"date":"2026-05-20","ocid":"ocds-yfs5dr-1341660","idc":"1341660","sup":"DI MATTIA TROPIANO PABLO HUMBERTO","qty":5,"unit":23411,"tot":117055},{"date":"2026-05-25","ocid":"ocds-yfs5dr-1307206","idc":"1307206","sup":"NAVES CRAMER CATALINA ALEJANDRA","qty":36,"unit":141667,"tot":5100000},{"date":"2026-05-25","ocid":"ocds-yfs5dr-1307284","idc":"1307284","sup":"HERNANDEZ KUSTER SARA LILIAN","qty":36,"unit":87500,"tot":3150000},{"date":"2026-06-17","ocid":"ocds-yfs5dr-1326091","idc":"1326091","sup":"MENDEZ MARTINEZ MARIA CRISTINA","qty":36,"unit":50205,"tot":1807377},{"date":"2026-06-17","ocid":"ocds-yfs5dr-1306730","idc":"1306730","sup":"GONZALEZ VIGLIANTE GERMAN CONO","qty":24,"unit":64891,"tot":1557377},{"date":"2026-07-03","ocid":"ocds-yfs5dr-1333220","idc":"1333220","sup":"NAVES CRAMER CATALINA ALEJANDRA","qty":36,"unit":64549,"tot":2323771}]

export const VERIFIED_METHODS: Record<string, string> = {"893881":"Compra por Excepción 42/2021","984499":"Compra por Excepción 49/2022","1021083":"Compra por Excepción 19/2023","1039251":"Compra por Excepción 33/2023","1050203":"Compra por Excepción 51/2023","1103295":"Compra por Excepción 48/2023","1114853":"Compra por Excepción 7/2024","1162260":"Compra por Excepción 35/2024","1164929":"Compra por Excepción 40/2024","1307206":"Compra por Excepción 51/2025"}

/** Unit-price baseline for code 79764 (item_price_baselines), for the dispersion chart. */
export const CORTESIA_BASELINE = { min: 8333, p25: 28688.53, p50: 51229.51, p75: 63012.3, p95: 190724, max: 211748.64, n: 47 }

export const CORTESIA_STATS = { totalUYU: 58849923, usd: 1.47, contracts: 61, suppliers: 22, sharedWithDesayuno: 12, roundSums: 10, medianUnit: 51230, maxUnit: 211749, rankBySpend: 980, firstYear: 2021, lastYear: 2026 }

export const CORTESIA_BY_YEAR = [
  { year: 2021, spend: 4456557 }, { year: 2022, spend: 2741967 }, { year: 2023, spend: 14121338 },
  { year: 2024, spend: 15666667 }, { year: 2025, spend: 7119289 }, { year: 2026, spend: 14744105 },
]

export const RUBROS_MAP: RubroMap[] = [{"code":"42828","key":"repuestos","dgc":118249816,"cat":"lockin","verif":"Excepción 18/2026 · Art. 33.3","id":"1321272"},{"code":"14953","key":"desayuno","dgc":82507672,"cat":"hospitalidad","verif":"Excepción 35/2020 · Art. 33.3","id":"821353"},{"code":"79764","key":"cortesia","dgc":58849923,"cat":"hospitalidad","verif":"Excepción · Art. 33.3","id":"1307206"},{"code":"73208","key":"atm","dgc":51789129,"cat":"competitivo","verif":"Lic. Pública 7/2022","id":"944593"},{"code":"66364","key":"fichas","dgc":20283606,"cat":"competitivo","verif":"Lic. Pública 110226/2011","id":"288163"},{"code":"25350","key":"caja","dgc":10940559,"cat":"competitivo","verif":"Lic. Abreviada 28/2017","id":"853705"},{"code":"64547","key":"camaras","dgc":3307200,"cat":"competitivo","verif":"Lic. Abreviada 25/2024","id":"1259480"},{"code":"76541","key":"mantatm","dgc":2942876,"cat":"lockin","verif":"Excepción 26/2025 · Art. 33.3","id":"1257241"}]

export const DGC_METHODS = [{"key":"directa","n":2921},{"key":"abreviada","n":1021},{"key":"publica","n":216},{"key":"concurso","n":117},{"key":"excepcion","n":95},{"key":"otros","n":151}]
export const DGC_METHODS_NULL = 7179

export const DGC_BY_YEAR: DgcYear[] = [{"year":2003,"contracts":280,"spend":269812820},{"year":2004,"contracts":291,"spend":864921523},{"year":2005,"contracts":541,"spend":1072218178},{"year":2006,"contracts":473,"spend":681831980},{"year":2007,"contracts":360,"spend":265085725},{"year":2008,"contracts":546,"spend":72941689},{"year":2009,"contracts":590,"spend":847663719},{"year":2010,"contracts":611,"spend":415597072},{"year":2011,"contracts":524,"spend":324408325},{"year":2012,"contracts":609,"spend":393988279},{"year":2013,"contracts":523,"spend":503168065},{"year":2014,"contracts":377,"spend":615741411},{"year":2015,"contracts":362,"spend":352136414},{"year":2016,"contracts":439,"spend":421352307},{"year":2017,"contracts":445,"spend":271991241},{"year":2018,"contracts":384,"spend":551852928},{"year":2019,"contracts":551,"spend":1500154044},{"year":2020,"contracts":430,"spend":884443523},{"year":2021,"contracts":425,"spend":724962832},{"year":2022,"contracts":560,"spend":1107977584},{"year":2023,"contracts":564,"spend":879372704},{"year":2024,"contracts":587,"spend":811629839},{"year":2025,"contracts":783,"spend":1267391511},{"year":2026,"contracts":336,"spend":309775963}]
export const DGC_TOTAL_CONTRACTS = 11630
export const DGC_CAPPED_TOTAL = 15410928465

/** Top suppliers by capped spend (self-supplier + inter-state entities removed as data artifacts). */
export const DGC_TOP_SUPPLIERS: DgcSupplier[] = [{"name":"KALTE S.A.","spend":3835633136,"awards":27},{"name":"HRU S.A.","spend":719057185,"awards":29},{"name":"TECHNO GAMING INTERNATIONAL S.A.","spend":674691419,"awards":16},{"name":"SAMALIR S.A.","spend":465949348,"awards":24},{"name":"DEL  ESTE  SOL  S.R.L.","spend":452269644,"awards":6},{"name":"I C M S A","spend":429946749,"awards":52},{"name":"VIDAPLAN S.A.","spend":418728208,"awards":5},{"name":"VARELA ANDRES  JUAN MANUEL Y VARELA ANDRES MARIA CAROLINA SRL","spend":415564945,"awards":12},{"name":"ARNALDO CASTRO   LTDA.-","spend":289107992,"awards":8},{"name":"NARANPARK S.A.","spend":272617769,"awards":2},{"name":"SEVITEC LTDA","spend":266907112,"awards":16},{"name":"MARYSTAY S A","spend":264750041,"awards":11}]

export const DGC_OPS_RUBROS = [{"code":"66501","lines":28,"desc_es":"Arrendamiento de sala de juego","desc_en":"Gaming-hall lease"},{"code":"7102","lines":210,"desc_es":"Máquina tragamonedas","desc_en":"Slot machines"},{"code":"3960","lines":245,"desc_es":"Servicio de vigilancia","desc_en":"Security / surveillance"},{"code":"7022","lines":430,"desc_es":"Limpieza integral de locales","desc_en":"Cleaning services"},{"code":"9213","lines":223,"desc_es":"Transporte de valores","desc_en":"Cash-in-transit"},{"code":"42828","lines":286,"desc_es":"Repuestos de tragamonedas","desc_en":"Slot-machine parts"},{"code":"14953","lines":142,"desc_es":"Desayuno / merienda","desc_en":"Breakfast / snacks"},{"code":"753","lines":442,"desc_es":"Publicidad y difusión","desc_en":"Advertising"},{"code":"79764","lines":61,"desc_es":"Consumición de cortesía","desc_en":"Courtesy consumption"}]

export const excepcionTotal = RUBROS_MAP.filter(r => r.cat !== 'competitivo').reduce((s, r) => s + r.dgc, 0)
export const licitadoTotal = RUBROS_MAP.filter(r => r.cat === 'competitivo').reduce((s, r) => s + r.dgc, 0)


export type Locale = 'es' | 'en'
export const INV_CONTENT = {
  "es": {
    "common": {
      "source": "Fuente: Compras Estatales (OCDS)",
      "updated": "datos al 18/07/2026",
      "method": "Método",
      "ficha": "Ficha",
      "official": "Ver ficha oficial",
      "verified": "Verificado en el portal",
      "readMore": "Leer la investigación",
      "backToHub": "Todas las investigaciones",
      "disclaimerTitle": "Cómo leer esta investigación",
      "disclaimer": [
        "Es un análisis de datos de contratación pública, que son registro público. Documenta hechos verificables —montos, fechas, proveedores, método de compra— y señala patrones que ameritan escrutinio, distinguiendo lo probado de lo que es una pregunta abierta.",
        "Una compra por excepción, un precio alto o una concentración de proveedores no constituye, por sí sola, prueba de irregularidad o delito. Muchas contrataciones pueden tener justificación administrativa válida. El objetivo es habilitar el control ciudadano, no emitir un veredicto.",
        "Se nombran empresas y personas únicamente en su carácter de proveedores del Estado, tal como figuran en el sistema oficial. Quien quiera aportar su descargo o corregir un dato puede hacerlo, y se incorporará."
      ],
      "dataNote": "Los totales crudos del organismo están inflados por unos pocos registros con cantidades corruptas; se usa el total ajustado por plausibilidad y, para los rubros, se lidera con la cantidad de líneas (exacta). El gasto por rubro es aproximado."
    },
    "cat": {
      "competitivo": "Competitivo",
      "lockin": "Lock-in · excepción",
      "hospitalidad": "Hospitalidad · excepción"
    },
    "method": {
      "directa": "Compra Directa",
      "abreviada": "Licitación Abreviada",
      "publica": "Licitación Pública",
      "concurso": "Concurso de Precios",
      "excepcion": "Compra por Excepción",
      "otros": "Concesión / otros",
      "sinDato": "sin método en el dato"
    },
    "rubro": {
      "cortesia": "Consumición de cortesía",
      "desayuno": "Desayuno / merienda",
      "repuestos": "Repuestos de tragamonedas",
      "atm": "Cajeros ATM (máquinas)",
      "fichas": "Fichas de casino",
      "caja": "Mant. caja fuerte",
      "camaras": "Mant. cámaras de vigilancia",
      "mantatm": "Mant. cajeros ATM"
    },
    "chart": {
      "median": "Mediana",
      "unit": "unidad"
    },
    "hub": {
      "kicker": "Con la tuya, contribuyente · Investigaciones",
      "title": "Adónde fue tu plata",
      "dek": "Investigaciones de datos abiertos sobre el gasto del Estado uruguayo. Cada una arranca en un número del sistema de Compras Estatales, se verifica en la fuente oficial y termina con lo que cualquiera puede volver a chequear. Sin sesgo, con enlaces.",
      "stats": [
        {
          "n": "7",
          "l": "INVESTIGACIONES"
        },
        {
          "n": "+25",
          "l": "EMPRESAS SEÑALADAS"
        },
        {
          "n": "+$3.000 M",
          "l": "EN CONTRATOS ANALIZADOS"
        },
        {
          "n": "~120",
          "l": "FUENTES CITADAS"
        }
      ],
      "serieTag": "Serie",
      "serieTitle": "Casinos del Estado",
      "serieIntro": "La Dirección General de Casinos (Ministerio de Economía y Finanzas) opera el monopolio estatal del juego: cuatro casinos y unas 30 salas. Es rentable —USD 65 M de ganancia en 2024— y por eso mismo su gasto merece control. Estas investigaciones siguen su contratación rubro por rubro.",
      "cardCasinos": {
        "eyebrow": "La investigación completa",
        "title": "Casinos del Estado: todo el gasto",
        "dek": "11.630 contratos desde 2002. Qué compra, a quién, y cómo: la mayoría por contratación directa, con la licitación pública como rareza. El mapa completo del organismo.",
        "tags": [
          "$15,4 B ajustado",
          "método verificado",
          "concentración"
        ]
      },
      "cardCortesia": {
        "eyebrow": "Art. 79764 · deep-dive",
        "title": "La consumición de cortesía",
        "dek": "Casi 59 millones en comida y bebida regalada a los jugadores, adjudicados por «proveedor exclusivo»… a 22 proveedores distintos. Un proveedor cobra 4× lo que los demás, sin variar en años.",
        "tags": [
          "TOCAF Art. 33.3",
          "precio fijo 4×",
          "roster cerrado"
        ]
      },
      "serieImTitle": "Intendencias",
      "serieImIntro": "Los gobiernos departamentales manejan una parte enorme del gasto público y rinden cuentas de forma despareja. Estas investigaciones miran adónde va su plata, empezando por la más grande: Montevideo, en el peor déficit en una década.",
      "cardIm": {
        "eyebrow": "Gobiernos departamentales",
        "title": "Montevideo en rojo: el gasto discrecional",
        "dek": "En 2024 la Intendencia cerró con el mayor déficit en diez años (USD 82,6 M) y siguió pagando publicidad, espectáculos, catering y merchandising. El gasto discrecional, contrato por contrato.",
        "tags": [
          "déficit ×8",
          "$400 M discrecional",
          "cada ficha enlazada"
        ]
      },
      "cardTvciudad": {
        "eyebrow": "Intendencia de Montevideo",
        "title": "TV Ciudad: cuánto cuesta el canal municipal",
        "dek": "El canal de la Intendencia cuesta entre USD 8 y 10 millones al año, pero casi no deja rastro en las compras: se financia por presupuesto. Lo que sí queda registrado, más el presupuesto, la publicidad, la NBA y los recortes.",
        "tags": [
          "≈ USD 8–10 M/año",
          "publicidad ×5",
          "solo 20 registros"
        ]
      },
      "serieEmpTitle": "Empresas señaladas",
      "serieEmpIntro": "Partimos de empresas señaladas por la prensa y la Justicia por corrupción o irregularidades con el Estado, y las cruzamos contra la base para ver si el señalamiento deja rastro en los datos abiertos. Algunas aparecen de cuerpo entero; las más grandes casi no se ven.",
      "cardEmpresas": {
        "eyebrow": "El catálogo",
        "title": "¿Lo confirma la base?",
        "dek": "Más de 25 empresas señaladas por corrupción con el Estado, cruzadas una por una contra Compras Estatales. Cuáles son verificables en los datos, cuáles quedan fuera del alcance y por qué. Cada caso con su estado legal y su fuente.",
        "tags": [
          "Prensa + Justicia",
          "cruzado con la base",
          "cada dato con fuente"
        ]
      },
      "cardAsse": {
        "eyebrow": "Salud · ASSE",
        "title": "ITHG: 5 fichas para US$ 20 millones",
        "dek": "Una «proveedora marítima» concentró el 96% de los traslados de ASSE por compra directa. La base registra $33 M; la auditoría y el Tribunal de Cuentas, más de $2.000 M. La invisibilidad del gasto directo, medida.",
        "tags": [
          "96,47% de los traslados",
          "US$ 800 mil por 1 ambulancia",
          "denuncia penal 2026"
        ]
      },
      "cardSaturno": {
        "eyebrow": "Defensa · FF.AA.",
        "title": "Saturno: la carne de los cuarteles",
        "dek": "283 contratos por $1.140 M con el INDA y las tres fuerzas. En la Armada, un faltante de 57 toneladas de bondiola terminó en la Fiscalía de Delitos Económicos.",
        "tags": [
          "$1.140 M facturados",
          "faltante 57 toneladas",
          "causa penal"
        ]
      },
      "methodTag": "Método",
      "methodTitle": "Cómo se hace cada una",
      "how": [
        {
          "n": "Datos abiertos",
          "h": "Empieza en la fuente",
          "p": "Todo sale de Compras Estatales (OCDS, catalogodatos.gub.uy), la misma base que alimenta el sitio. Nada de números sin origen."
        },
        {
          "n": "Verificación",
          "h": "Se chequea a mano",
          "p": "El método de compra, el monto y el proveedor se confirman abriendo la ficha oficial de cada contrato. Cada afirmación fuerte tiene su enlace."
        },
        {
          "n": "Sin veredicto",
          "h": "Marca, no acusa",
          "p": "Se distinguen los hechos de las preguntas abiertas. Un patrón no es un delito: se señala dónde pedir el expediente, y se incluye el descargo del organismo."
        }
      ],
      "soonTag": "En curso",
      "soonTitle": "Próximas líneas",
      "soon": [
        {
          "emoji": "🍸",
          "eyebrow": "Aguas arriba",
          "title": "Las concesiones de bar",
          "dek": "La defensa de la «exclusividad» se apoya en que cada sala tiene un concesionario de bar. La pregunta que falta: cómo y con qué competencia se adjudicó cada concesión."
        },
        {
          "emoji": "🏛️",
          "eyebrow": "Más organismos",
          "title": "El resto del Estado",
          "dek": "El mismo método aplicado a otras reparticiones: dónde se concentra el gasto, quién gana sin competencia y qué patrones se repiten."
        }
      ]
    },
    "casinos": {
      "fileOrg": "Dirección General de Casinos",
      "filePeriod": "2002–2026",
      "fileInciso": "05 · UE 013",
      "kicker": "Investigación completa · Con la tuya, contribuyente",
      "title": "Todo el gasto de Casinos del Estado",
      "dek": "La Dirección General de Casinos hizo 11.630 contratos en 24 años. Este es el mapa completo: cuánto, en qué, a quién y —sobre todo— cómo lo compra.",
      "chips": [
        "11.630 contratos",
        "≈ $15,4 B ajustado",
        "2002–2026",
        "MEF · Inciso 05"
      ],
      "statContracts": "contratos 2002–2026",
      "statCapped": "gasto ajustado por plausibilidad",
      "statCappedSub": "los totales crudos están inflados por outliers",
      "statRubros": "rubros distintos comprados",
      "statExcepcion": "de este grupo, por «proveedor exclusivo»",
      "queTag": "Qué compra",
      "queTitle": "De las tragamonedas a la limpieza",
      "queIntro": "El gasto de un casino estatal es mitad negocio del juego —máquinas, fichas, repuestos, transporte de valores— y mitad operación de un local grande: limpieza, vigilancia, aire acondicionado, publicidad. Estos son los rubros con más contratos (la medida más confiable; el gasto por rubro es aproximado por los outliers).",
      "queChart": "Rubros de la DGC por cantidad de contratos",
      "comoTag": "Cómo compra",
      "comoTitle": "La licitación pública es la excepción",
      "comoIntro": "El TOCAF pone la licitación pública como regla general. En la DGC, de las compras con método registrado, la licitación pública son apenas 216 de más de 4.400. Domina la contratación directa y sus variantes.",
      "comoChart": "Métodos de contratación (histórico)",
      "comoFindingTitle": "2.921 compras directas, 216 licitaciones públicas",
      "comoFinding": "No todo lo directo es objetable —un repuesto urgente, un monto chico—. Pero la proporción marca dónde mirar: cuanto menos se licita, menos se compite, y más peso tiene la decisión discrecional de a quién comprarle.",
      "mapaTag": "El mapa",
      "mapaTitle": "Qué se licita y qué se compra a dedo",
      "mapaIntro": "Verificamos, ficha por ficha, el método de ocho rubros. Aparece una lógica: los bienes que se pueden especificar en un pliego se licitan; la excepción de «exclusividad» queda para el hardware propietario y para la hospitalidad.",
      "mapaChart": "Ocho rubros por método (monto DGC)",
      "mapaExcepcion": "por «proveedor exclusivo»",
      "mapaLicitado": "licitado",
      "provTag": "Los proveedores",
      "provTitle": "Quién cobra",
      "provIntro": "Top de proveedores por monto ajustado (se quitaron los registros del propio organismo como «proveedor» y de otras reparticiones estatales, que son artefactos del dato). El primero concentra una porción enorme y merece su propia mirada.",
      "provChart": "Top de proveedores de la DGC",
      "provNote": "KALTE S.A. encabeza con una porción muy grande del gasto ajustado; conviene abrir sus contratos para entender de qué se trata. SAMALIR, TECHNO GAMING e I.C.M. son proveedores recurrentes del negocio del juego (fichas, máquinas, repuestos).",
      "deepTag": "Deep-dive",
      "deepTitle": "La punta del ovillo: la cortesía",
      "deepDek": "El rubro donde la excepción de «exclusividad» se vuelve más difícil de sostener: la comida y bebida que se regala a los jugadores. 22 proveedores para un servicio «exclusivo».",
      "sourcesTitle": "Fuentes",
      "sourcesLicitado": "Rubros licitados",
      "sourcesExcepcion": "Rubros por excepción",
      "sourcesNorm": "Normativa y datos"
    },
    "cortesia": {
      "fileArt": "Art. 79764",
      "fileOrg": "Dirección General de Casinos",
      "filePeriod": "2021–2026",
      "kicker": "Investigación · Con la tuya, contribuyente",
      "title": "La consumición de cortesía",
      "dek": "El Estado gastó casi 59 millones de pesos en comida y bebida regalada a los clientes de sus casinos. Cada compra se resolvió invocando la excepción de «proveedor exclusivo». Los proveedores exclusivos fueron 22 distintos.",
      "chips": [
        "61 contratos",
        "22 proveedores",
        "1 comprador",
        "Excepción · TOCAF 33.3"
      ],
      "statTotal": "gasto del artículo 79764",
      "statTotalSub": "≈ USD 1,47 M · ajustado por plausibilidad",
      "tiles": [
        {
          "n": "61",
          "l": "contratos / líneas",
          "s": "2021 → 2026"
        },
        {
          "n": "22",
          "l": "proveedores distintos",
          "s": "para un servicio «exclusivo»"
        },
        {
          "n": "100%",
          "l": "de un solo comprador",
          "s": "Dirección General de Casinos"
        },
        {
          "n": "4,1×",
          "l": "precio máx. sobre la mediana",
          "s": "$ 211.749 vs $ 51.230"
        }
      ],
      "queTag": "Contexto",
      "queTitle": "Qué es «consumición de cortesía»",
      "que": [
        "La partida con la que el casino estatal compra comida y bebida para regalarla a sus jugadores —en la jerga, un comp: un incentivo de fidelización calibrado a lo que el jugador pierde en promedio—. La DGC dice que se ampara en una norma de 1998 y en su Resolución 140/2021.",
        "El rubro saltó a la prensa en marzo de 2021 por una compra de $ 880.000 al año en la sala de Minas. Lo que sigue no es esa polémica puntual, sino el agregado completo del rubro —todas las salas, todos los años— reconstruido desde el sistema oficial."
      ],
      "hallazgoTag": "El hallazgo central",
      "hallazgoTitle": "Un servicio «exclusivo» que tiene 22 proveedores",
      "hallazgoKicker": "Método · verificado en Compras Estatales",
      "hallazgoH": "Compra por Excepción — TOCAF, Art. 33, numeral 3",
      "hallazgoP": "Cada adjudicación que revisamos se resolvió como Compra por Excepción, invocando la causal de proveedor exclusivo: la vía que permite contratar directo, sin licitación y sin tope de monto, cuando —y solo cuando— el bien o servicio lo provee un único oferente insustituible.",
      "hallazgoLaw": "TOCAF Art. 33, lit. D, num. 3 — habilita la contratación directa para «bienes o servicios cuya fabricación o suministro sea exclusivo… que no puedan ser sustituidos por elementos similares».",
      "contraA": "La causal invocada",
      "contraAp": "«Suministro exclusivo… que no puede ser sustituido.» Un único proveedor posible.",
      "contraB": "Lo que muestran los datos",
      "contraBp": "22 proveedores adjudicados para el mismo artículo, rotando año a año.",
      "balanceH": "La otra campana · el descargo de la DGC",
      "balance": [
        "La DGC explica que compra por excepción porque el concesionario del bar de cada sala tiene la exclusividad de vender dentro de ese local. Y en parte se sostiene: Nifelar S.A. explota el bar del estatal Argentino Hotel; Videst S.A. es catering.",
        "Pero eso traslada la pregunta un nivel más arriba: si la exclusividad nace de la concesión del bar, ¿cómo y con qué competencia se adjudicó cada concesión? Y no explica por qué aparecen varios proveedores en el mismo período, ni por qué uno cobra 4× lo que otros por la misma «unidad»."
      ],
      "scatterTag": "La evidencia · precio por unidad",
      "scatterTitle": "El precio de la misma «unidad» va de $ 8.333 a $ 211.749",
      "scatterIntro": "Cada punto es un contrato. La línea marca la mediana ($ 51.230). En rojo, Código de Barras SRL: cobra siempre exactamente $ 211.749 —cuatro veces la mediana, sin moverse un peso entre 2021 y 2024—.",
      "scatterLegendRest": "Resto de proveedores",
      "scatterLegendCdb": "Código de Barras SRL (precio fijo)",
      "obsTag": "Observaciones",
      "obsTitle": "Patrones que ameritan mirada",
      "obs": [
        {
          "tag": "Precio fijo",
          "h": "4× la mediana, sin variar en años",
          "p": "Código de Barras SRL facturó exactamente $ 211.749 por unidad en 2021, 2023 y dos veces en 2024. No se movió un peso pese a la inflación."
        },
        {
          "tag": "Roster cerrado",
          "h": "La misma bolsa rota entre dos rubros",
          "p": "De los 22 proveedores de cortesía, 12 también proveen el desayuno/merienda del mismo comprador. Un círculo estable de caterers."
        },
        {
          "tag": "Sumas redondas",
          "h": "Diez montos múltiplos de 50.000",
          "p": "10 de 63 líneas cierran en cifras redondas —$ 300.000, $ 2.100.000, $ 5.100.000— más de una suma pactada que de un precio competido."
        },
        {
          "tag": "Línea fantasma",
          "h": "Una adjudicación de $ 2,5 M con cantidad cero",
          "p": "La compra 1219789 (2025) registra una línea con cantidad = 0 que arrastra un total de $ 2.527.322."
        },
        {
          "tag": "Escalada",
          "h": "Un precio casi se triplica",
          "p": "Naves Cramer pasó de $ 47.814/u (2023) a $ 141.667 (mayo 2026, compra de $ 5,1 M). Misma partida, sin licitación."
        },
        {
          "tag": "Punto ciego",
          "h": "El detector estadístico no marca nada",
          "p": "De 6.255 alertas de precio en la base, cero caen acá: la «UNIDAD» no significa nada físico y la dispersión entierra hasta el premium 4×."
        }
      ],
      "ledgerTag": "La evidencia · libro mayor",
      "ledgerTitle": "Las 63 líneas, una por una",
      "ledgerIntro": "Cada fila enlaza a su ficha en el sitio. Resaltadas: el precio fijo de Código de Barras y la línea de cantidad cero.",
      "colDate": "Fecha",
      "colSup": "Proveedor",
      "colQty": "Cant.",
      "colUnit": "Precio unit.",
      "colTot": "Total",
      "colMethod": "Método",
      "colFicha": "Ficha",
      "consultar": "consultar ficha",
      "sourcesTitle": "Fuentes"
    }
  },
  "en": {
    "common": {
      "source": "Source: state procurement (OCDS)",
      "updated": "data as of 2026-07-18",
      "method": "Method",
      "ficha": "Record",
      "official": "View official record",
      "verified": "Verified on the portal",
      "readMore": "Read the investigation",
      "backToHub": "All investigations",
      "disclaimerTitle": "How to read this investigation",
      "disclaimer": [
        "This is an analysis of public procurement data, which is public record. It documents verifiable facts — amounts, dates, suppliers, procurement method — and flags patterns worth scrutiny, keeping proven facts apart from open questions.",
        "An exception purchase, a high price or supplier concentration is not, on its own, proof of wrongdoing. Many contracts may have valid administrative justification. The goal is to enable citizen oversight, not to issue a verdict.",
        "Companies and people are named only as state suppliers, as they appear in the official system. Anyone named may add their response or correct a figure, and it will be incorporated."
      ],
      "dataNote": "The agency raw totals are inflated by a few records with corrupt quantities; a plausibility-capped total is used, and rubros are led by contract counts (exact). Per-rubro spend is approximate."
    },
    "cat": {
      "competitivo": "Competitive",
      "lockin": "Lock-in · exception",
      "hospitalidad": "Hospitality · exception"
    },
    "method": {
      "directa": "Direct purchase",
      "abreviada": "Abbreviated tender",
      "publica": "Public tender",
      "concurso": "Price contest",
      "excepcion": "Exception purchase",
      "otros": "Concession / other",
      "sinDato": "no method in the data"
    },
    "rubro": {
      "cortesia": "Courtesy consumption",
      "desayuno": "Breakfast / snacks",
      "repuestos": "Slot-machine parts",
      "atm": "ATM machines",
      "fichas": "Casino chips",
      "caja": "Safe maintenance",
      "camaras": "CCTV maintenance",
      "mantatm": "ATM maintenance"
    },
    "chart": {
      "median": "Median",
      "unit": "unit"
    },
    "hub": {
      "kicker": "Con la tuya, contribuyente · Investigations",
      "title": "Where your money went",
      "dek": "Open-data investigations into Uruguayan state spending. Each starts from a number in the state procurement system, is verified against the official source, and ends with something anyone can re-check. No bias, with links.",
      "stats": [
        {
          "n": "7",
          "l": "INVESTIGATIONS"
        },
        {
          "n": "+25",
          "l": "COMPANIES FLAGGED"
        },
        {
          "n": "+$3,000 M",
          "l": "IN CONTRACTS ANALYZED"
        },
        {
          "n": "~120",
          "l": "SOURCES CITED"
        }
      ],
      "serieTag": "Series",
      "serieTitle": "State Casinos",
      "serieIntro": "The Directorate of Casinos (Ministry of Economy) runs the state gambling monopoly: four casinos and ~30 halls. It is profitable — USD 65 M in 2024 — which is exactly why its spending deserves oversight. These investigations follow its contracting rubro by rubro.",
      "cardCasinos": {
        "eyebrow": "The full investigation",
        "title": "State Casinos: all the spending",
        "dek": "11,630 contracts since 2002. What it buys, from whom, and how: mostly direct contracting, with public tender the rarity. The full map of the agency.",
        "tags": [
          "$15.4 B capped",
          "method verified",
          "concentration"
        ]
      },
      "cardCortesia": {
        "eyebrow": "Art. 79764 · deep-dive",
        "title": "Courtesy consumption",
        "dek": "Nearly 59 million pesos of food and drink comped to gamblers, awarded as “exclusive supplier”… to 22 different suppliers. One bills 4× the rest, unchanged for years.",
        "tags": [
          "TOCAF Art. 33.3",
          "flat 4× price",
          "closed roster"
        ]
      },
      "serieImTitle": "Departmental governments",
      "serieImIntro": "Departmental governments handle a huge share of public spending and report unevenly. These investigations look at where their money goes, starting with the biggest: Montevideo, in its worst deficit in a decade.",
      "cardIm": {
        "eyebrow": "Departmental governments",
        "title": "Montevideo in the red: the discretionary spend",
        "dek": "In 2024 the city posted its biggest deficit in ten years (USD 82.6 M) and kept paying for advertising, shows, catering and merchandising. The discretionary spend, contract by contract.",
        "tags": [
          "deficit ×8",
          "$400 M discretionary",
          "every file linked"
        ]
      },
      "cardTvciudad": {
        "eyebrow": "Intendencia de Montevideo",
        "title": "TV Ciudad: what the municipal channel costs",
        "dek": "The city’s TV channel costs between USD 8 and 10 million a year, yet barely shows up in procurement: it’s budget-funded. What does get recorded, plus the budget, the advertising, the NBA deal and the cuts.",
        "tags": [
          "≈ USD 8–10 M/yr",
          "advertising ×5",
          "only 20 records"
        ]
      },
      "serieEmpTitle": "Flagged companies",
      "serieEmpIntro": "We start from companies flagged by the press and the courts for corruption or irregularities with the State, and cross them against the data to see whether the flag leaves a trace in the open records. Some appear in full; the biggest barely show up.",
      "cardEmpresas": {
        "eyebrow": "The catalog",
        "title": "Does the data confirm it?",
        "dek": "Over 25 companies flagged for corruption with the State, cross-checked one by one against State procurement. Which are verifiable in the data, which fall outside its scope and why. Each case with its legal status and its source.",
        "tags": [
          "Press + courts",
          "cross-checked with the data",
          "every figure sourced"
        ]
      },
      "cardAsse": {
        "eyebrow": "Health · ASSE",
        "title": "ITHG: 5 records for US$20 million",
        "dek": "A “maritime supplier” concentrated 96% of ASSE’s transfers by direct purchase. The data shows $33 M; the audit and the Tribunal de Cuentas, over $2,000 M. The invisibility of direct spending, measured.",
        "tags": [
          "96.47% of transfers",
          "US$800k for 1 ambulance",
          "criminal complaint 2026"
        ]
      },
      "cardSaturno": {
        "eyebrow": "Defense · Armed forces",
        "title": "Saturno: the barracks’ meat",
        "dek": "283 contracts for $1,140 M with INDA and all three forces. In the Navy, a 57-tonne shortfall of pork ended up with the Economic Crimes Prosecutor.",
        "tags": [
          "$1,140 M billed",
          "57-tonne shortfall",
          "criminal case"
        ]
      },
      "methodTag": "Method",
      "methodTitle": "How each one is done",
      "how": [
        {
          "n": "Open data",
          "h": "Starts at the source",
          "p": "Everything comes from state procurement (OCDS, catalogodatos.gub.uy), the same base that powers the site. No numbers without an origin."
        },
        {
          "n": "Verification",
          "h": "Checked by hand",
          "p": "The procurement method, amount and supplier are confirmed by opening each contract official record. Every strong claim has its link."
        },
        {
          "n": "No verdict",
          "h": "Flags, does not accuse",
          "p": "Facts are kept apart from open questions. A pattern is not a crime: it points to where to request the file, and includes the agency response."
        }
      ],
      "soonTag": "In progress",
      "soonTitle": "Next lines",
      "soon": [
        {
          "emoji": "🍸",
          "eyebrow": "Upstream",
          "title": "The bar concessions",
          "dek": "The “exclusivity” defense rests on each hall having a bar concessionaire. The missing question: how, and with what competition, was each concession awarded?"
        },
        {
          "emoji": "🏛️",
          "eyebrow": "More agencies",
          "title": "The rest of the State",
          "dek": "The same method applied to other agencies: where spending concentrates, who wins without competition, and which patterns repeat."
        }
      ]
    },
    "casinos": {
      "fileOrg": "Directorate of Casinos",
      "filePeriod": "2002–2026",
      "fileInciso": "05 · UE 013",
      "kicker": "Full investigation · Con la tuya, contribuyente",
      "title": "All the spending of State Casinos",
      "dek": "The Directorate of Casinos made 11,630 contracts in 24 years. This is the full map: how much, on what, from whom and — above all — how it buys.",
      "chips": [
        "11,630 contracts",
        "≈ $15.4 B capped",
        "2002–2026",
        "MEF · Inciso 05"
      ],
      "statContracts": "contracts 2002–2026",
      "statCapped": "plausibility-capped spend",
      "statCappedSub": "raw totals are inflated by outliers",
      "statRubros": "distinct rubros purchased",
      "statExcepcion": "of this group, by “exclusive supplier”",
      "queTag": "What it buys",
      "queTitle": "From slots to cleaning",
      "queIntro": "A state casino spending is half the gambling business — machines, chips, parts, cash-in-transit — and half running a big venue: cleaning, security, AC, advertising. These are the rubros with the most contracts (the most reliable measure; per-rubro spend is approximate).",
      "queChart": "DGC rubros by contract count",
      "comoTag": "How it buys",
      "comoTitle": "Public tender is the exception",
      "comoIntro": "The TOCAF makes public tender the general rule. At the DGC, of purchases with a recorded method, public tenders are just 216 of over 4,400. Direct contracting and its variants dominate.",
      "comoChart": "Procurement methods (historical)",
      "comoFindingTitle": "2,921 direct purchases, 216 public tenders",
      "comoFinding": "Not all direct buying is objectionable — an urgent part, a small amount. But the ratio shows where to look: the less that is tendered, the less competition, and the more weight falls on the discretionary choice of whom to buy from.",
      "mapaTag": "The map",
      "mapaTitle": "What is tendered and what is bought sole-source",
      "mapaIntro": "We verified, record by record, the method of eight rubros. A logic appears: goods that can be specified in a tender document are tendered; the “exclusivity” exception is kept for proprietary hardware and for hospitality.",
      "mapaChart": "Eight rubros by method (DGC amount)",
      "mapaExcepcion": "by “exclusive supplier”",
      "mapaLicitado": "tendered",
      "provTag": "The suppliers",
      "provTitle": "Who gets paid",
      "provIntro": "Top suppliers by capped amount (the agency own records as “supplier” and those of other state bodies were removed as data artifacts). The first concentrates a huge share and deserves its own look.",
      "provChart": "Top DGC suppliers",
      "provNote": "KALTE S.A. leads with a very large share of capped spend; its contracts are worth opening to understand what they are. SAMALIR, TECHNO GAMING and I.C.M. are recurring suppliers of the gambling business (chips, machines, parts).",
      "deepTag": "Deep-dive",
      "deepTitle": "The loose thread: courtesy consumption",
      "deepDek": "The rubro where the “exclusivity” exception is hardest to sustain: the food and drink comped to gamblers. 22 suppliers for an “exclusive” service.",
      "sourcesTitle": "Sources",
      "sourcesLicitado": "Tendered rubros",
      "sourcesExcepcion": "Exception rubros",
      "sourcesNorm": "Rules and data"
    },
    "cortesia": {
      "fileArt": "Art. 79764",
      "fileOrg": "Directorate of Casinos",
      "filePeriod": "2021–2026",
      "kicker": "Investigation · Con la tuya, contribuyente",
      "title": "Courtesy consumption",
      "dek": "The State spent nearly 59 million pesos on food and drink comped to casino gamblers. Every purchase was resolved by invoking the “exclusive supplier” exception. The exclusive suppliers were 22 different ones.",
      "chips": [
        "61 contracts",
        "22 suppliers",
        "1 buyer",
        "Exception · TOCAF 33.3"
      ],
      "statTotal": "spend on article 79764",
      "statTotalSub": "≈ USD 1.47 M · plausibility-capped",
      "tiles": [
        {
          "n": "61",
          "l": "contracts / lines",
          "s": "2021 → 2026"
        },
        {
          "n": "22",
          "l": "distinct suppliers",
          "s": "for an “exclusive” service"
        },
        {
          "n": "100%",
          "l": "from a single buyer",
          "s": "Directorate of Casinos"
        },
        {
          "n": "4.1×",
          "l": "max price over median",
          "s": "$ 211,749 vs $ 51,230"
        }
      ],
      "queTag": "Context",
      "queTitle": "What “courtesy consumption” is",
      "que": [
        "The budget line the state casino uses to buy food and drink to give away to its gamblers — in the jargon, a comp: a loyalty incentive calibrated to a player average loss. The DGC says it rests on a 1998 rule and its Resolution 140/2021.",
        "The item hit the press in March 2021 over an $880,000-a-year purchase at the Minas hall. What follows is not that one controversy, but the full aggregate of the rubro — all halls, all years — rebuilt from the official system."
      ],
      "hallazgoTag": "The central finding",
      "hallazgoTitle": "An “exclusive” service with 22 suppliers",
      "hallazgoKicker": "Method · verified on state procurement",
      "hallazgoH": "Exception Purchase — TOCAF, Art. 33, item 3",
      "hallazgoP": "Every award we reviewed was resolved as an Exception Purchase, invoking the exclusive-supplier ground: the route that allows direct contracting, without a tender and without an amount cap, when — and only when — a single, irreplaceable bidder supplies the good or service.",
      "hallazgoLaw": "TOCAF Art. 33, item D.3 — allows direct contracting for “goods or services of exclusive manufacture or supply… that cannot be substituted by similar items”.",
      "contraA": "The ground invoked",
      "contraAp": "“Exclusive supply… that cannot be substituted.” A single possible supplier.",
      "contraB": "What the data shows",
      "contraBp": "22 suppliers awarded for the same article, rotating year to year.",
      "balanceH": "The other side · the DGC defense",
      "balance": [
        "The DGC explains it buys by exception because each hall bar concessionaire holds exclusivity to sell inside that venue. And it partly holds: Nifelar S.A. runs the bar of the state-owned Argentino Hotel; Videst S.A. is a catering firm.",
        "But that moves the question one level up: if the exclusivity comes from the bar concession, how — and with what competition — was each concession awarded? And it does not explain why several suppliers appear in the same period, nor why one bills 4× what others do for the same “unit”."
      ],
      "scatterTag": "The evidence · price per unit",
      "scatterTitle": "The same “unit” ranges from $ 8,333 to $ 211,749",
      "scatterIntro": "Each dot is a contract. The line marks the median ($ 51,230). In red, Código de Barras SRL: it always bills exactly $ 211,749 — four times the median, unchanged between 2021 and 2024.",
      "scatterLegendRest": "Other suppliers",
      "scatterLegendCdb": "Código de Barras SRL (flat price)",
      "obsTag": "Observations",
      "obsTitle": "Patterns worth a look",
      "obs": [
        {
          "tag": "Flat price",
          "h": "4× the median, unchanged for years",
          "p": "Código de Barras SRL billed exactly $ 211,749 per unit in 2021, 2023 and twice in 2024. Not a peso of movement despite inflation."
        },
        {
          "tag": "Closed roster",
          "h": "The same pool across two rubros",
          "p": "Of the 22 courtesy suppliers, 12 also supply the same buyer breakfast/snack line. A stable circle of caterers."
        },
        {
          "tag": "Round sums",
          "h": "Ten amounts are multiples of 50,000",
          "p": "10 of 63 lines close on round figures — $ 300,000, $ 2,100,000, $ 5,100,000 — more a pre-agreed sum than a competed price."
        },
        {
          "tag": "Phantom line",
          "h": "A $ 2.5 M award with zero quantity",
          "p": "Purchase 1219789 (2025) records a line with quantity = 0 carrying a total of $ 2,527,322."
        },
        {
          "tag": "Escalation",
          "h": "One price nearly triples",
          "p": "Naves Cramer went from $ 47,814/unit (2023) to $ 141,667 (May 2026, a $ 5.1 M purchase). Same rubro, no tender."
        },
        {
          "tag": "Blind spot",
          "h": "The statistical detector flags nothing",
          "p": "Of 6,255 price alerts in the base, zero land here: the “UNIT” means nothing physical and the spread buries even the 4× premium."
        }
      ],
      "ledgerTag": "The evidence · ledger",
      "ledgerTitle": "The 63 lines, one by one",
      "ledgerIntro": "Each row links to its record on the site. Highlighted: Código de Barras flat price and the zero-quantity line.",
      "colDate": "Date",
      "colSup": "Supplier",
      "colQty": "Qty",
      "colUnit": "Unit price",
      "colTot": "Total",
      "colMethod": "Method",
      "colFicha": "Record",
      "consultar": "view record",
      "sourcesTitle": "Sources"
    }
  }
} as const

export function invContent(locale: string) {
  return (INV_CONTENT as Record<string, typeof INV_CONTENT.es>)[locale] ?? INV_CONTENT.es
}
