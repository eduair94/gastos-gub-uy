/**
 * Las encuestas de opinión, con su ficha técnica.
 *
 * QUÉ ES ESTA PÁGINA Y QUÉ NO ES. El pedido fue "evaluar la imagen del gobierno". La respuesta
 * honesta para un sitio que promete no ser partidario (PRODUCT.md: la voz "nunca es promocional,
 * partidaria ni acusatoria") no es evaluar al gobierno: es publicar QUÉ MIDIERON OTROS, con qué
 * método y en qué fechas, y dejar la lectura al lector. Acá no hay un juicio nuestro sobre la
 * gestión, y no debe haberlo nunca.
 *
 * LA REGLA DE ENTRADA, que es lo que hace publicable la página. Una fila entra sólo si la fuente
 * publica las tres cosas: encuestadora, fechas EXACTAS de trabajo de campo y tamaño de muestra.
 * Sin esas tres no se muestra la cifra: la medición se nombra en la lista de exclusiones, con el
 * motivo. Los demás campos de la ficha se muestran y, cuando faltan, dicen "no publicado". Nunca
 * quedan en blanco ni se rellenan. El criterio no lo inventamos: es la unión de lo que ya obliga
 * el protocolo de ficha técnica de CEISMU (la cámara del sector) con las guías de ESOMAR/WAPOR y
 * los estándares de divulgación de AAPOR.
 *
 * NO PROMEDIAMOS. Ni media, ni mediana, ni línea suavizada entre casas. No miden el mismo objeto
 * (Opción pregunta por separado por el gobierno y por el presidente, y en la misma medición esas
 * dos preguntas dan 57% y 50% de desaprobación), no usan la misma escala, no cubren el mismo
 * universo y no releva ninguna por la misma vía. Lo único que agregamos son dos cuentas, siempre
 * rotuladas: el SALDO (aprobación menos desaprobación) y el RANGO entre casas dentro de una misma
 * ventana de campo. Ninguna encuestadora publica esos dos números.
 *
 * POR QUÉ ES UN ARCHIVO ESTÁTICO Y NO UNA COLECCIÓN. Son ~20 filas por año, curadas a mano. El
 * riesgo real no es el volumen: es la transcripción. Ejemplo verificado: una radio reportó la
 * muestra de Equipos como "2000", que es el umbral del universo ("localidades de 2.000 o más
 * habitantes") y no el tamaño muestral —la ficha dice 704 casos—. Cualquier lectura automatizada
 * de prensa arrastra ese error. Se actualiza a mano, con fecha de última revisión a la vista.
 *
 * CADA CIFRA DE ACÁ SE VERIFICÓ CONTRA LA FUENTE. Donde sólo hubo prensa que reproduce la ficha,
 * la fila lo dice. Si una cifra no coincide con la de la casa que la publicó, la casa tiene razón.
 */

export type Locale = 'es' | 'en'

/** Texto libre que cambia con el idioma pero pertenece al dato, no a la plantilla. */
export interface L { es: string, en: string }

export const REVISED_ON = '2026-08-14'

/* ------------------------------------------------------------------ */
/* Vocabulario de las fichas — se repite fila a fila, se declara una vez */
/* ------------------------------------------------------------------ */

export const MODES = {
  telFijaCel: { es: 'telefónica, fija y celular', en: 'telephone, landline and mobile' },
  celular: { es: 'telefonía celular', en: 'mobile telephony' },
  telefonica: { es: 'telefónica', en: 'telephone' },
  presencial: { es: 'presencial, cara a cara en hogares', en: 'face-to-face, in households' },
  mixta: { es: 'mixta: 706 casos presenciales y 403 telefónicos', en: 'mixed: 706 face-to-face and 403 by telephone' },
  whatsapp: { es: 'protocolos automatizados de WhatsApp con monitoreo telefónico', en: 'automated WhatsApp protocols with telephone monitoring' },
} as const satisfies Record<string, L>

export const UNIVERSES = {
  nacional: { es: 'nacional', en: 'national' },
  nacionalUrbRur: { es: 'nacional, urbano y rural, 18 años y más', en: 'national, urban and rural, 18 and over' },
  factum: {
    es: 'residentes en el país, urbano y rural, de 18 años en adelante; marco muestral Censo de Personas 2023 (INE)',
    en: 'residents of the country, urban and rural, aged 18 and over; sampling frame the 2023 INE population census',
  },
  /** Redacción textual de las olas de 2026. La de 2024 decía «localidades mayores a 2.000». */
  equipos: {
    es: 'residentes en todo el territorio nacional con 2.000 habitantes o más',
    en: 'residents across the national territory with 2,000 inhabitants or more',
  },
  /**
   * La ficha de febrero de 2026 declara metodología presencial y, dos renglones después, un
   * universo telefónico. Es un arrastre del diseño mixto que Equipos usaba hasta 2024, cuando
   * declaraba los dos universos por separado. Se cita textual porque es lo que publicó la casa.
   */
  equiposFeb: {
    es: 'personas de 18 años y más, residentes en el país con telefonía celular (textual de la ficha; ver la nota)',
    en: 'people aged 18 and over, resident in the country with mobile telephony (verbatim from the note; see the caveat)',
  },
  nd: { es: 'no publicado', en: 'not published' },
} as const satisfies Record<string, L>

export const WEIGHTS = {
  factum: { es: 'por voto de octubre de 2024', en: 'by the October 2024 vote' },
  equipos: {
    es: 'sexo, edad, zona, nivel educativo, condición de actividad, tipo de vivienda y voto anterior',
    en: 'sex, age, region, education, employment status, dwelling type and previous vote',
  },
  /**
   * Usina NO declara ponderación: la palabra no aparece en las 33 páginas de su informe. Lo que
   * declara es cómo seleccionó la muestra, que no es lo mismo, y por eso se dice así.
   */
  usinaSeleccion: {
    es: 'no declara ponderación; selección por estratos de sexo y edad según proyecciones del INE',
    en: 'declares no weighting; sample selected by sex and age strata from national population projections',
  },
  nd: { es: 'no publicada', en: 'not published' },
} as const satisfies Record<string, L>

export type ModeKey = keyof typeof MODES
export type UniverseKey = keyof typeof UNIVERSES
export type WeightKey = keyof typeof WEIGHTS

/* ------------------------------------------------------------------ */
/* Las mediciones                                                      */
/* ------------------------------------------------------------------ */

export type House = 'Cifra' | 'Equipos' | 'Factum' | 'Opción' | 'Usina'

/** Qué se midió. No es lo mismo y la confusión mueve titulares enteros. */
export type Unit = 'presidente' | 'gobierno'

export interface Poll {
  key: string
  house: House
  unit: Unit
  /** ISO. Trabajo de campo, no publicación: es la fecha que manda en toda la página. */
  fieldStart: string
  fieldEnd: string
  n: number
  mode: ModeKey
  universe: UniverseKey
  /** Normalizado al 95% de confianza. `null` = la casa no lo publicó para esa ola. */
  margin: string | null
  weighting: WeightKey
  approve: number
  /**
   * Bloque intermedio AGREGADO: quienes no aprueban ni desaprueban MÁS quienes no opinan. Se
   * agrega porque no todas las casas separan las dos cosas, y se rotula como agregado en la
   * tabla. `null` cuando la casa no lo publica: nunca se deduce restando de 100.
   */
  middle: number | null
  /** El desglose del bloque, cuando la casa lo publica. Es lo que evita comparar peras con manzanas. */
  middleSplit?: L
  disapprove: number
  /** Formulación textual de la pregunta. La publican Equipos, Factum (en su deck) y Usina. */
  questionPublished: boolean
  source: string
  /** Prensa que reproduce la ficha, cuando no se pudo abrir la fuente primaria. */
  viaPress?: boolean
  note?: L
}

/**
 * Ordenadas por fin de campo. `saldo` no se guarda: es una cuenta nuestra y se deriva a la vista
 * para que nunca pueda quedar desincronizado del par que lo origina.
 */
export const POLLS: Poll[] = [
  {
    key: 'cifra-2025-03',
    house: 'Cifra',
    unit: 'presidente',
    fieldStart: '2025-03-17',
    fieldEnd: '2025-03-30',
    n: 800,
    mode: 'telFijaCel',
    universe: 'nacional',
    margin: null,
    weighting: 'nd',
    approve: 37,
    middle: 48,
    middleSplit: {
      es: '19 no aprueban ni desaprueban; el resto, cerca de tres de cada diez, no tenía opinión formada',
      en: '19 neither approve nor disapprove; the rest, close to three in ten, had no formed opinion',
    },
    disapprove: 15,
    questionPublished: false,
    source: 'https://www.cifra.com.uy/la-evaluacion-de-la-gestion-del-presidente-7/',
  },
  {
    key: 'cifra-2025-04',
    house: 'Cifra',
    unit: 'presidente',
    fieldStart: '2025-04-09',
    fieldEnd: '2025-04-19',
    n: 1115,
    mode: 'telFijaCel',
    universe: 'nacional',
    margin: null,
    weighting: 'nd',
    approve: 41,
    middle: 41,
    middleSplit: {
      es: '15 no aprueban ni desaprueban; más de un cuarto no tenía opinión formada',
      en: '15 neither approve nor disapprove; more than a quarter had no formed opinion',
    },
    disapprove: 18,
    questionPublished: false,
    source: 'https://www.cifra.com.uy/la-evaluacion-de-la-gestion-del-presidente-8/',
  },
  {
    key: 'cifra-2025-09',
    house: 'Cifra',
    unit: 'presidente',
    fieldStart: '2025-09-18',
    fieldEnd: '2025-09-28',
    n: 803,
    mode: 'telFijaCel',
    universe: 'nacional',
    margin: null,
    weighting: 'nd',
    approve: 43,
    middle: 24,
    middleSplit: {
      es: '17 no aprueban ni desaprueban; el resto no opina',
      en: '17 neither approve nor disapprove; the rest give no opinion',
    },
    disapprove: 33,
    questionPublished: false,
    source: 'https://www.cifra.com.uy/la-evaluacion-de-la-gestion-del-presidente-9/',
  },
  {
    key: 'cifra-2025-11',
    house: 'Cifra',
    unit: 'presidente',
    fieldStart: '2025-10-24',
    fieldEnd: '2025-11-03',
    n: 801,
    mode: 'telFijaCel',
    universe: 'nacional',
    margin: null,
    weighting: 'nd',
    approve: 40,
    middle: 20,
    middleSplit: { es: '15 no aprueban ni desaprueban y 5 no opinan', en: '15 neither approve nor disapprove and 5 give no opinion' },
    disapprove: 40,
    questionPublished: false,
    source: 'https://www.cifra.com.uy/la-evaluacion-de-la-gestion-del-presidente-10/',
  },
  {
    key: 'equipos-2025-12',
    house: 'Equipos',
    unit: 'presidente',
    fieldStart: '2025-11-18',
    fieldEnd: '2025-12-02',
    n: 1109,
    mode: 'mixta',
    universe: 'nd',
    margin: '±2,9% (95%)',
    weighting: 'nd',
    approve: 36,
    middle: null,
    disapprove: 36,
    questionPublished: false,
    source: 'https://equipos.com.uy/noticias/Evaluacion-del-presidente-Orsi-36-aprueba,-36-desaprueba/458',
    note: {
      es: 'Única ola de Equipos con modalidad mixta. No es estrictamente comparable con sus propias olas de 2026, que son presenciales puras.',
      en: 'The only Equipos wave with a mixed mode. Not strictly comparable with its own 2026 waves, which are purely face-to-face.',
    },
  },
  {
    key: 'factum-2026-02',
    house: 'Factum',
    unit: 'presidente',
    fieldStart: '2026-02-08',
    fieldEnd: '2026-02-22',
    n: 900,
    mode: 'celular',
    universe: 'factum',
    margin: '±3,3% (2 sigmas)',
    weighting: 'factum',
    approve: 37,
    middle: 21,
    disapprove: 41,
    questionPublished: false,
    source: 'https://portal.factum.uy/analisis/2026/ana260302.php',
  },
  {
    key: 'cifra-2026-02',
    house: 'Cifra',
    unit: 'presidente',
    fieldStart: '2026-02-18',
    fieldEnd: '2026-02-28',
    n: 801,
    mode: 'telFijaCel',
    universe: 'nacionalUrbRur',
    margin: '±3,4 pp (95%)',
    weighting: 'nd',
    approve: 31,
    middle: 23,
    middleSplit: { es: '17 no aprueban ni desaprueban y 6 no opinaron', en: '17 neither approve nor disapprove and 6 gave no opinion' },
    disapprove: 46,
    questionPublished: false,
    source: 'https://www.cifra.com.uy/la-evaluacion-de-la-gestion-del-presidente-11/',
  },
  {
    key: 'equipos-2026-03',
    house: 'Equipos',
    unit: 'presidente',
    fieldStart: '2026-02-19',
    fieldEnd: '2026-03-05',
    n: 704,
    mode: 'presencial',
    universe: 'equiposFeb',
    margin: '±3,7% (95%)',
    weighting: 'equipos',
    approve: 33,
    middle: null,
    disapprove: 40,
    questionPublished: true,
    source: 'https://equipos.com.uy/noticias/Evaluacion-del-presidente-Orsi--33-aprueba,-40-desaprueba/551',
    note: {
      es: 'La ficha de esta ola declara metodología presencial cara a cara y, dos renglones más abajo, un universo de personas «con telefonía celular». Es un arrastre del diseño mixto que la casa usaba hasta 2024, cuando declaraba los dos universos por separado; en las olas de abril y junio ya aparece corregido. Lo citamos textual porque es lo que publicó.',
      en: 'This wave declares face-to-face methodology and, two lines below, a universe of people "with mobile telephony". It is a carry-over from the mixed design the firm used until 2024, when it declared both universes separately; the April and June waves already show it corrected. We quote it verbatim because it is what was published.',
    },
  },
  {
    key: 'opcion-2026-04-pres',
    house: 'Opción',
    unit: 'presidente',
    fieldStart: '2026-04-21',
    fieldEnd: '2026-04-27',
    n: 869,
    mode: 'celular',
    universe: 'nacional',
    margin: '±3,5% (95%)',
    weighting: 'nd',
    approve: 26,
    middle: 28,
    disapprove: 43,
    questionPublished: false,
    source: 'https://www.elobservador.com.uy/nacional/declive-del-apoyo-medicion-medicion-encuesta-opcion-senala-que-48-desaprueba-al-gobierno-orsi-y-20-lo-aprueba-n6046249',
    viaPress: true,
    note: {
      es: 'Dos medios difieren en el bloque intermedio de esta ola: 28 según El Observador y 29 según Búsqueda. Publicamos el primero y dejamos la discrepancia a la vista, porque el sitio de la casa no abre a consulta automatizada y no hay forma de dirimirla.',
      en: 'Two outlets differ on this wave\'s middle block: 28 per El Observador and 29 per Búsqueda. We publish the former and leave the discrepancy visible, because the firm\'s own site does not open to automated access and there is no way to settle it.',
    },
  },
  {
    key: 'opcion-2026-04-gob',
    house: 'Opción',
    unit: 'gobierno',
    fieldStart: '2026-04-21',
    fieldEnd: '2026-04-27',
    n: 869,
    mode: 'celular',
    universe: 'nacional',
    margin: '±3,5% (95%)',
    weighting: 'nd',
    approve: 20,
    middle: 30,
    disapprove: 48,
    questionPublished: false,
    source: 'https://www.elobservador.com.uy/nacional/declive-del-apoyo-medicion-medicion-encuesta-opcion-senala-que-48-desaprueba-al-gobierno-orsi-y-20-lo-aprueba-n6046249',
    viaPress: true,
    note: {
      es: '«Aprueba» es la suma de muy buena (4) y buena (16); «desaprueba», la de mala (26) y muy mala (22). Las dos sumas son nuestras.',
      en: '"Approve" is the sum of very good (4) and good (16); "disapprove", of bad (26) and very bad (22). Both sums are ours.',
    },
  },
  {
    key: 'equipos-2026-05',
    house: 'Equipos',
    unit: 'presidente',
    fieldStart: '2026-04-21',
    fieldEnd: '2026-05-04',
    n: 704,
    mode: 'presencial',
    universe: 'equipos',
    margin: '±3,7% (95%)',
    weighting: 'equipos',
    approve: 27,
    middle: 25,
    middleSplit: { es: '23 no aprueban ni desaprueban y 2 no saben o no contestan', en: '23 neither approve nor disapprove and 2 do not know or do not answer' },
    disapprove: 48,
    questionPublished: true,
    source: 'https://equipos.com.uy/noticias/-Evaluacion-del-presidente-Orsi-en-abril--27-aprueba,-48-desaprueba/621',
  },
  {
    key: 'usina-2026-05',
    house: 'Usina',
    unit: 'presidente',
    fieldStart: '2026-05-22',
    fieldEnd: '2026-05-26',
    n: 500,
    mode: 'whatsapp',
    universe: 'nd',
    margin: null,
    weighting: 'usinaSeleccion',
    approve: 24,
    middle: 27,
    middleSplit: { es: 'a 22 les «resulta indiferente» y 5 «eligen no responder»', en: '22 "are indifferent" and 5 "choose not to answer"' },
    disapprove: 49,
    questionPublished: true,
    source: 'https://usina.com.uy/wp-content/uploads/2026/06/PUBLICABLE_EVALUACION_GOBIERNOyOPOSICION_2026.05.22.pdf',
    note: {
      es: 'Pregunta textual: «¿Cuál es tu opinión respecto a la gestión del Presidente de la República?». El mismo informe declara un segundo relevamiento, del 29 de mayo al 2 de junio, para otras preguntas. Usina no declara quién financia sus estudios políticos y no integra la cámara del sector.',
      en: 'Verbatim question: "What is your opinion of the President\'s performance?". The same report declares a second fieldwork round, 29 May to 2 June, for other questions. Usina does not declare who funds its political studies and is not a member of the industry chamber.',
    },
  },
  {
    key: 'cifra-2026-06',
    house: 'Cifra',
    unit: 'presidente',
    fieldStart: '2026-06-01',
    fieldEnd: '2026-06-17',
    n: 800,
    mode: 'telFijaCel',
    universe: 'nacionalUrbRur',
    margin: '±3,4 pp (95%)',
    weighting: 'nd',
    approve: 20,
    middle: 15,
    middleSplit: { es: '12 no aprueban ni desaprueban y 3 no opinan', en: '12 neither approve nor disapprove and 3 give no opinion' },
    disapprove: 65,
    questionPublished: false,
    source: 'https://www.cifra.com.uy/la-evaluacion-de-la-gestion-del-presidente-12/',
  },
  {
    key: 'factum-2026-06',
    house: 'Factum',
    unit: 'presidente',
    fieldStart: '2026-06-06',
    fieldEnd: '2026-06-20',
    n: 900,
    mode: 'celular',
    universe: 'factum',
    margin: '±3,3% (2 sigmas)',
    weighting: 'factum',
    approve: 24,
    middle: 20,
    disapprove: 56,
    questionPublished: true,
    source: 'https://portal.factum.uy/analisis/2026/ana260701.php',
    note: {
      es: 'Prensa secundaria reportó el campo como «2 al 20 de junio». Usamos la ficha de la casa: 6 al 20.',
      en: 'Secondary press reported the field period as "2 to 20 June". We use the house\'s own note: 6 to 20.',
    },
  },
  {
    key: 'equipos-2026-07',
    house: 'Equipos',
    unit: 'presidente',
    fieldStart: '2026-06-23',
    fieldEnd: '2026-07-08',
    n: 705,
    mode: 'presencial',
    universe: 'equipos',
    margin: '±3,7% (95%)',
    weighting: 'equipos',
    approve: 26,
    middle: 21,
    middleSplit: { es: '20 no aprueban ni desaprueban y 1 no sabe o no contesta', en: '20 neither approve nor disapprove and 1 does not know or does not answer' },
    disapprove: 53,
    questionPublished: true,
    source: 'https://equipos.com.uy/noticias/Evaluacion-del-presidente-Orsi-en-junio--26-aprueba,-53-desaprueba/667',
    note: {
      es: 'La casa publica el bloque intermedio dentro del gráfico, no en el texto de la nota.',
      en: 'The firm publishes the middle block inside the chart, not in the prose of the release.',
    },
  },
  {
    key: 'opcion-2026-08-pres',
    house: 'Opción',
    unit: 'presidente',
    fieldStart: '2026-07-16',
    fieldEnd: '2026-08-11',
    n: 806,
    mode: 'telefonica',
    universe: 'nacional',
    margin: '±3,5% (95%)',
    weighting: 'nd',
    approve: 22,
    middle: 28,
    disapprove: 50,
    questionPublished: false,
    source: 'https://ladiaria.com.uy/politica/articulo/2026/8/el-57-de-la-poblacion-desaprueba-el-gobierno-de-orsi-y-los-juicios-negativos-crecen-entre-los-votantes-frentistas-segun-opcion/',
    viaPress: true,
    note: {
      es: 'Campo partido en dos tramos, del 16 al 20 de julio y del 6 al 11 de agosto, con 403 casos cada uno.',
      en: 'Fieldwork split in two stretches, 16-20 July and 6-11 August, 403 cases each.',
    },
  },
  {
    key: 'opcion-2026-08-gob',
    house: 'Opción',
    unit: 'gobierno',
    fieldStart: '2026-07-16',
    fieldEnd: '2026-08-11',
    n: 806,
    mode: 'telefonica',
    universe: 'nacional',
    margin: '±3,5% (95%)',
    weighting: 'nd',
    approve: 19,
    middle: 24,
    disapprove: 57,
    questionPublished: false,
    source: 'https://www.montevideo.com.uy/Noticias/Desaprobacion-del-gobierno-llega-a-su-pico-un-57-lo-ve-malo-o-muy-malo--segun-Opcion-uc971650',
    viaPress: true,
    note: {
      es: 'Desglose publicado: muy buena 3, buena 16, ni buena ni mala 24, mala 27, muy mala 30, no contesta 1; suma 101 por redondeo de la fuente. Este 57% es el número que muchos titulares de agosto presentaron como aprobación presidencial. No lo es: en la misma medición, la desaprobación al presidente es 50%.',
      en: 'Published breakdown: very good 3, good 16, neither 24, bad 27, very bad 30, no answer 1; it sums to 101 because of the source rounding. This 57% is the figure many August headlines presented as presidential approval. It is not: in the same survey, disapproval of the president is 50%.',
    },
  },
]

/** La ventana en la que cinco casas midieron casi lo mismo casi al mismo tiempo. */
export const WINDOW = { from: '2026-05-22', to: '2026-08-11' }

/** Filas de la ventana, sólo las que midieron al presidente. Es la sección de portada. */
export const WINDOW_KEYS = ['usina-2026-05', 'cifra-2026-06', 'factum-2026-06', 'equipos-2026-07', 'opcion-2026-08-pres']

/* ------------------------------------------------------------------ */
/* Cortes por voto — la parte más citada y la más frágil               */
/* ------------------------------------------------------------------ */

export interface Breakdown {
  key: string
  house: House
  pollKey: string
  lines: L[]
  source: string
}

export const BREAKDOWNS: Breakdown[] = [
  {
    key: 'factum-feb',
    house: 'Factum',
    pollKey: 'factum-2026-02',
    source: 'https://portal.factum.uy/analisis/2026/ana260302.php',
    lines: [
      { es: 'Votantes del Frente Amplio: 72 aprueba, 10 desaprueba.', en: 'Frente Amplio voters: 72 approve, 10 disapprove.' },
      { es: 'Votantes de la Coalición Republicana: 7 aprueba, 71 desaprueba.', en: 'Coalición Republicana voters: 7 approve, 71 disapprove.' },
      { es: 'La menor aprobación se registra entre los 18 y los 33 años.', en: 'The lowest approval is recorded among 18 to 33 year olds.' },
    ],
  },
  {
    key: 'cifra-jun',
    house: 'Cifra',
    pollKey: 'cifra-2026-06',
    source: 'https://www.cifra.com.uy/la-evaluacion-de-la-gestion-del-presidente-12/',
    lines: [
      { es: 'Votantes del Frente Amplio en 2024: 41 aprueba, 34 desaprueba.', en: 'Frente Amplio voters in 2024: 41 approve, 34 disapprove.' },
      { es: 'Votantes de la coalición: 94 desaprueba.', en: 'Coalition voters: 94 disapprove.' },
      { es: 'No politizados: 9 aprueba, alrededor de 75 desaprueba.', en: 'Non-politicised: 9 approve, around 75 disapprove.' },
    ],
  },
  {
    key: 'opcion-ago',
    house: 'Opción',
    pollKey: 'opcion-2026-08-pres',
    source: 'https://ladiaria.com.uy/politica/articulo/2026/8/el-57-de-la-poblacion-desaprueba-el-gobierno-de-orsi-y-los-juicios-negativos-crecen-entre-los-votantes-frentistas-segun-opcion/',
    lines: [
      { es: 'Votantes del Frente Amplio, sobre el gobierno: 39 aprueba, 28 desaprueba, 33 neutral. Sobre el presidente: 46 y 22.', en: 'Frente Amplio voters, on the government: 39 approve, 28 disapprove, 33 neutral. On the president: 46 and 22.' },
      { es: 'Votantes de la Coalición, sobre el gobierno: 4 aprueba, 81 desaprueba, 15 neutral. Sobre el presidente: 6 y 72.', en: 'Coalition voters, on the government: 4 approve, 81 disapprove, 15 neutral. On the president: 6 and 72.' },
    ],
  },
]

/* ------------------------------------------------------------------ */
/* Imagen de dirigentes                                                */
/* ------------------------------------------------------------------ */

/**
 * EL RÓTULO DE ENCARGO VA ARRIBA DE LA TABLA, NO AL PIE. Según la cobertura que la difundió, esta
 * medición fue encargada por el Partido Nacional. Publicarla sin decirlo sería exactamente la
 * clase de omisión que esta página existe para evitar.
 */
/**
 * NO HAY TABLA DE DIRIGENTES, Y ES A PROPÓSITO.
 *
 * La tabla de nueve pares de simpatía y antipatía que circuló en julio de 2026 no resiste la regla
 * de esta página. Cifra no publicó ese estudio en su sitio: los números viven en dos medios que se
 * contradicen frontalmente entre sí —uno le atribuye a Lacalle Pou 34% de antipatía y el otro
 * "apenas un 1%"—, y una tabla armada sobre esa base sería una tabla inventada con nombre y
 * apellido de nueve personas.
 *
 * También se cayó el rótulo "encargada por el Partido Nacional": lo sostiene un único medio que a
 * su vez reproduce datos de terceros, ningún documento de Cifra lo dice, y la ficha de ese mismo
 * campo describe el estudio como multicliente. Publicarlo hubiera sido peor que no publicar nada.
 *
 * Queda lo que sí resiste: la serie de Orsi, que las coberturas reproducen de forma consistente, y
 * los rangos que Equipos escribió en prosa. Menos, y cierto.
 */
export const ORSI_IMAGE = [
  {
    when: { es: 'octubre de 2025', en: 'October 2025' },
    pro: 56,
    /** Cifra escribe «menos de un tercio». El 31 que circuló no está en la fuente. */
    anti: { es: 'menos de un tercio', en: 'less than a third' } as L,
  },
  { when: { es: 'febrero de 2026', en: 'February 2026' }, pro: 51, anti: 36 },
  { when: { es: '1 al 17 de junio de 2026', en: '1 to 17 June 2026' }, pro: 34, anti: 52 },
]

export const ORSI_IMAGE_SOURCE = 'https://www.cifra.com.uy/la-evaluacion-de-la-gestion-del-presidente-12/'

/* ------------------------------------------------------------------ */
/* Ministros — una sola medición con ficha                             */
/* ------------------------------------------------------------------ */

export const MINISTERS = {
  house: 'Cifra' as House,
  pollKey: 'cifra-2026-06',
  source: 'https://www.elobservador.com.uy/nacional/encuesta-cifra-los-ministros-del-gobierno-carlos-negro-es-el-peor-evaluado-y-cristina-lustemberg-registra-mayor-aprobacion-n6050146',
  rows: [
    { name: 'Carlos Negro', office: { es: 'Interior', en: 'Interior' }, approve: 21, middle: 6, disapprove: 64, noOpinion: 9 },
    { name: 'Cristina Lustemberg', office: { es: 'Salud Pública', en: 'Public Health' }, approve: 39, middle: 8, disapprove: 41, noOpinion: 12 },
    { name: 'Mario Lubetkin', office: { es: 'Relaciones Exteriores', en: 'Foreign Affairs' }, approve: 38, middle: 11, disapprove: 23, noOpinion: 28 },
    { name: 'Gabriel Oddone', office: { es: 'Economía y Finanzas', en: 'Economy and Finance' }, approve: 35, middle: 8, disapprove: 43, noOpinion: 14 },
  ],
}

/* ------------------------------------------------------------------ */
/* Comparación histórica                                               */
/* ------------------------------------------------------------------ */

/**
 * Dos niveles de evidencia, dibujados distinto. `ficha` = medición con ficha propia.
 * `citada` = cifra que la casa menciona en una nota posterior, con fecha aproximada y sin
 * fechas de campo, muestra ni margen. No se pintan como si fueran lo mismo.
 */
export interface HistoricRow {
  president: string
  when: L
  n?: number
  approve: number
  disapprove: number | null
  level: 'ficha' | 'citada'
}

export const HISTORIC_CIFRA: HistoricRow[] = [
  { president: 'Jorge Batlle', when: { es: '2001', en: '2001' }, approve: 27, disapprove: null, level: 'citada' },
  { president: 'Tabaré Vázquez (I)', when: { es: 'marzo de 2006', en: 'March 2006' }, approve: 56, disapprove: 17, level: 'citada' },
  { president: 'José Mujica', when: { es: 'marzo de 2011', en: 'March 2011' }, approve: 39, disapprove: null, level: 'citada' },
  { president: 'Tabaré Vázquez (II)', when: { es: 'marzo de 2016', en: 'March 2016' }, approve: 39, disapprove: null, level: 'citada' },
  { president: 'Luis Lacalle Pou', when: { es: '18 al 28 de febrero de 2021', en: '18 to 28 February 2021' }, n: 702, approve: 64, disapprove: 25, level: 'ficha' },
  { president: 'Yamandú Orsi', when: { es: '18 al 28 de febrero de 2026', en: '18 to 28 February 2026' }, n: 801, approve: 31, disapprove: 46, level: 'ficha' },
]

/** El único punto de año y medio bien documentado: tres casas, el mismo mes, un clima favorable. */
export const MONTHS_18 = [
  { house: 'Equipos' as House, when: { es: '22 de setiembre al 1 de octubre de 2021', en: '22 September to 1 October 2021' }, n: 500, margin: '±4,3%', approve: 52, middle: 15, disapprove: 33 },
  // El bloque intermedio de esta fila NO se publica: el 12 que circulaba era el residuo 100−56−32.
  { house: 'Cifra' as House, when: { es: '26 de agosto al 3 de setiembre de 2021', en: '26 August to 3 September 2021' }, n: 707, margin: null, approve: 56, middle: null, disapprove: 32 },
  { house: 'Factum' as House, when: { es: '1 al 14 de setiembre de 2021', en: '1 to 14 September 2021' }, n: 900, margin: '±3,3% (2 sigmas)', approve: 61, middle: 4, disapprove: 35 },
]

/** Lo que dicen las propias casas sobre el lugar histórico de esta gestión. Atribuido, no nuestro. */
export const HOUSE_CLAIMS = [
  {
    house: 'Equipos' as House,
    when: { es: 'informe de junio de 2026', en: 'June 2026 report' },
    quote: {
      es: 'por lo general, los presidentes han llegado a su segundo año de gobierno ya con saldos negativos, con las excepciones de Vázquez en 2006, Mujica en 2011, y Lacalle Pou en 2021',
      en: 'as a rule, presidents have reached their second year in office already with negative balances, with the exceptions of Vázquez in 2006, Mujica in 2011 and Lacalle Pou in 2021',
    },
    url: 'https://equipos.com.uy/noticias/Evaluacion-del-presidente-Orsi-en-junio--26-aprueba,-53-desaprueba/667',
  },
  {
    house: 'Cifra' as House,
    when: { es: 'informe de junio de 2026', en: 'June 2026 report' },
    quote: {
      es: 'sólo el Presidente Batlle durante la crisis de 2002 y sus secuelas registraba una aprobación menor',
      en: 'only President Batlle, during the 2002 crisis and its aftermath, recorded lower approval',
    },
    url: 'https://www.cifra.com.uy/la-evaluacion-de-la-gestion-del-presidente-12/',
  },
  {
    house: 'Opción' as House,
    // La frase es sobre su medición del SEGUNDO trimestre (campo 21 al 27 de abril), no sobre la
    // de julio-agosto: pegarla al bloque más reciente le cambiaría el referente.
    when: { es: 'sobre su medición de abril de 2026, vía Búsqueda', en: 'on its April 2026 survey, via Búsqueda' },
    quote: {
      es: 'el nivel de apoyo de la administración Orsi es el más bajo que registró un gobierno del Frente Amplio',
      en: 'the level of support for the Orsi administration is the lowest recorded by a Frente Amplio government',
    },
    url: 'https://www.busqueda.com.uy/politica/opcion-consultores-el-nivel-apoyo-la-administracion-orsi-es-el-mas-bajo-que-registro-un-gobierno-del-frente-amplio-n5413906',
  },
]

/* ------------------------------------------------------------------ */
/* Principal problema del país                                         */
/* ------------------------------------------------------------------ */

export const MAIN_PROBLEM = [
  {
    house: 'Cifra' as House,
    when: { es: '18 al 28 de febrero de 2026', en: '18 to 28 February 2026' },
    n: 801,
    result: {
      es: 'Inseguridad, delincuencia y narcotráfico 46; economía alrededor de 33; desempleo alrededor de 19; el resto por debajo de 5.',
      en: 'Insecurity, crime and drug trafficking 46; the economy around 33; unemployment around 19; everything else below 5.',
    },
  },
  {
    house: 'Equipos' as House,
    when: { es: '21 de abril al 4 de mayo de 2026', en: '21 April to 4 May 2026' },
    n: 704,
    result: {
      es: 'Seguridad 58 como primera o segunda mención; desempleo alrededor de un tercio; después situación económica, problemas sociales y educación.',
      en: 'Security 58 as first or second mention; unemployment around a third; then the economy, social problems and education.',
    },
  },
  {
    house: 'Factum' as House,
    // Esta nota NO trae ficha técnica: no publica fechas de campo, ni n, ni modalidad, ni margen.
    // Atribuirle el campo de la ola de aprobación sería una inferencia nuestra, así que va la
    // fecha de publicación y se dice que falta la ficha.
    when: { es: 'publicado el 15 de julio de 2026, sin ficha técnica', en: 'published 15 July 2026, with no technical note' },
    result: {
      es: 'Seguridad 53; economía 10; el trabajo 9. Es una pregunta de mención única sobre el primer lugar, no una escala de preocupación: los porcentajes reparten el primer puesto. La lista completa está sólo en imágenes y no la pudimos recuperar.',
      en: 'Security 53; the economy 10; work 9. It is a single-mention question about first place, not a concern scale: the percentages split the top spot. The full list exists only inside images and we could not recover it.',
    },
  },
]

export const EXPECTATIONS = {
  house: 'Factum' as House,
  when: { es: '6 al 20 de junio de 2026', en: '6 to 20 June 2026' },
  n: 900,
  published: '2026-07-24',
  source: 'https://portal.factum.uy/analisis/2026/ana260724.php',
  rows: [
    { label: { es: 'Por encima de lo esperado', en: 'Above expectations' }, value: 1 },
    { label: { es: 'Igual a lo esperado', en: 'As expected' }, value: 27 },
    { label: { es: 'Por debajo de lo esperado', en: 'Below expectations' }, value: 49 },
    // Etiqueta textual de la fuente. Decíamos «no tenía expectativas», que no es lo que dice.
    { label: { es: 'No esperaba nada', en: 'Expected nothing' }, value: 22 },
  ],
}

/* ------------------------------------------------------------------ */
/* Exclusiones — el criterio se publica antes que los datos            */
/* ------------------------------------------------------------------ */

export interface Exclusion { what: L, why: L }

export const EXCLUSIONS: Exclusion[] = [
  {
    what: { es: 'Nómade Consultora, toda su producción', en: 'Nómade Consultora, its entire output' },
    why: {
      es: 'No publica ficha técnica en ninguna cobertura que encontramos: ni fechas de campo (sólo «invierno»), ni tamaño de muestra, ni modalidad, ni margen. Lo único afirmable es que su última publicación política es de octubre de 2025.',
      en: 'It publishes no technical note in any coverage we found: no field dates (only "winter"), no sample size, no mode, no margin. All that can be stated is that its last political release is from October 2025.',
    },
  },
  {
    what: { es: 'Grupo Radar', en: 'Grupo Radar' },
    why: {
      es: 'No encontramos ninguna medición política suya de 2026 en fuentes abiertas y su sección de novedades devolvió un error de acceso. Eso no autoriza a escribir que Radar no midió: lo único afirmable es que no la encontramos.',
      en: 'We found no 2026 political survey of theirs in open sources and their news section returned an access error. That does not license writing that Radar did not measure: all that can be stated is that we did not find it.',
    },
  },
  {
    what: { es: 'Opción, primer trimestre de 2026 (gobierno 29/33, presidente 26/43)', en: 'Opción, first quarter of 2026 (government 29/33, president 26/43)' },
    why: {
      es: 'Circulan sin fechas de campo ni tamaño de muestra. La serie de Opción que resiste empieza en abril de 2026.',
      en: 'They circulate with no field dates and no sample size. The Opción series that holds up starts in April 2026.',
    },
  },
  {
    what: { es: 'Factum, ola de junio de 2025 (46/31/22)', en: 'Factum, June 2025 wave (46/31/22)' },
    why: { es: 'No publicó las fechas exactas de trabajo de campo.', en: 'It did not publish exact fieldwork dates.' },
  },
  {
    what: { es: 'Factum, intendente de Montevideo, segundo bimestre de 2026 (Bergara 23/30/46)', en: 'Factum, Montevideo mayor, second two-month period of 2026 (Bergara 23/30/46)' },
    why: {
      es: 'No pudimos recuperar la ficha técnica; además mide otro cargo y no corresponde a esta serie.',
      en: 'We could not recover the technical note; it also measures a different office and does not belong to this series.',
    },
  },
  {
    what: { es: 'La tabla de simpatía y antipatía de nueve dirigentes atribuida a Cifra', en: 'The nine-leader sympathy and antipathy table attributed to Cifra' },
    why: {
      es: 'Cifra no publicó ese estudio en su sitio y los dos medios que difundieron la tabla se contradicen: uno le atribuye a Lacalle Pou 34% de antipatía y el otro «apenas un 1%». Una tabla con nombre y apellido de nueve personas armada sobre eso sería una tabla inventada. También se cayó el rótulo «encargada por el Partido Nacional»: lo sostiene un solo medio y la ficha del mismo campo describe el estudio como multicliente.',
      en: 'Cifra did not publish that study on its site and the two outlets that carried the table contradict each other: one attributes 34% antipathy to Lacalle Pou and the other "barely 1%". A table naming nine people built on that would be an invented table. The label "commissioned by the Partido Nacional" fell too: a single outlet supports it, and the technical note for that same fieldwork describes the study as multi-client.',
    },
  },
  {
    what: { es: 'CB Global Data, imagen presidencial de agosto de 2026', en: 'CB Global Data, presidential image, August 2026' },
    why: {
      es: 'Es la medición más reciente que circuló (campo del 5 al 10 de agosto, 37,5% de imagen positiva y 62,8% negativa) y la nombramos para no esconderla, pero no entra: no publica tamaño de muestra, mide imagen y no aprobación, y es un panel regional en línea sobre dieciocho países. Además dos medios le asignan a Uruguay puestos distintos en el mismo ranking.',
      en: 'It is the most recent measurement in circulation (fielded 5 to 10 August, 37.5% positive image and 62.8% negative) and we name it so as not to hide it, but it does not qualify: it publishes no sample size, it measures image rather than approval, and it is a regional online panel across eighteen countries. Two outlets also place Uruguay at different ranks in the same table.',
    },
  },
  {
    what: { es: 'Equipos, imagen de dirigentes persona por persona', en: 'Equipos, leader image person by person' },
    why: {
      es: 'La casa publicó los resultados sólo dentro de un gráfico. Mostramos los rangos que escribió en texto, no una tabla reconstruida a ojo.',
      en: 'The house published the results only inside a chart. We show the ranges it wrote in prose, not a table reconstructed by eye.',
    },
  },
  {
    what: { es: 'Equipos, corte entre votantes del Frente Amplio (61→45 y 13→28)', en: 'Equipos, breakdown among Frente Amplio voters (61→45 and 13→28)' },
    why: { es: 'La nota no dice a qué dos mediciones corresponden esos puntos.', en: 'The release does not say which two surveys those points belong to.' },
  },
  {
    what: { es: 'Cualquier cifra de prensa que contradiga la ficha de la casa', en: 'Any press figure that contradicts the house\'s own note' },
    why: {
      es: 'Caso real: una radio reportó la muestra de Equipos como «2000». Ese número es el umbral del universo —localidades de 2.000 o más habitantes— y no el tamaño muestral, que es de 704 casos.',
      en: 'A real case: a radio station reported the Equipos sample as "2000". That number is the universe threshold — localities of 2,000 or more inhabitants — not the sample size, which is 704 cases.',
    },
  },
  {
    what: { es: 'Cualquier pregunta textual reconstruida', en: 'Any reconstructed verbatim question' },
    why: {
      es: 'Una de nuestras búsquedas devolvió una pregunta de Cifra rotulada «reconstruida del contexto». Eso no es una fuente.',
      en: 'One of our searches returned a Cifra question labelled "reconstructed from context". That is not a source.',
    },
  },
  {
    what: { es: 'opuy, el paquete de datos agregados de opinión pública uruguaya', en: 'opuy, the aggregated Uruguayan public-opinion data package' },
    why: {
      es: 'Es la mejor línea de base histórica que existe (1989-2023, seis consultoras, licencia MIT), pero no trae tamaño de muestra, margen, modalidad, pregunta ni patrocinador, su campo de fecha mezcla último día de campo con fecha de publicación, y su último cambio es anterior a este gobierno.',
      en: 'It is the best historical baseline available (1989-2023, six firms, MIT licence), but it carries no sample size, margin, mode, question or sponsor, its date field mixes last day of fieldwork with publication date, and its last change predates this government.',
    },
  },
]

/* ------------------------------------------------------------------ */
/* Fuentes                                                             */
/* ------------------------------------------------------------------ */

export const POLL_SOURCES = [
  {
    key: 'casas',
    items: [
      { label: 'Factum — aprobación, tercer bimestre de 2026 (ficha completa)', url: 'https://portal.factum.uy/analisis/2026/ana260701.php' },
      { label: 'Factum — segundo bimestre de 2026', url: 'https://portal.factum.uy/analisis/2026/ana260518a.php' },
      { label: 'Factum — primer bimestre de 2026, con cortes por voto', url: 'https://portal.factum.uy/analisis/2026/ana260302.php' },
      { label: 'Factum — evaluación contra expectativas (24/07/2026)', url: 'https://portal.factum.uy/analisis/2026/ana260724.php' },
      { label: 'Equipos — junio-julio de 2026, con la pregunta textual', url: 'https://equipos.com.uy/noticias/Evaluacion-del-presidente-Orsi-en-junio--26-aprueba,-53-desaprueba/667' },
      { label: 'Equipos — abril-mayo de 2026', url: 'https://equipos.com.uy/noticias/-Evaluacion-del-presidente-Orsi-en-abril--27-aprueba,-48-desaprueba/621' },
      { label: 'Equipos — febrero-marzo de 2026', url: 'https://equipos.com.uy/noticias/Evaluacion-del-presidente-Orsi--33-aprueba,-40-desaprueba/551' },
      { label: 'Equipos — noviembre-diciembre de 2025 (ola mixta)', url: 'https://equipos.com.uy/noticias/Evaluacion-del-presidente-Orsi-36-aprueba,-36-desaprueba/458' },
      { label: 'Equipos — imagen de unos treinta dirigentes (29/07/2026)', url: 'https://equipos.com.uy/noticias/Lacalle-Pou-es-el-lider-politico-mejor-valorado-del-pais-Orsi-y-Topolansky-lideran-entre-los-frenteamplistas/669' },
      { label: 'Cifra — junio de 2026', url: 'https://www.cifra.com.uy/la-evaluacion-de-la-gestion-del-presidente-12/' },
      { label: 'Cifra — febrero de 2026', url: 'https://www.cifra.com.uy/la-evaluacion-de-la-gestion-del-presidente-11/' },
      { label: 'Cifra — Lacalle Pou al año de mandato, febrero de 2021', url: 'https://www.cifra.com.uy/evaluacion-de-la-gestion-del-presidente-4/' },
      { label: 'Opción — tercer trimestre de 2026, vía la diaria', url: 'https://ladiaria.com.uy/politica/articulo/2026/8/el-57-de-la-poblacion-desaprueba-el-gobierno-de-orsi-y-los-juicios-negativos-crecen-entre-los-votantes-frentistas-segun-opcion/' },
      { label: 'Opción — segundo trimestre de 2026, vía El Observador', url: 'https://www.elobservador.com.uy/nacional/declive-del-apoyo-medicion-medicion-encuesta-opcion-senala-que-48-desaprueba-al-gobierno-orsi-y-20-lo-aprueba-n6046249' },
      { label: 'Usina de Percepción Ciudadana — mayo de 2026, vía UyPress', url: 'https://www.uypress.net/Politica/49-desaprueba-la-gestion-del-presidente-Orsi-segun-Usina-de-Percepcion-Ciudadana-uc153692' },
    ],
  },
  {
    key: 'criterio',
    items: [
      { label: 'Protocolo de ficha técnica de CEISMU, publicado por la propia cámara', url: 'https://www.ceismu.org/site/protocolo-de-ficha-tecnica-para-la-publicacion-de-encuestas-de-opinion-publica/' },
      { label: 'CEISMU — nómina de empresas asociadas (consultada en agosto de 2026)', url: 'https://www.ceismu.org/quienes-somos/miembros/' },
      { label: 'La misma reproducción del protocolo en el portal de Factum, con fecha 23/11/2017', url: 'https://portal.factum.uy/documentos/2017/doc171123.php' },
      { label: 'ESOMAR/WAPOR — Guideline on Opinion Polls and Published Surveys (2014)', url: 'https://wapor.org/wp-content/uploads/esomar-wapor-guideline-on-opinion-polls-and-published-surveys-english-august-2014.pdf' },
      { label: 'AAPOR — Disclosure Standards', url: 'https://aapor.org/standards-and-ethics/disclosure-standards/' },
      { label: 'Shirani-Mehr, Rothschild, Goel y Gelman (2018) — Disentangling Bias and Variance in Election Polls', url: 'https://sites.stat.columbia.edu/gelman/research/published/polling-errors.pdf' },
      { label: 'opuy — datos de opinión pública uruguaya, 1989-2023', url: 'https://github.com/Nicolas-Schmidt/opuy' },
    ],
  },
]

/* ------------------------------------------------------------------ */
/* Copia                                                               */
/* ------------------------------------------------------------------ */

const CONTENT = {
  es: {
    kicker: 'Opinión pública',
    title: 'Las encuestas, con su ficha técnica',
    dek: 'Qué midió cada encuestadora sobre la gestión de Yamandú Orsi, con qué método y en qué fechas. En la misma ventana de once semanas, la desaprobación al presidente se leyó entre 49% y 65% según quién preguntó. Esa diferencia es el dato.',
    chips: ['Cinco encuestadoras', 'Fichas técnicas completas', 'Sin promedios'],
    fileScope: 'Aprobación de gestión, imagen de dirigentes y evaluación de ministros',
    filePeriod: 'Marzo de 2025 a agosto de 2026',
    fileSource: 'Publicaciones de las propias encuestadoras y prensa que reproduce la ficha',

    introTag: 'Qué es esto',
    intro: [
      'Esta página no evalúa al gobierno. Reúne las mediciones de opinión pública que publicaron encuestadoras uruguayas sobre la gestión de Yamandú Orsi, cada una con su ficha técnica: quién la hizo, entre qué días trabajó en campo, a cuánta gente entrevistó, por qué vía y con qué margen de error.',
      'Lo hacemos porque el número que circula suele venir sin nada de eso. Y porque cuando se ponen los números al lado, se ve lo que ningún titular muestra: en la misma ventana de tiempo, sobre el mismo país, las casas no miden lo mismo.',
    ],
    tiles: {
      houses: 'encuestadoras con ficha técnica publicada',
      housesSub: 'Cifra, Equipos, Factum, Opción y Usina de Percepción Ciudadana',
      polls: 'mediciones publicadas con ficha',
      pollsSub: 'de marzo de 2025 a agosto de 2026',
      spread: 'desaprobación al presidente en la misma ventana',
      spreadSub: 'cinco mediciones con campo entre el 22 de mayo y el 11 de agosto de 2026',
      vote: 'mediciones de intención de voto en 2026',
      voteSub: 'ninguna de las casas publicó una',
    },
    revisedOn: 'Última revisión',
    ownCalc: 'Cálculo nuestro sobre cifras publicadas por terceros. Ninguna encuestadora publica este rango.',

    divTag: 'El dato principal',
    divTitle: 'Cinco casas midieron lo mismo y dieron números distintos',
    divDek: 'Mediciones con trabajo de campo entre el 22 de mayo y el 11 de agosto de 2026, todas sobre la gestión del presidente.',
    div: [
      'Cinco encuestadoras preguntaron por la gestión del presidente en una ventana de once semanas. La aprobación se movió poco entre ellas: de 20% a 26%, seis puntos. La desaprobación se movió mucho: de 49% a 65%, dieciséis puntos. El saldo —aprobación menos desaprobación, cuenta nuestra— va de −25 a −45: veinte puntos de diferencia.',
      'El caso más limpio es el de junio. Cifra trabajó en campo del 1 al 17 y Factum del 6 al 20: ventanas casi superpuestas, el mismo país, la misma semana. Cifra reportó 65% de desaprobación y Factum 56%. Nueve puntos.',
      'No se puede decir cuál de las cinco mide mejor. Nosotros no tenemos forma de decidirlo y no lo vamos a insinuar. Lo que sí se puede decir, y es lo que esta página publica, es que quien lee un 26% en un medio y un 20% en otro no está viendo una contradicción: está viendo dos instrumentos distintos.',
    ],
    divFindingKicker: 'Cálculo nuestro',
    divFindingTitle: 'Lo que cambia entre casas no es cuánta gente aprueba: es cuánta gente queda en el medio',
    divFinding: [
      'Ordenadas por el tamaño del bloque intermedio —los que no aprueban ni desaprueban, más los que no opinan—, las cinco mediciones quedan casi en orden inverso a la desaprobación: Cifra deja 15 en el medio y reporta 65 de desaprobación; Factum 20 y 56; Equipos alrededor de 21 y 53; Usina 27 y 49; Opción 28 y 50. La aprobación, mientras tanto, apenas se mueve entre 20 y 26.',
      'Dicho de otro modo: las casas que dejan menos lugar a la respuesta intermedia convierten indecisos en desaprobadores, no en aprobadores. El número que se titula —la desaprobación— es el más sensible al diseño del cuestionario. El que menos varía —la aprobación— es el que menos se titula.',
      'Esto es una observación aritmética nuestra sobre cinco puntos publicados. Es sugerente y no es una demostración: con cinco casas no hay forma de someterla a una prueba estadística, y ninguna encuestadora la afirma.',
    ],
    divWarn: [
      'La ventana no es homogénea: la medición de Usina terminó su campo el 26 de mayo, antes del episodio de la camioneta presidencial; las otras cuatro trabajaron después. Está a la vista en la columna de fechas y por eso no lo llamamos tendencia.',
      'Todos los saldos y todos los rangos de esta sección son cálculos nuestros. Las encuestadoras publican aprobación y desaprobación, no el saldo.',
    ],

    tableTag: 'El registro',
    tableTitle: 'Todas las mediciones, con su ficha',
    tableDek: 'Una fila, una encuesta, ordenadas por fecha de fin de campo. Ninguna entra sin encuestadora, fechas exactas de campo y tamaño de muestra.',
    tableNote: 'Cuando un campo no fue publicado, la celda lo dice: no lo estimamos ni lo dejamos vacío. La columna «intermedio agregado» suma a quienes no aprueban ni desaprueban con quienes no opinan, porque no todas las casas separan las dos cosas; el desglose, cuando la casa lo publica, está al pie de la tabla.',

    whyTag: 'Método',
    whyTitle: 'Por qué dan distinto',
    whyDek: 'Tres diferencias documentadas por las propias encuestadoras, y una observación nuestra.',
    why: [
      'Primero: no todas preguntan por lo mismo. Opción evalúa por separado al gobierno y al presidente, en la misma muestra y el mismo cuestionario. En su medición de agosto de 2026 la desaprobación al gobierno es 57% y al presidente 50%. Siete puntos de distancia, diez si se mira el saldo. Poner el 57% de Opción al lado del 56% de Factum es comparar objetos distintos.',
      'Segundo: no todas preguntan igual. Opción usa una escala de cinco puntos —muy buena, buena, ni buena ni mala, mala, muy mala— y las otras tres una pregunta de aprobación. Una escala con dos casilleros negativos y dos positivos no se comporta igual que un aprueba o desaprueba.',
      'Tercero: no todas hablan con la misma gente ni por la misma vía. Equipos releva presencial en hogares de localidades de 2.000 o más habitantes; Factum releva por celular e incluye población rural; Cifra combina fija y celular; Usina usa protocolos automatizados de WhatsApp. Cada modalidad deja afuera a un grupo distinto, y las guías internacionales obligan a declarar esas exclusiones justamente por eso.',
      'Y cuarto, esto ya es cuenta nuestra: el tamaño del bloque intermedio ordena casi perfectamente la desaprobación. Es una observación sobre cinco puntos, no una demostración.',
    ],
    whyNote: 'Ninguna de estas diferencias es un defecto de nadie. Son decisiones de diseño distintas, todas declaradas por las casas.',

    seriesTag: 'Trayectoria',
    seriesTitle: 'La serie de cada casa, por separado',
    seriesDek: 'Cuatro series, cuatro gráficos, el mismo eje. Nunca una sola línea.',
    series: [
      'Superponer las cuatro series en un mismo gráfico fabricaría una tendencia única que ninguna encuestadora publicó. Van separadas, cada una con su ficha, y con el mismo eje vertical para que se puedan mirar en paralelo sin que la escala engañe.',
      'En lo que sí coinciden las cuatro es en la dirección y en el mecanismo: el bloque de gente sin opinión formada, que en marzo de 2025 era enorme, se fue volcando a la desaprobación y no a la aprobación. En la serie de Cifra, la aprobación pasa por 37, 41, 43, 40, 31 y 20, mientras la desaprobación sube de 15 a 65 de forma sostenida.',
      'Coinciden en la forma de la curva. No coinciden en el nivel. Las dos cosas son ciertas al mismo tiempo.',
    ],
    seriesWarn: [
      'La ola de Equipos de noviembre y diciembre de 2025 es mixta —706 casos presenciales y 403 telefónicos— y las de 2026 son presenciales puras. El punto va marcado distinto.',
      'La serie de Opción tiene dos puntos. Dos puntos no son una tendencia; se muestran igual porque son las dos mediciones con ficha que publicó.',
      'Un eje truncado convertiría dos puntos de diferencia en un derrumbe visual. Los gráficos van de 0 a 100.',
    ],
    seriesApprove: 'Aprueba',
    seriesDisapprove: 'Desaprueba',

    causaTag: 'Causalidad',
    causaTitle: 'Qué se puede y qué no se puede decir sobre la camioneta',
    causa: [
      'El caso se hizo público el 26 de mayo de 2026, a partir de una investigación del programa Así nos va, de Radio Carve, sobre la declaración jurada del presidente ante la Junta de Transparencia: una factura de febrero de 2025 muestra la camioneta facturada en unos 54.000 dólares contra un precio de lista cercano a los 79.000, ocho días antes de que asumiera. Muchas coberturas encadenaron ese hecho con la caída de la aprobación.',
      'Conviene fechar bien las dos cosas, porque nosotros mismos nos equivocamos primero: la fecha que teníamos anotada era la de un artículo publicado el 1º de junio, no la del hecho. Confundir la fecha de una nota con la fecha de lo que la nota cuenta es el error más fácil de cometer en una página como ésta.',
      'Las propias encuestadoras no encadenan. Cifra advirtió que su medición se realizó en un momento particularmente sensible. Opción, midiendo después, dijo expresamente que hay coincidencia temporal pero que los datos no permiten confirmar una relación causal.',
      'Y los números tampoco alcanzan. La única medición cuyo campo no está enteramente después del caso es la de Usina, que cerró su primer relevamiento el 26 de mayo, el mismo día: ya reportaba 49% de desaprobación. Equipos midió cinco semanas más tarde, con el caso instalado, y reportó 53%: doce puntos menos que Cifra, que midió antes que Equipos. Si el episodio explicara el nivel, esos números deberían ordenarse de otra manera.',
      'Sobre la Junta de Transparencia también hay que ser preciso: no se pronunció sobre el fondo. El 5 de junio dio trámite a seis denuncias anónimas acumuladas en un expediente y lo asignó a una abogada para su estudio; a fines de junio le requirió información a Presidencia. No resolvió nada, y los titulares que dicen que «lo investiga» se adelantan al trámite.',
      'No vamos más lejos que lo que sostienen las casas que midieron.',
    ],

    limitsTag: 'Para leer los números',
    limitsTitle: 'Qué no mide una encuesta de aprobación',
    limitsDek: 'Escrito para quien no estudió metodología. Nada de esto es opinión: son límites del instrumento.',
    limits: [
      {
        t: 'No mide en quién se va a votar.',
        d: 'Aprobar la gestión de un presidente y votar a su partido son dos preguntas distintas y dan resultados distintos. Ninguna de las mediciones de esta página pregunta por intención de voto.',
      },
      {
        t: 'No mide si un gobierno gobierna bien.',
        d: 'Mide cuánta gente dice que aprueba. Una gestión puede caer en la aprobación por razones que no tienen nada que ver con lo que hizo, y puede subir por razones igual de ajenas.',
      },
      {
        t: 'El margen de error es un piso, no la incertidumbre total.',
        d: 'El ±3,3% o el ±3,7% que declara cada casa mide sólo una fuente de error: la de haber entrevistado a novecientas personas en vez de a todas. No mide a quién no se pudo contactar, quién no quiso contestar, ni cómo pesó el orden de las preguntas. Un estudio sobre 4.221 encuestas de las últimas tres semanas de campaña, en 608 elecciones estadounidenses a nivel estadual —presidenciales, al Senado y a gobernador— entre 1998 y 2014, encontró que el error promedio real fue cerca del doble del que implicaban los márgenes declarados. Es otro país y otro tipo de encuesta: la lógica se traslada, la magnitud no está medida acá.',
      },
      {
        t: 'Una diferencia dentro del margen no es una diferencia.',
        d: 'Si una casa pasa de 26% a 24% y su margen es ±3,7%, no se puede decir que bajó. Lo mismo vale entre dos casas distintas.',
      },
      {
        t: 'Lo que se hace con los indecisos cambia el titular.',
        d: 'El porcentaje que no sabe o no opina no es un detalle: la lectura de un mismo resultado cambia por completo si ese bloque es del 5% o del 25%. Acá va de 15% a 28% según la casa.',
      },
      {
        t: 'Los cortes por subgrupo tienen más error que el total.',
        d: 'Cuando una encuesta de 800 casos informa qué opinan los votantes de un partido, ese porcentaje se calcula sobre una fracción de los 800. Ninguna de las casas publica el tamaño de esos subgrupos, así que no se puede decir cuánto más error tienen.',
      },
      {
        t: 'No es una foto del día en que la leíste.',
        d: 'Entre el último día de campo y la publicación pasan días o semanas. Por eso la columna que manda en esta página es la fecha de campo, no la de publicación.',
      },
      {
        t: 'Y no mide nada de lo que mide el resto de este sitio.',
        d: 'Una encuesta no dice cuánto gastó un organismo ni a quién le compró. Eso está en el registro de compras públicas y se puede verificar contrato por contrato.',
      },
    ],

    cutsTag: 'Cortes por voto',
    cutsTitle: 'Cómo se reparte según a quién votó cada uno',
    cutsDek: 'Tres casas publicaron cortes por voto anterior en 2026. Ninguna publicó el tamaño de los subgrupos.',
    cuts: 'Estos cortes son la parte más citada y la más frágil de cualquier encuesta: se calculan sobre una porción de la muestra, y ninguna de las tres casas publica de qué tamaño es esa porción. Se muestran porque las casas los publicaron, con la advertencia adelante y no al pie.',
    cutsWarn: 'Los tres cortes no son comparables entre sí: cambia la definición del voto de referencia y cambia el objeto medido, que en un caso es el gobierno y en otro el presidente.',

    leadersTag: 'Simpatía y antipatía',
    leadersTitle: 'Imagen de dirigentes',
    leadersDek: 'Dos casas midieron imagen de dirigentes en junio y julio de 2026. Ninguna de las dos publicó una tabla que podamos reproducir.',
    leadersNoTable: 'Acá no hay tabla de dirigentes, y es a propósito. La tabla de nueve pares que circuló en julio no está publicada por Cifra en ningún lado: vive en dos medios que se contradicen entre sí —uno le atribuye a Lacalle Pou 34% de antipatía y el otro «apenas un 1%»—, y armar con eso una tabla con nombre y apellido de nueve personas sería inventarla. Se cayó también, por la misma razón, el rótulo de quién encargó ese estudio: lo sostiene un solo medio y la ficha del mismo campo lo describe como multicliente.',
    leaders: [
      'Lo que sí se puede publicar de Cifra es la serie de Orsi, que las coberturas reproducen de forma consistente y que la propia casa retoma en sus informes.',
      'Equipos evaluó alrededor de treinta dirigentes en su campo del 23 de junio al 8 de julio —705 casos, presencial, ±3,7%— pero publicó los resultados sólo dentro de un gráfico. De su texto se recuperan rangos, no cifras. Por eso tampoco tiene tabla: una tabla con números que la casa no publicó sería una tabla inventada.',
    ],
    leadersEquipos: [
      'Pregunta textual: «Ahora le voy a nombrar algunos personajes públicos, y le voy a pedir que me diga, en primer lugar, si los conoce o no, y si los conoce su simpatía hacia ellos. En una escala que va de 0 a 10».',
      'Conocimiento por encima del 90%: Lacalle Pou, Orsi, Cosse y Topolansky. Alrededor del 90%: Delgado, Bordaberry, Ojeda y Manini Ríos.',
      'Simpatías: Lacalle Pou por encima del 40% y, según Equipos, el único de los treinta con saldo neto positivo. Orsi y Topolansky apenas por encima del 30%. Cosse, Bordaberry, Rodríguez y Ojeda por encima del 20%.',
      'Entre frenteamplistas, Orsi y Topolansky reúnen seis de cada diez juicios positivos. Entre votantes de la Coalición, Lacalle Pou casi tres de cada cuatro.',
    ],
    leadersWarn: [
      'Las escalas de las dos casas son distintas: Cifra pregunta simpatía, antipatía e indiferencia; Equipos usa una escala de 0 a 10. No se comparan punto a punto.',
      'La serie de Orsi está reproducida por la prensa a partir de los informes de Cifra, no leída de un informe que hayamos podido abrir: el sitio de la casa no responde a consulta automatizada.',
    ],
    leadersSerie: 'La serie de Orsi, según Cifra',

    ministersTag: 'Una sola medición con ficha',
    ministersTitle: 'Ministros',
    ministersDek: 'Cifra, campo del 1 al 17 de junio de 2026, 800 casos, telefónica fija y celular, ±3,4 puntos porcentuales con 95% de confianza.',
    ministers: 'Es la única medición de gabinete de 2026 que encontramos con ficha técnica publicada. La columna «no opina» es la que hay que mirar primero: el 23% de desaprobación de Lubetkin no se compara con el 64% de Negro, porque a Lubetkin más de una cuarta parte de los consultados no lo evalúa.',
    ministersWarn: 'Nómade publicó una evaluación del gabinete en octubre de 2025 con porcentajes al decimal, pero sin fechas de campo, sin tamaño de muestra, sin modalidad y sin margen. Bajo la regla de esta página no tiene una sola cifra publicable.',

    histTag: 'Al año de mandato',
    histTitle: 'Cómo se compara con gobiernos anteriores',
    histDek: 'La comparación menos mala es la de una sola casa consigo misma, al mismo punto del ciclo.',
    hist: [
      'Comparar presidentes distintos con encuestadoras distintas suma todos los problemas de esta página de una sola vez. La comparación más limpia disponible es la de Cifra consigo misma: la misma casa, la misma pregunta, al año de asumido cada gobierno.',
      'Hay que leerla con una advertencia adelante: sólo dos de esas seis mediciones tienen ficha propia. Las otras cuatro son cifras que la casa menciona en notas posteriores. Tienen casa y fecha aproximada, pero no tienen fechas de campo, ni tamaño de muestra, ni margen. Van marcadas distinto y no se dibujan como si fueran lo mismo.',
      'Y hay un hueco que no se puede tapar: el punto de los dieciocho meses de Orsi es setiembre de 2026 y todavía no ocurrió. Para Vázquez en 2006 y Mujica en 2011 no encontramos ninguna medición publicada y fechada en esa ventana. El único año y medio bien documentado es el de Lacalle Pou en setiembre de 2021, con tres casas.',
    ],
    histLevelFicha: 'con ficha',
    histLevelCitada: 'citada, sin ficha',
    hist18Title: 'El único año y medio bien documentado',
    hist18: 'Tres casas midieron a Lacalle Pou en setiembre de 2021, en un clima favorable, y volvió a aparecer la dispersión: nueve puntos de rango en la aprobación y siete en el saldo neto. La fila de Equipos viene de la cobertura de la época: no encontramos la nota original en su sitio.',
    histClaimsTitle: 'Lo que dicen las propias casas',
    histClaims: 'Las tres afirmaciones que siguen son de las encuestadoras, no nuestras, y difieren entre sí porque parten de números distintos.',
    histWarn: 'No se puede trazar una línea continua de Factum a través de 2021: allí su bloque intermedio es de dos a cuatro puntos y en 2016 y 2026 es de veinte a veintiocho. O cambió la pregunta o cambió la base de cálculo, y no pudimos determinar cuál. Hasta resolverlo, su serie se corta.',

    ctxTag: 'Contexto',
    ctxTitle: 'Qué dicen que es el principal problema del país',
    ctxDek: 'Tres casas, tres formatos de pregunta distintos. Se muestran por separado y no se grafican juntos.',
    ctx: 'Estas tres mediciones no son comparables entre sí, y el motivo está a la vista: Equipos cuenta la seguridad como primera o segunda mención y las otras dos no aclaran ese criterio; además cada casa agrupa las categorías de manera distinta. Un gráfico de barras que las junte estaría fabricando una comparación.',
    expTitle: 'Evaluación contra expectativas',
    expDek: 'Factum, campo del 6 al 20 de junio de 2026, 900 casos, publicado el 24 de julio.',

    voteTag: 'Módulo vacío',
    voteTitle: 'Intención de voto',
    vote: [
      'Este módulo está vacío a propósito. En 2026 ninguna de las encuestadoras que seguimos publicó una medición nacional de intención de voto.',
      'Todo lo que devuelven los buscadores con cifras de intención de voto es del ciclo electoral de 2024. Un caso concreto y verificable: un artículo fechado el 14 de agosto de 2026 republica una medición de Nómade con datos del 8 de agosto de 2024. La fecha de publicación engaña; la del dato, no.',
      'Otro caso, este de una búsqueda automatizada: un resumidor devolvió un supuesto tercer bimestre de 2026 de intención de voto departamental en Montevideo citando páginas de Factum que en realidad son de 2025. Ese dato no existe.',
      'Cuando alguna casa publique una medición de 2026 con ficha, va acá. Mientras tanto, esta sección muestra menos y no rellena.',
    ],
    voteEmpty: 'Sin mediciones publicadas en 2026',

    critTag: 'Criterio',
    critTitle: 'Cómo elegimos qué mostrar, y qué dejamos afuera',
    critDek: 'El criterio está publicado antes que los datos, y la lista de exclusiones tiene nombre y motivo.',
    crit: [
      'No inventamos un criterio propio: aplicamos el mismo estándar de ficha técnica que las encuestadoras nucleadas en CEISMU, la cámara del sector, se comprometieron a cumplir en 2017, cruzado con las guías de ESOMAR y WAPOR y con los estándares de divulgación de AAPOR. Conviene decir qué es y qué no es ese compromiso: es autorregulación privada, no una norma legal —no hay sanción ni autoridad de aplicación— y alcanza sólo a las empresas socias. Varias casas que publican encuestas en Uruguay no lo son, entre ellas Usina de Percepción Ciudadana, que aparece en esta misma página. Aun así es el piso que la propia industria se fijó, y si publicamos lo que ella misma pide publicar, no somos nosotros los que decidimos qué es una encuesta seria.',
      'De esa unión sale la ficha que pedimos: encuestadora; quién la financió o la encargó; fechas de campo de inicio y fin; fecha de publicación; tamaño de muestra; universo y exclusiones de cobertura; marco muestral; tipo de muestreo; técnica de recolección; margen de error con su nivel de confianza; formulación textual de la pregunta; variables de ponderación; porcentaje de no sabe; y el enlace a la ficha completa del origen.',
      'De esos campos, tres son condición de entrada: encuestadora, fechas exactas de campo y tamaño de muestra. Los demás se muestran y, cuando faltan, dicen «no publicado».',
      'Si encontrás un error en esta página, escribinos. Corregir a la vista es parte del criterio.',
    ],
    critExcl: 'Qué dejamos afuera',
    critExclWhat: 'Medición',
    critExclWhy: 'Motivo',

    readTitle: 'Cómo leer esta página',
    read: [
      'Todo lo que hay acá lo midieron otros. Nosotros no encuestamos, no ponderamos, no corregimos ni promediamos: transcribimos las cifras publicadas por cada encuestadora junto a la ficha con la que las publicó, y enlazamos el original.',
      'Lo único que agregamos son dos cuentas, y están rotuladas cada vez que aparecen: el saldo neto —aprobación menos desaprobación— y los rangos entre encuestadoras dentro de una misma ventana de campo. Ninguna casa publica esos dos números.',
      'No podemos decir cuál encuestadora mide mejor, y no lo insinuamos. No podemos afirmar que una caída se deba a un hecho puntual: eso no lo mide ninguna de estas encuestas y las propias casas lo advierten.',
      'Esta página tampoco evalúa al gobierno. Para eso está el resto del sitio, que trabaja sobre el registro de compras públicas y se puede verificar contrato por contrato.',
      'Si una cifra de acá no coincide con la de la fuente, la fuente tiene razón y nosotros tenemos un error. Escribinos y lo corregimos con la fecha a la vista.',
    ],

    srcTitle: 'Fuentes',
    srcDek: 'Cada fila enlaza a la publicación de la casa cuando pudimos abrirla, y a la prensa que reproduce la ficha cuando no.',
    srcCasas: 'Las encuestadoras',
    srcCriterio: 'El criterio',

    col: {
      house: 'Encuestadora',
      unit: 'Qué midió',
      field: 'Trabajo de campo',
      n: 'Casos',
      mode: 'Modalidad',
      universe: 'Universo',
      margin: 'Margen',
      weighting: 'Ponderación',
      approve: 'Aprueba',
      middle: 'Intermedio agregado',
      disapprove: 'Desaprueba',
      balance: 'Saldo',
      question: 'Pregunta',
      minister: 'Ministro',
      office: 'Cartera',
      noOpinion: 'No opina',
      leader: 'Dirigente',
      pro: 'Simpatía',
      anti: 'Antipatía',
      president: 'Presidente',
      when: 'Cuándo',
      level: 'Evidencia',
      indicator: 'Respuesta',
      value: '%',
    },
    unitPres: 'presidente',
    unitGob: 'gobierno',
    nd: 'no publicado',
    ndF: 'no publicada',
    questionYes: 'publicada',
    viaPress: 'vía prensa que reproduce la ficha',
    ownCalcTag: 'cuenta nuestra',
  },

  en: {
    kicker: 'Public opinion',
    title: 'The polls, with their technical notes',
    dek: 'What each polling firm measured about Yamandú Orsi\'s government, by what method and on what dates. Within the same eleven-week window, presidential disapproval read anywhere between 49% and 65% depending on who asked. That gap is the finding.',
    chips: ['Five polling firms', 'Full technical notes', 'No averaging'],
    fileScope: 'Job approval, leader image and ministerial ratings',
    filePeriod: 'March 2025 to August 2026',
    fileSource: 'The firms\' own releases, and press that reproduces the technical note',

    introTag: 'What this is',
    intro: [
      'This page does not evaluate the government. It collects the public-opinion surveys Uruguayan firms published about Yamandú Orsi\'s administration, each with its technical note: who ran it, between which days it was in the field, how many people it interviewed, by what channel and with what margin of error.',
      'We do this because the figure in circulation usually arrives with none of that. And because when the numbers are placed side by side, something no headline shows becomes visible: over the same window, about the same country, the firms are not measuring the same thing.',
    ],
    tiles: {
      houses: 'firms with a published technical note',
      housesSub: 'Cifra, Equipos, Factum, Opción and Usina de Percepción Ciudadana',
      polls: 'surveys published with a technical note',
      pollsSub: 'from March 2025 to August 2026',
      spread: 'presidential disapproval in the same window',
      spreadSub: 'five surveys fielded between 22 May and 11 August 2026',
      vote: 'voting-intention surveys in 2026',
      voteSub: 'not one firm published any',
    },
    revisedOn: 'Last reviewed',
    ownCalc: 'Our calculation over figures published by third parties. No polling firm publishes this range.',

    divTag: 'The main finding',
    divTitle: 'Five firms measured the same thing and got different numbers',
    divDek: 'Surveys fielded between 22 May and 11 August 2026, all on the president\'s performance.',
    div: [
      'Five firms asked about the president\'s performance within an eleven-week window. Approval barely moved between them: from 20% to 26%, six points. Disapproval moved a lot: from 49% to 65%, sixteen points. The net balance — approval minus disapproval, our own arithmetic — runs from −25 to −45: twenty points apart.',
      'June is the cleanest case. Cifra was in the field from the 1st to the 17th and Factum from the 6th to the 20th: near-overlapping windows, the same country, the same week. Cifra reported 65% disapproval and Factum 56%. Nine points.',
      'There is no saying which of the five measures better. We have no way to decide it and we will not insinuate one. What can be said, and what this page publishes, is that a reader who sees 26% in one outlet and 20% in another is not looking at a contradiction: they are looking at two different instruments.',
    ],
    divFindingKicker: 'Our calculation',
    divFindingTitle: 'What changes between firms is not how many approve: it is how many are left in the middle',
    divFinding: [
      'Ranked by the size of the middle block — those who neither approve nor disapprove, plus those with no opinion — the five surveys fall in almost the exact reverse order of disapproval: Cifra leaves 15 in the middle and reports 65 disapproval; Factum 20 and 56; Equipos around 21 and 53; Usina 27 and 49; Opción 28 and 50. Approval, meanwhile, barely moves between 20 and 26.',
      'Put another way: the firms that leave less room for a middle answer turn undecideds into disapprovers, not into approvers. The number that gets the headline — disapproval — is the one most sensitive to questionnaire design. The one that varies least — approval — is the one least often headlined.',
      'This is an arithmetic observation of ours over five published points. It is suggestive and it is not a demonstration: with five firms there is no way to submit it to a statistical test, and no firm asserts it.',
    ],
    divWarn: [
      'The window is not homogeneous: the Usina survey closed its field period on 26 May, before the presidential-pickup episode; the other four were fielded afterwards. It is visible in the dates column, which is why we do not call this a trend.',
      'Every balance and every range in this section is our own calculation. The firms publish approval and disapproval, not the balance.',
    ],

    tableTag: 'The record',
    tableTitle: 'Every survey, with its technical note',
    tableDek: 'One row, one survey, ordered by last day of fieldwork. None enters without firm, exact field dates and sample size.',
    tableNote: 'Where a field was not published, the cell says so: we neither estimate it nor leave it blank. The "middle block" column adds those who neither approve nor disapprove to those with no opinion, because not every firm separates the two; the breakdown, where the firm publishes it, sits below the table.',

    whyTag: 'Method',
    whyTitle: 'Why they differ',
    whyDek: 'Three differences documented by the firms themselves, and one observation of ours.',
    why: [
      'First: they do not all ask about the same thing. Opción rates the government and the president separately, in the same sample and the same questionnaire. In its August 2026 survey, disapproval of the government is 57% and of the president 50%. Seven points apart, ten on the balance. Placing Opción\'s 57% next to Factum\'s 56% compares different objects.',
      'Second: they do not all ask the same way. Opción uses a five-point scale — very good, good, neither, bad, very bad — and the other three an approval question. A scale with two negative boxes and two positive ones does not behave like an approve-or-disapprove.',
      'Third: they do not talk to the same people or by the same channel. Equipos interviews face-to-face in households in localities of 2,000 or more inhabitants; Factum by mobile phone, including rural population; Cifra combines landline and mobile; Usina uses automated WhatsApp protocols. Each mode leaves out a different group, and the international guidelines require declaring those exclusions precisely for that reason.',
      'And fourth, this one is ours: the size of the middle block orders disapproval almost perfectly. It is an observation over five points, not a demonstration.',
    ],
    whyNote: 'None of these differences is anyone\'s defect. They are different design decisions, all declared by the firms.',

    seriesTag: 'Trajectory',
    seriesTitle: 'Each firm\'s series, on its own',
    seriesDek: 'Four series, four charts, one axis. Never a single line.',
    series: [
      'Overlaying the four series on one chart would manufacture a single trend that no firm published. They go separately, each with its note, on the same vertical axis so they can be read in parallel without the scale deceiving anyone.',
      'What all four do agree on is the direction and the mechanism: the block of people without a formed opinion, which in March 2025 was enormous, tipped towards disapproval rather than approval. In Cifra\'s series, approval runs 37, 41, 43, 40, 31 and 20, while disapproval climbs steadily from 15 to 65.',
      'They agree on the shape of the curve. They do not agree on the level. Both things are true at once.',
    ],
    seriesWarn: [
      'The Equipos wave of November and December 2025 is mixed — 706 face-to-face cases and 403 by telephone — while the 2026 ones are purely face-to-face. That point is marked differently.',
      'Opción\'s series has two points. Two points are not a trend; they are shown anyway because they are the two surveys with a technical note it published.',
      'A truncated axis would turn two points of difference into a visual collapse. The charts run from 0 to 100.',
    ],
    seriesApprove: 'Approve',
    seriesDisapprove: 'Disapprove',

    causaTag: 'Causality',
    causaTitle: 'What can and cannot be said about the pickup truck',
    causa: [
      'The case became public on 26 May 2026, through an investigation by the Radio Carve programme Así nos va into the president\'s asset declaration before the transparency board: an invoice from February 2025 shows the pickup billed at about 54,000 dollars against a list price near 79,000, eight days before he took office. Much of the coverage chained that fact to the fall in approval.',
      'It is worth dating both things properly, because we got it wrong ourselves first: the date we had on file was that of an article published on 1 June, not that of the event. Confusing the date of a story with the date of what the story reports is the easiest error to make on a page like this one.',
      'The firms themselves do not chain them. Cifra warned that its survey was carried out at a particularly sensitive moment. Opción, measuring afterwards, said explicitly that there is a temporal coincidence but that the data do not allow a causal relationship to be confirmed.',
      'Nor do the numbers support it. The only survey whose fieldwork is not entirely after the case is Usina\'s, which closed its first round on 26 May, the very same day: it was already reporting 49% disapproval. Equipos measured five weeks later, with the case fully in the open, and reported 53%: twelve points below Cifra, which measured before Equipos. If the episode explained the level, those numbers would have to fall in a different order.',
      'On the transparency board, precision matters too: it did not rule on the substance. On 5 June it processed six anonymous complaints bundled into one file and assigned it to a lawyer for study; in late June it requested information from the presidency. It resolved nothing, and headlines saying it "is investigating him" run ahead of the procedure.',
      'We go no further than the firms that did the measuring.',
    ],

    limitsTag: 'How to read the numbers',
    limitsTitle: 'What an approval poll does not measure',
    limitsDek: 'Written for someone who never studied methodology. None of this is opinion: these are limits of the instrument.',
    limits: [
      {
        t: 'It does not measure how people will vote.',
        d: 'Approving of a president\'s performance and voting for their party are two different questions and give different results. None of the surveys on this page asks about voting intention.',
      },
      {
        t: 'It does not measure whether a government governs well.',
        d: 'It measures how many people say they approve. An administration can fall in approval for reasons that have nothing to do with what it did, and rise for reasons just as external.',
      },
      {
        t: 'The margin of error is a floor, not the total uncertainty.',
        d: 'The ±3.3% or ±3.7% each firm declares captures only one source of error: having interviewed nine hundred people instead of everyone. It does not capture who could not be reached, who declined to answer, or how question order weighed. A study of 4,221 polls from the last three weeks of campaigning, across 608 US statewide elections — presidential, Senate and governor — between 1998 and 2014, found the real average error was close to twice what the declared margins implied. That is another country and another kind of poll: the logic carries over, the magnitude is not measured here.',
      },
      {
        t: 'A difference inside the margin is not a difference.',
        d: 'If a firm moves from 26% to 24% and its margin is ±3.7%, you cannot say it fell. The same holds between two different firms.',
      },
      {
        t: 'What is done with the undecided changes the headline.',
        d: 'The share who do not know or have no opinion is not a detail: the reading of one and the same result changes entirely depending on whether that block is 5% or 25%. Here it runs from 15% to 28% depending on the firm.',
      },
      {
        t: 'Subgroup breakdowns carry more error than the total.',
        d: 'When an 800-case survey reports what one party\'s voters think, that percentage is computed over a fraction of the 800. None of the firms publishes the size of those subgroups, so there is no saying how much more error they carry.',
      },
      {
        t: 'It is not a snapshot of the day you read it.',
        d: 'Days or weeks pass between the last day of fieldwork and publication. That is why the column that governs this page is the field date, not the publication date.',
      },
      {
        t: 'And it measures none of what the rest of this site measures.',
        d: 'A poll does not say how much a public body spent or whom it bought from. That is in the public-procurement record and can be checked contract by contract.',
      },
    ],

    cutsTag: 'Breakdowns by vote',
    cutsTitle: 'How it splits by who people voted for',
    cutsDek: 'Three firms published breakdowns by previous vote in 2026. None published the size of the subgroups.',
    cuts: 'These breakdowns are the most quoted and the most fragile part of any poll: they are computed over a portion of the sample, and none of the three firms publishes how large that portion is. They are shown because the firms published them, with the warning up front rather than in a footnote.',
    cutsWarn: 'The three breakdowns are not comparable with one another: the reference vote is defined differently and the object measured changes, being the government in one case and the president in another.',

    leadersTag: 'Sympathy and antipathy',
    leadersTitle: 'Leader image',
    leadersDek: 'Two firms measured leader image in June and July 2026. Neither published a table we can reproduce.',
    leadersNoTable: 'There is no leader table here, and that is deliberate. The nine-pair table that circulated in July is published by Cifra nowhere: it lives in two outlets that contradict each other — one attributes 34% antipathy to Lacalle Pou and the other "barely 1%" — and building a table naming nine people out of that would be inventing it. The label naming who commissioned that study fell for the same reason: a single outlet supports it, and the technical note for the same fieldwork describes it as multi-client.',
    leaders: [
      'What can be published from Cifra is the Orsi series, which the coverage reproduces consistently and which the firm itself returns to in its reports.',
      'Equipos rated around thirty leaders in its 23 June to 8 July field period — 705 cases, face-to-face, ±3.7% — but published the results only inside a chart. Its prose yields ranges, not figures. That is why it has no table either: a table of numbers the firm did not publish would be an invented table.',
    ],
    leadersEquipos: [
      'The verbatim question: "I am going to name some public figures, and I will ask you to tell me, first, whether you know them or not, and if you do, your sympathy towards them, on a scale from 0 to 10."',
      'Recognition above 90%: Lacalle Pou, Orsi, Cosse and Topolansky. Around 90%: Delgado, Bordaberry, Ojeda and Manini Ríos.',
      'Sympathy: Lacalle Pou above 40% and, according to Equipos, the only one of the thirty with a positive net balance. Orsi and Topolansky just above 30%. Cosse, Bordaberry, Rodríguez and Ojeda above 20%.',
      'Among Frente Amplio supporters, Orsi and Topolansky draw six out of every ten positive judgements. Among Coalition voters, Lacalle Pou almost three out of four.',
    ],
    leadersWarn: [
      'The two firms use different scales: Cifra asks about sympathy, antipathy and indifference; Equipos uses a 0-to-10 scale. They are not comparable point by point.',
      'The Orsi series is reproduced by the press from Cifra\'s reports, not read from a report we could open: the firm\'s site does not answer automated requests.',
    ],
    leadersSerie: 'Orsi\'s series, according to Cifra',

    ministersTag: 'One survey with a technical note',
    ministersTitle: 'Ministers',
    ministersDek: 'Cifra, fielded 1 to 17 June 2026, 800 cases, landline and mobile telephone, ±3.4 percentage points at 95% confidence.',
    ministers: 'It is the only 2026 cabinet survey we found with a published technical note. The "no opinion" column is the one to read first: Lubetkin\'s 23% disapproval does not compare with Negro\'s 64%, because more than a quarter of respondents do not rate Lubetkin at all.',
    ministersWarn: 'Nómade published a cabinet rating in October 2025 with percentages to one decimal, but with no field dates, no sample size, no mode and no margin. Under this page\'s rule it has not a single publishable figure.',

    histTag: 'One year into the term',
    histTitle: 'How it compares with previous governments',
    histDek: 'The least bad comparison is one firm against itself, at the same point of the cycle.',
    hist: [
      'Comparing different presidents through different polling firms stacks every problem on this page at once. The cleanest comparison available is Cifra against itself: the same firm, the same question, one year into each government.',
      'It has to be read with a warning up front: only two of those six surveys have a technical note of their own. The other four are figures the firm mentions in later releases. They have a firm and an approximate date, but no field dates, no sample size and no margin. They are marked differently and not drawn as if they were the same thing.',
      'And there is a gap that cannot be filled: Orsi\'s eighteen-month point is September 2026 and has not happened yet. For Vázquez in 2006 and Mujica in 2011 we found no published, dated survey in that window. The only well-documented year and a half is Lacalle Pou\'s in September 2021, with three firms.',
    ],
    histLevelFicha: 'with technical note',
    histLevelCitada: 'quoted, no technical note',
    hist18Title: 'The only well-documented eighteen-month point',
    hist18: 'Three firms measured Lacalle Pou in September 2021, in a favourable climate, and the spread showed up again: nine points of range in approval and seven in the net balance. The Equipos row comes from contemporary coverage: we did not find the original release on its site.',
    histClaimsTitle: 'What the firms themselves say',
    histClaims: 'The three statements that follow belong to the polling firms, not to us, and they differ from one another because they start from different numbers.',
    histWarn: 'No continuous Factum line can be drawn through 2021: there its middle block is two to four points, while in 2016 and 2026 it is twenty to twenty-eight. Either the question or the base of calculation changed, and we could not determine which. Until that is resolved, its series is cut.',

    ctxTag: 'Context',
    ctxTitle: 'What people call the country\'s main problem',
    ctxDek: 'Three firms, three different question formats. Shown separately and never charted together.',
    ctx: 'These three surveys are not comparable with one another, and the reason is in plain sight: Equipos counts security as a first or second mention and the other two do not state that criterion; each firm also groups the categories differently. A bar chart putting them together would be manufacturing a comparison.',
    expTitle: 'Performance against expectations',
    expDek: 'Factum, fielded 6 to 20 June 2026, 900 cases, published on 24 July.',

    voteTag: 'Empty module',
    voteTitle: 'Voting intention',
    vote: [
      'This module is empty on purpose. In 2026 none of the firms we follow published a national voting-intention survey.',
      'Everything search engines return with voting-intention figures belongs to the 2024 election cycle. One concrete, checkable case: an article dated 14 August 2026 republishes a Nómade survey with data from 8 August 2024. The publication date deceives; the data date does not.',
      'Another case, this one from an automated search: a summariser returned a supposed third two-month period of 2026 for departmental voting intention in Montevideo, citing Factum pages that are in fact from 2025. That figure does not exist.',
      'When some firm publishes a 2026 survey with a technical note, it goes here. In the meantime this section shows less rather than filling the space.',
    ],
    voteEmpty: 'No surveys published in 2026',

    critTag: 'Criteria',
    critTitle: 'How we choose what to show, and what we leave out',
    critDek: 'The criterion is published before the data, and the exclusion list carries names and reasons.',
    crit: [
      'We did not invent our own criterion: we apply the same technical-note standard the polling firms grouped in CEISMU, the industry chamber, committed to in 2017, cross-checked against the ESOMAR and WAPOR guidelines and AAPOR\'s disclosure standards. It is worth saying what that commitment is and is not: private self-regulation, not law — no sanction, no enforcing authority — and it binds only member firms. Several houses that publish polls in Uruguay are not members, among them Usina de Percepción Ciudadana, which appears on this very page. Even so it is the floor the industry set for itself, and if we publish what it asks to be published, we are not the ones deciding what counts as a serious poll.',
      'That union yields the note we ask for: polling firm; who funded or commissioned it; start and end field dates; publication date; sample size; universe and coverage exclusions; sampling frame; sampling type; collection technique; margin of error with its confidence level; verbatim question wording; weighting variables; the share of don\'t-knows; and the link to the full note at source.',
      'Of those fields, three are a condition of entry: firm, exact field dates and sample size. The rest are displayed and, when missing, say "not published".',
      'If you find an error on this page, write to us. Correcting in plain sight is part of the criterion.',
    ],
    critExcl: 'What we left out',
    critExclWhat: 'Survey',
    critExclWhy: 'Reason',

    readTitle: 'How to read this page',
    read: [
      'Everything here was measured by others. We do not poll, weight, correct or average: we transcribe the figures each firm published alongside the technical note it published them with, and we link to the original.',
      'The only things we add are two calculations, labelled every time they appear: the net balance — approval minus disapproval — and the ranges between firms within one field window. No firm publishes those two numbers.',
      'We cannot say which firm measures better, and we do not insinuate it. We cannot claim a fall is due to one particular event: none of these surveys measures that, and the firms themselves warn against it.',
      'Nor does this page evaluate the government. That is what the rest of the site is for, working on the public-procurement record, checkable contract by contract.',
      'If a figure here does not match the source, the source is right and we are wrong. Write to us and we will correct it with the date in plain sight.',
    ],

    srcTitle: 'Sources',
    srcDek: 'Each row links to the firm\'s own release where we could open it, and to the press that reproduces the technical note where we could not.',
    srcCasas: 'The polling firms',
    srcCriterio: 'The criteria',

    col: {
      house: 'Firm',
      unit: 'Measured',
      field: 'Fieldwork',
      n: 'Cases',
      mode: 'Mode',
      universe: 'Universe',
      margin: 'Margin',
      weighting: 'Weighting',
      approve: 'Approve',
      middle: 'Middle block',
      disapprove: 'Disapprove',
      balance: 'Balance',
      question: 'Question',
      minister: 'Minister',
      office: 'Portfolio',
      noOpinion: 'No opinion',
      leader: 'Leader',
      pro: 'Sympathy',
      anti: 'Antipathy',
      president: 'President',
      when: 'When',
      level: 'Evidence',
      indicator: 'Answer',
      value: '%',
    },
    unitPres: 'president',
    unitGob: 'government',
    nd: 'not published',
    ndF: 'not published',
    questionYes: 'published',
    viaPress: 'via press reproducing the technical note',
    ownCalcTag: 'our calculation',
  },
} as const

export function pollContent(locale: string) {
  return CONTENT[(locale === 'en' ? 'en' : 'es') as Locale]
}

/** El saldo no se guarda: se deriva, para que nunca quede desincronizado del par que lo origina. */
export function balance(p: { approve: number, disapprove: number }): number {
  return p.approve - p.disapprove
}

/** Rango de desaprobación dentro de la ventana. Cálculo nuestro, rotulado como tal en la página. */
export function windowSpread(): { min: number, max: number } {
  const rows = POLLS.filter(p => WINDOW_KEYS.includes(p.key))
  const values = rows.map(p => p.disapprove)
  return { min: Math.min(...values), max: Math.max(...values) }
}
