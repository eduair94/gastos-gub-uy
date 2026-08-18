/**
 * Investigación · El documento del Frente Amplio, leído contra sus fuentes.
 *
 * POR QUÉ EXISTE ESTA PIEZA EN UN SITIO DE COMPRAS PÚBLICAS. Porque el documento hace
 * afirmaciones verificables y la prensa las repitió sin verificarlas. La pieza no evalúa la
 * gestión del gobierno. Tampoco evalúa al Frente Amplio. Hace tres cosas y ninguna más:
 * publica la fuente primaria, mide el propio texto y contrasta cinco afirmaciones contra el
 * documento oficial que las puede confirmar o corregir.
 *
 * LAS TRES PROCEDENCIAS, SIEMPRE SEPARADAS:
 *   1. El PDF oficial del VIII Congreso, bajado de frenteamplio.uy y extraído con `unpdf`.
 *      De ahí salen las citas literales y TODOS los conteos de este archivo.
 *   2. Documentos del Estado leídos directo — los dos Informes Fiscales del MEF.
 *   3. Prensa, citada como prensa, y sólo cuando pudimos leer su texto.
 *
 * LOS CONTEOS SON REPRODUCIBLES. Se cuentan sobre el cuerpo del documento, sin los
 * encabezados de página y sin la marca del extractor. El cuerpo tiene 22.832 palabras. Cada
 * conteo es sin distinción de mayúsculas. La palabra «seguridad» se desglosa a mano, porque el
 * conteo crudo mezcla la Estrategia de Seguridad Nacional de Estados Unidos con la seguridad
 * interna: publicar 17 sin ese desglose sería un dato falso.
 *
 * LO QUE NO ESTÁ ACÁ, A PROPÓSITO. Las notas tras muro de pago no tienen fila en la tabla de
 * coberturas. Cuando el medio deja abierta una parte, la fila lo dice y describe sólo esa parte.
 */

export type Locale = 'es' | 'en'

/* ------------------------------------------------------------------ */
/* La fuente primaria                                                  */
/* ------------------------------------------------------------------ */

export const DOC = {
  /** Páginas del PDF. */
  pages: 63,
  /** Palabras del cuerpo, sin encabezados. */
  words: 22832,
  approved: '2026-08-08',
  /** Fecha de publicación del PDF en el sitio del FA (cabecera Last-Modified del archivo). */
  publishedAt: '2026-08-14',
  /** Primera cobertura que citó el texto. */
  firstPress: '2026-08-10',
  congressDates: '16, 17 y 18 de octubre de 2026',
  committees: 500,
  pdfUrl: 'https://www.frenteamplio.uy/wp-content/uploads/VIII-Congreso-FA-2026.pdf',
  pageUrl: 'https://www.frenteamplio.uy/viii-congreso-ordinario-companero-jose-pepe-mujica-documento-aprobado-en-el-plenario-nacional-8-8-2026/',
} as const

/** Reparto del texto por capítulo. Palabras contadas sobre el cuerpo, no páginas maquetadas. */
export interface Chapter { key: string, pages: number, words: number, share: number }
export const CHAPTERS: Chapter[] = [
  { key: 'i', pages: 16, words: 6578, share: 29.5 },
  { key: 'ii', pages: 13, words: 5317, share: 23.9 },
  { key: 'iii', pages: 13, words: 4743, share: 21.3 },
  { key: 'iv', pages: 17, words: 5640, share: 25.3 },
]

/** Conteo de términos sobre el cuerpo del documento. Medido el 2026-08-17. */
export interface TermCount { key: string, n: number }
export const TERMS: TermCount[] = [
  { key: 'imperialismo', n: 25 },
  { key: 'soberania', n: 22 },
  { key: 'seguridad', n: 17 },
  { key: 'ambiental', n: 17 },
  { key: 'eeuu', n: 16 },
  { key: 'genero', n: 16 },
  { key: 'comunicacion', n: 13 },
  { key: 'feminismo', n: 12 },
  { key: 'educacion', n: 9 },
  { key: 'salud', n: 9 },
  { key: 'vivienda', n: 7 },
  { key: 'empleo', n: 5 },
  { key: 'salario', n: 4 },
  { key: 'transparencia', n: 3 },
  { key: 'corrupcion', n: 1 },
]

/** Términos que no aparecen ni una vez. Es el hallazgo, así que va aparte. */
export const ZERO_TERMS = ['delito', 'delincuencia', 'rapina', 'homicidio', 'narcotrafico', 'desempleo', 'inflacion', 'costoDeVida', 'comprasPublicas', 'licitacion'] as const

/** Las 17 menciones de «seguridad», clasificadas una por una. */
export const SEG = { total: 17, geopolitica: 10, social: 2, alimentaria: 1, soberania: 1, interna: 3 } as const

/* ------------------------------------------------------------------ */
/* Las coberturas                                                      */
/* ------------------------------------------------------------------ */

/**
 * `quotes` dice qué hizo el medio con el texto: 'literal' cita párrafos completos,
 * 'parafrasis' resume sin comillas, 'ninguna' informa el hecho sin tocar el contenido.
 */
export interface Coverage {
  key: string
  outlet: string
  date: string
  url: string
  quotes: 'literal' | 'parafrasis' | 'ninguna'
}

export const COVERAGE: Coverage[] = [
  { key: 'enperspectiva', outlet: 'En Perspectiva', date: '2026-08-10', quotes: 'parafrasis', url: 'https://enperspectiva.uy/en-perspectiva-programa/noticias-del-10-de-agosto-de-2026/' },
  { key: 'laprensa', outlet: 'La Prensa', date: '2026-08-10', quotes: 'ninguna', url: 'https://laprensa.com.uy/informaci%C3%B3n/nacionales/plenario-nacion-al-del-frente-amplio-aprobo-documento-que-orientara-al-congreso-de-octubre' },
  { key: 'carasycaretas', outlet: 'Caras y Caretas', date: '2026-08-14', quotes: 'literal', url: 'https://www.carasycaretas.com.uy/politica/frente-amplio-se-propone-apelar-al-dialogo-y-ampliar-alianzas-organizaciones-sociales-n98349' },
  { key: 'teledoce', outlet: 'Telemundo · Teledoce', date: '2026-08-17', quotes: 'literal', url: 'https://www.teledoce.com/telemundo/nacionales/documento-del-fa-considera-que-hay-una-enorme-carencia-animica-entre-militantes-y-que-el-gobierno-enfrenta-errores-en-la-comunicacion/' },
  { key: 'cronista', outlet: 'El Cronista', date: '2026-08-17', quotes: 'ninguna', url: 'https://www.cronista.com/uruguay/actualidad-uy/frente-amplio-y-gobierno-reconocen-falencias-en-comunicacion-pese-a-avances-en-politicas-sociales/' },
]

/* ------------------------------------------------------------------ */
/* Las afirmaciones, contra fuente                                     */
/* ------------------------------------------------------------------ */

export type Verdict = 'medible' | 'parcial' | 'no-medible'

export interface Claim {
  key: string
  /** Número de párrafo en el documento. Es la referencia estable: la página cambia con el visor. */
  para: number
  verdict: Verdict
}

export const CLAIMS: Claim[] = [
  { key: 'popularidad', para: 112, verdict: 'medible' },
  { key: 'deficit', para: 116, verdict: 'parcial' },
  { key: 'compromisos', para: 116, verdict: 'medible' },
  { key: 'atrasos', para: 117, verdict: 'no-medible' },
  { key: 'ajuste', para: 119, verdict: 'no-medible' },
]

/** Cifras fiscales, cada una con el documento oficial donde consta. */
export const FISCAL = {
  /** Lo que el documento escribe como estimación previa. */
  docPrev: 2.9,
  /** Lo que el Informe Fiscal del MEF del 18/02/2025 proyectó para 2025 (GC-BPS). */
  mefPrev: 3.0,
  /** Resultado GC-BPS 2025, Informe Fiscal del 03/03/2026. */
  result: 4.1,
  /** Del resultado 2025, lo que el MEF atribuye a gastos postergados por la administración anterior. */
  postponed: 0.3,
  /** Lo que el documento dice: «superaban los 1000 millones de dólares». */
  docCommitments: 1000,
  /** Lo que el ministro presentó al Parlamento el 03/04/2025, en millones de dólares. */
  officialCommitments: 970,
  officialPostponed: 360,
  officialCommitted: 610,
  mefPrevUrl: 'https://www.gub.uy/ministerio-economia-finanzas/sites/ministerio-economia-finanzas/files/documentos/publicaciones/Informe%20Fiscal%202024.pdf',
  mefResultUrl: 'https://www.gub.uy/ministerio-economia-finanzas/sites/ministerio-economia-finanzas/files/documentos/publicaciones/Informe%20Fiscal%202025.pdf',
  commitmentsUrl: 'https://www.elobservador.com.uy/nacional/oddone-informo-que-el-deficit-fiscal-2024-tendria-que-haber-sido-05-puntos-mas-del-pib-compromisos-pagar-2025-n5992588',
} as const

/**
 * Lo que el corpus de compras públicas puede y no puede decir sobre el gasto de 2025 y 2026.
 * Sale de la colección `spending_trend`, la misma que publica /analytics/evolucion-gasto.
 * NO alcanza para decidir si hubo ajuste, y los números de acá son la razón.
 */
export const TREND = {
  real2025: -21.2,
  /** Un solo contrato de UTE explica esta parte de la variación real de 2025. */
  singleContract2025: 25.2,
  real2026: -48.2,
  /** De la variación real de 2026, lo que corresponde a cambios de cobertura, en miles de millones. */
  coverage2026Uyu: 14.2,
  entrants2026: 9,
  exits2026: 14,
} as const

/* ------------------------------------------------------------------ */
/* Fuentes                                                             */
/* ------------------------------------------------------------------ */

export const FA_SOURCES = [
  {
    key: 'primaria',
    items: [
      { label: 'Frente Amplio — documento aprobado en el Plenario Nacional del 8/8/2026 (PDF, 63 páginas)', url: DOC.pdfUrl },
      { label: 'Frente Amplio — publicación del documento en su sitio', url: DOC.pageUrl },
    ],
  },
  {
    key: 'estado',
    items: [
      { label: 'MEF — Informe Fiscal Gobierno Central-BPS 2024 (18/02/2025): proyección de -3,0% del PIB para 2025', url: FISCAL.mefPrevUrl },
      { label: 'MEF — Informe Fiscal 2025 (03/03/2026): resultado GC-BPS de -4,1% del PIB', url: FISCAL.mefResultUrl },
    ],
  },
  {
    key: 'encuestas',
    items: [
      { label: 'Cifra — evaluación de la gestión del presidente, junio de 2026', url: 'https://www.cifra.com.uy/la-evaluacion-de-la-gestion-del-presidente-12/' },
      { label: 'Factum — análisis de febrero de 2026', url: 'https://portal.factum.uy/analisis/2026/ana260302.php' },
      { label: 'la diaria — Opción, agosto de 2026: los juicios negativos crecen entre votantes frentistas', url: 'https://ladiaria.com.uy/politica/articulo/2026/8/el-57-de-la-poblacion-desaprueba-el-gobierno-de-orsi-y-los-juicios-negativos-crecen-entre-los-votantes-frentistas-segun-opcion/' },
    ],
  },
  {
    key: 'prensa',
    items: COVERAGE.map(c => ({ label: `${c.outlet} — ${c.date}`, url: c.url })),
  },
]

/* ------------------------------------------------------------------ */
/* Contenido                                                           */
/* ------------------------------------------------------------------ */

export const FA_CONTENT = {
  es: {
    kicker: 'Investigación · fuente primaria contra prensa',
    title: 'El documento del FA, contado por cinco medios y medido contra tres fuentes',
    dek: 'El Plenario Nacional aprobó 63 páginas el 8 de agosto de 2026. El Frente Amplio las publicó el 14. Bajamos el PDF, medimos su texto y contrastamos cinco de sus afirmaciones contra los informes del MEF y las encuestas con ficha técnica. Dos se confirman, una se corrige por 30 millones de dólares y dos no se pueden decidir con dato público.',
    fileScope: '63 páginas · 22.832 palabras',
    filePeriod: '8 → 17 de agosto de 2026',
    fileSource: 'PDF del Frente Amplio · Informes Fiscales del MEF · encuestas con ficha',
    chips: ['PDF oficial, no filtrado', '«85% de 63 prioridades» no está en el texto', '3 de 17 menciones de seguridad', 'US$ 970 M, no 1.000'],

    statHead: 'Menciones de delito, rapiña, homicidio, narcotráfico o desempleo',
    statSub: 'en las 22.832 palabras del documento que diagnostica un problema de comunicación',
    tiles: [
      { n: '63', l: 'páginas', s: 'aprobadas por unanimidad el 8/8/2026' },
      { n: '25', l: 'menciones de imperialismo', s: 'y 16 de Estados Unidos' },
      { n: '3', l: 'menciones de seguridad interna', s: 'de 17 veces que aparece la palabra' },
      { n: 'US$ 970 M', l: 'la cifra del ministro', s: 'el documento dice «más de 1.000 millones»' },
    ],

    docTag: 'La fuente primaria',
    docTitle: 'El documento no se filtró: está publicado',
    doc: [
      'El 8 de agosto de 2026 el Plenario Nacional del Frente Amplio aprobó por unanimidad el documento que orienta el VIII Congreso Ordinario «Compañero José \'Pepe\' Mujica». El congreso es el 16, 17 y 18 de octubre. Antes lo discuten unos 500 comités de base.',
      'El 10 de agosto la prensa ya citaba el texto: En Perspectiva lo resumió y atribuyó el acceso a la diaria. El Frente Amplio subió el PDF completo a su sitio el 14 de agosto, según la fecha del propio archivo. Desde esa fecha cualquiera puede leer las 63 páginas sin intermediario.',
      'Las citas de esta página salen de ese PDF. Cada una lleva el número de párrafo, que es la referencia estable: la página depende del visor.',
    ],
    quoteAnimo: '111. Ahora bien, para dar esta batalla y aprovechar al máximo estas potencialidades, la fuerza política no puede mirar para el costado. Resulta imperioso reconocer la enorme carencia anímica que aqueja hoy a muchos/as de los/as militantes en los Comités de Base, como así también a una parte no menor de las direcciones intermedias, llámense Departamentales, Coordinadoras o zonales a partir de problemas en la «gestión de la política» y errores en la comunicación del gobierno nacional.',
    quoteCoord: '112. Es en esta misma línea, viene siendo notoria también la falta de coordinación dentro del propio gobierno. Esto —que además de ser uno de los motivos principales que han incidido según las mediciones de opinión para la cada vez más baja popularidad del gobierno, principalmente entre los y las frenteamplistas—, ha generado un gran malestar y desorientación en la militancia más estrecha.',
    quoteRight: '108. A través de esa ofensiva ideológica se busca erosionar los principios y valores que sustentan el proyecto político del Frente Amplio, modelando un humor social adverso a las transformaciones impulsadas por nuestro gobierno.',
    quoteRightNote: 'Este párrafo va cuatro lugares antes del que todos citaron. El documento reparte la causa entre dos cosas: los errores propios y una ofensiva ajena. Cuatro de las cinco coberturas se quedaron con la primera mitad.',

    pesoTag: 'Medición propia',
    pesoTitle: 'Qué pesa cada tema dentro del documento',
    peso: [
      'El documento diagnostica que el problema es de comunicación. Su propio texto se puede medir, y medirlo dice a qué le dedica espacio.',
      'El capítulo de coyuntura internacional es el más largo de los cuatro: 6.578 palabras, el 29,5% del texto de los cuatro capítulos. El balance del período, donde vive la autocrítica que la prensa citó, ocupa 5.317.',
      'El conteo de términos es más directo. «Imperialismo» y sus derivados aparecen 25 veces, «soberanía» 22, «Estados Unidos» 16. «Delito», «rapiña», «homicidio», «narcotráfico», «desempleo» e «inflación» no aparecen ninguna vez.',
      'La palabra «seguridad» aparece 17 veces y hay que abrirla, porque el conteo crudo engaña. Diez menciones son geopolítica: la Estrategia de Seguridad Nacional de Estados Unidos, la seguridad naval del estrecho de Ormuz, la Doctrina de Seguridad Nacional del Plan Cóndor. Dos son «Seguridad Social». Una es «inseguridad alimentaria». Una es el control soberano de fronteras. Quedan tres sobre seguridad interna.',
    ],
    pesoNota: 'Un documento estratégico de un partido no es un plan de gobierno. Mide su propia discusión, no la agenda del Estado. El conteo dice de qué habla el texto, y nada más que eso.',
    colTermino: 'Término',
    colMenciones: 'Menciones',
    colCapitulo: 'Capítulo',
    colPaginas: 'Páginas',
    colPalabras: 'Palabras',
    colShare: 'De los capítulos',
    chapters: {
      i: 'I · Coyuntura internacional',
      ii: 'II · Balance desde el Congreso 50 Años de Unidad',
      iii: 'III · Estrategia política y línea programática',
      iv: 'IV · Rol de la fuerza política',
    },
    terms: {
      imperialismo: 'imperialismo, imperialista',
      soberania: 'soberanía, soberano',
      seguridad: 'seguridad (todas las acepciones)',
      ambiental: 'ambiental',
      eeuu: 'Estados Unidos',
      genero: 'género',
      comunicacion: 'comunicación',
      feminismo: 'feminismo, feminista',
      educacion: 'educación',
      salud: 'salud',
      vivienda: 'vivienda',
      empleo: 'empleo',
      salario: 'salario',
      transparencia: 'transparencia',
      corrupcion: 'corrupción',
    },
    zeroTitle: 'Cero menciones, ni una',
    zeroTerms: {
      delito: 'delito',
      delincuencia: 'delincuencia',
      rapina: 'rapiña',
      homicidio: 'homicidio',
      narcotrafico: 'narcotráfico',
      desempleo: 'desempleo',
      inflacion: 'inflación',
      costoDeVida: 'costo de vida',
      comprasPublicas: 'compras públicas',
      licitacion: 'licitación',
    },
    agendaTitle: 'Lo que la gente nombra primero',
    agenda: [
      'Las encuestas que este sitio publica con ficha técnica preguntan cuál es el principal problema del país. Cifra midió del 18 al 28 de febrero de 2026, con 801 casos: inseguridad, delincuencia y narcotráfico 46; economía alrededor de 33; desempleo alrededor de 19. Equipos midió del 21 de abril al 4 de mayo, con 704 casos: seguridad 58 como primera o segunda mención, desempleo alrededor de un tercio.',
      'Las dos mediciones son de casas distintas y no se promedian. Cada una apunta a lo mismo: el primer problema que la gente nombra es el que el documento menciona tres veces.',
    ],

    prensaTag: 'Las coberturas',
    prensaTitle: 'Cinco medios leyeron el mismo documento',
    prensaIntro: 'Entra el medio cuyo texto pudimos leer completo. Las notas tras muro de pago no tienen fila: no se puede describir lo que no se leyó.',
    colMedio: 'Medio',
    colFecha: 'Fecha',
    colCitas: 'Uso del texto',
    colQue: 'Qué hizo con el documento',
    quotesLabel: { literal: 'Cita literal', parafrasis: 'Paráfrasis', ninguna: 'Sin citas' },
    coverage: {
      enperspectiva: 'Resumió el documento un día después del Plenario, atribuyendo el acceso a la diaria. Es la única cobertura que levanta el punto de política exterior: revisar la posición frente a Estados Unidos y Palestina.',
      laprensa: 'Informó el hecho —aprobación por unanimidad, 500 comités de base, congreso del 16 al 18 de octubre— sin citar el contenido. El resto de la nota está tras muro de pago.',
      carasycaretas: 'Citó el documento largo, y ninguna de sus citas es la de la carencia anímica: la palabra no aparece en la nota. Se quedó con el capítulo de alianzas y con la autocrítica sobre 2019. Parte del texto pide registro, así que leímos la porción abierta.',
      teledoce: 'Reprodujo los párrafos 111, 112 y 113 completos y sin recortes. En el mismo texto numera el congreso como «VII Congreso Ordinario»; el documento, en la portada y en el encabezado de las 63 páginas, dice VIII.',
      cronista: 'No citó el documento. Citó a Fernando Pereira, que dijo que el 85% de las 63 prioridades del plan de gobierno ya se aplica. Esa cifra no está en el documento: «63» y «85» no aparecen ninguna vez en las 63 páginas.',
    },

    medibleTag: 'Contra fuente',
    medibleTitle: 'Cinco afirmaciones del documento, chequeadas',
    medibleIntro: 'Cada afirmación se contrasta contra la fuente que la puede confirmar o corregir. La etiqueta dice hasta dónde llega el dato público, no si el documento tiene razón sobre lo que opina.',
    verdictLabel: { 'medible': 'Se puede medir', 'parcial': 'Se mide en parte', 'no-medible': 'No se puede medir' },
    colAfirmacion: 'Lo que dice el documento',
    colVeredicto: 'Dato público',
    claims: {
      popularidad: {
        claim: '§112 · La popularidad del gobierno cae «principalmente entre los y las frenteamplistas», según «las mediciones de opinión».',
        check: 'El documento no nombra ninguna medición: la palabra «encuesta» no aparece en sus 63 páginas, y tampoco el nombre de ninguna casa. Estas mediciones sí tienen ficha técnica. Factum, campo del 8 al 22 de febrero de 2026: entre votantes del FA, 72 aprueba y 10 desaprueba. Cifra, campo del 1 al 17 de junio: entre quienes votaron al FA en 2024, 41 aprueba y 34 desaprueba. Opción, campo de julio y agosto: entre votantes del FA, el gobierno tiene 39 de aprobación y 28 de desaprobación. Las tres casas miden objetos distintos y no se promedian. Las tres muestran la caída, y en las tres el votante frenteamplista sigue siendo el que mejor evalúa.',
      },
      deficit: {
        claim: '§116 · «El déficit fiscal heredado era del 4,1 %, muy por encima de las estimaciones del 2,9 %».',
        check: 'El 4,1% existe y es oficial: el Informe Fiscal del MEF del 3 de marzo de 2026 ubica el resultado del Gobierno Central-BPS de 2025 en -4,1% del PIB. Ese informe lo describe como resultado del ejercicio 2025, alineado con lo proyectado en el Presupuesto Nacional, y atribuye 0,3% del PIB a gastos postergados por la administración anterior. La estimación previa no es 2,9%: el Informe Fiscal del 18 de febrero de 2025 proyecta -3,0% del PIB para 2025. El 2,9% aparece en ese mismo informe, pero referido a otra cosa —la meta estructural fijada en febrero de 2024—.',
      },
      compromisos: {
        claim: '§116 · Existían «compromisos de gastos no contabilizados que superaban los 1000 millones de dólares».',
        check: 'La cifra oficial es menor. El ministro de Economía la presentó a la Comisión de Hacienda de Diputados el 3 de abril de 2025: US$ 970 millones, que son US$ 360 millones de gastos postergados de 2024 más US$ 610 millones comprometidos al 28 de febrero de 2025. El documento redondea 970 hasta pasar los 1.000. La diferencia es de 30 millones de dólares y no cambia el orden de magnitud.',
      },
      atrasos: {
        claim: '§117 · Había «atrasos en los pagos a distintos proveedores del Estado».',
        check: 'Este sitio no lo puede chequear, y conviene decirlo antes que estimarlo. El registro de compras estatales publica adjudicaciones: quién ganó, cuánto y cuándo se adjudicó. No publica pagos. Un atraso en el pago no deja rastro en el dato abierto de contrataciones. Para medirlo haría falta la ejecución del SIIF, que no está en este corpus.',
      },
      ajuste: {
        claim: '§119 · «Se descartó de plano una política de ajuste».',
        check: 'El corpus de compras no decide esto, y sus propios números explican por qué. El gasto adjudicado real cayó 21,2% en 2025, pero un solo contrato de UTE explica el 25,2% de esa variación. En 2026 la caída real va en 48,2% con el año a mitad de camino, y 14,2 mil millones de pesos de esa variación son cambio de cobertura: 9 organismos empezaron a reportar y 14 dejaron de hacerlo. Una serie que se mueve así no mide política fiscal. Mide contratos grandes y quién publicó ese año.',
      },
    },

    limitesTag: 'Método',
    limitesTitle: 'Cómo se hizo, y qué no cubre',
    limites: [
      'El PDF se bajó del sitio del Frente Amplio y se extrajo con la biblioteca `unpdf`. Los conteos corren sobre el cuerpo del texto, sin encabezados de página, y no distinguen mayúsculas.',
      'La palabra «seguridad» se clasificó a mano, una por una, porque el conteo crudo mezcla la seguridad interna con la Estrategia de Seguridad Nacional de Estados Unidos.',
      'No leímos las notas de la diaria, Búsqueda ni El País sobre el documento: están tras muro de pago. Por eso no tienen fila en la tabla de coberturas, aunque la diaria fue la primera en publicarlo. De La Prensa y Caras y Caretas leímos la porción abierta, y la fila de cada una lo dice.',
      'Esta página no evalúa la gestión del gobierno ni el diagnóstico del documento. Chequea afirmaciones contra la fuente que las puede confirmar. Sobre lo que el documento opina, no hay veredicto acá.',
    ],

    sourcesTag: 'Dónde chequear',
    sourcesTitle: 'Todo esto es público',
    sourcesP: 'El documento está en el sitio del Frente Amplio. Los dos informes fiscales están en el sitio del Ministerio de Economía. Las encuestas están en el sitio de cada casa. Ninguna de las cifras de esta página requiere un pedido de acceso a la información.',
    srcPrimaria: 'La fuente primaria',
    srcEstado: 'Documentos del Estado',
    srcEncuestas: 'Encuestas, con ficha técnica',
    srcPrensa: 'Prensa, citada como prensa',
    encuestasLink: 'Ver todas las encuestas con su ficha técnica',
  },

  en: {
    kicker: 'Investigation · primary source against press',
    title: 'The Frente Amplio document, told by five outlets and measured against three sources',
    dek: 'The National Plenary approved 63 pages on 8 August 2026. The party published them on the 14th. We downloaded the PDF, measured its text and checked five of its claims against the Finance Ministry reports and the polls that publish a methodology card. Two hold, one is off by 30 million dollars, and two cannot be settled with public data.',
    fileScope: '63 pages · 22,832 words',
    filePeriod: '8 → 17 August 2026',
    fileSource: 'Frente Amplio PDF · Finance Ministry fiscal reports · polls with methodology cards',
    chips: ['Official PDF, not leaked', '"85% of 63 priorities" is not in the text', '3 of 17 security mentions', 'US$ 970 M, not 1,000'],

    statHead: 'Mentions of crime, robbery, homicide, drug trafficking or unemployment',
    statSub: 'in the 22,832 words of the document that diagnoses a communication problem',
    tiles: [
      { n: '63', l: 'pages', s: 'approved unanimously on 8 August 2026' },
      { n: '25', l: 'mentions of imperialism', s: 'and 16 of the United States' },
      { n: '3', l: 'mentions of domestic security', s: 'out of 17 uses of the word' },
      { n: 'US$ 970 M', l: 'the minister\'s figure', s: 'the document says "over 1,000 million"' },
    ],

    docTag: 'The primary source',
    docTitle: 'The document was not leaked: it is published',
    doc: [
      'On 8 August 2026 the National Plenary of the Frente Amplio unanimously approved the document that guides the VIII Ordinary Congress "Comrade José \'Pepe\' Mujica". The congress runs on 16, 17 and 18 October. Some 500 base committees discuss the text first.',
      'By 10 August the press was already quoting the text: En Perspectiva summarised it and credited la diaria for the access. The Frente Amplio uploaded the full PDF to its own site on 14 August, according to the file\'s own date. From that date anyone can read the 63 pages without an intermediary.',
      'The quotes on this page come from that PDF. Each one carries its paragraph number, which is the stable reference: the page depends on the viewer.',
    ],
    quoteAnimo: '111. To fight this battle and make the most of these strengths, the political force cannot look away. It is imperative to recognise the enormous loss of morale (la enorme carencia anímica) affecting many activists in the Base Committees today, and a sizeable share of the intermediate leaderships, from problems in the "management of politics" and errors in the national government\'s communication.',
    quoteCoord: '112. Along the same lines, the lack of coordination within the government itself has also become notorious. This — besides being, according to opinion measurements, one of the main reasons for the government\'s ever lower popularity, principally among Frente Amplio supporters — has generated great unease and disorientation among the closest activists.',
    quoteRight: '108. Through that ideological offensive the aim is to erode the principles and values that sustain the Frente Amplio\'s political project, shaping a social mood adverse to the transformations driven by our government.',
    quoteRightNote: 'This paragraph sits four places before the one everyone quoted. The document splits the cause in two: its own errors and someone else\'s offensive. Four of the five outlets kept the first half.',

    pesoTag: 'Our own measurement',
    pesoTitle: 'What weighs most inside the document',
    peso: [
      'The document diagnoses the problem as one of communication. Its own text can be measured, and measuring it shows where the space goes.',
      'The chapter on the international situation is the longest of the four: 6,578 words, 29.5% of the four chapters. The balance of the period, where the self-criticism the press quoted lives, takes 5,317.',
      'The term count is blunter. "Imperialism" and its variants appear 25 times, "sovereignty" 22, "United States" 16. "Crime", "robbery", "homicide", "drug trafficking", "unemployment" and "inflation" appear not once.',
      'The word "security" appears 17 times and has to be opened up, because the raw count misleads. Ten mentions are geopolitics: the United States National Security Strategy, naval security in the Strait of Hormuz, the National Security Doctrine of Plan Cóndor. Two are "Social Security". One is "food insecurity". One is sovereign control of borders. Three are left on domestic security.',
    ],
    pesoNota: 'A party\'s strategic document is not a government plan. It measures its own debate, not the State\'s agenda. The count says what the text talks about, and nothing beyond that.',
    colTermino: 'Term',
    colMenciones: 'Mentions',
    colCapitulo: 'Chapter',
    colPaginas: 'Pages',
    colPalabras: 'Words',
    colShare: 'Of the chapters',
    chapters: {
      i: 'I · International situation',
      ii: 'II · Balance since the 50 Years of Unity Congress',
      iii: 'III · Political strategy and programme',
      iv: 'IV · Role of the political force',
    },
    terms: {
      imperialismo: 'imperialism, imperialist',
      soberania: 'sovereignty, sovereign',
      seguridad: 'security (all senses)',
      ambiental: 'environmental',
      eeuu: 'United States',
      genero: 'gender',
      comunicacion: 'communication',
      feminismo: 'feminism, feminist',
      educacion: 'education',
      salud: 'health',
      vivienda: 'housing',
      empleo: 'employment',
      salario: 'wage',
      transparencia: 'transparency',
      corrupcion: 'corruption',
    },
    zeroTitle: 'Zero mentions, not one',
    zeroTerms: {
      delito: 'crime',
      delincuencia: 'delinquency',
      rapina: 'robbery',
      homicidio: 'homicide',
      narcotrafico: 'drug trafficking',
      desempleo: 'unemployment',
      inflacion: 'inflation',
      costoDeVida: 'cost of living',
      comprasPublicas: 'public procurement',
      licitacion: 'tender',
    },
    agendaTitle: 'What people name first',
    agenda: [
      'The polls this site publishes with their methodology cards ask what the country\'s main problem is. Cifra measured from 18 to 28 February 2026, with 801 cases: insecurity, crime and drug trafficking 46; the economy around 33; unemployment around 19. Equipos measured from 21 April to 4 May, with 704 cases: security 58 as first or second mention, unemployment around a third.',
      'The two measurements come from different houses and are not averaged. Both point the same way: the first problem people name is the one the document mentions three times.',
    ],

    prensaTag: 'The coverage',
    prensaTitle: 'Five outlets read the same document',
    prensaIntro: 'An outlet gets a row when we could read its full text. Paywalled articles have no row: you cannot describe what you did not read.',
    colMedio: 'Outlet',
    colFecha: 'Date',
    colCitas: 'Use of the text',
    colQue: 'What it did with the document',
    quotesLabel: { literal: 'Verbatim quotes', parafrasis: 'Paraphrase', ninguna: 'No quotes' },
    coverage: {
      enperspectiva: 'Summarised the document a day after the Plenary, crediting la diaria for the access. It is the only coverage that picks up the foreign-policy point: revising the position on the United States and Palestine.',
      laprensa: 'Reported the fact — unanimous approval, 500 base committees, congress on 16 to 18 October — without quoting the content. The rest of the piece is paywalled.',
      carasycaretas: 'Quoted the document at length, and none of its quotes is the loss-of-morale one: the word does not appear in the piece. It stayed with the alliances chapter and the self-criticism about 2019. Part of the text asks for registration, so we read the open portion.',
      teledoce: 'Reproduced paragraphs 111, 112 and 113 in full, uncut. In the same piece it numbers the congress as the "VII Ordinary Congress"; the document, on its cover and in the header of all 63 pages, says VIII.',
      cronista: 'Did not quote the document. It quoted Fernando Pereira, who said 85% of the government plan\'s 63 priorities are already being applied. That figure is not in the document: "63" and "85" appear not once in the 63 pages.',
    },

    medibleTag: 'Against the source',
    medibleTitle: 'Five claims from the document, checked',
    medibleIntro: 'Each claim is checked against the source that can confirm or correct it. The label says how far the public data goes, not whether the document is right in its opinions.',
    verdictLabel: { 'medible': 'Can be measured', 'parcial': 'Partly measurable', 'no-medible': 'Cannot be measured' },
    colAfirmacion: 'What the document says',
    colVeredicto: 'Public data',
    claims: {
      popularidad: {
        claim: '§112 · The government\'s popularity falls "principally among Frente Amplio supporters", according to "opinion measurements".',
        check: 'The document names no measurement: it never uses the word survey, and it names no polling house. These measurements do carry methodology cards. Factum, fieldwork 8 to 22 February 2026: among Frente Amplio voters, 72 approve and 10 disapprove. Cifra, fieldwork 1 to 17 June: among those who voted Frente Amplio in 2024, 41 approve and 34 disapprove. Opción, fieldwork across July and August: among Frente Amplio voters the government scores 39 approval against 28 disapproval. The three houses measure different objects and are not averaged. All three show the fall, and in all three the Frente Amplio voter remains the most favourable group.',
      },
      deficit: {
        claim: '§116 · "The inherited fiscal deficit was 4.1%, well above the estimates of 2.9%".',
        check: 'The 4.1% exists and is official: the Finance Ministry report of 3 March 2026 puts the 2025 Central Government-Social Security result at -4.1% of GDP. That report describes it as the outturn for 2025, in line with the National Budget projection, and attributes 0.3% of GDP to expenses postponed by the previous administration. The earlier estimate is not 2.9%: the fiscal report of 18 February 2025 projects -3.0% of GDP for 2025. The 2.9% does appear in that same report, but for something else — the structural target set in February 2024.',
      },
      compromisos: {
        claim: '§116 · There were "unaccounted spending commitments exceeding 1,000 million dollars".',
        check: 'The official figure is lower. The Economy Minister presented it to the Chamber of Deputies finance committee on 3 April 2025: US$ 970 million, made up of US$ 360 million in expenses postponed from 2024 plus US$ 610 million committed as of 28 February 2025. The document rounds 970 up past 1,000. The gap is 30 million dollars and does not change the order of magnitude.',
      },
      atrasos: {
        claim: '§117 · There were "arrears in payments to various State suppliers".',
        check: 'This site cannot check that, and it is better to say so than to estimate it. The public procurement record publishes awards: who won, how much, and when the award was made. It does not publish payments. A late payment leaves no trace in open contracting data. Measuring it would require budget execution data, which is not in this corpus.',
      },
      ajuste: {
        claim: '§119 · "A policy of fiscal adjustment was ruled out entirely".',
        check: 'The procurement corpus does not settle this, and its own numbers explain why. Real awarded spending fell 21.2% in 2025, but a single utility contract accounts for 25.2% of that variation. In 2026 the real fall stands at 48.2% with the year half done, and 14.2 billion pesos of that variation is coverage change: 9 bodies started reporting and 14 stopped. A series that moves like this does not measure fiscal policy. It measures large contracts and who published that year.',
      },
    },

    limitesTag: 'Method',
    limitesTitle: 'How this was done, and what it does not cover',
    limites: [
      'The PDF was downloaded from the Frente Amplio site and extracted with the `unpdf` library. Counts run over the body text, without page headers, and are case-insensitive.',
      'The word "security" was classified by hand, one occurrence at a time, because the raw count mixes domestic security with the United States National Security Strategy.',
      'We did not read the la diaria, Búsqueda or El País pieces on the document: they are paywalled. That is why they have no row in the coverage table, even though la diaria published it first. Of La Prensa and Caras y Caretas we read the open portion, and each row says so.',
      'This page does not evaluate the government\'s performance or the document\'s diagnosis. It checks claims against the source that can confirm them. On what the document argues, there is no verdict here.',
    ],

    sourcesTag: 'Where to check',
    sourcesTitle: 'All of this is public',
    sourcesP: 'The document is on the Frente Amplio site. Both fiscal reports are on the Finance Ministry site. The polls are on each house\'s own site. None of the figures on this page required a freedom-of-information request.',
    srcPrimaria: 'The primary source',
    srcEstado: 'State documents',
    srcEncuestas: 'Polls, with methodology cards',
    srcPrensa: 'Press, cited as press',
    encuestasLink: 'See every poll with its methodology card',
  },
} as const

export function faContent(locale: string) {
  return FA_CONTENT[(locale === 'en' ? 'en' : 'es') as Locale]
}
