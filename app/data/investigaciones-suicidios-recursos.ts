/**
 * Investigación · Cómo gestiona el Estado uruguayo sus recursos frente al suicidio.
 *
 * POR QUÉ EXISTE ESTA PIEZA, Y POR QUÉ ES OTRA. La pieza publicada en /investigaciones/suicidios
 * cuenta cuántas compras del Estado nombran el suicidio: siete. Ésta contesta la pregunta
 * siguiente, que es de gestión. Qué plata rotula el Estado, qué metas se fija, qué le cobra a la
 * persona que intentó autoeliminarse, y qué de todo eso publica. La pieza anterior no se reescribe.
 *
 * DE DÓNDE SALE CADA FAMILIA DE CIFRAS.
 *   1. Leyes y tomos presupuestales, leídos en IMPO y en presupuestonacional.gub.uy. De ahí salen
 *      el conteo de menciones, los artículos con partida y la meta carcelaria.
 *   2. Decretos, ordenanzas e instructivos del MSP, leídos directo. De ahí salen los topes de
 *      sesiones, la tasa moderadora, los cuatro hitos de la meta asistencial y sus montos.
 *   3. Medición propia sobre el corpus OCDS, con la regla C: un ocid vale el máximo de
 *      `amount.primaryAmount` entre todos sus releases, con tope de 50.000 millones por compra.
 *      La misma regla corre en el numerador y en el denominador.
 *   4. Fuentes internacionales: Mental Health Atlas y Global Health Observatory de la OMS.
 *   5. Prensa, citada como prensa, y sólo donde ninguna fuente oficial publica el dato.
 *
 * DOS ADVERTENCIAS DE UNIDAD GOBIERNAN EL ARCHIVO. La primera: el monto de psicofármacos se mide
 * como cantidad por precio unitario de línea, no con `amount.primaryAmount`. No se compara con
 * ninguna otra cifra en pesos del sitio y no se divide por el denominador del corpus. La segunda:
 * la serie de intentos de autoeliminación cambia de unidad entre 2024 y 2025, de episodios a
 * personas, y además cambia la base poblacional. Esas dos tasas no se comparan.
 *
 * TODA CIFRA DEL CORPUS LLEVA SU FECHA Y SU HORA. El corpus creció 63 registros y 21 ocids en
 * dieciséis minutos, entre dos corridas de la misma sesión de medición.
 *
 * COMUNICACIÓN RESPONSABLE. Las líneas de ayuda van antes de cualquier cifra. La pieza no describe
 * métodos. No publica casos individuales. No presenta ninguna cifra como récord. Nombra
 * «restringir el acceso a medios letales» al nivel de política pública, que es como lo escriben
 * el MSP y la OMS.
 *
 * NO HAY RELACIÓN ESTABLECIBLE entre la curva de compra de psicofármacos y la tasa de suicidio.
 * La serie de compra mide cobertura del registro, no consumo. Está dicho en el cuerpo.
 */

export type Locale = 'es' | 'en'

/* ------------------------------------------------------------------ *
 * 1 · AYUDA                                                           *
 * ------------------------------------------------------------------ */

/** Líneas de ayuda que funcionan hoy en Uruguay, sin costo y las 24 horas. */
export const SR_AYUDA = [
  { key: 'vida', phone: '0800 0767 · *0767' },
  { key: 'apoyo', phone: '0800 1920' },
  { key: 'emergencia', phone: '911' },
]

/* ------------------------------------------------------------------ *
 * 3 · NO SE PUEDE SUMAR                                               *
 * ------------------------------------------------------------------ */

/** Una ley de presupuesto o de rendición de cuentas, con sus dos conteos. */
export interface LeyMencion {
  /** Número de la ley, como lo escribe IMPO. */
  ley: string
  /** Clave del rótulo: presupuesto o rendición, con su ejercicio. */
  key: string
  /** Menciones de la raíz `suicid` en el texto articulado. Cero en las siete. */
  suicid: number
  /** Menciones de la expresión «salud mental» en el mismo texto. */
  saludMental: number
}

/**
 * Siete leyes seguidas, 2020-2025. Conteo propio sobre el texto articulado que sirve IMPO.
 *
 * TRAMPA DE REPRODUCCIÓN: IMPO sirve `latin-1` aunque el `meta` diga UTF-8. Decodificar mal
 * cambia los conteos.
 *
 * La medición cubre el articulado, no los tomos. El Tomo II sí nombra el suicidio tres veces.
 */
export const SR_LEYES: LeyMencion[] = [
  { ley: '19.924', key: 'presupuesto2024', suicid: 0, saludMental: 4 },
  { ley: '19.996', key: 'rc2020', suicid: 0, saludMental: 3 },
  { ley: '20.075', key: 'rc2021', suicid: 0, saludMental: 4 },
  { ley: '20.212', key: 'rc2022', suicid: 0, saludMental: 10 },
  { ley: '20.359', key: 'rc2023', suicid: 0, saludMental: 0 },
  { ley: '20.416', key: 'rc2024', suicid: 0, saludMental: 0 },
  { ley: '20.446', key: 'presupuesto2029', suicid: 0, saludMental: 11 },
]

/** Artículos de la Ley 20.446, sin faltantes del 1 al 717. Verificado en IMPO. */
export const SR_LEY20446_ARTICULOS = 717

/**
 * Lo que el Estado no le reporta a nadie sobre su gasto en salud mental.
 *
 * Las tres casillas de financiamiento de la ficha del Atlas 2020 están vacías. El Boletín de
 * Cuentas Nacionales de Salud 2024 no abre la salud mental. Y el propio país contestó «No» a las
 * dos preguntas del Atlas sobre recursos del plan nacional.
 */
export const SR_OMISION = {
  /** Casillas de financiamiento vacías en la ficha de Uruguay del Mental Health Atlas 2020. */
  atlas2020CasillasVacias: 3,
  atlas2020CasillasTotal: 3,
  /** Respuestas del país sobre recursos humanos y financieros del plan nacional de salud mental. */
  atlas2020Respuestas: ['No', 'No'],
  /** Boletín de Cuentas Nacionales de Salud 2024: páginas numeradas y menciones. */
  cnsPaginas: 22,
  cnsSaludMental: 0,
  cnsSuicid: 0,
  cnsPsiqui: 0,
  /** Hito 4 del MSP en el Tomo II: línea base y meta acumulada para 2029. */
  hito4Base: 0,
  hito4Meta: 4,
}

/** Escala del gasto en salud que sí está publicada, para dar contexto. Boletín CNS 2024, Tabla 3. */
export const SR_GASTO_SALUD = { pbiTotal: 9.31, pbiPublico: 6.72, compromisoOps: 6, anio: 2024 }

/**
 * El indicador mundial de gasto en salud mental, congelado en un solo año.
 *
 * OMS, Global Health Observatory, indicador MH_4: gasto público en salud mental sobre gasto
 * público en salud. 78 filas en todo el mundo, todas de 2011. 19 de la región de las Américas.
 * Ninguna de Uruguay.
 */
export const SR_MH4 = {
  filas: 78,
  anio: 2011,
  filasAmericas: 19,
  filasUruguay: 0,
  vecinos: [
    { pais: 'Chile', pct: 2.78 },
    { pais: 'Brasil', pct: 2.38 },
    { pais: 'Guyana', pct: 1.35 },
    { pais: 'Ecuador', pct: 1.20 },
    { pais: 'Paraguay', pct: 0.31 },
    { pais: 'Perú', pct: 0.27 },
  ],
}

/* ------------------------------------------------------------------ *
 * 4 · LA ÚNICA META ES CARCELARIA                                     *
 * ------------------------------------------------------------------ */

/**
 * El único indicador de suicidio de todo el Presupuesto 2025-2029.
 *
 * Tomo II «Planificación y evaluación», Inciso 04 Ministerio del Interior, Área Programática 14,
 * Programa 461. Su línea base y sus cinco metas anuales son el mismo número.
 *
 * ADVERTENCIA: el denominador son personas privadas de libertad, no la población del país. No se
 * compara con la tasa país.
 */
export const SR_META_PPL = {
  base: 93.09,
  metas: [
    { year: 2025, value: 93.09 },
    { year: 2026, value: 93.09 },
    { year: 2027, value: 93.09 },
    { year: 2028, value: 93.09 },
    { year: 2029, value: 93.09 },
  ],
  /** Ocurrencias de `suicid` y de `autoelimin` en el volumen de Organismos del artículo 220. */
  art220Suicid: 0,
  art220Autoelimin: 0,
}

/** Indicador del mismo cuadro: los que quedan planos y los que sí se mueven. */
export interface IndicadorTomo2 {
  key: string
  base: number
  meta: number
  /** `true` cuando la meta del quinquenio repite la línea base. */
  plano: boolean
}

export const SR_INDICADORES_TOMO2: IndicadorTomo2[] = [
  { key: 'suicidioPpl', base: 93.09, meta: 93.09, plano: true },
  { key: 'homicidioPpl', base: 121.57, meta: 121.57, plano: true },
  { key: 'hospitalizacionPpl', base: 92.33, meta: 92.33, plano: true },
  { key: 'armas', base: 3847, meta: 4676, plano: false },
  { key: 'femicidios', base: 0, meta: 0, plano: true },
  { key: 'camasAdolescentes', base: 2, meta: 26, plano: false },
  { key: 'consultasAsse', base: 396, meta: 574, plano: false },
]

/** La tasa país de 2025, que ya publica la pieza anterior. Va sólo como contraste de denominador. */
export const SR_TASA_PAIS_2025 = 19.16

/* ------------------------------------------------------------------ *
 * 5 · LO QUE SÍ ESTÁ ROTULADO                                         *
 * ------------------------------------------------------------------ */

/** Un artículo de la Ley 20.446 con partida de salud mental. */
export interface PartidaLey {
  art: number
  /** Inciso, como lo numera la ley. */
  inciso: string
  /** Crédito para el ejercicio 2026, a valores del 1º de enero de 2025. */
  y2026: number
  /** Crédito anual desde 2027, a la misma base de precios. */
  y2027: number
  key: string
  /** `true` cuando el artículo dice «Asígnase», o sea plata nueva. */
  nueva: boolean
}

/**
 * Las partidas que la Ley 20.446 rotula por salud mental.
 *
 * UNIDAD OBLIGATORIA: son créditos cuantificados a valores del 1º de enero de 2025, por el
 * artículo 2 de la misma ley, y rigen desde el 1º de enero de 2026 por su artículo 3. No son
 * pesos corrientes de 2026.
 *
 * El artículo 528 la ley lo escribe como 70.000.000 más 100.000.000 anuales. Acá va sumado.
 */
export const SR_PARTIDAS: PartidaLey[] = [
  { art: 528, inciso: '29 ASSE', y2026: 170_000_000, y2027: 170_000_000, key: 'asse', nueva: true },
  { art: 445, inciso: '15 MIDES', y2026: 40_000_000, y2027: 50_000_000, key: 'mides', nueva: true },
  { art: 393, inciso: '12 MSP', y2026: 10_000_000, y2027: 10_000_000, key: 'msp', nueva: true },
  { art: 509, inciso: '26 UdelaR', y2026: 4_000_000, y2027: 4_000_000, key: 'udelar', nueva: false },
  { art: 585, inciso: '21', y2026: 250_000, y2027: 250_000, key: 'giacoya', nueva: false },
]

export const SR_PARTIDAS_TOTAL = {
  y2026: 224_250_000,
  y2027: 234_250_000,
  /** Sólo los artículos que dicen «Asígnase». */
  nuevaY2026: 220_000_000,
  nuevaY2027: 230_000_000,
  /** Del artículo 393, la parte que son transferencias a instituciones sin fines de lucro. */
  mspTransferencias: 9_768_240,
  mspTransferenciasPct: 97.68,
}

/**
 * Los 60.000.000 del artículo 508 quedan afuera, y hay que decir por qué.
 *
 * La ley les da un destino doble sin desagregar: un proyecto de patología urológica y la
 * ampliación del programa de salud mental. Publicarlos como salud mental sería un error.
 */
export const SR_ART508 = { monto: 60_000_000, art: 508 }

/**
 * La escala de la partida más grande. Sirve para dar magnitud, no como proporción exacta.
 *
 * Compara un crédito a valores de enero de 2025 contra un gasto ejecutado en pesos corrientes
 * de 2023. Fuente del denominador: MEF, Exposición de Motivos de la Rendición de Cuentas 2023.
 */
export const SR_ESCALA_ASSE = { partida: 170_000_000, ejecutado2023: 57_988_000_000, pct: 0.29 }

/* ------------------------------------------------------------------ *
 * 6 · EL PRECIO DE LA AYUDA                                           *
 * ------------------------------------------------------------------ */

/** Un Modo del Plan de Prestaciones en Salud Mental, con sus topes de sesiones. */
export interface ModoPrestacion {
  modo: 1 | 2 | 3
  /** Tope anual de sesiones para personas adultas. */
  adultos: number
  /** Tope anual de sesiones para niños y adolescentes. */
  menores: number
  key: string
}

/** Anexo del Decreto 305/011, secciones ADULTOS y NIÑOS y ADOLESCENTES. */
export const SR_MODOS: ModoPrestacion[] = [
  { modo: 1, adultos: 16, menores: 12, key: 'modo1' },
  { modo: 2, adultos: 48, menores: 24, key: 'modo2' },
  { modo: 3, adultos: 48, menores: 48, key: 'modo3' },
]

/** El Modo 3 se renueva hasta este tope anual. Misma fuente. */
export const SR_MODO3_RENOVACION = 144

/**
 * Por qué puerta entra cada uno.
 *
 * La persona con intento de autoeliminación entra por el Modo 2, que tiene tasa moderadora. El
 * familiar o vínculo cercano entra por el Modo 1, que es gratuito. El derecho del familiar vence
 * al año del episodio.
 */
export const SR_PUERTAS = { personaConIntento: 2, familiar: 1, familiarVenceMeses: 12 }

/**
 * El tarifario de UN prestador, Camdel IAMPP, vigente al 1º de enero de 2026.
 *
 * El nombre del prestador va pegado al número. No es un promedio nacional. El tope nacional
 * vigente en pesos no es citable: los topes de 2011 se actualizan por porcentaje en cada ajuste
 * semestral y ningún decreto reciente vuelve a nombrar los Modos.
 */
export const SR_TARIFARIO = {
  prestador: 'Camdel IAMPP',
  vigencia: '2026-01-01',
  modo1: 0,
  modo2: 573,
  modo3: 189,
  comiteRecepcion: 189,
  entrevistaCoordinador: 189,
}

/** Topes originales de la tasa moderadora, Decreto 366/011 artículo 8. Son topes, no precios. */
export const SR_TOPES_2011 = { modo2: 170, modo3: 55, anio: 2011 }

/**
 * Lo que cuesta agotar el tope anual del Modo 2, con el tarifario de Camdel IAMPP.
 *
 * La palabra «adulta» es OBLIGATORIA junto a los 9.072 pesos. Para un niño o un adolescente el
 * tope del Modo 2 son 24 sesiones, o sea la mitad. Sin la edad, la cifra duplica la que
 * corresponde a un adolescente.
 *
 * Son un techo teórico, no un gasto observado: nadie publica cuántas sesiones usa en promedio
 * una persona con intento de autoeliminación. No incluyen timbre ni impuestos.
 */
export const SR_COSTO_ANUAL = {
  adultaHoy: 9_072,
  adultaAntes: 27_504,
  menorHoy: 4_536,
  menorAntes: 13_752,
}

/**
 * Lo que el Decreto 114/024 cambió en 2024.
 *
 * No exoneró a la persona con intento de autoeliminación. Le bajó la tasa moderadora a la del
 * Modo 3. La persona sigue pagando cada sesión.
 */
export const SR_DECRETO114 = {
  anio: 2024,
  /** Tope de edad de la cobertura general. Las poblaciones priorizadas nunca tuvieron tope. */
  edadNueva: 30,
  edadAnterior: 25,
  /** Tope en pesos que el decreto fija para el escitalopram. */
  escitalopramTope: 144,
}

/** Los dos relojes del Comité de Recepción. No confundir con los plazos de la meta asistencial. */
export const SR_COMITE = { horasIntento: 48, diasGeneral: 15, diasProrroga: 15 }

/**
 * La obligación de reportar que el Estado se puso en 2011, y lo que contestó en 2025.
 *
 * El Anexo del Decreto 305/011 manda a cada prestador enviar una planilla trimestral al Sistema
 * Nacional de Información. En 2025 el MSP contestó un pedido de acceso a la información pública
 * diciendo que no dispone de un registro centralizado con el nivel de desagregación pedido, y
 * denegó el pedido.
 *
 * NO DECIR «el MSP no tiene el registro». Hay que decir qué se pidió y qué se contestó.
 */
export const SR_EXPEDIENTE = {
  ref: '12/001/3/7903/2025',
  /** Fecha del informe jurídico. La resolución denegatoria no trae fecha visible en el PDF. */
  informeJuridico: '2025-11-07',
  publicado: '2026-07-29',
  obligacionDesde: 2011,
}

/* ------------------------------------------------------------------ *
 * 7 · LO QUE EL ESTADO PAGA POR SEGUIR A ALGUIEN                      *
 * ------------------------------------------------------------------ */

/**
 * La meta asistencial que paga el seguimiento después del alta.
 *
 * Indicador 5 del Componente 5 del Instructivo de la Meta Asistencial 2024-2025, «Seguimiento
 * inmediato de afiliados con intento de autoeliminación». El monto se verificó por coordenadas
 * contra el PDF: los 21 montos así mapeados suman 217,08 exacto, que es el total que el propio
 * instructivo declara.
 *
 * UNIDAD: pesos por mes y por usuario FONASA. Nunca «por afiliado».
 */
export const SR_META_ASISTENCIAL = {
  indicador: 5,
  componente: 5,
  indicadoresTotales: 21,
  monto: 15.51,
  total: 217.08,
  pct: 7.14,
  /** La escala de montos por indicador tiene tres escalones. El del seguimiento es el más alto. */
  escala: [5.16, 10.34, 15.51],
  /** Valor de Referencia, Valor Meta 2025 y Valor Piso 2025, exigidos en cada hito. */
  referencia: 100,
  meta: 70,
  piso: 50,
  /** Valor total de la meta entre enero y junio de 2026, por mes y por usuario FONASA. */
  total2026: 234.13,
  /** El otro indicador de salud mental de la misma meta, fuera del Componente 5. */
  otroIndicador: { id: '2.3', monto: 10.34 },
}

/** Uno de los cuatro hitos del indicador, con su peso y su reparto del monto. */
export interface HitoSeguimiento {
  key: string
  /** Peso del hito sobre el monto disponible del indicador. */
  peso: number
  /** Reparto de los 15,51 pesos según ese peso. Cuenta propia. */
  monto: number
}

/**
 * Los cuatro hitos, en el orden del instructivo.
 *
 * TÉRMINO: el instructivo dice «2 días», no «48 horas». Reservar «48 horas» para el plazo del
 * Comité de Recepción del Decreto 305/011, que es otro reloj.
 */
export const SR_HITOS: HitoSeguimiento[] = [
  { key: 'orientacion', peso: 20, monto: 3.10 },
  { key: 'llamada2dias', peso: 30, monto: 4.65 },
  { key: 'consulta7dias', peso: 30, monto: 4.65 },
  { key: 'llamada30dias', peso: 20, monto: 3.10 },
]

/**
 * El seguimiento post-alta como obligación, no como recomendación.
 *
 * El protocolo aprobado por la Ordenanza Ministerial 384/017 lo hace obligatorio desde 2017,
 * sobre todos los usuarios. El Anexo del Decreto 305/011 ya lo ordenaba en 2011.
 *
 * ESCRIBIR «Ordenanza Ministerial 384/017» SIN FECHA PROPIA: el PDF de la ordenanza es un
 * escaneo sin capa de texto.
 */
export const SR_SEGUIMIENTO_NORMA = {
  decretoDesde: 2011,
  decretoMeses: 6,
  ordenanzaDesde: 2017,
  primeraConsultaDias: 7,
  seguimientoMeses: 6,
}

/* ------------------------------------------------------------------ *
 * 8 · LO QUE EL CORPUS VE                                             *
 * ------------------------------------------------------------------ */

/**
 * Escala del corpus en las dos corridas de esta sesión de medición.
 *
 * La regla de monto es la regla C: un ocid vale el máximo de `amount.primaryAmount` entre TODOS
 * sus releases, con tope de 50.000 millones por compra. La misma regla corre en el numerador y
 * en el denominador.
 *
 * El corpus crece mientras se mide. Entre las dos corridas entraron 63 registros y 21 ocids, y
 * el denominador subió 99.793.129,57 pesos. Por eso cada cifra lleva fecha y hora.
 */
export const SR_CORPUS = {
  releases: 2_186_313,
  ocids: 1_639_754,
  gasto: 1_674_533_194_737.58,
  measured: '2026-08-18',
  measuredUtc: '20:06 UTC',
  /** Compras descartadas por el tope de 50.000 millones. Son artefactos de suma global. */
  descartadas: 15,
  descartadasUyu: 4_613_721_230_572,
  /** La corrida anterior, de la que salen las cifras por comprador y por proveedor. */
  prevReleases: 2_186_129,
  prevOcids: 1_639_674,
  prevGasto: 1_674_333_743_427.70,
}

/**
 * El léxico de salud mental, publicado SIEMPRE como rango.
 *
 * PROHIBIDO publicar el techo solo. El descarte de falso positivo se aplicó a un solo token y el
 * ruido restante está medido y no está neteado. El piso descuenta los dos focos más grandes.
 */
export const SR_LEXICO = {
  techoOcids: 2_198,
  techoUyu: 1_208_259_462.09,
  pisoOcids: 2_092,
  pisoUyu: 1_133_918_333.96,
  /** Porcentaje del gasto del corpus. Cuenta propia sobre las dos filas anteriores. */
  pctGastoMin: 0.0677,
  pctGastoMax: 0.0722,
  /** Porcentaje de las compras del corpus. Cuenta propia. */
  pctComprasMin: 0.1276,
  pctComprasMax: 0.1340,
  /** Compras del léxico que no traen monto. Cero en el corpus no prueba que no se adjudicara. */
  sinMonto: 833,
}

/** Un foco de ruido medido dentro del léxico, con lo que es en realidad. */
export interface FocoRuido {
  key: string
  ocids: number
  uyu: number
  /** `true` cuando el piso del rango ya lo descuenta. */
  neteado: boolean
}

export const SR_RUIDO: FocoRuido[] = [
  { key: 'centroDiurno', ocids: 100, uyu: 74_010_202.12, neteado: true },
  { key: 'lineaVida', ocids: 6, uyu: 330_926, neteado: true },
  { key: 'adiccional', ocids: 5, uyu: 10_869_597.90, neteado: false },
  { key: 'siliconaAdiccion', ocids: 3, uyu: 26_426.16, neteado: false },
  { key: 'trabajadorSocial', ocids: 10, uyu: 8_778_692.34, neteado: false },
]

/** Una familia del léxico, medida con la regla C. */
export interface FamiliaLexico {
  key: string
  ocids: number
  uyu: number
  /** Clave de la condición que hay que publicar junto al número. */
  condicion?: string | undefined
}

export const SR_FAMILIAS: FamiliaLexico[] = [
  { key: 'profesionales', ocids: 916, uyu: 559_306_527.08, condicion: 'trabajadorSocial' },
  { key: 'adicciones', ocids: 808, uyu: 177_457_672.91, condicion: 'tipeo' },
  { key: 'residencial', ocids: 273, uyu: 236_451_614.08, condicion: 'expresionNueva' },
  { key: 'psicofarmaco', ocids: 51, uyu: 122_747_453.90, condicion: 'recetarios' },
  { key: 'prevencion', ocids: 6, uyu: 4_796_848, condicion: undefined },
]

/**
 * La familia «salud mental», con su par obligatorio.
 *
 * Tres registros del INAU traen el mismo monto hasta la milésima, las mismas seis adjudicaciones,
 * los mismos seis proveedores y los mismos once renglones con los mismos precios unitarios. Son
 * el 42,7% del total.
 *
 * ADVERTENCIA VINCULANTE: si los tres son una sola compra, el total queda por debajo de lo que la
 * pieza anterior publica. Hasta resolver la duplicación con el expediente del INAU, la corrección
 * de «salud mental» no se enuncia como corrección al alza.
 */
export const SR_SALUD_MENTAL = {
  ocidsSeparados: 167,
  uyuSeparados: 275_293_598.29,
  ocidsUnificados: 165,
  uyuUnificados: 196_963_696.66,
  pctGastoMin: 0.0118,
  pctGastoMax: 0.0164,
  triplicadoPct: 42.7,
  triplicadoMonto: 39_164_950.814,
}

/**
 * La raíz suicid, con la lectura que se publica.
 *
 * La pieza anterior descontaba un registro repetido de la suma y no lo descontaba del conteo.
 * Acá van las dos cifras de la misma lectura: siete compras y 5.033.280 pesos. La duda sobre el
 * registro repetido va a límites. Mueve el 1,6% de la cifra y no mueve ninguna conclusión.
 */
export const SR_SUICID = { ocids: 7, uyu: 5_033_280, pctGasto: 0.00030 }

/**
 * El comparador «desfibrilador», medido con la misma regla C y los mismos siete campos de texto.
 *
 * La cifra estable es el conteo: 2.542 compras contra 7, o sea 363 veces. En pesos el múltiplo
 * depende de la regla de imputación, y por eso se publica el rango entero con la regla de cada
 * punta.
 */
export const SR_DESFIBRILADOR = {
  ocids: 2_542,
  uyu: 540_581_284.57,
  /** Parte de esa plata que viene de compras donde el desfibrilador es minoría de los renglones. */
  minoriaPct: 64.0,
  multiploCompras: 363,
  multiploPesos: [
    { value: 99.7, key: 'publicado' },
    { value: 107.4, key: 'reglaC' },
    { value: 1_094, key: 'renglones' },
  ],
}

/**
 * ASSE: la fracción de salud mental en su gasto de compras no se movió en once años.
 *
 * Filtro por `buyer.id` que empieza con `29-`, nunca por `buyer.name`. Los 315.781 ocids y los
 * 60.878.337.504 pesos los reprodujo un verificador al centavo contra la base viva.
 */
export const SR_ASSE = {
  ocids: 315_781,
  ocidsConMonto: 251_585,
  uyu: 60_878_337_504,
  lexicoOcids: 622,
  lexicoUyu: 376_682_728,
  pctTotal: 0.619,
  pct1519: 0.702,
  pct2125: 0.686,
  pct1525: 0.684,
  /** La cantidad de compras sí creció, y el total de compras de ASSE creció con ella. */
  compras2015: 12,
  compras2025: 111,
  totales2015: 6_914,
  totales2025: 38_612,
  pctCompras2015: 0.174,
  pctCompras2025: 0.288,
}

/**
 * MSP: casi nueve de cada diez pesos que nombra como salud mental son papel de control.
 *
 * La clasificación «recetarios psicofármacos» vive en `awards.items.classification.description`.
 */
export const SR_MSP_PAPEL = {
  ocids: 38,
  uyu: 107_569_225,
  recetariosOcids: 13,
  recetariosUyu: 93_920_967,
  pct: 87.31,
  desde: 2003,
  hasta: 2026,
}

/** Un proveedor del léxico, entre los cinco primeros por monto. */
export interface ProveedorLexico {
  name: string
  rut: string
  uyu: number
  ocids: number
  key: string
}

/**
 * La concentración de proveedores, medida sobre las compras del léxico que traen identificador.
 *
 * TRAMPA: el corpus escribe el identificador con barra y sin barra. Sin normalizar, el primer
 * proveedor se parte en dos y no queda primero. La trampa afecta a 44 de los 600 proveedores.
 */
export const SR_PROVEEDORES = {
  ocids: 1_368,
  uyu: 1_206_655_554,
  distintos: 600,
  distintosSinNormalizar: 644,
  pct1: 10.24,
  pct3: 26.81,
  pct5: 38.64,
  pct10: 57.89,
  pct20: 73.09,
  pct50: 88.98,
  afectadosPorLaBarra: 44,
  /** Reagrupado por inciso, no por unidad ejecutora. */
  asseUyu: 405_111_335,
  asseOcids: 724,
  imUyu: 242_185_411,
  imOcids: 92,
  asseVecesIm: 1.67,
}

export const SR_PROVEEDORES_TOP: ProveedorLexico[] = [
  { name: 'ALSARA ASOCIADOS S.R.L.', rut: '215082180017', uyu: 123_558_724, ocids: 57, key: 'alsara' },
  { name: 'Asoc. de Hermanas Hospitalarias del Sagrado Corazón', rut: '214109620014', uyu: 121_389_809, ocids: 14, key: 'hospitalarias' },
  { name: 'GARINO HNOS S A', rut: '210154140015', uyu: 78_525_557, ocids: 6, key: 'garino' },
  { name: 'HOGAR ITALIANO', rut: '218023810012', uyu: 72_579_983, ocids: 14, key: 'hogarItaliano' },
  { name: 'INSTITUTO MUJER Y SOCIEDAD', rut: '215299020011', uyu: 70_158_521, ocids: 16, key: 'mujerSociedad' },
]

/** Tokens que dan cero compras en todo el corpus. Cero no prueba que el servicio no exista. */
export const SR_TOKENS_CERO = [
  'dispositivo comunitario',
  'rehabilitación psicosocial',
  'servicio residencial',
  'drogodependencia',
  'drogadicción',
  'farmacodependencia',
  'primeros auxilios psicológicos',
  'atención en crisis',
  'intervención en crisis',
  '0800 0767',
]

/**
 * PSICOFÁRMACOS · ADVERTENCIA DE UNIDAD, OBLIGATORIA EN CADA APARICIÓN.
 *
 * El monto es cantidad por `awards.items.unit.value.amount`. No es `amount.primaryAmount`. Es la
 * única forma de medir por molécula. No se compara con ninguna otra cifra en pesos de este sitio.
 * No se divide por el denominador del corpus.
 *
 * Y no hay relación establecible entre esta serie y la tasa de suicidio. La serie mide cobertura
 * del registro de compras, no consumo del país.
 */
export const SR_PSICOFARMACOS = {
  uyuCorrientes: 348_131_404,
  /** Deflactado con la Unidad Indexada de agosto de 2026 (6,633494). Es un piso. */
  uyuHoy: 792_946_097,
  ocids: 4_142,
  lineas: 6_826,
  descarteLineas: 1_704,
  descarteUyu: 51_988_860,
  descartePct: 12.99,
  /** Comprimidos y ampollas adjudicados. El de comprimidos es un piso. */
  comprimidos: 174_137_966,
  ampollas: 3_723_226,
  /** Peso de la Licitación Pública 1007/2007 sobre los comprimidos, y sobre el dinero. */
  lp1007ComprimidosMin: 64.43,
  lp1007ComprimidosMax: 76.95,
  lp1007Dinero: 27.75,
  sinCompradorOcids: 5,
  sinCompradorUyu: 118_554_518,
  frag2025Ocids: 730,
  frag2025Organismos: 40,
  frag2025Mediana: 27_339,
  compradoresPorNombre: 140,
  compradoresPorId: 139,
  cuota1620: 16.98,
  cuota2125: 5.99,
  cuotaAd1620: 1.86,
  cuotaAd2125: 1.53,
  /** El denominador de esas cuotas se multiplica por 27,7 entre las dos ventanas. */
  denominadorFactor: 27.7,
  veterinariaLineas: 29,
  veterinariaUyu: 129_816,
  defectoLineas: 56,
  defectoUyu: 7_469_439,
  defectoCantidad1Lineas: 42,
  defectoCantidad1Uyu: 5_920_995,
}

/** Un grupo terapéutico dentro de la medición por renglón adjudicado. Misma advertencia de unidad. */
export const SR_PSICO_GRUPOS = [
  { key: 'antipsicoticos', uyu: 144_118_808 },
  { key: 'estabilizadores', uyu: 93_902_962 },
  { key: 'ansioliticos', uyu: 56_297_472 },
  { key: 'antidepresivos', uyu: 53_812_163 },
]

/** Antipsicóticos sobre antidepresivos. Cuenta propia. */
export const SR_PSICO_MULTIPLO = 2.68

/**
 * Los dos empates que impiden nombrar una primera molécula.
 *
 * El descarte de falso positivo es asimétrico por molécula: va de 57,3% en el litio a cero en
 * trece moléculas. Por eso un filtro aplicado a una sola molécula rompe cualquier ranking.
 */
export const SR_PSICO_EMPATES = [
  { key: 'molecula', a: { name: 'Aripiprazol', uyu: 45_450_586 }, b: { name: 'Valproato', uyu: 45_151_515 }, distancia: 0.66 },
  { key: 'antidepresivo', a: { name: 'Sertralina', uyu: 13_935_133 }, b: { name: 'Escitalopram', uyu: 13_921_209 }, distancia: 0.10 },
]

/* ------------------------------------------------------------------ *
 * 9 · DOS LÍNEAS EN 24 AÑOS                                           *
 * ------------------------------------------------------------------ */

/** Una de las dos compras de línea de respuesta al suicidio que el corpus registra. */
export interface LineaCompra {
  key: string
  ocid: string
  /** Año de la adjudicación. */
  year: number
  buyer: string
  supplier: string | null
  uyu: number
}

export const SR_LINEAS: LineaCompra[] = [
  { key: 'sanidad2016', ocid: 'ocds-yfs5dr-497746', year: 2016, buyer: 'Dirección Nacional de Sanidad Policial', supplier: 'ÚLTIMO RECURSO', uyu: 4_540_800 },
  { key: 'asse2024', ocid: 'ocds-yfs5dr-1144998', year: 2024, buyer: 'ASSE', supplier: null, uyu: 770_273 },
]

/** El token que casi esconde la compra de 2016. 143 compras, y sólo una es la línea de ayuda. */
export const SR_TOKEN_TELEFONICA = { ocids: 143, ruido: 142, util: 1 }

/* ------------------------------------------------------------------ *
 * 10 · EL OTRO NÚMERO: LOS INTENTOS                                   *
 * ------------------------------------------------------------------ */

/** Procedencia de una fila del cuadro de intentos de autoeliminación. */
export type IntentoSource = 'msp' | 'prensa' | 'prensaMsp'

/** Una fila del registro nacional de intentos de autoeliminación. */
export interface IntentoRow {
  key: string
  /** Período que cubre la fila. */
  periodo: string
  /** Valor publicado. `null` cuando la fuente no publica el conteo. */
  value: number | null
  /** Unidad de ese valor. Nunca se omite. */
  unidad: 'casos' | 'registros' | 'intentos' | 'episodios' | 'personas' | 'tasaEpisodios' | 'tasaPersonas'
  source: IntentoSource
  /** `true` sólo cuando la fila cubre un año calendario completo. */
  esAnio: boolean
  /** Denominador implícito de la tasa. Cuenta propia: valor dividido tasa, por cien mil. */
  denominador?: number | undefined
}

/**
 * El registro digital de intentos de autoeliminación arranca en octubre de 2022.
 *
 * El primer año calendario completo es 2023. Antes de eso no hay serie anual: la notificación es
 * obligatoria desde diciembre de 2012, y el MSP nunca publicó la serie de la ficha de papel.
 *
 * VA COMO CUADRO, NUNCA COMO SERIE DE LÍNEA. Las filas no comparten unidad.
 */
export const SR_INTENTOS: IntentoRow[] = [
  { key: 'nov2022', periodo: 'nov 2022 – ene 2023', value: 1_020, unidad: 'casos', source: 'prensa', esAnio: false, denominador: undefined },
  { key: 'oct2022', periodo: 'oct 2022 – jun 2023', value: 2_896, unidad: 'registros', source: 'msp', esAnio: false, denominador: undefined },
  { key: 'conteo2023', periodo: '2023', value: 4_723, unidad: 'intentos', source: 'prensa', esAnio: true, denominador: undefined },
  { key: 'tasa2023', periodo: '2023', value: 132.42, unidad: 'tasaEpisodios', source: 'msp', esAnio: true, denominador: 3_566_682 },
  { key: 'conteo2024', periodo: '2024', value: null, unidad: 'episodios', source: 'msp', esAnio: true, denominador: undefined },
  { key: 'tasa2024', periodo: '2024', value: 161.74, unidad: 'tasaEpisodios', source: 'msp', esAnio: true, denominador: 3_578_454 },
  { key: 'episodios2025', periodo: '2025', value: 6_140, unidad: 'episodios', source: 'msp', esAnio: true, denominador: undefined },
  { key: 'personas2025', periodo: '2025', value: 5_144, unidad: 'personas', source: 'msp', esAnio: true, denominador: undefined },
  { key: 'tasa2025', periodo: '2025', value: 147.56, unidad: 'tasaPersonas', source: 'prensaMsp', esAnio: true, denominador: 3_486_040 },
]

/** Caída de la base poblacional entre 2024 y 2025, en por ciento. Cuenta propia. */
export const SR_CAIDA_BASE = 2.57

/** Episodios por persona en 2025, el único año en que el MSP publicó las dos unidades juntas. */
export const SR_EPISODIOS_POR_PERSONA = 1.19

/** Desglose por sexo, sólo donde existe. Las dos filas de 2025 cierran contra sus totales. */
export const SR_INTENTOS_SEXO = [
  { key: 'tasa2024', year: 2024, mujeres: 223.34, varones: 96.48, unidad: 'tasaEpisodios' },
  { key: 'tasa2025', year: 2025, mujeres: 205.02, varones: 86.40, unidad: 'tasaPersonas' },
  { key: 'personas2025', year: 2025, mujeres: 3_685, varones: 1_459, unidad: 'personas' },
  { key: 'episodios2025', year: 2025, mujeres: 4_426, varones: 1_714, unidad: 'episodios' },
]

/** Una comparación posible, con su veredicto. El cuadro decide qué se puede poner al lado de qué. */
export interface Comparacion {
  key: string
  vale: 'si' | 'siReserva' | 'no'
}

export const SR_COMPARABLE: Comparacion[] = [
  { key: 'tasa2023vs2024', vale: 'siReserva' },
  { key: 'tasa2024vs2025', vale: 'no' },
  { key: 'conteo2024vs2025', vale: 'no' },
  { key: 'contra2022', vale: 'no' },
  { key: 'tramo9meses', vale: 'no' },
  { key: 'froVsDigital', vale: 'no' },
  { key: 'emse', vale: 'si' },
  { key: 'egresos', vale: 'si' },
  { key: 'iaeVsMortalidad', vale: 'no' },
]

/**
 * La ficha de papel de 2021, el único dato pre-digital que el MSP publicó.
 *
 * Cubre sólo de 10 a 24 años. Los dos chequeos internos cierran: 307 + 508 + 356 = 1.171, y
 * 760 + 68 + 343 = 1.171.
 */
export const SR_FRO_2021 = {
  total: 1_171,
  e1014: 307,
  e1519: 508,
  e2024: 356,
  mujeres: 902,
  varones: 268,
  sinDatoConsulta: 343,
}

/** Encuesta escolar EMSE. Es la única fuente con dos puntos comparables entre sí. */
export const SR_EMSE = [
  { year: 2012, pct: 9.2, key: 'total' },
  { year: 2019, pct: 12, key: 'total' },
  { year: 2019, pct: 14.3, key: 'mujeres' },
  { year: 2019, pct: 8.9, key: 'varones' },
]

/** Egresos hospitalarios con código secundario CIE-10 X60-X84. Otra unidad todavía. */
export const SR_EGRESOS = [
  { year: 2018, value: 1_988 },
  { year: 2019, value: 2_150 },
  { year: 2020, value: 1_984 },
  { year: 2021, value: 2_432 },
]

export const SR_EGRESOS_TOTAL = 8_554

/** La única estimación oficial de magnitud, que aplica una razón internacional a la mortalidad. */
export const SR_ESTIMACION_OMS = { veces: [10, 20], personasMin: 7_000, personasMax: 14_000 }

/**
 * La reiteración medida sobre el registro de 2023.
 *
 * No se puede deslizar «el sistema los vio y no actuó». El dato es descriptivo y ninguna fuente
 * afirma esa causa.
 */
export const SR_REITERACION = {
  con: 2_392,
  de: 4_723,
  pct: 50.65,
  /** El mismo cálculo sobre el tramo de nueve meses. */
  tramoCon: 1_346,
  tramoDe: 2_896,
  tramoPct: 46.5,
  /** Estudio del MSP sobre 54 historias clínicas. No se extrapola al país. */
  consulta3meses: 29,
  consulta6meses: 38,
  historias: 54,
  certificados: 149,
}

/* ------------------------------------------------------------------ *
 * 11 · LA LEY QUE CAMBIÓ DENTRO DE UN PRESUPUESTO                     *
 * ------------------------------------------------------------------ */

/** Un cambio literal entre el artículo 38 de 2017 y el vigente. */
export interface DiffArt38 {
  key: string
  /** Texto de 2017. `null` cuando la frase existía y hoy no está. */
  antes: string | null
  /** Texto vigente. `null` cuando la frase se suprimió. */
  ahora: string | null
}

/**
 * El artículo 381 de la Ley 20.446, el Presupuesto Nacional 2025-2029, reescribió entero el
 * artículo 38 de la Ley 19.529 de Salud Mental.
 *
 * Diff literal entre el texto original y el texto vigente que publica IMPO.
 */
export const SR_ART38: DiffArt38[] = [
  {
    key: 'plazo',
    antes: 'El cumplimiento definitivo del cronograma no podrá exceder temporalmente el año 2025.',
    ahora: 'El cumplimiento definitivo del cronograma no podrá exceder temporalmente el año 2029.',
  },
  {
    key: 'prohibicion',
    antes: 'Queda igualmente prohibida, a partir de la vigencia de la presente ley, la internación de personas en los establecimientos asilares existentes.',
    ahora: null,
  },
  {
    key: 'estaLey',
    antes: '…desde la entrada en vigencia de esta ley',
    ahora: '…desde la entrada en vigencia de esta disposición',
  },
  {
    key: 'reglamentacion',
    antes: 'El Poder Ejecutivo establecerá en la reglamentación de la presente ley el cronograma',
    ahora: 'El Poder Ejecutivo establecerá en la reglamentación el cronograma',
  },
]

/** Las fechas del cambio. La fe de erratas del 27/03/2026 sólo corrige el artículo 382. */
export const SR_ART38_FECHAS = { promulgada: '2025-12-16', publicada: '2026-01-08', vigencia: '2026-01-01' }

/** Los dos decretos reglamentarios de la Ley 19.529, y lo que no traen. */
export const SR_REGLAMENTACION = {
  decretos: [
    { num: '226/018', date: '2018-07-16' },
    { num: '331/019', date: '2019-11-04' },
  ],
  /** Palabras buscadas en los nueve artículos del 226/018. Los seis conteos dan cero. */
  conteosCero: ['cronograma', 'asilar', 'monovalente', 'desinstitucionalización', 'comunitario', 'plaza'],
  /** El buscador de IMPO pide login, así que «dos decretos» no es un censo cerrado. */
  censoCerrado: false,
}

/** La Comisión Nacional de Contralor de la Atención en Salud Mental. */
export const SR_CONTRALOR = {
  /** Organismo desconcentrado dependiente del MSP, por el artículo 39 de la Ley 19.529. */
  articulo: 39,
  integrantes: 10,
  quorum: 7,
  mandatoAnios: 3,
  /** Plazo del informe anual al MSP, en días, por el artículo 7 del Decreto 226/018. */
  informeDias: 120,
  /** Meses entre el fin del primer ejercicio y la toma de posesión de la comisión siguiente. */
  discontinuidadMeses: 11,
  /** Documentos suyos encontrados en línea. El único lo aloja la Facultad de Psicología. */
  documentosEnLinea: 1,
  /** Notificaciones de hospitalización recibidas entre agosto y diciembre de 2022. */
  notificaciones: 224,
  notifMontevideo: 220,
  notifInterior: 4,
}

/** Lo que el Estado no publica sobre los dispositivos que deben sustituir al modelo asilar. */
export const SR_DISPOSITIVOS = {
  /** Usuarios censados en CEREMOS en octubre de 2023. Son usuarios, no camas. */
  ceremos: 443,
  ceremosRossi: 276,
  ceremosEtchepare: 167,
  /** Camas del Hospital Vilardebó, según el informe de OPS de 2022. */
  vilardebo: 300,
  /** Salas de salud mental en hospitales generales de Montevideo, y sus camas. */
  salasGenerales: 2,
  camasGenerales: 19,
  /** Padrón de dispositivos comunitarios publicado. No existe. */
  padron: 0,
}

/* ------------------------------------------------------------------ *
 * 12 · RECURSOS HUMANOS                                               *
 * ------------------------------------------------------------------ */

/**
 * Infotítulos, el registro de títulos habilitados del MSP. Corte del 31 de julio de 2026.
 *
 * FRASE DE BLOQUEO OBLIGATORIA antes de poner 628, 544 y 550 cerca: son tres definiciones
 * distintas. Títulos acumulados sin baja, personas que trabajan en el sector según el país le
 * declaró a la OMS, y una declaración oral. No se comparan ni se restan.
 */
export const SR_INFOTITULOS = {
  corte: '2026-07-31',
  psiquiatras: 628,
  psiquiatrasNyA: 183,
  union: 803,
  solapamiento: 8,
  psicologos: 14_616,
  /** Personas con un título de especialización en salud mental, por el cruce con enfermería. */
  enfermeria: 91,
  enfermeriaLicenciados: 77,
  enfermeriaAuxiliares: 14,
  doctoresMedicina: 27_834,
  filas: 148_976,
  filasHabilitadas: 148_959,
}

/**
 * El control de calidad del método, que es un hallazgo en sí.
 *
 * El registro acumula títulos y no da de baja por fallecimiento, jubilación ni emigración. Es un
 * techo, no un conteo de quien ejerce.
 *
 * La conversión de tasa a número absoluto es CUENTA NUESTRA: el indicador HWF_0001 de la OMS da
 * 45,51 médicos cada 10.000 habitantes para Uruguay en 2023, y la población es la del Censo 2023.
 */
export const SR_CONTROL_CALIDAD = {
  titulos: 27_834,
  medicosEnActividad: 15_675,
  tasaOms: 45.51,
  poblacionCenso: 3_444_263,
  titulosPorMedico: 1.8,
}

/**
 * Lo que Uruguay le declaró a la OMS en el Mental Health Atlas 2020.
 *
 * La OMS cuenta a quienes trabajan en el sector de salud mental. Infotítulos cuenta títulos. Las
 * dos cifras miden cosas distintas y no se pueden restar.
 */
export const SR_ATLAS2020 = {
  psiquiatras: 544,
  psiquiatrasTasa: 15.7,
  enfermeros: 1_005,
  enfermerosTasa: 29.0,
  psicologos: 1_063,
  psicologosTasa: 30.71,
  psiquiatrasNyA: 112,
  psiquiatrasNyATasa: 11.7,
  /** El total que la ficha imprime, que excluye a los psicólogos que ella misma reporta. */
  totalFicha: 1_549,
  totalFichaTasa: 44.7,
  /** El mismo total, corregido. Suma propia sobre las tres filas de la ficha. */
  totalCorregido: 2_612,
  totalCorregidoTasa: 75.45,
}

/**
 * La escala regional en 2016, el último año con dato comparable.
 *
 * VA EN PASADO Y CON DENOMINADOR. Reportaron 23 países de la región, no 35. Y el puesto mundial
 * es entre los 104 países con dato, no entre los 194 Estados miembros.
 */
export const SR_MH6 = {
  anio: 2016,
  uruguay: 14.13,
  argentina: 21.71,
  estadosUnidos: 10.54,
  medianaAmericas: 1.835,
  medianaMundial: 1.231,
  nAmericas: 23,
  nMundial: 104,
  puesto: 9,
}

/** Medianas del Mental Health Atlas 2024. La OMS publica medianas, no metas. */
export const SR_ATLAS2024 = {
  psiquiatras: { mundial: 1.5, americas: 1.7, ingresoAlto: 7.0, europa: 9.9 },
  especializados: { mundial: 13.5, americas: 22.2, ingresoAlto: 67.2, europa: 80.4 },
  gastoPct: 2.1,
  gastoUsd: 2.69,
  gastoPaises: 75,
  /** La ficha de país de Uruguay del Atlas 2024 no está publicada. */
  fichaUruguayHttp: 404,
}

/** El único mapa territorial de una profesión de salud mental, y el de médicos en general. */
export const SR_TERRITORIO = {
  /** 1er Censo Nacional en Psicología, 2014. Mide residencia declarada, no lugar de trabajo. */
  censoPsicologos: 7_543,
  coberturaPct: 77.1,
  montevideo: 5_488,
  montevideoPct: 72.8,
  interior: 2_055,
  interiorPct: 27.2,
  habxPsicMontevideo: 240.4,
  habxPsicArtigas: 2_530.3,
  porDepartamento: [
    { key: 'canelones', value: 884 },
    { key: 'maldonado', value: 225 },
    { key: 'colonia', value: 131 },
    { key: 'salto', value: 123 },
    { key: 'artigas', value: 29 },
    { key: 'flores', value: 21 },
  ],
  /** Médicos de todas las especialidades cada 10.000 habitantes, 2011. */
  medicosMontevideo: 78.8,
  medicosInterior: 21.7,
  medicosAnio: 2011,
}

/**
 * La lista de espera. Las dos cifras van separadas: la fuente no dice que midan lo mismo.
 *
 * Los 30.000 son de «los servicios de psiquiatría» de ASSE. El menos 15% es de «los servicios de
 * salud mental del prestador público».
 */
export const SR_ESPERA = {
  usuarios: 30_000,
  reduccionPct: 15,
  reduccionMeses: 7,
  fecha: '2025-11-14',
  /** Plazo máximo para una consulta de especialidad, por decreto. No nombra a la psiquiatría. */
  plazoDias: 30,
  metaCorto: 25,
  meta2030: 50,
}

/** Lo que la Estrategia 2025-2030 dice y no dice sobre recursos humanos. */
export const SR_ESTRATEGIA_RRHH = {
  paginas: 67,
  /** Cifras de base o metas numéricas en el Eje 5. */
  eje5Cifras: 0,
  /** Conteos por palabra exacta. Por raíz, «psiquiatr» da 10 y «psicolog» da 3. */
  psiquiatra: 2,
  psicologos: 1,
  enfermer: 0,
  /** Menciones de suicidio, y de cifras en pesos, en las mismas 67 páginas. */
  suicid: 48,
  pesos: 0,
}

/** Llamadas a las dos líneas en 2023. No se suman: son dos unidades distintas. */
export const SR_LLAMADAS_2023 = { apoyoRecibidas: 23_842, prevencionAtendidas: 5_129 }

/* ------------------------------------------------------------------ *
 * 13 · RECOMENDACIONES                                                *
 * ------------------------------------------------------------------ */

/** Quién escribió la recomendación. */
export type OrgReco = 'oms' | 'ops' | 'msp' | 'inddhh' | 'cncasm' | 'asamblea'

/** Estado en Uruguay. Nunca es una opinión: es lo que otra fuente permite afirmar. */
export type EstadoReco =
  | 'si' | 'siReserva' | 'parcial' | 'no' | 'noVerificado'
  | 'norma' | 'anunciado' | 'ocurrio' | 'participa' | 'noAplica'

/** Una recomendación atribuida, con su cita literal y el estado que otra fuente permite afirmar. */
export interface Recomendacion {
  id: string
  org: OrgReco
  /**
   * Cita literal. Las de la OMS van en inglés porque es la edición que la OMS declara
   * vinculante. La edición en español de la OPS no se pudo descargar.
   */
  cita: string
  estado: EstadoReco
}

/**
 * Las cincuenta y dos recomendaciones, con su estado.
 *
 * El remate es R5: la OMS pide presupuesto etiquetado anual para prevención del suicidio, y el
 * estado en Uruguay es NO.
 */
export const SR_RECOMENDACIONES: Recomendacion[] = [
  { id: 'R1', org: 'oms', cita: 'Limit access to the means of suicide', estado: 'parcial' },
  { id: 'R2', org: 'oms', cita: 'Interact with the media for responsible reporting of suicide', estado: 'parcial' },
  { id: 'R3', org: 'oms', cita: 'Foster socio-emotional life skills in adolescents', estado: 'parcial' },
  { id: 'R4', org: 'oms', cita: 'Early identify, assess, manage and follow up anyone who is affected by suicidal behaviours', estado: 'parcial' },
  { id: 'R5', org: 'oms', cita: 'OUTCOME 5: Budgets are articulated and funds secured to implement LIVE LIFE pillars and interventions. National budget earmarked for suicide prevention is systematically allocated annually.', estado: 'no' },
  { id: 'R6', org: 'oms', cita: 'Global target 3.2: The rate of suicide will be reduced by one-third, by 2030.', estado: 'noVerificado' },
  { id: 'R7', org: 'oms', cita: 'Global target 1.2: 80% of countries will have developed or updated their law for mental health in line with international and regional human rights instruments, by 2030.', estado: 'siReserva' },
  { id: 'R8', org: 'msp', cita: 'Se recomienda realizar un seguimiento telefónico inmediato en un plazo máximo de 2 días desde el egreso, realizado por un integrante del equipo de Salud Mental.', estado: 'parcial' },
  { id: 'R9', org: 'msp', cita: '…deberá ser máximo 7 días post egreso', estado: 'norma' },
  { id: 'R10', org: 'msp', cita: 'se impulsará una estrategia integral que contemple su fortalecimiento legal, operativo y financiero. Esto implicará dotarla de recursos humanos, infraestructura adecuada y un mecanismo de financiamiento estable y sostenible.', estado: 'no' },
  { id: 'R11', org: 'msp', cita: 'Promover su conformación con la representatividad que establece la Ley 19529, la continuidad de su funcionamiento, con financiamiento estable y sostenible…', estado: 'no' },
  { id: 'R12', org: 'msp', cita: 'Evaluación de la Estrategia Nacional de Prevención del Suicidio 2021-2025 y diseño de la Estrategia Nacional para la Prevención del Suicidio 2026-2030', estado: 'no' },
  { id: 'R13', org: 'msp', cita: 'Elaboración de un plan de desinstitucionalización […] con un cronograma definido para el cierre o reestructura de estos dispositivos.', estado: 'no' },
  { id: 'R14', org: 'msp', cita: 'Diagnóstico de situación de los dispositivos alternativos a la hospitalización […] de acuerdo con la Ordenanza 1488/019.', estado: 'no' },
  { id: 'R15', org: 'msp', cita: 'Elaboración de un plan específico para la prevención de la reiteración de intentos de autoeliminación.', estado: 'no' },
  { id: 'R16', org: 'msp', cita: 'Se avanzará en la reglamentación de: […] Los artículos pendientes de la Ley de Salud Mental, comenzando por el 19, 33, 37 y 38.', estado: 'no' },
  { id: 'R17', org: 'msp', cita: 'Cronograma de cierre de instituciones de larga estadía publicado y porcentaje de cumplimiento anual de metas.', estado: 'no' },
  { id: 'R18', org: 'msp', cita: 'Hito 4: Contar con un sistema de monitoreo de indicadores de salud mental en el país.', estado: 'no' },
  { id: 'R19', org: 'msp', cita: 'Dispónese que el registro digital de los Intentos de Auto Eliminación (IAE) tiene carácter obligatorio y deberá ser completado en cada puerta de emergencia pertenecientes a los prestadores de salud públicos y privados, en un plazo máximo de veinticuatro (24) horas una vez ingresado el usuario/a con intento de autoeliminación (IAE).', estado: 'si' },
  { id: 'R20', org: 'msp', cita: 'El incumplimiento de lo previsto en la presente Ordenanza Ministerial dará lugar a las sanciones previstas en el artículo 396 de la Ley N° 19.924, de 20 de diciembre de 2020.', estado: 'noVerificado' },
  { id: 'R21', org: 'inddhh', cita: 'resulta necesario adoptar medidas que permitan, a la mayor brevedad, revertir este cambio legislativo que de sostenerse podría significar un retroceso', estado: 'noVerificado' },
  { id: 'R22', org: 'inddhh', cita: 'Una decisión de esta magnitud, que afecta aspectos centrales del modelo de atención, requería niveles de transparencia, fundamentación y debate público acordes a su relevancia.', estado: 'noVerificado' },
  { id: 'R23', org: 'cncasm', cita: 'Esto nos lleva a reiterar nuestra preocupación ante el vencimiento del plazo para cumplir con la meta establecida de cierre para el año 2025 (Art. 38 de la Ley N° 19.529).', estado: 'ocurrio' },
  { id: 'R24', org: 'cncasm', cita: 'Se destaca la necesidad de dispositivos de transición como el hospital de día y las casas de medio camino.', estado: 'noVerificado' },
  { id: 'R25', org: 'asamblea', cita: 'Créase, como una institución del Poder Legislativo, el Órgano de Revisión que actuara como mecanismo independiente… El Órgano de Revisión no estará sujeto a jerarquía […] no pudiendo recibir instrucciones ni órdenes de ninguna autoridad.', estado: 'no' },
  { id: 'R26', org: 'asamblea', cita: 'hasta su remplazo definitivo por los dispositivos sustitutivos; con fecha máxima en 2020', estado: 'no' },
  { id: 'R27', org: 'oms', cita: 'The core pillars of LIVE LIFE are as follows: Situation analysis · Multisectoral collaboration · Awareness-raising and advocacy · Capacity-building · Financing · Surveillance, monitoring and evaluation.', estado: 'parcial' },
  { id: 'R28', org: 'oms', cita: 'Importantly, evidence shows that restriction of one method of suicide does not inevitably lead to a rise in the use of others.', estado: 'noAplica' },
  { id: 'R29', org: 'oms', cita: 'Effective means restriction should focus on methods that: cause most deaths and/or have a high case fatality; and the most commonly used. […] Surveillance is necessary to identify the means used by the population', estado: 'noVerificado' },
  { id: 'R30', org: 'oms', cita: 'There is evidence that media reporting of suicide can lead to a rise in suicide due to imitation, particularly in cases of celebrity suicide and where suicide methods are described', estado: 'parcial' },
  { id: 'R31', org: 'oms', cita: 'In Austria, the Austrian Press Council established suicide-preventive reporting in its code of ethics in 2012. Media articles which are not in line with responsible reporting receive admonitions by the National Press Council.', estado: 'no' },
  { id: 'R32', org: 'oms', cita: 'a certain form of reporting not only prevents imitation suicides (the Werther effect) but can have a general suicide-preventive effect (the Papageno effect)', estado: 'noVerificado' },
  { id: 'R33', org: 'oms', cita: 'talking about suicide with young people will not increase suicide risk but will mean that young people may feel more able to approach them for support', estado: 'parcial' },
  { id: 'R34', org: 'oms', cita: 'Rather than focusing explicitly on suicide, the HAT guidelines recommend that programmes employ a positive mental health approach.', estado: 'parcial' },
  { id: 'R35', org: 'oms', cita: 'Crisis services such as crisis community treatment teams or crisis lines should also be available to provide immediate support to individuals in acute distress', estado: 'si' },
  { id: 'R36', org: 'oms', cita: 'Data on the number of suicides and cases of self-harm should be disaggregated at a minimum by gender, age and method', estado: 'parcial' },
  { id: 'R37', org: 'msp', cita: 'Campaña Nacional de Concientización y Prevención del Suicidio Adolescente', estado: 'norma' },
  { id: 'R38', org: 'msp', cita: 'Será obligatoria la capacitación del personal de la salud pública y privada, bomberos y funcionarios policiales en la atención de personas con señales de comportamiento suicida, así como en el abordaje del rescate.', estado: 'norma' },
  { id: 'R39', org: 'ops', cita: 'transformar el liderazgo, la gobernanza y las acciones de prevención del suicidio para reducir estas pérdidas', estado: 'participa' },
  { id: 'R40', org: 'msp', cita: 'Realizar un seguimiento activo durante un mínimo de seis (6) meses.', estado: 'norma' },
  { id: 'R41', org: 'msp', cita: 'En caso de inasistencia a la consulta, un miembro del equipo de salud mental deberá llamar al usuario y/o al referente afectivo. La visita domiciliaria será considerada como herramienta privilegiada en estos casos.', estado: 'norma' },
  { id: 'R42', org: 'msp', cita: '6.2 Elaborar y aprobar protocolo de estandarización de método de evaluación de aspectos psicológicos para el porte de armas.', estado: 'noVerificado' },
  { id: 'R43', org: 'msp', cita: '6.3 Regular e implementar medidas de seguridad en zonas de riesgo.', estado: 'no' },
  { id: 'R44', org: 'msp', cita: '6.1 Diseñar e implementar políticas regulatorias para el acceso a medios letales.', estado: 'noVerificado' },
  { id: 'R45', org: 'msp', cita: '5) Certificado de aptitud sicofísica expedido por un profesional competente.', estado: 'siReserva' },
  { id: 'R46', org: 'msp', cita: 'Se mejorará la disponibilidad y calidad de la información, incluyendo el registro digital obligatorio de IAE a través del Sistema de Vigilancia en Salud', estado: 'norma' },
  { id: 'R47', org: 'msp', cita: 'En el caso de los IAE, se hará seguimiento los primeros 6 meses, de acuerdo a pautas establecidas al respecto.', estado: 'norma' },
  { id: 'R48', org: 'msp', cita: 'Trimestralmente el Sistema Nacional de Información (SINADI) deberá recibir la planilla electrónica correspondiente.', estado: 'noVerificado' },
  { id: 'R49', org: 'msp', cita: 'En caso de IAE, deberá ser recibido por el Comité de Recepción antes de las 48 horas.', estado: 'norma' },
  { id: 'R50', org: 'msp', cita: 'Para los casos de IAE no se consideraran los plazos estipulados en los puntos a y b.', estado: 'si' },
  { id: 'R51', org: 'msp', cita: 'Se realizará un analisis de la implementación de las prestaciones psicoterapeúticas y psicosociales en el SNIS (Decreto 305/011 y 114/024).', estado: 'anunciado' },
  { id: 'R52', org: 'msp', cita: 'se dará continuidad a la Meta Asistencial vinculada al seguimiento inmediato de estos usuarios para el período 2026-2027.', estado: 'anunciado' },
]

/* ------------------------------------------------------------------ *
 * 14 · PEDIDOS DE DATOS                                               *
 * ------------------------------------------------------------------ */

/** Bloque temático del pedido. */
export type BloquePedido =
  | 'intentos' | 'plata' | 'camas' | 'rrhh' | 'compras'
  | 'prestaciones' | 'estrategia' | 'internacional'

/** Un pedido de datos NUESTRO. Nunca es un pedido de política sanitaria. */
export interface PedidoDato {
  id: string
  bloque: BloquePedido
  /** Organismo que tendría que publicarlo. */
  organismo: string
}

/** Los cuarenta y seis pedidos, agrupados por bloque. */
export const SR_PEDIDOS: PedidoDato[] = [
  { id: 'P1', bloque: 'intentos', organismo: 'MSP' },
  { id: 'P2', bloque: 'intentos', organismo: 'MSP' },
  { id: 'P3', bloque: 'intentos', organismo: 'MSP' },
  { id: 'P4', bloque: 'intentos', organismo: 'MSP' },
  { id: 'P5', bloque: 'intentos', organismo: 'MSP' },
  { id: 'P6', bloque: 'intentos', organismo: 'MSP' },
  { id: 'P7', bloque: 'intentos', organismo: 'AGESIC / MSP' },
  { id: 'P8', bloque: 'intentos', organismo: 'MSP' },
  { id: 'P9', bloque: 'plata', organismo: 'CGN / MEF' },
  { id: 'P10', bloque: 'plata', organismo: 'MSP, Área Economía de la Salud' },
  { id: 'P11', bloque: 'plata', organismo: 'MSP' },
  { id: 'P12', bloque: 'plata', organismo: 'ASSE' },
  { id: 'P13', bloque: 'plata', organismo: 'Hospital de Clínicas / UdelaR' },
  { id: 'P14', bloque: 'plata', organismo: 'ASSE' },
  { id: 'P15', bloque: 'plata', organismo: 'ASSE' },
  { id: 'P16', bloque: 'camas', organismo: 'Poder Ejecutivo / MSP' },
  { id: 'P17', bloque: 'camas', organismo: 'MSP / ASSE' },
  { id: 'P18', bloque: 'camas', organismo: 'ASSE' },
  { id: 'P19', bloque: 'camas', organismo: 'MSP' },
  { id: 'P20', bloque: 'camas', organismo: 'MSP' },
  { id: 'P21', bloque: 'rrhh', organismo: 'MSP / JUNASA' },
  { id: 'P22', bloque: 'rrhh', organismo: 'ASSE' },
  { id: 'P23', bloque: 'rrhh', organismo: 'JUNASA / MSP' },
  { id: 'P24', bloque: 'rrhh', organismo: 'MSP' },
  { id: 'P25', bloque: 'compras', organismo: 'Compras Estatales / ACCE' },
  { id: 'P26', bloque: 'compras', organismo: 'Compras Estatales / UCA' },
  { id: 'P27', bloque: 'compras', organismo: 'UCA' },
  { id: 'P28', bloque: 'compras', organismo: 'Compras Estatales / ACCE' },
  { id: 'P29', bloque: 'compras', organismo: 'Compras Estatales / ACCE' },
  { id: 'P30', bloque: 'compras', organismo: 'Compras Estatales / INAU' },
  { id: 'P31', bloque: 'prestaciones', organismo: 'MSP / JUNASA' },
  { id: 'P32', bloque: 'prestaciones', organismo: 'MSP' },
  { id: 'P33', bloque: 'prestaciones', organismo: 'MSP' },
  { id: 'P34', bloque: 'prestaciones', organismo: 'MSP' },
  { id: 'P35', bloque: 'prestaciones', organismo: 'MSP / JUNASA' },
  { id: 'P36', bloque: 'prestaciones', organismo: 'MSP / AGESIC' },
  { id: 'P37', bloque: 'prestaciones', organismo: 'MSP' },
  { id: 'P38', bloque: 'prestaciones', organismo: 'ASSE / MSP' },
  { id: 'P39', bloque: 'estrategia', organismo: 'MSP, Interior, Defensa, MGAP' },
  { id: 'P40', bloque: 'estrategia', organismo: 'MSP' },
  { id: 'P41', bloque: 'estrategia', organismo: 'MSP' },
  { id: 'P42', bloque: 'rrhh', organismo: 'MSP / Facultad de Medicina' },
  { id: 'P43', bloque: 'rrhh', organismo: 'MSP / UdelaR' },
  { id: 'P44', bloque: 'rrhh', organismo: 'Facultad de Psicología / MSP' },
  { id: 'P45', bloque: 'rrhh', organismo: 'OMS' },
  { id: 'P46', bloque: 'internacional', organismo: 'OPS' },
]

/* ------------------------------------------------------------------ *
 * 15 · FUENTES                                                        *
 * ------------------------------------------------------------------ */

export const SR_SOURCES = [
  {
    key: 'oficial',
    items: [
      { label: 'IMPO — Ley 20.446, Presupuesto Nacional 2025-2029 (texto articulado, 717 artículos)', url: 'https://www.impo.com.uy/bases/leyes-originales/20446-2025' },
      { label: 'Presupuesto Nacional 2025-2029 — Tomo II, Planificación y evaluación, Administración Central (versión sancionada)', url: 'https://presupuestonacional.gub.uy/sites/default/files/2025-12/Tomo%20II%20-%20Planificaci%C3%B3n%20y%20evaluaci%C3%B3n%20Informaci%C3%B3n%20institucional%20-%20Administraci%C3%B3n%20Central%20-%20Ley%20N%C2%B0%2020.446.pdf' },
      { label: 'IMPO — Ley 19.529 de Salud Mental, artículo 38 (texto de 2017 y texto vigente)', url: 'https://www.impo.com.uy/bases/leyes/19529-2017/38' },
      { label: 'IMPO — Decreto 305/011 y su Anexo, Plan de Prestaciones en Salud Mental', url: 'https://www.impo.com.uy/bases/decretos/305-2011' },
      { label: 'IMPO — Decreto 366/011, tasas moderadoras y financiamiento por cuota salud', url: 'https://www.impo.com.uy/bases/decretos/366-2011' },
      { label: 'IMPO — Decreto 378/004, creación de la Comisión Nacional Honoraria de Prevención del Suicidio', url: 'https://www.impo.com.uy/bases/decretos/378-2004' },
      { label: 'MSP — Meta Asistencial 2024-2025, Instructivo (indicador 5 del Componente 5, págs. 70-77)', url: 'https://www.gub.uy/ministerio-salud-publica/sites/ministerio-salud-publica/files/documentos/publicaciones/Instructivo%20META%202024_2025_V1.2%20-%20Agosto2024.pdf' },
      { label: 'MSP — Estrategia Nacional de Salud Mental y Bienestar 2025-2030 (67 páginas, sin cifras en pesos)', url: 'https://www.gub.uy/ministerio-salud-publica/sites/ministerio-salud-publica/files/documentos/publicaciones/MSP_ESTRATEGIA_SALUD_MENTAL_BIENESTAR_2025_2030_16_04_2026.pdf' },
      { label: 'MSP — Estrategia Nacional de Prevención del Suicidio 2021-2025 (PDF)', url: 'https://www.gub.uy/ministerio-salud-publica/sites/ministerio-salud-publica/files/documentos/publicaciones/MSP_ESTRATEGIA_NACIONAL_PREVENCION_SUICIDIO_2021_2025.pdf' },
      { label: 'MSP — Boletín de Cuentas Nacionales de Salud de Uruguay 2024 (22 páginas, cero menciones de salud mental)', url: 'https://www.gub.uy/ministerio-salud-publica/sites/ministerio-salud-publica/files/documentos/publicaciones/Boletin_CNS_2024_0.pdf' },
      { label: 'MSP — Denegatoria de acceso a la información, Ref. 12/001/3/7903/2025', url: 'https://www.gub.uy/ministerio-salud-publica/sites/ministerio-salud-publica/files/2026-07/Notificaci%C3%B3n%20ref.%203-7903-2025_removed%20%281%29.pdf' },
      { label: 'MSP — Suicidios en Uruguay: nueva orientación de las políticas públicas (17/07/2025, tasas de intentos 2023 y 2024)', url: 'https://www.gub.uy/ministerio-salud-publica/comunicacion/noticias/suicidios-uruguay-nueva-orientacion-politicas-publicas-ante-evolucion' },
      { label: 'MSP — Encuentro de trabajo por el Día Nacional de Prevención del Suicidio (17/07/2026, 6.140 episodios y 5.144 personas)', url: 'https://www.gub.uy/ministerio-salud-publica/comunicacion/noticias/encuentro-trabajo-dia-nacional-prevencion-del-suicidio' },
      { label: 'MSP — Suicidio en adolescentes en Uruguay: un análisis desde el sistema de salud (2023)', url: 'https://www.gub.uy/ministerio-salud-publica/sites/ministerio-salud-publica/files/documentos/publicaciones/Suicidio%20en%20adolescentes%20en%20Uruguay%20-%20un%20an%C3%A1lisis%20desde%20el%20sistema%20de%20salud.pdf' },
      { label: 'MSP — Infotítulos, base de datos de títulos habilitados (corte 31/07/2026)', url: 'https://www.gub.uy/ministerio-salud-publica/datos-y-estadisticas/microdatos/infotitulos-base-datos' },
      { label: 'MSP — Respuesta al pedido de informes, Oficio N° 11717 (censo de CEREMOS, octubre de 2023)', url: 'https://documentos.diputados.gub.uy/docs/L49/Original/11645.pdf' },
      { label: 'CNCASM — Puntos críticos en la implementación de la Ley 19529 (diciembre de 2023)', url: 'https://www.psico.edu.uy/sites/default/files/2024-03/Puntos%20cr%C3%ADticos%20en%20la%20implementaci%C3%B3n%20de%20la%20Ley%2019529%20FINAL.pdf' },
      { label: 'INDDHH — Advertencia sobre los cambios en la Ley de Salud Mental (04/03/2026)', url: 'https://www.gub.uy/institucion-nacional-derechos-humanos-uruguay/comunicacion/comunicados/inddhh-advierte-sobre-cambios-sustantivos-ley-salud-mental' },
      { label: 'INDDHH — Informe Anual 2025, Mecanismo Nacional de Prevención de la Tortura (316 páginas)', url: 'https://www.gub.uy/institucion-nacional-derechos-humanos-uruguay/sites/institucion-nacional-derechos-humanos-uruguay/files/2026-04/INFORME%20ANUAL%202025_INDDHH.pdf' },
      { label: 'OMS — Mental Health Atlas 2020, ficha de país de Uruguay (tres casillas de financiamiento vacías)', url: 'https://cdn.who.int/media/docs/default-source/mental-health/mental-health-atlas-2020-country-profiles/ury.pdf' },
      { label: 'OMS — Mental Health Atlas 2017, ficha de país de Uruguay', url: 'https://cdn.who.int/media/docs/default-source/mental-health/mental-health-atlas-2017-country-profiles/uy.pdf' },
      { label: 'OPS — Modelo y requisitos mínimos de dispositivos de la Red de Atención en Salud Mental (diciembre de 2022)', url: 'https://www.paho.org/sites/default/files/2023-05/documento-referencia-sobre-modelo-requisitos.pdf' },
      { label: 'Facultad de Psicología, UdelaR — 1er Censo Nacional en Psicología, Uruguay 2014', url: 'https://psico.edu.uy/sites/default/files/2017-07/primer%20censo.pdf' },
      { label: 'Camdel IAMPP — Tarifario de tasas moderadoras vigente al 01/01/2026', url: 'https://camdeliampp.com.uy/tasas-moderadoras/' },
      { label: 'MEF — Exposición de Motivos de la Rendición de Cuentas 2023, ejecución presupuestal de ASSE', url: 'https://documentos.diputados.gub.uy/docs/rc/2023/PoderEjecutivo/02-Exposici%C3%B3n%20de%20Motivos.pdf' },
      { label: 'Compras Estatales — Licitación Pública 22/2024 de ASSE, línea 0800 1920', url: 'https://www.comprasestatales.gub.uy/consultas/detalle/id/1144998' },
    ],
  },
  {
    key: 'prensa',
    items: [
      { label: 'El Observador — Cifras del registro de intentos de 2025, citando al MSP (17/07/2026)', url: 'https://www.elobservador.com.uy/nacional/uruguay-registro-la-menor-tasa-suicidios-diez-anos-pero-el-msp-mantiene-la-alerta-y-pide-evitar-triunfalismo-n6051098' },
      { label: 'Subrayado — Presentación del MSP del 18/07/2023, tramo de nueve meses del registro', url: 'https://www.subrayado.com.uy/hubo-668-muertes-suicidio-2025-el-msp-senala-indicadores-preocupantes-todo-el-pais-n1013000' },
      { label: 'la diaria — Columna de opinión del 31/03/2025, única fuente del conteo de 2023', url: 'https://ladiaria.com.uy/opinion/' },
      { label: 'Presidencia — Lista de espera de psiquiatría en ASSE (14/11/2025)', url: 'https://www.gub.uy/presidencia/' },
      { label: 'Naciones Unidas — América, la única región del mundo donde crece el suicidio (10/09/2025)', url: 'https://news.un.org/es/story/2025/09/1540421' },
    ],
  },
]

/* ------------------------------------------------------------------ *
 * TARJETA DEL ÍNDICE                                                  *
 * ------------------------------------------------------------------ */

/**
 * La tarjeta del índice vive acá y no en `app/data/investigaciones.ts`.
 *
 * MOTIVO: otra sesión tiene cambios sin commitear en ese archivo. Tocarlo desde acá los barre.
 * El índice importa `SR_CARD` desde este módulo y la pieza queda registrada igual.
 */
export const SR_CARD = {
  es: {
    eyebrow: 'Investigación propia · presupuesto y prestaciones',
    title: 'El Estado frente al suicidio: los recursos que no se pueden sumar',
    dek: 'Ninguna partida del presupuesto se rotula por el problema. La única meta sobre suicidio de todo el presupuesto es carcelaria y no baja en cinco años. La persona que intentó autoeliminarse paga cada sesión de psicoterapia; su familiar no.',
    tags: ['Presupuesto', 'Salud mental', 'Medición propia'],
  },
  en: {
    eyebrow: 'Own investigation · budget and benefits',
    title: 'The State and suicide: the resources that cannot be added up',
    dek: 'No budget line is labelled by the problem. The only suicide target of the whole budget is a prison target, and it does not fall in five years. The person who attempted suicide pays for every psychotherapy session; their relative does not.',
    tags: ['Budget', 'Mental health', 'Own measurement'],
  },
} as const

/* ------------------------------------------------------------------ *
 * CONTENIDO                                                           *
 * ------------------------------------------------------------------ */

export const SR_CONTENT = {
  es: {
    kicker: 'Investigación propia · datos abiertos',
    title: 'El Estado frente al suicidio: los recursos que no se pueden sumar',
    dek: 'Uruguay tiene una estrategia de prevención del suicidio, un registro de intentos y una prestación obligatoria de psicoterapia. No tiene una partida que diga «prevención del suicidio». Esta pieza mide qué plata rotula el Estado, qué metas se fija y qué le cobra a la persona que intentó autoeliminarse.',
    fileScope: '7 leyes · 1.639.754 compras · 52 recomendaciones',
    filePeriod: '2011 → 2026',
    fileSource: 'IMPO · MSP · OMS · corpus OCDS',
    chips: ['0 menciones en 7 leyes', '0,0677% a 0,0722% del gasto', 'meta carcelaria plana', '9.072 pesos por año'],

    /* 1 · AYUDA */
    ayudaTag: 'Antes de seguir',
    ayudaTitle: 'Si estás pasando por esto, hay a quién llamar',
    ayudaP: 'Las tres líneas son gratuitas. Funcionan las 24 horas, en todo el país. Atienden a la persona en crisis y también a quien la acompaña.',
    ayudaLabels: {
      vida: 'Línea Vida — atención en crisis, gestionada por ASSE desde 2018',
      apoyo: 'Línea de apoyo emocional — ASSE, MSP y Voluntariado Juntos, desde abril de 2020',
      emergencia: 'Emergencia — riesgo inmediato',
    },
    ayudaNota: 'Esta pieza sigue las recomendaciones de la OMS para comunicar sobre suicidio. No describe métodos. No publica casos individuales. No presenta ninguna cifra como récord. El único método que nombra es «restringir el acceso a medios letales», porque es una política pública y así lo escriben el MSP y la OMS.',

    /* 2 · HERO */
    statHead: 'Cómo gestiona el Estado sus recursos frente al suicidio',
    statSub: 'presupuesto rotulado, metas, prestaciones y compras, medidos uno por uno',
    tiles: [
      { n: '0', l: 'menciones en 7 leyes', s: 'presupuesto y rendición de cuentas, 2020-2025, texto articulado' },
      { n: '0,0677–0,0722%', l: 'del gasto en compras', s: 'todo lo que el corpus nombra como salud mental, en 24 años' },
      { n: '93,09', l: 'la meta que no baja', s: 'línea base y las cinco metas anuales, en personas privadas de libertad' },
      { n: '$ 9.072', l: 'por año, persona adulta', s: 'agotar el tope del Modo 2 con el tarifario de Camdel IAMPP' },
    ],

    /* 3 · NO SE PUEDE SUMAR */
    sumarTag: 'El punto de partida',
    sumarTitle: 'No hay una partida que diga «prevención del suicidio»',
    sumar: [
      'Buscamos la raíz «suicid» en el texto articulado de siete leyes seguidas. Son dos presupuestos y cinco rendiciones de cuentas, entre 2020 y 2025. La palabra aparece cero veces en las siete.',
      'La Ley 20.446, el Presupuesto Nacional 2025-2029, tiene 717 artículos. Ninguno la nombra. La expresión «salud mental» sí aparece: once veces en esa ley, y con números distintos en cada una de las otras seis.',
      'Cero menciones no es cero pesos. El gasto en prevención existe adentro de partidas de salud mental y de sueldos de ASSE. Lo que el conteo prueba es que ninguna partida se rotula por el problema, y que por eso el gasto no se puede aislar desde la ley.',
      'La medición cubre el texto articulado, no los tomos. El Tomo II de Planificación y Evaluación sí nombra el suicidio, tres veces, y de eso trata la sección siguiente.',
    ],
    leyesCols: { ley: 'Ley', tipo: 'Qué es', suicid: '«suicidio»', sm: '«salud mental»' },
    leyesLabels: {
      presupuesto2024: 'Presupuesto Nacional 2020-2024',
      rc2020: 'Rendición de cuentas, ejercicio 2020',
      rc2021: 'Rendición de cuentas, ejercicio 2021',
      rc2022: 'Rendición de cuentas, ejercicio 2022',
      rc2023: 'Rendición de cuentas, ejercicio 2023',
      rc2024: 'Rendición de cuentas, ejercicio 2024',
      presupuesto2029: 'Presupuesto Nacional 2025-2029',
    },
    leyesNota: 'Conteo propio sobre el texto que sirve IMPO. Trampa de reproducción: IMPO devuelve latin-1 aunque el encabezado diga UTF-8. Decodificar mal cambia los conteos.',

    omisionTitle: 'Tampoco se reporta hacia afuera',
    omision: [
      'El Ministerio de Salud Pública publica un boletín anual de Cuentas Nacionales de Salud. El de 2024 tiene 22 páginas numeradas. La expresión «salud mental» aparece cero veces, la raíz «suicid» cero veces y la raíz «psiqui» cero veces.',
      'La ficha de Uruguay del Mental Health Atlas 2020 de la OMS tiene tres casillas de financiamiento. Las tres están vacías. La ficha de 2017 tampoco reporta el dato.',
      'En la misma ficha de 2020 hay dos preguntas seguidas sobre el plan nacional de salud mental. Una pregunta si los recursos humanos están estimados y asignados. La otra, si lo están los recursos financieros. Uruguay contestó «No» a las dos.',
      'El propio Estado se puso como meta llegar a medir. El Hito 4 del MSP en el Tomo II dice «Contar con un sistema de monitoreo de indicadores de salud mental en el país», con línea base 0 y meta acumulada 4 para 2029.',
      'Nada de esto prueba que no exista un registro interno. Prueba que el dato no se declaró y que no está publicado.',
    ],
    omisionNota: 'Trampa verificada, para que nadie la reviva: en el mismo PDF del Atlas 2020 aparecen los porcentajes 2,20%, 2,50% y 8,06%. No son gasto en salud mental. Pertenecen al gráfico de producción de investigación.',

    mh4Title: 'El indicador mundial que mide esto está congelado en 2011',
    mh4: [
      'La OMS publica un indicador de gasto público en salud mental sobre gasto público en salud. Tiene 78 filas en todo el mundo, y todas son del mismo año: 2011. Diecinueve filas son de la región de las Américas. Ninguna es de Uruguay.',
      'De eso salen dos afirmaciones, y las dos hay que decirlas juntas. La primera: ningún país tiene cifra reciente, así que la comparación regional no se puede construir con esta fuente. La segunda: en el único año que existe, seis países sudamericanos reportaron y Uruguay no.',
    ],
    mh4Cols: { pais: 'País', pct: '% del gasto público en salud, 2011' },
    escalaNota: 'La escala que sí está publicada: en 2024 Uruguay gastó en salud el 9,31% del PBI, y el gasto público en salud fue el 6,72% del PBI. El compromiso que el país declara cumplir es del 6% del PBI para gasto público en salud. Ese compromiso no fija ningún porcentaje para salud mental.',

    /* 4 · LA ÚNICA META ES CARCELARIA */
    carcelTag: 'La única meta',
    carcelTitle: 'El presupuesto se fija una sola meta sobre suicidio, y es carcelaria',
    carcel: [
      'El Tomo II del Presupuesto 2025-2029 nombra el suicidio en un solo indicador. Es del Ministerio del Interior, programa «Gestión de la privación de libertad». Mide el promedio quinquenal móvil de la tasa de suicidio de las personas privadas de libertad.',
      'Su línea base es 93,09 cada 100.000 personas privadas de libertad. Sus cinco metas anuales, de 2025 a 2029, son el mismo número. El Estado se propone terminar el quinquenio donde lo empezó.',
      'Que la meta iguale a la línea base es una decisión de la tabla, no un error de extracción. En la misma página hay indicadores que sí se mueven: las armas incautadas van de 3.847 a 4.676, y ASSE se propone pasar de 2 a 26 camas de corta estadía para adolescentes. Por qué se fijó así, no se puede afirmar.',
      'Los otros dos indicadores de daño del mismo cuadro también quedan planos. El de homicidios de personas privadas de libertad se fija en 121,57 los cinco años. El de hospitalizaciones por incidentes violentos o lesiones autoinfligidas, en 92,33.',
      'El volumen de Organismos del artículo 220 del mismo Tomo II tiene cero ocurrencias de «suicid» y cero de «autoelimin». Con eso, la afirmación vale para todo el Tomo II. ASSE planifica salud mental, y lo hace fuera del área Salud: su objetivo vive en «Protección Social».',
    ],
    indicadoresCols: { key: 'Indicador', base: 'Línea base', meta: 'Meta 2029' },
    indicadoresLabels: {
      suicidioPpl: 'Suicidios cada 100.000 personas privadas de libertad',
      homicidioPpl: 'Homicidios cada 100.000 personas privadas de libertad',
      hospitalizacionPpl: 'Hospitalizaciones por incidentes violentos o lesiones autoinfligidas',
      armas: 'Armas incautadas en unidades penitenciarias',
      femicidios: 'Femicidios con medidas cautelares vigentes',
      camasAdolescentes: 'Camas de corta estadía para adolescentes, ASSE',
      consultasAsse: 'Consultas de psiquiatría y psicología cada mil usuarios, ASSE',
    },
    carcelAviso: 'El 93,09 tiene otro denominador que la tasa país. Cuenta personas privadas de libertad, no habitantes. No se compara con el 19,16 de 2025 sin decirlo.',

    /* 5 · LO QUE SÍ ESTÁ ROTULADO */
    partidasTag: 'Lo que sí está rotulado',
    partidasTitle: 'Cinco artículos, 224 millones para 2026',
    partidas: [
      'Los artículos de la Ley 20.446 que nombran la salud mental suman 224.250.000 pesos para el ejercicio 2026. Desde 2027 suman 234.250.000 anuales. La partida más grande es de ASSE: 170.000.000 por año.',
      'Sólo cuatro de los cinco artículos dicen «Asígnase», que es la fórmula de la plata nueva. Contando sólo esos, quedan 220.000.000 para 2026 y 230.000.000 desde 2027. Los 4.000.000 de la Universidad de la República son una reasignación desde otro inciso.',
      'Del artículo 393, que da 10.000.000 al MSP por «los cometidos en salud mental y adicciones», 9.768.240 pesos son transferencias a instituciones sin fines de lucro. Es el 97,68% de esa partida.',
      'Para dar magnitud: los 170.000.000 de ASSE equivalen al 0,29% de los 57.988.000.000 que ASSE ejecutó en 2023. La cuenta sirve para dar escala y no como proporción del presupuesto vigente. Compara un crédito a valores de enero de 2025 contra un gasto ejecutado en pesos corrientes de 2023.',
      'Esto es crédito asignado, no ejecutado. La ejecución por línea no se publica.',
    ],
    partidasCols: { art: 'Artículo', inciso: 'Inciso', y2026: 'Crédito 2026', y2027: 'Anual desde 2027', destino: 'Destino literal' },
    partidasDestinos: {
      asse: '«red de estructuras básicas de atención en salud mental […] y el fortalecimiento de equipos de salud mental comunitarios». La ley lo escribe como 70.000.000 más 100.000.000 anuales.',
      mides: '«nuevas iniciativas de atención de la salud mental y los consumos problemáticos de sustancias psicoactivas para personas con alta vulnerabilidad social»',
      msp: '«los cometidos en salud mental y adicciones». 9.768.240 pesos, el 97,68%, son transferencias a instituciones sin fines de lucro.',
      udelar: 'Proyecto ECHO, «salud mental y el desarrollo de la teleclínica en el interior». Es reasignación desde el Inciso 24, no plata nueva.',
      giacoya: 'Subsidio al «Centro de Salud Mental Nélida Giacoya». Entra por el nombre de la institución, no por la etiqueta del gasto.',
    },
    partidasUnidad: 'Unidad obligatoria: son créditos cuantificados a valores del 1º de enero de 2025, por el artículo 2 de la propia ley. Rigen desde el 1º de enero de 2026, por su artículo 3. No son pesos corrientes de 2026.',
    art508Titulo: 'Los 60 millones que quedan afuera',
    art508Nota: 'El artículo 508 asigna 60.000.000 de pesos con un destino doble y sin desagregar: un proyecto de patología urológica y la ampliación del programa de salud mental. La ley no dice cuánto va a cada uno. Publicarlos como salud mental sería un error, así que no entran en el total de arriba.',

    /* 6 · EL PRECIO DE LA AYUDA */
    precioTag: 'El precio de la ayuda',
    precioTitle: 'Quien intentó autoeliminarse paga cada sesión. Su familiar no paga',
    precio: [
      'El Decreto 305/011 obliga a todos los prestadores del sistema de salud a dar psicoterapia. Organiza el acceso en tres Modos, con topes anuales de sesiones distintos. Se financia subiendo la cuota salud del FONASA y cobrando tasa moderadora.',
      'La persona con intento de autoeliminación entra por el Modo 2. El Modo 2 tiene tasa moderadora. El familiar o vínculo cercano entra por el Modo 1, cuyas sesiones son gratuitas. El derecho del familiar vence al año del episodio.',
      'El Decreto 114/024, de 2024, no exoneró a la persona con intento de autoeliminación. Le bajó la tasa moderadora a la del Modo 3, que es un tercio. La persona sigue pagando cada sesión.',
      'Con el tarifario de Camdel IAMPP vigente al 1º de enero de 2026, la sesión del Modo 2 vale 573 pesos y la del Modo 3 vale 189. Agotar las 48 sesiones anuales le cuesta a una persona adulta con intento de autoeliminación 9.072 pesos por año. Antes del Decreto 114/024 le costaba 27.504.',
      'La palabra «adulta» es obligatoria. Para un niño o un adolescente el tope del Modo 2 son 24 sesiones, o sea la mitad, y la cuenta da 4.536 pesos por año contra 13.752 antes del decreto.',
      'Los 9.072 pesos son un techo teórico, no un gasto observado. Nadie publica cuántas sesiones usa en promedio una persona con intento de autoeliminación. Y los 573 y los 189 son el tarifario de un prestador, Camdel IAMPP, no un promedio nacional.',
    ],
    modosCols: { modo: 'Modo', adultos: 'Adultos', menores: 'Niños y adolescentes', tasa: 'Tasa moderadora' },
    modosLabels: {
      modo1: 'Modo 1 — abordaje grupal. Es la puerta del familiar o vínculo cercano.',
      modo2: 'Modo 2 — es la puerta de la persona con intento de autoeliminación.',
      modo3: 'Modo 3 — renovable hasta 144 sesiones anuales.',
    },
    modosTasa: { modo1: 'gratuito', modo2: 'con tasa moderadora', modo3: 'tasa moderadora menor' },
    tarifarioTitulo: 'El tarifario de un prestador, al 1º de enero de 2026',
    tarifarioNota: 'El tope nacional vigente en pesos no es citable. Los topes originales de 2011 son 170 pesos para el Modo 2 y 55 para el Modo 3, y son topes, no precios. Se actualizan por porcentaje en cada ajuste semestral, y ningún decreto reciente vuelve a nombrar los Modos.',
    decreto114Nota: 'El Decreto 114/024 también subió el tope de edad de la cobertura general de 25 a 30 años. Las poblaciones priorizadas, entre ellas el intento de autoeliminación, nunca tuvieron tope de edad. Y eliminó la tasa moderadora de fluoxetina y sertralina, y la topeó en 144 pesos en escitalopram. Elimina la tasa moderadora, no el timbre profesional.',
    expedienteTitulo: 'La obligación de reportar que el Estado se puso en 2011',
    expediente: [
      'El Anexo del mismo decreto manda a cada prestador enviar una planilla trimestral al Sistema Nacional de Información. La obligación rige desde 2011.',
      'Catorce años después, alguien le pidió al MSP el uso de esas prestaciones: usuarios de 18 años o menos entre 2018 y 2022, por edad, sexo y departamento, más los indicadores de estructura, proceso y resultado por prestador. El MSP contestó que no dispone de un registro centralizado con ese nivel de desagregación. Y denegó el pedido de acceso.',
      'El expediente es el Ref. 12/001/3/7903/2025, con informe jurídico del 7 de noviembre de 2025, publicado el 29 de julio de 2026. El MSP nunca dijo no tener ningún dato de uso. Dijo que no tiene ese desagregado.',
    ],

    /* 7 · LO QUE EL ESTADO PAGA POR SEGUIR A ALGUIEN */
    pagoTag: 'El incentivo',
    pagoTitle: 'El Estado paga 15,51 pesos por seguir a alguien después del alta',
    pago: [
      'Desde 2024 el seguimiento después del alta es una meta asistencial que se paga. Es el indicador 5 del Componente 5 del instructivo del MSP, y se llama «Seguimiento inmediato de afiliados con intento de autoeliminación».',
      'Vale 15,51 pesos por mes y por usuario FONASA, sobre los 217,08 que vale la meta entera. Es el 7,14% de una meta que tiene 21 indicadores. La escala de montos por indicador tiene tres escalones, 5,16, 10,34 y 15,51, y el del seguimiento está en el más alto.',
      'El objetivo de cumplimiento que el Estado se fija es 70%. El pago empieza desde 50%. Los dos valores se aplican hito por hito, no sobre un porcentaje único de casos completos.',
      'Dicho sin aritmética: el Estado se propone cumplir el protocolo en 7 de cada 10 casos, y empieza a cobrar desde 5 de cada 10.',
      'El indicador tiene cuatro hitos con pesos distintos. El que más pesa junto a la consulta presencial es la llamada a los 2 días. El instructivo dice «2 días», no «48 horas».',
      'El hito de la consulta presencial a los 7 días vale el 30%. El instructivo prevé de forma expresa que, si la consulta no se concreta, el prestador la sustituya por una llamada. Esa llamada vale aunque sea con el referente afectivo y no con la persona. El hito se cierra sin ver a la persona, y puede cerrarse sin hablarle.',
      'No hay dato de cuántas veces el hito se cierra por teléfono. El instructivo también le fija un objetivo a esa llamada, que es reevaluar el riesgo.',
      'Éste no es el único indicador de salud mental de la meta. El indicador 2.3 deriva a puérperas primerizas con indicios de depresión post-parto al mismo Comité de Recepción, y vale 10,34 pesos.',
    ],
    hitosCols: { key: 'Hito', peso: 'Peso', monto: 'Pesos por mes y por usuario FONASA' },
    hitosLabels: {
      orientacion: 'Orientación al usuario por escrito antes del alta',
      llamada2dias: 'Seguimiento telefónico a los 2 días',
      consulta7dias: 'Consulta presencial a los 7 días',
      llamada30dias: 'Seguimiento telefónico a los 30 días',
    },
    hitosNota: 'El reparto de los 15,51 pesos entre los cuatro hitos es cuenta nuestra, sobre los pesos que fija el instructivo. El monto de 15,51 se verificó por coordenadas contra el PDF: los 21 montos así mapeados suman 217,08 exacto, que es el total que el propio instructivo declara.',
    metaUnidad: 'Unidad: pesos por mes y por usuario FONASA, nunca «por afiliado». El 15,51 se publica sobre 217,08, que es el valor a julio de 2024. Entre enero y junio de 2026 la meta entera vale 234,13, y proyectar el indicador sobre ese total supone una actualización proporcional que ningún documento confirma.',
    normaTitulo: 'Y no empieza en 2024',
    norma: [
      'El seguimiento después del alta es obligación desde 2017, no recomendación desde 2024. El protocolo aprobado por la Ordenanza Ministerial 384/017 fija la primera consulta ambulatoria en un plazo no mayor a 7 días, y el seguimiento activo por un mínimo de seis meses, sobre todos los usuarios.',
      'El Anexo del Decreto 305/011 ya lo ordenaba en 2011: «En el caso de los IAE, se hará seguimiento los primeros 6 meses, de acuerdo a pautas establecidas al respecto». El decreto no define esas pautas. Las pautas llegan recién con el protocolo de 2017.',
      'Hay una tensión entre los dos instrumentos, y conviene verla. El que obliga sigue hasta los seis meses. El que paga se corta a los 30 días.',
      'La duda no es normativa: es de cumplimiento. Y el cumplimiento no se publica.',
    ],
    normaNota: 'Escribimos «Ordenanza Ministerial 384/017» sin fecha propia. El número está confirmado por tres fuentes del MSP. La fecha no: el PDF de la ordenanza es un escaneo sin capa de texto.',
    relojesNota: 'Dos relojes distintos usan el mismo número. El Decreto 305/011 manda que el Comité de Recepción reciba a la persona con intento de autoeliminación antes de las 48 horas, y ése es el plazo de entrada a la prestación. La meta asistencial corre después del egreso hospitalario, y su instructivo dice «2 días».',

    /* 8 · LO QUE EL CORPUS VE */
    corpusTag: 'La medición',
    corpusTitle: 'Todo lo que el corpus nombra como salud mental cabe en siete centésimas del uno por ciento',
    corpus: [
      'Este sitio mide el registro de Compras Estatales. El 18 de agosto de 2026, a las 20:06 UTC, el corpus tenía 2.186.313 registros agrupados en 1.639.754 compras, por 1.674.533.194.737,58 pesos corrientes.',
      'La regla de monto es una sola y corre en el numerador y en el denominador: una compra vale el máximo de su monto normalizado entre todos sus registros, con tope de 50.000 millones. Quince compras caen por ese tope y son artefactos de suma global.',
      'Con esa regla, las compras cuyo texto nombra algún término de salud mental están entre 2.092 y 2.198, y entre 1.133.918.333,96 y 1.208.259.462,09 pesos. Eso es entre 0,0677% y 0,0722% del gasto del corpus.',
      'El rango no es un adorno. El descarte de falso positivo se aplicó a un solo token, y el ruido restante está medido. El piso descuenta los dos focos más grandes. Los otros tres no se descuentan, porque su solapamiento con el resto no se midió.',
      'Casi cuatro de cada diez compras del léxico no traen monto: son 833 de 2.198. Cero en el corpus no prueba que no se adjudicara.',
      'El porcentaje mide presencia del término en el texto de la compra, no destino del gasto. Y el corpus no ve el grueso del gasto público en salud mental: los sueldos de ASSE, las prestaciones obligatorias del sistema y los presupuestos de los establecimientos no pasan por una compra.',
    ],
    ruidoCols: { key: 'Foco de ruido', ocids: 'Compras', uyu: 'Pesos corrientes', que: 'Qué es en realidad' },
    ruidoLabels: {
      centroDiurno: '«centro diurno» sin contexto de salud mental — frutas y verduras del INDA, limpieza de hogar de ancianos, reparación de fachada',
      lineaVida: '«línea vida» — equipo anticaída: arnés, absorbedor de impacto, casco',
      adiccional: '«adiccional», error de tipeo por «adicional» — adicionales de obra',
      siliconaAdiccion: '«SILICONA DE ADICCIÓN» — material dental',
      trabajadorSocial: '«trabajador social» sin contexto de salud mental — equipos de titulación del PIAI, agencias de empleo del BPS',
    },
    familiasTitulo: 'Las familias del léxico, una por una',
    familiasCols: { key: 'Familia', ocids: 'Compras', uyu: 'Pesos corrientes', cond: 'Condición' },
    familiasLabels: {
      profesionales: 'Profesionales — psiquiatr, psicólog, psicoterap, trabajador social',
      adicciones: 'Adicciones',
      residencial: 'Residencial — hogares e internación psiquiátrica',
      psicofarmaco: 'Psicofármaco, como palabra del texto de la compra',
      prevencion: 'Prevención y posvención, junto a suicidio',
    },
    familiasCondiciones: {
      trabajadorSocial: '10 compras y 8.778.692,34 pesos entran por «trabajador social» sin contexto de salud mental',
      tipeo: '8 compras y 10.896.024 pesos son el error de tipeo «adiccional» y material dental',
      expresionNueva: 'La expresión es más ancha que la anterior, que daba 192 compras y 219.343.216 pesos',
      recetarios: 'Casi todo es impresión de recetarios',
    },
    familiaCrisis: 'La familia «crisis» no tiene cifra publicable. Dos mediciones de la misma familia difieren en tres compras que la expresión nueva no encuentra, y no se sabe qué token las trae. Hasta identificarlas, esa familia no lleva número.',
    saludMentalTitulo: 'Y «salud mental» viene con un par obligatorio',
    saludMental: [
      'La familia «salud mental» da 167 compras y 275.293.598,29 pesos. O 165 compras y 196.963.696,66 pesos, según cómo se cuenten tres registros del INAU.',
      'Los tres traen el mismo monto hasta la milésima, las mismas seis adjudicaciones, los mismos seis proveedores y los mismos once renglones con los mismos precios unitarios. Son el 42,7% del total. Uno es de 2019 y los otros dos, de 2023.',
      'Si los tres son una sola compra, el total queda por debajo de lo que este sitio ya publica. Por eso la corrección no se enuncia como corrección al alza. Hasta resolver la duplicación con el expediente del INAU, van las dos cifras.',
    ],
    tokensCeroTitulo: 'Diez tokens que dan cero compras en todo el corpus',
    tokensCeroNota: 'Cero en el corpus no prueba que el servicio no exista. Prueba que no se compra con ese nombre por la vía de Compras Estatales.',
    asseTitulo: 'ASSE no movió la aguja en once años',
    asse: [
      'ASSE registra 315.781 compras entre 2006 y 2026. De ésas, 251.585 traen monto y suman 60.878.337.504 pesos corrientes. Sólo 622 registros tocan el léxico de salud mental, por 376.682.728 pesos: el 0,619% de su gasto.',
      'La fracción tampoco se movió por tramos. En 2015-2019 fue 0,702%. En 2021-2025 fue 0,686%. En los once años 2015-2025 fue 0,684%.',
      'Lo que sí creció es la cantidad de compras: 12 en 2015 y 111 en 2025. Pero las compras totales de ASSE crecieron igual, de 6.914 a 38.612. La proporción pasó de 0,174% a 0,288%.',
    ],
    mspTitulo: 'Y casi nueve de cada diez pesos que el MSP nombra como salud mental son papel',
    msp: [
      'El MSP registra 38 compras que tocan el léxico de salud mental, por 107.569.225 pesos. De esa plata, 93.920.967 pesos en 13 compras son la impresión de recetarios para prescribir psicofármacos y estupefacientes. Es el 87,3%.',
      'Esto no dice que el MSP invierta poco en salud mental. El MSP regula y fiscaliza, y su gasto asistencial está en ASSE desde 2008. Dice cuánto de lo que el MSP nombra salud mental pasa por una compra pública, y que casi todo eso es papel de control.',
    ],
    proveedoresTitulo: 'Quién le vende al Estado en salud mental',
    proveedores: [
      'Las compras del léxico que traen identificador de proveedor son 1.368, por 1.206.655.554 pesos, repartidas entre 600 proveedores. Los cinco primeros se llevan el 38,64%. Los cincuenta primeros, el 88,98%.',
      'El léxico mezcla cuatro cosas distintas: atención clínica, atención psicosocial por violencia de género, imprenta de recetarios y obra edilicia. La concentración se lee sobre esa mezcla.',
      'Reagrupado por inciso y no por unidad ejecutora, ASSE dirige 405.111.335 pesos en 724 compras y la Intendencia de Montevideo 242.185.411 en 92. La Intendencia es la unidad ejecutora que más compra. ASSE es el organismo que más compra, 1,67 veces más.',
      'Una trampa decide el ranking. El corpus escribe el identificador de proveedor con barra y sin barra. Sin normalizar, el primer proveedor se parte en dos y no queda primero. La trampa afecta a 44 de los 600.',
    ],
    proveedoresCols: { name: 'Proveedor', uyu: 'Pesos corrientes', ocids: 'Compras', que: 'Qué vende' },
    proveedoresQue: {
      alsara: 'Internación psiquiátrica, donde el corpus dice qué se compró',
      hospitalarias: '«Servicio de hogar para pacientes psiquiátricos»',
      garino: 'Imprime los recetarios del MSP. No es atención',
      hogarItaliano: '«Servicio de hogar para pacientes psiquiátricos»',
      mujerSociedad: 'Atención psicosocial a mujeres en situación de violencia, para la Intendencia de Montevideo',
    },
    corpusFecha: 'Toda cifra del corpus lleva su fecha y su hora. Entre dos corridas de esta misma sesión, separadas por dieciséis minutos, entraron 63 registros y 21 compras, y el denominador subió 99.793.129,57 pesos. Las cifras por comprador y por proveedor salen de la corrida anterior, con 2.186.129 registros y 1.639.674 compras.',

    psicoTag: 'Otra unidad',
    psicoTitle: 'Los psicofármacos, medidos renglón por renglón',
    psicoAviso: 'Advertencia de unidad, y es vinculante. Este monto se mide como cantidad por precio unitario de línea, no con el monto normalizado que usa todo el resto del sitio. Es la única forma de medir por molécula. No se compara con ninguna otra cifra en pesos de este sitio y no se divide por el denominador del corpus.',
    psico: [
      'El gasto en psicofármacos adjudicados entre 2002 y 2026 es 348.131.404 pesos corrientes, en 4.142 compras y 6.826 líneas. El descarte de falso positivo saca 1.704 líneas y 51.988.860 pesos, el 12,99% del bruto: reactivos, calibradores, controles, estándares analíticos, electrodos, herramienta y pilas.',
      'Ese descarte es asimétrico. Va de 57,3% en el litio a cero en trece moléculas. Por eso un filtro aplicado a una sola molécula rompe cualquier ranking, y por eso no hay una primera molécula publicable: aripiprazol y valproato quedan a 0,66% uno del otro, y sertralina y escitalopram a 0,10%.',
      'Por grupo, los antipsicóticos son 144.118.808 pesos y los antidepresivos 53.812.163. Son 2,68 veces.',
      'El registro está muy concentrado. Una sola licitación, la Pública 1007/2007, mueve entre el 64,43% y el 76,95% de los comprimidos, según cómo se cuenten. En dinero es el 27,75% del total, y ese porcentaje sí usa una sola regla.',
      'Al otro extremo, en 2025 hay 730 compras de 40 organismos distintos, con una mediana de 27.339 pesos. En 24 años, 140 compradores distintos compraron psicofármacos por su cuenta.',
      'No hay relación establecible entre esta serie y la tasa de suicidio. La serie mide cobertura del registro de compras, no consumo del país. El canal central de compra es invisible en montos. Y aunque las dos curvas coincidieran, la coincidencia no sería causa.',
    ],
    psicoGruposCols: { key: 'Grupo', uyu: 'Pesos corrientes' },
    psicoGruposLabels: {
      antipsicoticos: 'Antipsicóticos',
      estabilizadores: 'Estabilizadores del ánimo',
      ansioliticos: 'Ansiolíticos',
      antidepresivos: 'Antidepresivos',
    },
    psicoNota: 'Los 792.946.097 pesos de agosto de 2026 son un piso: doce líneas no deflactan por falta de Unidad Indexada de su mes. Los 174.137.966 comprimidos también son un piso: 33,6 millones de unidades traen la etiqueta genérica «UNIDAD» y no se pueden separar.',

    /* 9 · DOS LÍNEAS EN 24 AÑOS */
    lineasTag: 'Las dos líneas',
    lineasTitle: 'Dos compras de línea de respuesta en veinticuatro años',
    lineas: [
      'En 1.639.754 compras, el Estado registra dos contrataciones de una línea de respuesta a la conducta suicida.',
      'La primera es de la Dirección Nacional de Sanidad Policial. Se llamó en 2015 y se adjudicó en marzo de 2016 a Último Recurso, por 4.540.800 pesos corrientes. El objeto del llamado es «un servicio de respuesta de prevención y postvención de suicidio».',
      'La segunda es de ASSE. Es la Licitación Pública 22/2024, «Servicio de Linea de Apoyo Emocional 0800 1920», por 770.273 pesos. Una es seis veces la otra.',
      'La compra de 2016 casi no aparece, y ahí está la trampa de método. Su renglón dice «ARRENDAMIENTO DE LINEA TELEFONICA». El token «línea telefónica» devuelve 143 compras: 142 son reparación, traslado y arrendamiento de teléfonos. La 143 es ésta, y hay que rescatarla a mano.',
      'La Línea Vida no aparece en el registro. El token «0800 0767» da cero compras. Cero en el corpus no prueba que el servicio no exista: prueba que no se compra por esa vía. Un servicio prestado por funcionarios presupuestados no genera ninguna compra.',
    ],
    lineasCols: { year: 'Año', buyer: 'Organismo', supplier: 'Adjudicatario', uyu: 'Adjudicado' },
    lineasLabels: {
      sanidad2016: 'Servicio de respuesta de prevención y postvención de suicidio: línea telefónica, 24 meses',
      asse2024: 'Servicio de Línea de Apoyo Emocional 0800 1920 (Call Center / Contact Center)',
    },
    lineasSinAdj: 'sin adjudicatario en el registro',

    /* 10 · EL OTRO NÚMERO: LOS INTENTOS */
    intentosTag: 'El otro número',
    intentosTitle: 'La serie de intentos empieza en 2023, y cambia de unidad en 2025',
    intentos: [
      'La notificación del intento de autoeliminación es obligatoria desde diciembre de 2012. El MSP nunca publicó la serie anual de la ficha de papel. El registro digital obligatorio en puertas de emergencia arranca en octubre de 2022, así que el primer año calendario completo es 2023.',
      'Lo que existe no es una serie: es un cuadro de mediciones con unidades distintas. Por eso va como cuadro y no como línea.',
      'Dos trampas de unidad lo gobiernan. La primera: un episodio es un intento de autoeliminación registrado, y una persona puede tener varios. En 2025 el MSP publicó las dos unidades juntas por primera vez: 6.140 episodios de 5.144 personas, o sea 1,19 episodios por persona.',
      'La segunda: la base poblacional. Los denominadores implícitos de 2023 y 2024 rondan los 3,57 millones. El de 2025 es 3,49 millones. El MSP cambió de cosecha de proyecciones entre un año y otro, y la base cae 2,57%.',
      'La consecuencia es concreta. La tasa de 2024 y la de 2025 no se comparan. Cambia la unidad, de episodios a personas, y cambia la base.',
      'El propio MSP avisó sobre la calidad de su serie. Sobre el salto de 2024 escribió: «Este incremento podría estar vinculado a mejoras en los sistemas de registro, y no necesariamente a un aumento real de casos». Esa frase, sola, impide leer la serie como tendencia epidemiológica.',
      'La Estrategia 2021-2025 reconoce por escrito «el subregistro de IAE a nivel de los prestadores de salud». No lo cuantifica. No hay ninguna estimación oficial de cuánto falta.',
      'Y hay dos aperturas que el MSP no publica en ningún año: el intento de autoeliminación por departamento, y el conteo por tramo de edad de 2024 y 2025.',
    ],
    intentosCols: { periodo: 'Período', value: 'Valor', unidad: 'Unidad', source: 'Fuente', esAnio: '¿Es un año?' },
    intentosUnidades: {
      casos: 'casos, como los escribe la fuente',
      registros: 'registros del sistema; la unidad no está establecida',
      intentos: 'intentos, según la única fuente que lo publica',
      episodios: 'episodios',
      personas: 'personas',
      tasaEpisodios: 'tasa cada 100.000, sobre episodios',
      tasaPersonas: 'tasa cada 100.000, sobre personas',
    },
    intentosFuentes: {
      msp: 'MSP, publicación oficial',
      prensa: 'prensa, citada como prensa',
      prensaMsp: 'prensa citando al MSP; el MSP no publicó esta cifra',
    },
    intentosSinConteo: 'el MSP publicó sólo la tasa',
    intentosNota: 'El conteo de 4.723 para 2023 tiene una sola fuente, y es una columna de opinión que atribuye la cifra al MSP sin citar documento. La tasa de 147,56 para 2025 tampoco la publicó el MSP: la publicó El Observador citándolo. Lo único de 2025 con sello directo del MSP son los 6.140 episodios y las 5.144 personas.',
    intentosPrensa: 'La prensa informó que los intentos de autoeliminación aumentaron en 436 casos respecto de 2024. Ese número no aparece en ningún documento del MSP y la prensa no declara su unidad. Por episodios, la derivación da 352.',
    sexoTitulo: 'Desglose por sexo, sólo donde existe',
    sexoCols: { year: 'Año', mujeres: 'Mujeres', varones: 'Varones', unidad: 'Unidad' },
    sexoNota: 'Los dos chequeos internos de 2025 cierran: 3.685 más 1.459 dan 5.144 personas, y 4.426 más 1.714 dan 6.140 episodios.',
    comparableTitulo: 'Qué se puede comparar con qué',
    comparableCols: { key: 'Comparación', vale: '¿Vale?', why: 'Por qué' },
    comparableLabels: {
      tasa2023vs2024: 'Tasa de 2023 contra tasa de 2024',
      tasa2024vs2025: 'Tasa de 2024 contra tasa de 2025',
      conteo2024vs2025: 'Conteo de 2024 contra conteo de 2025',
      contra2022: 'Cualquiera de 2023, 2024 o 2025 contra 2022 o antes',
      tramo9meses: 'El tramo de nueve meses contra un año',
      froVsDigital: 'Ficha de papel de 2021 contra el registro digital',
      emse: 'Encuesta escolar de 2012 contra la de 2019',
      egresos: 'Egresos hospitalarios de 2018 a 2021 entre sí',
      iaeVsMortalidad: 'Cualquier serie de intentos contra la tasa de mortalidad',
    },
    comparableWhy: {
      tasa2023vs2024: 'Misma cosecha de proyecciones y misma presentación del MSP. La reserva: la unidad de 2023 descansa en una columna de opinión.',
      tasa2024vs2025: 'Cambia la unidad, de episodios a personas, y cambia la base poblacional en 2,57%.',
      conteo2024vs2025: 'El conteo de 2024 no está publicado.',
      contra2022: 'El registro digital arranca en octubre de 2022.',
      tramo9meses: 'Nueve meses no se comparan con doce, y la unidad del tramo no está establecida.',
      froVsDigital: 'La ficha de papel cubre sólo de 10 a 24 años, es otra captura y son sólo las fichas completadas.',
      emse: 'Misma encuesta, misma población, misma pregunta. No se compara con ninguna tasa del MSP.',
      egresos: 'Misma fuente y misma definición. No se comparan con los 4.723 ni con los 6.140.',
      iaeVsMortalidad: 'Son dos sistemas de captura distintos. Ninguna coincidencia sería causa.',
    },
    comparableVale: { si: 'Sí', siReserva: 'Sí, con reserva', no: 'No' },
    paralelasTitulo: 'Tres mediciones paralelas, que son otra cosa',
    paralelas: [
      'La ficha de papel de 2021 es el único dato pre-digital que el MSP publicó. Cubre sólo de 10 a 24 años y registró 1.171 casos. Sus dos chequeos internos cierran.',
      'La encuesta escolar EMSE pregunta a estudiantes de 13 a 17 años si tuvieron un intento de autoeliminación en los últimos doce meses. Es la única fuente con dos puntos comparables entre sí: 9,2% en 2012 y 12% en 2019.',
      'Los egresos hospitalarios son otra unidad todavía. Cuentan internaciones con código secundario CIE-10 X60-X84, no consultas en puerta de emergencia. Suman 8.554 entre 2018 y 2021.',
    ],
    froCols: { key: 'Corte', value: 'Casos' },
    froLabels: {
      total: 'Total de 10 a 24 años',
      e1014: 'De 10 a 14 años',
      e1519: 'De 15 a 19 años',
      e2024: 'De 20 a 24 años',
      mujeres: 'Mujeres',
      varones: 'Varones',
      sinDatoConsulta: 'Sin dato de consulta previa en salud mental',
    },
    emseTitulo: 'Encuesta escolar, estudiantes de 13 a 17 años',
    egresosTitulo: 'Egresos hospitalarios con código secundario CIE-10 X60-X84',
    estimacionNota: 'La única estimación oficial de magnitud aplica una razón internacional a la mortalidad local: la Estrategia 2021-2025 dice que los intentos de autoeliminación ocurren entre 10 y 20 veces más que los suicidios, y estima entre 7.000 y 14.000 personas alcanzadas. No es una medición uruguaya. Contra ese rango, las 5.144 personas registradas en 2025 quedan por debajo del piso.',
    reiteracionTitulo: 'La mitad de los intentos registrados los hicieron personas que ya habían intentado',
    reiteracion: [
      'De los 4.723 intentos de autoeliminación registrados en 2023, en 2.392 registros consta un antecedente previo. En el tramo de nueve meses la proporción fue 1.346 de 2.896.',
      'El estudio del MSP sobre suicidio adolescente trabajó sobre 149 certificados de defunción y 54 historias clínicas de personas de 19 años y menos. De esas 54 historias, 29 habían consultado en el sistema en los tres meses previos y 38 en los seis meses previos.',
      'El antecedente es autodeclarado en la ficha. Las 54 historias no se extrapolan al país. Y no se puede deslizar que el sistema las vio y no actuó: el dato es descriptivo y ninguna fuente afirma esa causa.',
    ],

    /* 11 · LA LEY QUE CAMBIÓ DENTRO DE UN PRESUPUESTO */
    leyTag: 'La ley',
    leyTitle: 'El cierre de los manicomios se corrió dentro de una ley de presupuesto',
    ley: [
      'El artículo 381 de la Ley 20.446, el Presupuesto Nacional 2025-2029, reescribió entero el artículo 38 de la Ley 19.529 de Salud Mental.',
      'Movió el plazo de cierre de los establecimientos asilares de 2025 a 2029. Borró la frase que prohibía internar personas en los establecimientos existentes. Y cambió dos referencias expresas a la Ley de Salud Mental.',
      'La ley se promulgó el 16 de diciembre de 2025 y se publicó el 8 de enero de 2026. El cambio rige desde el 1º de enero de 2026. La fe de erratas de marzo de 2026 sólo corrige el artículo siguiente y no toca nada de esto.',
      'La supresión no reabre por sí sola ningún establecimiento. Habilita el ingreso de personas a los que siguen abiertos.',
    ],
    art38Cols: { key: 'Qué cambió', antes: 'Texto de 2017', ahora: 'Texto vigente' },
    art38Labels: {
      plazo: 'El plazo de cierre',
      prohibicion: 'La prohibición de internar',
      estaLey: 'El alcance de la vigencia',
      reglamentacion: 'El mandato de reglamentar',
    },
    art38Suprimido: 'suprimido',
    inddhhTitulo: 'Lo que dijo la INDDHH',
    inddhhCita: 'Las modificaciones introducidas, al suprimir la prohibición expresa de internación en establecimientos asilares es una alteración estructural del sentido de la ley y del modelo de atención que ella estableció.',
    inddhhCita2: 'Es en ese mismo artículo que se extendió el plazo para el cierre de los establecimientos asilares y estructuras monovalentes hasta el año 2029. Sobre este último y único aspecto se desarrolló la exposición de la ministra de Salud Pública y la comunicación pública del Ministerio de Salud Pública a la ciudadanía.',
    inddhhNota: 'La caracterización sobre qué se comunicó es de la INDDHH y se reporta como posición de la INDDHH. No recuperamos la versión taquigráfica de la exposición ministerial.',
    cronogramaTitulo: 'El cronograma que la ley manda dictar desde 2017 no existe',
    cronograma: [
      'El artículo 38 manda al Poder Ejecutivo fijar el cronograma de cierre en la reglamentación. IMPO registra dos decretos reglamentarios de la Ley 19.529 en casi nueve años, y ninguno lo contiene.',
      'En los nueve artículos del Decreto 226/018 no aparecen las palabras «cronograma», «asilar», «monovalente», «desinstitucionalización», «comunitario» ni «plaza». Los seis conteos dan cero. El propio decreto declara su alcance parcial.',
      'El MSP lo confirma en 2026: «Se avanzará en la reglamentación de: […] Los artículos pendientes de la Ley de Salud Mental, comenzando por el 19, 33, 37 y 38». Los artículos 37 y 38 son los que ordenan la desinstitucionalización y el cierre.',
      '«Dos decretos» es lo que IMPO registra, no un censo cerrado: su buscador pide login. Y sin reglamentar no quiere decir sin aplicar. Quiere decir que el instrumento que la ley exige no se dictó.',
    ],
    contralorTitulo: 'El órgano que vigila el sistema depende del ministerio que vigila',
    contralor: [
      'La Comisión Nacional de Contralor de la Atención en Salud Mental es un organismo desconcentrado dependiente del MSP. Así la creó el artículo 39 de la Ley 19.529.',
      'Le debe un informe anual al MSP dentro de los primeros 120 días de cada año. Ninguna norma la obliga a publicarlo. El deber es hacia el Ministerio y no hacia el público.',
      'Tiene diez integrantes honorarios, quórum de siete y mandato de tres años. Entre el fin de su primer ejercicio y la toma de posesión de la comisión siguiente pasaron once meses.',
      'El único informe suyo que encontramos en línea lo aloja la Facultad de Psicología, no el MSP. El propio documento menciona memorias anuales presentadas al MSP que no están publicadas.',
      'Ese informe trae una medición del alcance real del sistema. Entre agosto y diciembre de 2022 el órgano recibió 224 notificaciones de hospitalización. Doscientas veinte vinieron de Montevideo y cuatro de todo el resto del país. Eso mide el sistema de notificación, no la ocurrencia de hospitalizaciones.',
    ],
    dispositivosTitulo: 'Las plazas asilares están medidas. Lo que las sustituye, no',
    dispositivos: [
      'El censo oficial de CEREMOS contó 443 usuarios en octubre de 2023: 276 en el sector Santín Carlos Rossi y 167 en el sector Etchepare. Cuenta usuarios, no camas, y no hay censo posterior.',
      'El Hospital Vilardebó figura con 300 camas en el informe de OPS de 2022. En hospitales generales de Montevideo hay dos salas de salud mental con 19 camas.',
      'Enfrente, el Estado no publica cuántos dispositivos comunitarios hay ni cuántas plazas tienen. La Estrategia 2025-2030 pone el diagnóstico como acción a ejecutar, con plazo 2025-2025 en su propia matriz. El documento se publicó en abril de 2026.',
      'La INDDHH agrega el otro extremo del problema. Al 31 de diciembre de 2024, 58 personas cumplían medidas de seguridad curativas en hospitales psiquiátricos, algunas con hasta 38 años de internación. Son medidas dispuestas por la Justicia, no el total de internados de larga estadía. El mismo informe dice que no hay registros nacionales que permitan seguirlas.',
      'CEREMOS no admite nuevos ingresos, por el artículo 38 de la Ley 19.529. Es el contrapeso directo del cambio que hizo el presupuesto. El informe cubre 2025 y se publicó en abril de 2026: no evalúa el efecto de la prórroga votada en diciembre de 2025.',
    ],

    /* 12 · RECURSOS HUMANOS */
    rrhhTag: 'Los recursos humanos',
    rrhhTitle: 'El dato existe, y no sirve para lo que hace falta',
    rrhhBloqueo: 'Frase de bloqueo, antes de cualquier cifra de esta sección. Circulan tres números de psiquiatras: 628 de 2026, 544 de 2020 y 550 de 2011. Son tres definiciones distintas. El primero cuenta títulos acumulados sin baja. El segundo cuenta personas que trabajan en el sector, según lo que el país le declaró a la OMS. El tercero es una declaración oral, y la fuente dice «550 profesionales», no «550 psiquiatras». No se comparan ni se restan.',
    rrhh: [
      'El registro de títulos habilitados del MSP, con corte al 31 de julio de 2026, lista 628 personas con título de psiquiatría y 183 con psiquiatría de niños y adolescentes. Sólo 8 personas tienen los dos títulos, así que la unión son 803.',
      'El mismo registro lista 14.616 psicólogos. Y lista 91 personas con un título de especialización en salud mental, de las que 77 son licenciados en enfermería y 14 auxiliares. Que el grupo sea de enfermería sale del cruce, no del rótulo del título.',
      'El registro no dice dónde trabaja ninguna de esas personas. No trae columna de departamento. Que no exista el dato territorial de psiquiatras es algo que no podemos afirmar: podemos afirmar que no lo encontramos en fuentes públicas.',
    ],
    controlTitulo: 'El control de calidad del método, que es un hallazgo en sí',
    control: [
      'El mismo registro lista 27.834 doctores en medicina habilitados. El indicador de la OMS da 45,51 médicos cada 10.000 habitantes para Uruguay en 2023, que sobre la población del Censo 2023 son unos 15.700 médicos en actividad.',
      'Son 1,8 títulos por médico que ejerce. El registro acumula títulos y no da de baja por fallecimiento, jubilación ni emigración. Es un techo, no un conteo de quien ejerce.',
      'La conversión de tasa a número absoluto es cuenta nuestra. La publicamos porque es el argumento que sostiene todo el control de calidad del método.',
    ],
    atlasTitulo: 'Lo que el país le declaró a la OMS',
    atlasCols: { key: 'Categoría', n: 'Personas', tasa: 'Cada 100.000' },
    atlasLabels: {
      psiquiatras: 'Psiquiatras',
      psiquiatrasNyA: 'Psiquiatras de niños y adolescentes',
      enfermeros: 'Enfermeros de salud mental',
      psicologos: 'Psicólogos',
      totalFicha: 'Total que imprime la ficha',
      totalCorregido: 'El mismo total, corregido',
    },
    atlasNota: 'La ficha imprime un total de 1.549 personas, o 44,7 cada 100.000, y ese total excluye a los 1.063 psicólogos que la propia ficha reporta. Corregida la suma da 2.612 personas, o 75,45 cada 100.000. Eso queda por encima de la mediana de los países de ingreso alto, que es 67,2. Las dos cifras no son comparables entre sí: la uruguaya es de 2020 y cubre tres categorías, la mediana es de 2024 y cubre siete. La tasa de 11,7 de psiquiatras de niños y adolescentes tiene una base que inferimos en población menor de 19 años, porque la ficha imprime «per 100 000 population» y la aritmética descarta la población total.',
    regionalTitulo: 'La escala regional, en pasado',
    regional: [
      'En 2016, el último año con dato comparable, Uruguay declaró 14,13 psiquiatras cada 100.000 habitantes. Argentina declaró 21,71 y Estados Unidos 10,54.',
      'Ese año Uruguay quedó segundo entre los 23 países de la región que reportaron, y noveno entre los 104 países del mundo con dato. No entre los 35 de la región ni entre los 194 Estados miembros.',
      'Las medianas del mismo indicador son 1,835 en las Américas y 1,231 en el mundo. El dato tiene diez años.',
    ],
    atlas2024Titulo: 'Y la OMS no fija ninguna cantidad recomendada',
    atlas2024: [
      'La OMS publica medianas, no metas. Ninguna de las ocho metas de su Plan de Acción Integral de Salud Mental es de dotación de personal.',
      'Las medianas de psiquiatras del Atlas 2024 son 1,5 en el mundo, 1,7 en las Américas, 7,0 en los países de ingreso alto y 9,9 en Europa. Compararlas contra el 15,7 uruguayo mezcla 2020 con 2024.',
      'La consecuencia importa: no existe un umbral oficial contra el cual medir a Uruguay. Eso cierra la puerta a cualquier cifra del tipo «la OMS recomienda tanto».',
      'La ficha de país de Uruguay del Atlas 2024 no está publicada. Uruguay respondió el cuestionario y figura en el anexo de contribuyentes. La dirección esperada devuelve 404, y la de 2020 responde. El último retrato completo del sistema uruguayo tiene datos de 2020.',
    ],
    territorioTitulo: 'El único mapa territorial es de 2014, y es de psicólogos',
    territorio: [
      'El 1er Censo Nacional en Psicología, de 2014, censó 7.543 psicólogos. Es el 77,1% del universo censal, no el total del país.',
      'De ésos, 5.488 residían en Montevideo y 2.055 en el interior. Montevideo tenía 240,4 habitantes por psicólogo y Artigas 2.530,3.',
      'El dato tiene doce años. Mide residencia declarada, no lugar de trabajo. Los habitantes salen del Censo de 2011. No hay censo posterior, y para psiquiatría no existe ningún equivalente.',
      'El otro dato territorial disponible es de médicos de todas las especialidades, de 2011: 78,8 cada 10.000 habitantes en Montevideo contra 21,7 en el interior. La raíz «psiquiatr» aparece cero veces en ese informe.',
    ],
    esperaTitulo: 'La lista de espera, en dos cifras que van separadas',
    espera: [
      'El gobierno informó que 30.000 usuarios esperaban una consulta de psiquiatría en ASSE al inicio del período de gobierno. Informó además una reducción del 15% en siete meses, a noviembre de 2025.',
      'Las dos cifras no van unidas. Los 30.000 se atribuyen a «los servicios de psiquiatría» de ASSE. El menos 15% se atribuye a «los servicios de salud mental del prestador público». El gobierno no dice que midan lo mismo, y el valor absoluto de noviembre de 2025 no está publicado.',
      'Hay un plazo máximo para una consulta de especialidad, de 30 días. Es un decreto, no una ley, y no nombra a la psiquiatría. Las metas de tiempos de espera que el gobierno se fijó son del sistema entero: ninguna es de salud mental.',
    ],
    estrategiaRrhhNota: 'La Estrategia 2025-2030 tiene 67 páginas y su Eje 5, el de recursos humanos, no trae ni una cifra de base ni una meta numérica. Por palabra exacta, «psiquiatra» aparece 2 veces y «psicólogos» 1; la raíz «enfermer» aparece 0 veces. Por raíz, «psiquiatr» da 10 y «psicolog» da 3.',
    llamadasNota: 'Las dos líneas de ayuda no se suman bajo un rótulo único. En 2023 la de apoyo emocional recibió 23.842 llamadas y la de prevención del suicidio atendió 5.129. «Recibió» y «atendió» son dos unidades distintas.',

    /* 13 · RECOMENDACIONES */
    recosTag: 'Lo que le recomiendan al país',
    recosTitle: 'Cincuenta y dos recomendaciones, y su estado en Uruguay',
    recosP: 'Cada fila trae el organismo que la escribió, su cita literal y el estado en Uruguay con la fuente de ese estado. El estado nunca es una opinión: es lo que otra fuente permite afirmar. Las citas de la OMS van en inglés, que es la edición que la OMS declara vinculante.',
    recosCols: { id: '#', org: 'Organismo', cita: 'Cita literal', estado: 'Estado en Uruguay', fuente: 'Fuente del estado' },
    orgLabels: {
      oms: 'Organización Mundial de la Salud',
      ops: 'Organización Panamericana de la Salud',
      msp: 'Ministerio de Salud Pública',
      inddhh: 'INDDHH',
      cncasm: 'Comisión Nacional de Contralor',
      asamblea: 'Asamblea Instituyente, anteproyecto 2015',
    },
    estadoLabels: {
      si: 'sí',
      siReserva: 'sí, con reserva',
      parcial: 'parcial',
      no: 'no',
      noVerificado: 'no verificado',
      norma: 'la norma existe; el cumplimiento no se publica',
      anunciado: 'anunciado',
      ocurrio: 'ocurrió lo advertido',
      participa: 'participa',
      noAplica: 'no aplica todavía',
    },
    recosRemate: 'El remate de la tabla es R5. La OMS pide un presupuesto etiquetado que se asigne todos los años para prevención del suicidio. En Uruguay el estado es NO, y la prueba es el conteo con el que abre esta pieza.',
    recos: {
      R1: 'Es el objetivo 6 de la Estrategia Nacional 2021-2025, escrito como «restringir el acceso a medios letales». El corpus no registra ninguna compra atada a ese objetivo.',
      R2: 'Tres fuentes uruguayas, y ninguna es una norma de cobertura exigible: la Ley 18.097 art. 4 («según sus posibilidades»), la presentación del material de la OMS en 2015, y el eje 7 de la Estrategia 2025-2030 como resultado esperado. La actualiza R30.',
      R3: 'Las dos guías del MSP de octubre de 2023. Una guía no es un programa curricular: la evidencia que respalda esta intervención viene de un programa con dosis definida e instructor entrenado.',
      R4: 'Existe la meta asistencial 2024-2025 de seguimiento después del alta. Queda en tensión con la Ordenanza Ministerial 384/017, que exige seguimiento activo por seis meses: el instrumento que paga se corta a los 30 días.',
      R5: 'Cero menciones de «suicidio» en siete leyes de presupuesto y rendición de cuentas, 2020-2025, sobre el texto articulado.',
      R6: 'La serie oficial va de 20,55 en 2019 a 19,16 en 2025, con máximo de 23,20 en 2022. No verificamos cuál es el año base que Uruguay usa para el tercio.',
      R7: 'Uruguay tiene la Ley 19.529 desde 2017. La reserva: la Ley 20.446 art. 381 le sacó la prohibición de internar en asilos, y la INDDHH lo llamó «una alteración estructural del sentido de la ley».',
      R8: 'Es una recomendación de la Guía de Práctica Clínica de 2024, escrita fuera del bloque de la Ordenanza Ministerial 384/017. Coincide con el hito de 2 días de la meta asistencial. No hay dato público de cumplimiento.',
      R9: 'Es obligación de la Ordenanza Ministerial 384/017, de 2017. Siete años antes de la guía clínica, y por ordenanza ministerial. No hay dato público de cumplimiento.',
      R10: 'No existe partida presupuestal para la Comisión Nacional Honoraria de Prevención del Suicidio. La Ley 20.446 no la nombra. Su decreto fundacional de 2004 tampoco: cero apariciones de cinco raíces de gasto, y una sola modificación en veintidós años, que agrega un delegado.',
      R11: 'No existe partida. El órgano estuvo once meses entre el fin de un ejercicio y la toma de posesión del siguiente, y publicó un solo documento en línea.',
      R12: 'El indicador que la propia estrategia se puso es «Estrategia 2026-2030 aprobada por resolución ministerial (Sí/No)». No consta aprobada al 18 de agosto de 2026.',
      R13: 'El indicador es «Plan nacional de desinstitucionalización aprobado y en ejecución». El plazo de la matriz es 2025-2027, a cargo de dos ámbitos que el órgano de contralor describió como inactivos.',
      R14: 'La matriz de plazos lo fija 2025-2025. Ya estaba vencido cuando el documento se publicó, en abril de 2026.',
      R15: 'El indicador es «Tasa de recurrencia de intentos de autoeliminación entre personas con antecedentes previos». No hay línea base publicada.',
      R16: 'Dos decretos reglamentarios en casi nueve años, y ninguno de esos cuatro artículos.',
      R17: 'El artículo 38 lo manda desde 2017. No existe.',
      R18: 'Línea base 0 y meta acumulada 4 para 2029, en el Tomo II del Presupuesto 2025-2029.',
      R19: 'Es la norma que crea el registro digital de octubre de 2022. Deja sin efecto el numeral 2º de la Ordenanza 801/012, que era la ficha de papel. La ordenanza es del 28/09/2022 y manda comunicar responsables antes del 10 de octubre de 2022: son la firma y la puesta en marcha, dos fechas que miden cosas distintas.',
      R20: 'No encontramos ninguna sanción aplicada. El subregistro sigue reconocido por el propio MSP.',
      R21: 'No consta ninguna norma que revierta el artículo 381 al 18 de agosto de 2026.',
      R22: 'No recuperamos la versión taquigráfica de la exposición ministerial.',
      R23: 'El plazo se corrió a 2029 en diciembre de 2025, dentro de la ley de presupuesto.',
      R24: 'El Estado no publica cuántos dispositivos de transición existen.',
      R25: 'El artículo 39 de la Ley 19.529 lo creó como organismo desconcentrado dependiente del MSP, no como órgano independiente del Poder Legislativo.',
      R26: 'La ley fijó 2025 y el presupuesto de 2025 lo movió a 2029.',
      R27: 'Cinco de los diez elementos de LIVE LIFE tienen objetivo espejo en la Estrategia 2021-2025. Dos fundamentos no lo tienen: el análisis de situación y el financiamiento. El mapeo es lectura nuestra: «LIVE LIFE» aparece cero veces en la estrategia uruguaya, que nombra otro marco.',
      R28: 'La medida no existe todavía en Uruguay. Es la objeción estándar a R1, y la OMS la responde por escrito. «No inevitablemente» no es «nunca».',
      R29: 'El MSP tiene el desglose en sus publicaciones. No consta que lo use como insumo declarado del objetivo 6. Esta fila no traslada ningún desglose: dice que la política debe mirar ese dato, no cuál es.',
      R30: 'Las mismas tres fuentes de R2. Ninguna es una norma de cobertura exigible.',
      R31: 'No consta ningún mecanismo de reproche por cobertura, ni del MSP ni de un órgano de prensa. La guía no cuantifica el efecto de la medida austríaca sobre la tasa.',
      R32: 'Está dentro de un recuadro de caso país, no en el cuerpo normativo de la guía.',
      R33: 'El MSP publicó en 2023 una guía para instituciones educativas y otra para el primer nivel de atención.',
      R34: 'Las dos guías del MSP de 2023. Una guía no es un programa curricular. No verificamos que exista en Uruguay un programa con dosis definida e instructor entrenado dictado a escala.',
      R35: 'Es lo único que el corpus de compras ve: dos compras de línea de respuesta al suicidio en veinticuatro años. Las líneas de crisis no son una de las cuatro intervenciones de LIVE LIFE, y que no lo sean no significa que la OMS las desaconseje.',
      R36: 'El MSP publica tasas por sexo para 2024 y 2025. No publica el intento de autoeliminación por departamento en ningún año. Para 2024 y 2025 describe la concentración por edad sin cifras.',
      R37: 'Ley 19.979, promulgada el 20/08/2021. Su artículo 3 designa MSP, MIDES, MEC, INAU e INJU. La ley no asigna presupuesto propio y deja a las autoridades definir contenidos y periodicidad.',
      R38: 'Ley 18.097, artículo 3, desde 2007. La ley no fija plazos, cobertura mínima ni presupuesto. No encontramos publicado qué porcentaje del personal está capacitado, casi veinte años después.',
      R39: 'Uruguay expuso su registro de intentos de autoeliminación en el lanzamiento regional del 10/09/2025. La iniciativa no compromete ningún monto.',
      R40: 'No hay ningún porcentaje publicado de cumplimiento por prestador.',
      R41: 'Guía de Práctica Clínica 2024, dentro del bloque de la Ordenanza Ministerial 384/017. El cumplimiento no se publica.',
      R42: 'El indicador de la propia estrategia es «Protocolo elaborado y aprobado», a cargo del Ministerio del Interior. No se puede afirmar que el protocolo no exista. Se puede afirmar que no es público.',
      R43: 'El MSP la volvió a anunciar como trabajo futuro el 17/07/2025, casi con las mismas palabras que en 2021. La Estrategia de Salud Mental de noviembre de 2025 no contiene la expresión «zonas de riesgo» ni una vez en sus 67 páginas.',
      R44: 'El indicador que la estrategia se puso es «Control del acceso», sin línea base ni meta. No encontramos resultado publicado.',
      R45: 'Es el único instrumento de restricción de acceso que ya existe. Es previo a la estrategia y no nació como prevención del suicidio. La estrategia no pedía crear el requisito, sino estandarizar cómo se hace la evaluación. El requisito vive en el artículo 18, numeral 5, del Decreto 345/020.',
      R46: 'El indicador está definido: «Porcentaje de puertas de emergencia que registran IAE a través de SIVISA». Su valor no se publica. La estrategia no crea la obligación: la reafirma. Rige desde la Ordenanza 1323/022.',
      R47: 'El decreto delega el contenido a pautas que no define. Esas pautas llegan con el protocolo de 2017.',
      R48: 'El MSP declaró en 2025 no disponer del registro centralizado con el desagregado pedido, y denegó el pedido de acceso.',
      R49: 'Estas 48 horas no son las 48 horas de la meta asistencial. Éstas corren hacia el Comité de Recepción, que es la puerta de entrada a la prestación. Las de la meta corren después del egreso hospitalario.',
      R50: 'El resto de los usuarios espera seis meses tras un abandono y dos años tras terminar un tratamiento. A la población con intento de autoeliminación la norma no le pone traba de reingreso.',
      R51: 'El documento no reconoce: anuncia. Quince años después del decreto, ese análisis figura como acción futura. Que hoy no esté analizada es una inferencia del futuro verbal. Los errores de tipeo son del original.',
      R52: 'El mismo texto propone como indicador «Porcentaje de casos de IAE en cada prestador del SNIS que cumplen con el Protocolo». Es un indicador a construir: hoy no está publicado.',
    },

    /* 14 · PEDIDOS DE DATOS */
    pedidosTag: 'Lo que pedimos',
    pedidosTitle: 'Cuarenta y seis datos que faltan',
    pedidosP: 'Esto es un pedido nuestro, y es un pedido de datos. No pedimos política sanitaria. Pedimos que se publique lo que ya se mide, para que la gestión de estos recursos se pueda auditar desde afuera. Cada fila nombra el organismo y el hueco exacto.',
    pedidosCols: { id: '#', q: 'Pedido', organismo: 'Organismo', why: 'Por qué falta hoy' },
    bloqueLabels: {
      intentos: 'La serie de intentos de autoeliminación',
      plata: 'Plata',
      camas: 'Camas, dispositivos y cierre',
      rrhh: 'Recursos humanos y cumplimiento',
      compras: 'El registro de compras, que es donde este sitio vive',
      prestaciones: 'Prestaciones y meta asistencial',
      estrategia: 'Cumplimiento de la estrategia vencida',
      internacional: 'Comparación internacional',
    },
    pedidos: {
      P1: { q: 'La serie anual desde 2023, con la unidad declarada en cada fila: episodios y personas por separado', why: '2023 y 2024 se publican en una unidad y 2025 en otra, sin decirlo' },
      P2: { q: 'El conteo crudo de 2024. Hoy sólo existe la tasa', why: 'El conteo nunca se publicó; hay que derivarlo en tercer orden' },
      P3: { q: 'El denominador poblacional de cada tasa, año por año, con la cosecha de proyecciones que se usó', why: 'Los denominadores implícitos de 2023 y 2024 exceden al Censo 2023 y al máximo del INE' },
      P4: { q: 'Los intentos de autoeliminación por departamento, por año', why: 'Nunca se publicaron. Lo único territorial que circula viene de otro sistema de captura' },
      P5: { q: 'Los intentos de autoeliminación por tramo de edad, en conteo y en tasa, para 2024 y 2025', why: 'Sólo se publica una descripción cualitativa' },
      P6: { q: 'La serie anual de la ficha de papel 2013-2022, si existe en algún archivo', why: 'La notificación es obligatoria desde diciembre de 2012 y la serie nunca se publicó' },
      P7: { q: 'Un dataset en el catálogo nacional de datos abiertos', why: 'Las búsquedas por «autoeliminación» y por «IAE» devuelven cero resultados' },
      P8: { q: 'La tasa de recurrencia, que la propia Estrategia pone como indicador', why: 'No hay línea base publicada' },
      P9: { q: 'La ejecución de cada partida de salud mental, por línea y por año, no sólo el crédito asignado', why: 'La ejecución se publica por inciso y programa, y el programa contiene toda la asistencia' },
      P10: { q: 'La apertura de salud mental en las Cuentas Nacionales de Salud', why: '22 páginas y cero menciones en el boletín de 2024' },
      P11: { q: 'Reportar el gasto en salud mental a la OMS', why: 'Dos Atlas seguidos con las casillas de financiamiento vacías' },
      P12: { q: 'El desglose del gasto de ASSE por área asistencial, para poder separar salud mental', why: 'El gasto total de ASSE se publica sin abrir' },
      P13: { q: 'La apertura de los 60.000.000 del artículo 508 entre patología urológica y salud mental', why: 'La ley da un destino doble sin desagregar' },
      P14: { q: 'El costo anual de operar las dos líneas de ayuda', why: 'No aparece ni en la ley, ni en el registro de compras, ni en la web de ASSE' },
      P15: { q: 'La serie anual de llamadas de las dos líneas', why: 'Sólo hay prensa de abril de 2024, con datos de 2023 y del primer trimestre de 2024' },
      P16: { q: 'El cronograma de cierre de establecimientos asilares y monovalentes', why: 'El artículo 38 lo manda desde 2017 y no está en ninguno de los dos decretos reglamentarios' },
      P17: { q: 'El padrón de dispositivos comunitarios: cuántos, dónde, cuántas plazas, qué prestador', why: 'La propia Estrategia pone «hacer el diagnóstico» como meta, y esa meta venció en 2025' },
      P18: { q: 'Un censo actualizado de CEREMOS', why: 'El último público es de octubre de 2023' },
      P19: { q: 'La serie anual de camas psiquiátricas por prestador, público y privado', why: 'La única fuente con detalle es un informe de consultoría de 2022, que se contradice a sí mismo' },
      P20: { q: 'Los informes anuales de la Comisión Nacional de Contralor, que el decreto le exige presentar', why: 'El deber es hacia el Ministerio, no hacia el público. Un solo documento en línea' },
      P21: { q: 'Psiquiatras y psicólogos en ejercicio, por departamento y por prestador', why: 'El registro de títulos acumula y no da de baja. Lista 27.834 doctores en medicina habilitados' },
      P22: { q: 'La lista de espera de psiquiatría de ASSE en valor absoluto, por mes y por unidad', why: 'Se publicó una reducción del 15% sin el absoluto de referencia' },
      P23: { q: 'El porcentaje de cumplimiento de la meta asistencial de seguimiento, por prestador', why: 'La Estrategia lo pone como indicador a construir' },
      P24: { q: 'El porcentaje de puertas de emergencia que registran el intento de autoeliminación, que es indicador de la propia Estrategia', why: 'No publicado' },
      P25: { q: 'El monto con impuestos en el feed, o el campo de impuesto por separado', why: 'El feed publica el monto sin impuestos y el portal muestra el monto con impuestos' },
      P26: { q: 'El comprador de las compras centrales de medicamentos', why: 'Las licitaciones centrales de 2005-2008 vienen sin comprador' },
      P27: { q: 'La adjudicación itemizada del canal central de sedativos, hoy en un adjunto fuera del feed', why: 'La licitación figura con un ítem de cantidad 1 y sin adjudicación' },
      P28: { q: 'Corregir los artefactos de suma global por debajo del techo de 50.000 millones', why: 'Un registro de 2020 vale 646.289.368 en el corpus y 788.473.028,96 en el portal. Los dos están inflados' },
      P29: { q: 'La lista de oferentes de cada llamado en el feed', why: 'Sólo 28 de 1.368 compras del léxico traen ese dato. No se puede medir competencia' },
      P30: { q: 'Resolver los registros duplicados: tres compras del INAU con el mismo monto al milésimo y los mismos seis adjudicatarios', why: 'Si una sola es real, el doble conteo llega a 78.329.902 pesos' },
      P31: { q: 'El cumplimiento de la meta de seguimiento desagregado por los cuatro hitos', why: 'El instructivo mide los cuatro hitos por separado. Un cumplimiento global no dice cuál hito falla' },
      P32: { q: 'El total anual de sesiones por Modo, sin desagregar por persona', why: 'El MSP denegó el pedido por falta de desagregado. Nunca dijo no tener ningún dato de uso: un pedido más angosto lo probaría' },
      P33: { q: 'Cuántos prestadores declararon no adhesión en el indicador del intento de autoeliminación', why: 'Decide si el incentivo llega a todo el sistema o sólo a los que se anotan' },
      P34: { q: 'Cuántas veces el hito de la consulta presencial a los 7 días se cierra por teléfono', why: 'El instructivo lo permite de forma expresa. Sin ese número no se sabe cuánto del 30% se paga por consultas que existieron' },
      P35: { q: 'El tope nacional vigente en pesos de la tasa moderadora del Modo 2 y del Modo 3', why: 'Los topes originales de 2011 se actualizan por porcentaje, y ningún decreto reciente vuelve a nombrar los Modos' },
      P36: { q: 'El precio de la sesión de psicoterapia por prestador, en el dataset abierto de tasas moderadoras', why: 'Ese dataset tiene 46 columnas y ninguna es de salud mental' },
      P37: { q: 'El tiempo de espera para salud mental por prestador', why: 'El dataset de tiempos de espera cubre cinco especialidades y ninguna es psiquiatría' },
      P38: { q: 'Cómo se paga el Modo 2 en ASSE', why: 'El decreto obliga a todos los prestadores integrales, y las tasas moderadoras se fijan para las mutualistas. Decide si los 9.072 pesos aplican a la mitad del país o a la otra' },
      P39: { q: 'El resultado de las tres actividades del Objetivo 6 de la Estrategia 2021-2025', why: 'Las tres tienen indicador escrito por la propia estrategia y ninguna tiene resultado publicado' },
      P40: { q: 'El informe de evaluación de la Estrategia 2021-2025', why: 'El MSP declaró en 2025 que la evaluación está en curso. Sin el informe no se puede decir qué objetivos se cumplieron' },
      P41: { q: 'El monitoreo de la cobertura periodística del suicidio', why: 'La Estrategia 2025-2030 pone la cobertura responsable como resultado esperado y no dice cómo se medirá' },
      P42: { q: 'Los cargos de residencia en psiquiatría que el Estado financia por año', why: 'El listado de cupos enlaza un PDF que devuelve 404' },
      P43: { q: 'Cuántos centros docentes asociados en psiquiatría existen hoy y en qué departamentos', why: 'La Estrategia se propone garantizarlos «en cada departamento» y no publica la línea base' },
      P44: { q: 'Un censo actualizado de psicólogos por departamento', why: 'El único mapa es de 2014, mide residencia declarada y cubre el 77,1% del universo censal' },
      P45: { q: 'La ficha de país de Uruguay del Mental Health Atlas 2024', why: 'Uruguay respondió el cuestionario y figura entre los contribuyentes. La dirección esperada devuelve 404' },
      P46: { q: 'El numerador y la población con que la OPS calcula su tasa de intentos para 2024', why: 'El MSP publica 161,74 para el mismo año y la misma unidad. Sin la base de la OPS no se puede reconciliar' },
    },

    /* 15 · LÍMITES Y FUENTES */
    limitesTag: 'Los límites',
    limitesTitle: 'Lo que no pudimos verificar',
    limitesP: 'Va entero. Cada límite dice qué no se pudo verificar y por qué.',
    limites: [
      {
        key: 'corpus',
        title: 'Límites del corpus de compras',
        items: [
          'El léxico mide texto, no gasto. Una compra entra entera aunque el léxico toque una sola de sus líneas. En ASSE el efecto tiene techo medido en 22,8% del total del léxico. Cada porcentaje de esta pieza es un techo, no una medida exacta.',
          'El léxico tiene falsos positivos y falsos negativos a la vez. En el MSP entran banners, bolsas de tela, edición de video, tóner y carnets, porque el pliego nombra al Programa de Salud Mental. Y un antidepresivo comprado por su nombre comercial no entra.',
          'El corpus no ve el grueso del gasto. Los sueldos de ASSE, las prestaciones obligatorias del sistema y los presupuestos de los establecimientos no generan una compra.',
          'Todos los montos son pesos corrientes sin deflactar. La suma de veinticuatro años no es comparable entre años.',
          'La regla de máximo por compra tira las ampliaciones. Todo contrato ampliado por debajo del monto base queda subvaluado.',
          'El corpus es sin impuestos y el portal es con impuestos. El total mezcla compras exentas medidas en bruto con compras gravadas medidas en neto.',
          'No hay dato de oferentes para el 98% de las compras del léxico. No se puede publicar una tasa de oferente único para salud mental.',
          'Ninguna base del sitio trae la forma jurídica del proveedor. El reparto entre organización sin fines de lucro y empresa no se publica.',
          '2026 es un año parcial. El corpus llega al 18 de agosto.',
          'Los artefactos de suma global no están todos identificados. El tope de 50.000 millones atrapa quince, y hay al menos uno grande por debajo del tope.',
          'No verificamos contra el portal cada una de las 622 compras del léxico de ASSE. Verificamos las seis mayores y los dos casos anómalos.',
          'La lista de moléculas psicofármacas es propia y no es exhaustiva. No se usó un catálogo internacional ni el catálogo oficial completo.',
          'El feed no trae la dosis. El código de artículo es genérico, así que ninguna serie de precio por comprimido mide un producto idéntico.',
          'El monto de psicofármacos no usa el campo normalizado. Usa cantidad por precio unitario de línea, que es la única forma de medir por molécula. No es comparable con ninguna otra cifra en pesos del sitio.',
          'El conteo de comprimidos es un piso. Unos 33,6 millones de unidades traen la etiqueta genérica «UNIDAD» y no se pueden separar.',
          'Los 792.946.097 pesos de agosto de 2026 también son un piso. Doce líneas no deflactan por falta de Unidad Indexada de su mes.',
          'El descarte de falso positivo del léxico se aplicó a un solo token. Quedan cinco focos de ruido medidos, y tres no están neteados.',
          'El léxico de nueve familias no se puede reproducir bit a bit. El script original no está en disco ni en el repositorio, y la reescritura reproduce exacto tres familias.',
          'La familia «crisis» no tiene cifra publicable. Dos mediciones de la misma familia difieren en tres compras que la expresión nueva no encuentra, y no se sabe qué token las trae.',
          'El triplicado del INAU decide el signo de la corrección de «salud mental». Sin resolverlo, la corrección no se enuncia como corrección al alza.',
          'El múltiplo entre desfibrilador y suicidio depende de la regla de imputación. La cifra estable es el conteo de compras.',
          'El corpus crece durante la sesión de medición. Por eso cada cifra lleva su fecha y su hora.',
          'Casi cuatro de cada diez compras del léxico no traen monto. En «salud mental» son 62 de 167, y en 23 de esas 62 la adjudicación existe y está cancelada.',
          'De las compras que nombran una molécula psiquiátrica, 1.568 no muestran ningún ítem adjudicado.',
        ],
      },
      {
        key: 'prestaciones',
        title: 'Límites de las prestaciones y de la meta asistencial',
        items: [
          'El tope nacional vigente de la tasa moderadora no es citable. Los 573 y los 189 pesos son el tarifario publicado de un prestador.',
          'Los 9.072 pesos son un techo teórico. Nadie publica cuántas sesiones usa en promedio una persona con intento de autoeliminación.',
          'Las 48 horas del Comité de Recepción no son las 48 horas de la meta asistencial. Son dos relojes distintos.',
          'La cobertura de ASSE frente a las mutualistas en estas prestaciones no está medida. Cómo se paga el Modo 2 en ASSE quedó sin verificar.',
          'El Decreto 366/011 se contradice a sí mismo, y la contradicción se muestra, no se resuelve. El mismo artículo autoriza cobrar la entrevista con el coordinador del Modo 1 y tres renglones después manda que el acceso al Modo 1 sea sin costo.',
          'No medimos si la tercerización que habilita el Anexo del Decreto 305/011 deja rastro en las compras de ASSE. Sería el único puente entre esa norma y lo que este sitio mide.',
          'El cumplimiento observado de la meta de seguimiento no existe como dato público. Es el agujero central de todo el carril de servicios.',
        ],
      },
      {
        key: 'fuentes',
        title: 'Límites de las fuentes oficiales e internacionales',
        items: [
          'El conteo de 4.723 intentos de autoeliminación en 2023 tiene una sola fuente, y es una columna de opinión que atribuye la cifra al MSP sin citar documento.',
          'La unidad de la tasa de 2023 no está probada por aritmética. La cuenta cierra igual si fueran personas.',
          'La tasa de 147,56 de 2025 no la publicó el MSP. La publicó un medio citándolo.',
          'No hay ninguna estimación oficial cuantificada del subregistro. La Estrategia lo reconoce por escrito y no lo mide.',
          'No recuperamos la versión taquigráfica de la exposición ministerial sobre el artículo 381.',
          'No pudimos enumerar el corpus de decretos reglamentarios de la Ley 19.529: el buscador de IMPO pide login.',
          'No leímos las planillas de créditos de los Tomos III. Están publicadas. Sin ellas no se puede comparar el ciclo presupuestal anterior con el actual.',
          'No leímos el Instructivo de Metas Asistenciales 2026-2027.',
          'No existe una lista pública de dispositivos comunitarios en ningún organismo que hayamos podido consultar.',
          'El estado actual de integración de la Comisión Nacional de Contralor no se verificó de forma independiente.',
          'El ranking internacional termina en 2021 y la serie del MSP llega a 2025. Las dos puntas no terminan en el mismo año.',
          'Las citas de la guía de la OMS son del original en inglés. La edición en español no se pudo descargar.',
          'El registro de títulos no trae departamento. No podemos afirmar que el Estado no tenga el dato territorial: podemos afirmar que no lo encontramos en fuentes públicas.',
          'La ficha de país de Uruguay del Mental Health Atlas 2024 no está publicada. El último retrato completo del sistema uruguayo tiene datos de 2020.',
          'La conversión de la tasa de médicos a número absoluto es nuestra.',
          'La Estrategia 2021-2025 se presenta a sí misma como propuesta. Su texto dice «El presente documento constituye la propuesta en materia de Estrategia Nacional».',
          'No recuperamos el texto íntegro de la Ordenanza 801/012 ni el de la Ordenanza Ministerial 384/017. De la segunda circula el PDF del protocolo que aprueba, no el acto administrativo.',
          'La Estrategia 2025-2030 tiene tres fechas incompatibles circulando. Acá se usa una sola: el documento se fecha «Noviembre, 2025» en portada y el MSP lo publicó el 20 de abril de 2026. El 16 de abril de 2026 es la fecha de creación del PDF y no figura en el cuerpo.',
        ],
      },
      {
        key: 'responsable',
        title: 'Límites de comunicación responsable',
        items: [
          'Varias fuentes primarias traen desglose por método. Se leyeron y no se trasladaron, por la recomendación de la OMS. Quien lo necesite lo encuentra en los PDF citados.',
          'La frase «el sistema de salud los vio y no actuó» no se puede escribir. Los porcentajes de consulta previa son descriptivos y ninguna fuente afirma esa causa.',
          'El 93,09 de la cárcel no se pone junto a la tasa país sin advertir que el denominador es otro.',
          'Un caso individual quedó fuera por regla. Un número de resolución que apunta a un caso con la persona nombrada es un puntero al caso, y ningún caveat lo protege.',
          'El riesgo del período de transición después del alta, que la guía uruguaya cifra en 300 veces la primera semana y 200 el primer mes, es literatura internacional citada por la guía. No es una medición uruguaya.',
        ],
      },
    ],

    sourcesTag: 'Dónde chequear',
    sourcesTitle: 'Todo esto es público',
    sourcesP: 'Las leyes están en IMPO. Los decretos, ordenanzas e instructivos están en el portal del MSP. Las compras están en el registro de Compras Estatales, cada una con su identificador. Un solo dato salió de un pedido de acceso a la información pública, y su respuesta también está publicada.',
    srcOficial: 'Documentos del Estado y organismos internacionales',
    srcPrensa: 'Prensa, citada como prensa',
  },
  en: {
    kicker: 'Own investigation · open data',
    title: 'The State and suicide: the resources that cannot be added up',
    dek: 'Uruguay has a suicide prevention strategy, a register of attempts and a mandatory psychotherapy benefit. It has no budget line that says "suicide prevention". This piece measures what money the State labels, what targets it sets, and what it charges the person who attempted suicide.',
    fileScope: '7 laws · 1,639,754 purchases · 52 recommendations',
    filePeriod: '2011 → 2026',
    fileSource: 'IMPO · Health Ministry · WHO · OCDS corpus',
    chips: ['0 mentions in 7 laws', '0.0677% to 0.0722% of spending', 'flat prison target', '9,072 pesos a year'],

    /* 1 · AYUDA */
    ayudaTag: 'Before you read on',
    ayudaTitle: 'If you are going through this, there is someone to call',
    ayudaP: 'All three lines are free. They run 24 hours, nationwide. They support the person in crisis and the people around them.',
    ayudaLabels: {
      vida: 'Línea Vida — crisis care, run by ASSE since 2018',
      apoyo: 'Emotional support line — ASSE, the Health Ministry and Voluntariado Juntos, since April 2020',
      emergencia: 'Emergency — immediate risk',
    },
    ayudaNota: 'This piece follows WHO guidance on reporting suicide. It describes no methods. It publishes no individual cases. It presents no figure as a record. The only method it names is "restricting access to lethal means", because that is public policy and that is how the Health Ministry and the WHO word it.',

    /* 2 · HERO */
    statHead: 'How the State manages its resources against suicide',
    statSub: 'labelled budget, targets, benefits and purchases, measured one by one',
    tiles: [
      { n: '0', l: 'mentions in 7 laws', s: 'budget and accountability laws, 2020-2025, enacted text' },
      { n: '0.0677–0.0722%', l: 'of procurement spending', s: 'everything the corpus names as mental health, over 24 years' },
      { n: '93.09', l: 'the target that does not fall', s: 'baseline and all five annual targets, among people deprived of liberty' },
      { n: '$ 9,072', l: 'a year, adult person', s: 'exhausting the Mode 2 cap on the Camdel IAMPP price list' },
    ],

    /* 3 · NO SE PUEDE SUMAR */
    sumarTag: 'The starting point',
    sumarTitle: 'There is no budget line that says "suicide prevention"',
    sumar: [
      'We searched the stem "suicid" in the enacted text of seven consecutive laws. They are two budget laws and five accountability laws, between 2020 and 2025. The word appears zero times in all seven.',
      'Ley 20.446, the 2025-2029 National Budget, has 717 articles. None of them names it. The expression «salud mental», mental health, does appear: eleven times in that law, and with a different count in each of the other six.',
      'Zero mentions is not zero pesos. Prevention spending exists inside mental health budget lines and inside ASSE salaries. What the count proves is that no budget line is labelled by the problem. Because of that, the spending cannot be isolated from the law itself.',
      'The measurement covers the enacted text, not the budget volumes. Tomo II, the planning and evaluation volume, does name suicide three times. The next section is about that.',
    ],
    leyesCols: { ley: 'Law', tipo: 'What it is', suicid: '"suicidio"', sm: '"salud mental"' },
    leyesLabels: {
      presupuesto2024: 'National Budget 2020-2024',
      rc2020: 'Accountability law, 2020 financial year',
      rc2021: 'Accountability law, 2021 financial year',
      rc2022: 'Accountability law, 2022 financial year',
      rc2023: 'Accountability law, 2023 financial year',
      rc2024: 'Accountability law, 2024 financial year',
      presupuesto2029: 'National Budget 2025-2029',
    },
    leyesNota: 'Our own count on the text served by IMPO, the official legal database. Reproduction trap: IMPO returns latin-1 even though the header says UTF-8. Decoding it wrong changes the counts.',

    omisionTitle: 'Nor is it reported outwards',
    omision: [
      'The Health Ministry publishes an annual National Health Accounts bulletin. The 2024 edition has 22 numbered pages. The expression «salud mental» appears zero times, the stem "suicid" zero times and the stem "psiqui" zero times.',
      'The Uruguay country profile in the WHO Mental Health Atlas 2020 has three financing boxes. All three are empty. The 2017 profile does not report the figure either.',
      'The same 2020 profile asks two consecutive questions about the national mental health plan. One asks whether human resources are estimated and allocated. The other asks the same about financial resources. Uruguay answered "No" to both.',
      'The State set itself the target of getting to measure. Milestone 4 of the Health Ministry in Tomo II reads "Contar con un sistema de monitoreo de indicadores de salud mental en el país" — have a national mental health indicator monitoring system, with baseline 0 and cumulative target 4 for 2029.',
      'None of this proves that no internal register exists. It proves that the figure was not declared and is not published.',
    ],
    omisionNota: 'A verified trap, so that nobody revives it: the same Atlas 2020 PDF shows the percentages 2.20%, 2.50% and 8.06%. They are not mental health spending. They belong to the research output chart.',

    mh4Title: 'The global indicator that measures this is frozen in 2011',
    mh4: [
      'The WHO publishes an indicator of public mental health spending over public health spending. It has 78 rows in the whole world, and all of them are from the same year: 2011. Nineteen rows come from the Americas region. None comes from Uruguay.',
      'Two statements follow, and both go together. The first: no country has a recent figure, so the regional comparison cannot be built from this source. The second: in the only year that exists, six South American countries reported and Uruguay did not.',
    ],
    mh4Cols: { pais: 'Country', pct: '% of public health spending, 2011' },
    escalaNota: 'The scale that is published: in 2024 Uruguay spent 9.31% of GDP on health, and public health spending was 6.72% of GDP. The commitment the country states it meets is 6% of GDP for public health spending. That commitment sets no percentage for mental health.',

    /* 4 · LA ÚNICA META ES CARCELARIA */
    carcelTag: 'The only target',
    carcelTitle: 'The budget sets one single target on suicide, and it is a prison target',
    carcel: [
      'Tomo II of the 2025-2029 Budget names suicide in a single indicator. It belongs to the Interior Ministry, under the programme "Gestión de la privación de libertad", management of deprivation of liberty. It measures the five-year rolling average of the suicide rate among people deprived of liberty.',
      'Its baseline is 93.09 per 100,000 people deprived of liberty. Its five annual targets, from 2025 to 2029, are the same number. The State plans to end the five-year period where it started it.',
      'The target matching the baseline is a decision of the table, not an extraction error. On the same page there are indicators that do move: seized weapons go from 3,847 to 4,676, and ASSE plans to go from 2 to 26 short-stay beds for adolescents. Why it was set this way cannot be stated.',
      'The other two harm indicators of the same table are also flat. Homicides among people deprived of liberty stay at 121.57 for the five years. Hospitalisations for violent incidents or self-inflicted injuries stay at 92.33.',
      'The article 220 bodies volume of the same Tomo II has zero occurrences of "suicid" and zero of "autoelimin". With that, the statement holds for the whole of Tomo II. ASSE does plan mental health, and it does so outside the Health area: its objective sits under "Protección Social", social protection.',
    ],
    indicadoresCols: { key: 'Indicator', base: 'Baseline', meta: '2029 target' },
    indicadoresLabels: {
      suicidioPpl: 'Suicides per 100,000 people deprived of liberty',
      homicidioPpl: 'Homicides per 100,000 people deprived of liberty',
      hospitalizacionPpl: 'Hospitalisations for violent incidents or self-inflicted injuries',
      armas: 'Weapons seized in prison units',
      femicidios: 'Femicides with protective measures in force',
      camasAdolescentes: 'Short-stay beds for adolescents, ASSE',
      consultasAsse: 'Psychiatry and psychology consultations per thousand users, ASSE',
    },
    carcelAviso: 'The 93.09 has a different denominator from the national rate. It counts people deprived of liberty, not inhabitants. It is not placed next to the 19.16 of 2025 without saying so.',

    /* 5 · LO QUE SÍ ESTÁ ROTULADO */
    partidasTag: 'What is labelled',
    partidasTitle: 'Five articles, 224 million for 2026',
    partidas: [
      'The articles of Ley 20.446 that name mental health add up to 224,250,000 pesos for the 2026 financial year. From 2027 they add up to 234,250,000 a year. The largest line belongs to ASSE: 170,000,000 a year.',
      'Only four of the five articles say "Asígnase", hereby allocated, which is the wording of new money. Counting only those, 220,000,000 remain for 2026 and 230,000,000 from 2027. The 4,000,000 of the national university are a reallocation from another budget head.',
      'Article 393 gives 10,000,000 to the Health Ministry for "los cometidos en salud mental y adicciones", its duties in mental health and addiction. Of that, 9,768,240 pesos are transfers to non-profit institutions. That is 97.68% of the line.',
      'For magnitude: the 170,000,000 of ASSE equal 0.29% of the 57,988,000,000 that ASSE executed in 2023. The arithmetic gives scale, not a share of the current budget. It compares a credit valued at January 2025 prices against spending executed in nominal 2023 pesos.',
      'This is allocated credit, not executed spending. Execution by line is not published.',
    ],
    partidasCols: { art: 'Article', inciso: 'Budget head', y2026: '2026 credit', y2027: 'Annual from 2027', destino: 'Literal purpose' },
    partidasDestinos: {
      asse: '"red de estructuras básicas de atención en salud mental […] y el fortalecimiento de equipos de salud mental comunitarios" — a network of basic mental health care structures and stronger community mental health teams. The law writes it as 70,000,000 plus 100,000,000 a year.',
      mides: '"nuevas iniciativas de atención de la salud mental y los consumos problemáticos de sustancias psicoactivas para personas con alta vulnerabilidad social" — new services for mental health and problem drug use, for highly vulnerable people',
      msp: '"los cometidos en salud mental y adicciones", duties in mental health and addiction. 9,768,240 pesos, 97.68%, are transfers to non-profit institutions.',
      udelar: 'Project ECHO, "salud mental y el desarrollo de la teleclínica en el interior" — mental health and teleclinic development outside Montevideo. It is a reallocation from budget head 24, not new money.',
      giacoya: 'Subsidy to the "Centro de Salud Mental Nélida Giacoya". It enters through the name of the institution, not through the label of the spending.',
    },
    partidasUnidad: 'Mandatory unit: these are credits valued at 1 January 2025 prices, under article 2 of the law itself. They apply from 1 January 2026, under its article 3. They are not nominal 2026 pesos.',
    art508Titulo: 'The 60 million that stay out',
    art508Nota: 'Article 508 allocates 60,000,000 pesos with a double purpose and no breakdown: a urological pathology project and the expansion of the mental health programme. The law does not say how much goes to each. Publishing them as mental health would be an error, so they do not enter the total above.',

    /* 6 · EL PRECIO DE LA AYUDA */
    precioTag: 'The price of help',
    precioTitle: 'The person who attempted suicide pays for every session. Their relative does not pay',
    precio: [
      'Decreto 305/011 requires every health system provider to deliver psychotherapy. It organises access into three Modes, each with a different annual session cap. It is financed by raising the premium of FONASA, the national health fund, and by charging a co-payment.',
      'The person who attempted suicide enters through Mode 2. Mode 2 carries a co-payment. The relative or close contact enters through Mode 1, whose sessions are free. The entitlement of the relative expires one year after the episode.',
      'Decreto 114/024, from 2024, did not exempt the person who attempted suicide. It lowered their co-payment to the Mode 3 level, which is a third. The person still pays for every session.',
      'On the Camdel IAMPP price list in force at 1 January 2026, a Mode 2 session costs 573 pesos and a Mode 3 session costs 189. Exhausting the 48 annual sessions costs an adult person who attempted suicide 9,072 pesos a year. Before Decreto 114/024 it cost 27,504.',
      'The word "adult" is mandatory. For a child or an adolescent the Mode 2 cap is 24 sessions, that is half, and the arithmetic gives 4,536 pesos a year against 13,752 before the decree.',
      'The 9,072 pesos are a theoretical ceiling, not observed spending. Nobody publishes how many sessions a person who attempted suicide uses on average. And the 573 and the 189 are the price list of one provider, Camdel IAMPP, not a national average.',
    ],
    modosCols: { modo: 'Mode', adultos: 'Adults', menores: 'Children and adolescents', tasa: 'Co-payment' },
    modosLabels: {
      modo1: 'Mode 1 — group work. It is the door of the relative or close contact.',
      modo2: 'Mode 2 — it is the door of the person who attempted suicide.',
      modo3: 'Mode 3 — renewable up to 144 sessions a year.',
    },
    modosTasa: { modo1: 'free', modo2: 'with co-payment', modo3: 'lower co-payment' },
    tarifarioTitulo: 'The price list of one provider, at 1 January 2026',
    tarifarioNota: 'The national cap in force in pesos cannot be cited. The original 2011 caps are 170 pesos for Mode 2 and 55 for Mode 3, and they are caps, not prices. They are updated by percentage at each six-monthly adjustment, and no recent decree names the Modes again.',
    decreto114Nota: 'Decreto 114/024 also raised the age ceiling of general cover from 25 to 30. The priority groups, suicide attempt among them, never had an age ceiling. It also removed the co-payment on fluoxetine and sertraline, and capped it at 144 pesos on escitalopram. It removes the co-payment, not the professional stamp duty.',
    expedienteTitulo: 'The reporting duty the State gave itself in 2011',
    expediente: [
      'The annex to the same decree requires every provider to send a quarterly return to the national information system. The duty applies since 2011.',
      'Fourteen years later, someone asked the Health Ministry for the use of those benefits: users aged 18 or under between 2018 and 2022, by age, sex and department, plus the structure, process and outcome indicators by provider. The ministry answered that it holds no central register at that level of breakdown. It refused the freedom-of-information request.',
      'The file is Ref. 12/001/3/7903/2025, with a legal report of 7 November 2025, published on 29 July 2026. The ministry never said it holds no usage figure at all. It said it does not hold that breakdown.',
    ],

    /* 7 · LO QUE EL ESTADO PAGA POR SEGUIR A ALGUIEN */
    pagoTag: 'The incentive',
    pagoTitle: 'The State pays 15.51 pesos to follow someone up after discharge',
    pago: [
      'Since 2024 follow-up after discharge is a care target that is paid for. It is indicator 5 of Component 5 of the Health Ministry instruction, and it is called "Seguimiento inmediato de afiliados con intento de autoeliminación" — immediate follow-up of members after a suicide attempt.',
      'It is worth 15.51 pesos per month per FONASA user, out of the 217.08 the whole target is worth. That is 7.14% of a target with 21 indicators. The scale of amounts per indicator has three steps, 5.16, 10.34 and 15.51, and follow-up sits on the highest one.',
      'The compliance objective the State sets itself is 70%. Payment starts at 50%. Both values apply milestone by milestone, not to a single percentage of completed cases.',
      'Said without arithmetic: the State plans to meet the protocol in 7 of every 10 cases, and starts collecting from 5 of every 10.',
      'The indicator has four milestones with different weights. The one that weighs most alongside the face-to-face consultation is the call at 2 days. The instruction says "2 days", not "48 hours".',
      'The milestone of the face-to-face consultation at 7 days is worth 30%. The instruction expressly allows the provider to replace it with a call if the consultation does not happen. That call counts even when it is with the emotional referent and not with the person. The milestone closes without seeing the person, and it can close without speaking to them.',
      'There is no figure for how often the milestone closes by telephone. The instruction also sets that call an objective, which is to reassess risk.',
      'This is not the only mental health indicator of the target. Indicator 2.3 refers first-time mothers with signs of post-partum depression to the same Reception Committee, and is worth 10.34 pesos.',
    ],
    hitosCols: { key: 'Milestone', peso: 'Weight', monto: 'Pesos per month per FONASA user' },
    hitosLabels: {
      orientacion: 'Written guidance to the user before discharge',
      llamada2dias: 'Telephone follow-up at 2 days',
      consulta7dias: 'Face-to-face consultation at 7 days',
      llamada30dias: 'Telephone follow-up at 30 days',
    },
    hitosNota: 'Splitting the 15.51 pesos across the four milestones is our own arithmetic, on the weights the instruction sets. The 15.51 was verified by coordinates against the PDF: the 21 amounts mapped that way sum to exactly 217.08, which is the total the instruction itself declares.',
    metaUnidad: 'Unit: pesos per month per FONASA user, never "per member". The 15.51 is published against 217.08, which is the value at July 2024. Between January and June 2026 the whole target is worth 234.13, and projecting the indicator onto that total assumes a proportional update that no document confirms.',
    normaTitulo: 'And it does not start in 2024',
    norma: [
      'Follow-up after discharge is a duty since 2017, not a recommendation since 2024. The protocol approved by Ordenanza Ministerial 384/017 sets the first outpatient consultation at no more than 7 days, and active follow-up for at least six months, over every user.',
      'The annex to Decreto 305/011 already ordered it in 2011: "En el caso de los IAE, se hará seguimiento los primeros 6 meses, de acuerdo a pautas establecidas al respecto" — suicide attempts are followed up for the first 6 months, according to guidelines set for the purpose. The decree does not define those guidelines. The guidelines arrive only with the 2017 protocol.',
      'There is a tension between the two instruments, and it is worth seeing. The one that obliges runs to six months. The one that pays stops at 30 days.',
      'The doubt is not about the rule: it is about compliance. And compliance is not published.',
    ],
    normaNota: 'We write "Ordenanza Ministerial 384/017" with no date of its own. Three Health Ministry sources confirm the number. The date is not confirmed: the PDF of the ordinance is a scan with no text layer.',
    relojesNota: 'Two different clocks use the same number. Decreto 305/011 requires the Reception Committee to see the person who attempted suicide within 48 hours, and that is the entry deadline to the benefit. The care target runs after hospital discharge, and its instruction says "2 days".',

    /* 8 · LO QUE EL CORPUS VE */
    corpusTag: 'The measurement',
    corpusTitle: 'Everything the corpus names as mental health fits into seven hundredths of one per cent',
    corpus: [
      'This site measures the state procurement record. On 18 August 2026, at 20:06 UTC, the corpus held 2,186,313 records grouped into 1,639,754 purchases, worth 1,674,533,194,737.58 nominal pesos.',
      'There is one amount rule and it runs in the numerator and in the denominator: a purchase is worth the maximum of its normalised amount across all its records, capped at 50 billion. Fifteen purchases fall to that cap and are line-total artefacts.',
      'Under that rule, the purchases whose text names any mental health term run between 2,092 and 2,198, and between 1,133,918,333.96 and 1,208,259,462.09 pesos. That is between 0.0677% and 0.0722% of corpus spending.',
      'The range is not an ornament. The false positive filter was applied to a single token, and the remaining noise is measured. The floor discounts the two largest sources. The other three are not discounted, because their overlap with the rest was not measured.',
      'Almost four in ten lexicon purchases carry no amount: 833 of 2,198. A zero in the corpus does not prove that nothing was awarded.',
      'The percentage measures presence of the term in the text of the purchase, not the destination of the spending. And the corpus does not see the bulk of public mental health spending: ASSE salaries, the mandatory benefits of the system and the budgets of the establishments do not run through a purchase.',
    ],
    ruidoCols: { key: 'Noise source', ocids: 'Purchases', uyu: 'Nominal pesos', que: 'What it really is' },
    ruidoLabels: {
      centroDiurno: '«centro diurno», day centre, with no mental health context — fruit and vegetables for INDA, cleaning of a care home, façade repair',
      lineaVida: '«línea vida», life line — fall arrest gear: harness, shock absorber, helmet',
      adiccional: '«adiccional», a typo for «adicional», additional — construction extras',
      siliconaAdiccion: '«SILICONA DE ADICCIÓN» — dental material',
      trabajadorSocial: '«trabajador social», social worker, with no mental health context — land titling teams at PIAI, employment agencies at BPS',
    },
    familiasTitulo: 'The lexicon families, one by one',
    familiasCols: { key: 'Family', ocids: 'Purchases', uyu: 'Nominal pesos', cond: 'Condition' },
    familiasLabels: {
      profesionales: 'Professionals — psiquiatr, psicólog, psicoterap, trabajador social',
      adicciones: 'Addiction',
      residencial: 'Residential — care homes and psychiatric admission',
      psicofarmaco: 'Psychotropic drug, as a word of the text of the purchase',
      prevencion: 'Prevention and postvention, next to suicide',
    },
    familiasCondiciones: {
      trabajadorSocial: '10 purchases and 8,778,692.34 pesos enter through «trabajador social» with no mental health context',
      tipeo: '8 purchases and 10,896,024 pesos are the «adiccional» typo and dental material',
      expresionNueva: 'The expression is wider than the previous one, which gave 192 purchases and 219,343,216 pesos',
      recetarios: 'Almost all of it is prescription pad printing',
    },
    familiaCrisis: 'The «crisis» family has no publishable figure. Two measurements of the same family differ by three purchases that the new expression does not find, and which token brings them is unknown. Until they are identified, that family carries no number.',
    saludMentalTitulo: 'And «salud mental» comes with a mandatory pair',
    saludMental: [
      'The «salud mental» family gives 167 purchases and 275,293,598.29 pesos. Or 165 purchases and 196,963,696.66 pesos, depending on how three records from INAU, the child welfare institute, are counted.',
      'The three carry the same amount to the thousandth, the same six awards, the same six suppliers and the same eleven line items at the same unit prices. They are 42.7% of the total. One is from 2019 and the other two from 2023.',
      'If the three are one single purchase, the total falls below what this site already publishes. That is why the correction is not stated as an upward correction. Until the duplication is resolved with the INAU file, both figures stand.',
    ],
    tokensCeroTitulo: 'Ten tokens that give zero purchases in the whole corpus',
    tokensCeroNota: 'A zero in the corpus does not prove that the service does not exist. It proves that it is not bought under that name through state procurement.',
    asseTitulo: 'ASSE has not moved the needle in eleven years',
    asse: [
      'ASSE records 315,781 purchases between 2006 and 2026. Of those, 251,585 carry an amount and add up to 60,878,337,504 nominal pesos. Only 622 records touch the mental health lexicon, worth 376,682,728 pesos: 0.619% of its spending.',
      'The share did not move by period either. In 2015-2019 it was 0.702%. In 2021-2025 it was 0.686%. Across the eleven years 2015-2025 it was 0.684%.',
      'What did grow is the number of purchases: 12 in 2015 and 111 in 2025. But the total purchases of ASSE grew just as much, from 6,914 to 38,612. The share went from 0.174% to 0.288%.',
    ],
    mspTitulo: 'And almost nine in ten pesos the Health Ministry names as mental health are paper',
    msp: [
      'The Health Ministry records 38 purchases that touch the mental health lexicon, worth 107,569,225 pesos. Of that money, 93,920,967 pesos across 13 purchases are the printing of pads for prescribing psychotropic drugs and narcotics. That is 87.3%.',
      'This does not say that the ministry invests little in mental health. The ministry regulates and inspects, and its care spending has sat with ASSE since 2008. It says how much of what the ministry names mental health runs through a public purchase, and that almost all of it is control paper.',
    ],
    proveedoresTitulo: 'Who sells mental health to the State',
    proveedores: [
      'The lexicon purchases that carry a supplier identifier are 1,368, worth 1,206,655,554 pesos, spread across 600 suppliers. The top five take 38.64%. The top fifty take 88.98%.',
      'The lexicon mixes four different things: clinical care, psychosocial care for gender violence, prescription pad printing and building works. The concentration reads against that mix.',
      'Regrouped by budget head and not by spending unit, ASSE directs 405,111,335 pesos across 724 purchases and the Montevideo city government 242,185,411 across 92. The city government is the spending unit that buys most. ASSE is the body that buys most, 1.67 times more.',
      'One trap decides the ranking. The corpus writes the supplier identifier with a slash and without a slash. Without normalising, the first supplier splits in two and does not come first. The trap affects 44 of the 600.',
    ],
    proveedoresCols: { name: 'Supplier', uyu: 'Nominal pesos', ocids: 'Purchases', que: 'What it sells' },
    proveedoresQue: {
      alsara: 'Psychiatric admission, where the corpus says what was bought',
      hospitalarias: '"Servicio de hogar para pacientes psiquiátricos", residential care for psychiatric patients',
      garino: 'Prints the prescription pads of the Health Ministry. It is not care',
      hogarItaliano: '"Servicio de hogar para pacientes psiquiátricos", residential care for psychiatric patients',
      mujerSociedad: 'Psychosocial care for women in situations of violence, for the Montevideo city government',
    },
    corpusFecha: 'Every corpus figure carries its date and its time. Between two runs of this same session, sixteen minutes apart, 63 records and 21 purchases came in, and the denominator rose by 99,793,129.57 pesos. The figures by buyer and by supplier come from the earlier run, with 2,186,129 records and 1,639,674 purchases.',

    psicoTag: 'Another unit',
    psicoTitle: 'Psychotropic drugs, measured line by line',
    psicoAviso: 'A unit warning, and it is binding. This amount is measured as quantity times line unit price, not with the normalised amount that the rest of the site uses. It is the only way to measure by molecule. It is not compared with any other peso figure of this site and it is not divided by the corpus denominator.',
    psico: [
      'Spending on psychotropic drugs awarded between 2002 and 2026 is 348,131,404 nominal pesos, across 4,142 purchases and 6,826 lines. The false positive filter removes 1,704 lines and 51,988,860 pesos, 12.99% of the gross: reagents, calibrators, controls, analytical standards, electrodes, tools and batteries.',
      'That filter is asymmetric. It runs from 57.3% on lithium to zero on thirteen molecules. That is why a filter applied to a single molecule breaks any ranking, and why there is no publishable first molecule: aripiprazole and valproate sit 0.66% from each other, and sertraline and escitalopram 0.10%.',
      'By group, antipsychotics are 144,118,808 pesos and antidepressants 53,812,163. That is 2.68 times.',
      'The record is highly concentrated. One single tender, Licitación Pública 1007/2007, moves between 64.43% and 76.95% of the tablets, depending on how they are counted. In money it is 27.75% of the total, and that percentage does use one single rule.',
      'At the other end, in 2025 there are 730 purchases from 40 different bodies, with a median of 27,339 pesos. Over 24 years, 140 different buyers bought psychotropic drugs on their own account.',
      'There is no establishable relation between this series and the suicide rate. The series measures coverage of the procurement record, not national consumption. The central purchasing channel is invisible in amounts. And even if the two curves matched, the match would not be a cause.',
    ],
    psicoGruposCols: { key: 'Group', uyu: 'Nominal pesos' },
    psicoGruposLabels: {
      antipsicoticos: 'Antipsychotics',
      estabilizadores: 'Mood stabilisers',
      ansioliticos: 'Anxiolytics',
      antidepresivos: 'Antidepressants',
    },
    psicoNota: 'The 792,946,097 pesos of August 2026 are a floor: twelve lines do not deflate because the Indexed Unit of their month is missing. The 174,137,966 tablets are also a floor: 33.6 million units carry the generic label "UNIDAD" and cannot be separated.',

    /* 9 · DOS LÍNEAS EN 24 AÑOS */
    lineasTag: 'The two lines',
    lineasTitle: 'Two purchases of a response line in twenty-four years',
    lineas: [
      'Across 1,639,754 purchases, the State records two contracts for a response line for suicidal behaviour.',
      'The first belongs to the national police health directorate. It was tendered in 2015 and awarded in March 2016 to Último Recurso, for 4,540,800 nominal pesos. The object of the tender is "un servicio de respuesta de prevención y postvención de suicidio" — a suicide prevention and postvention response service.',
      'The second belongs to ASSE. It is Licitación Pública 22/2024, "Servicio de Linea de Apoyo Emocional 0800 1920", worth 770,273 pesos. One is six times the other.',
      'The 2016 purchase barely shows up, and that is the method trap. Its line item reads "ARRENDAMIENTO DE LINEA TELEFONICA", telephone line rental. The token «línea telefónica» returns 143 purchases: 142 are repair, relocation and rental of telephones. The 143rd is this one, and it has to be rescued by hand.',
      'Línea Vida does not appear in the record. The token "0800 0767" gives zero purchases. A zero in the corpus does not prove that the service does not exist: it proves that it is not bought through that channel. A service delivered by budgeted staff generates no purchase.',
    ],
    lineasCols: { year: 'Year', buyer: 'Public body', supplier: 'Supplier', uyu: 'Awarded' },
    lineasLabels: {
      sanidad2016: 'Suicide prevention and postvention response service: telephone line, 24 months',
      asse2024: '0800 1920 Emotional Support Line service (call centre / contact centre)',
    },
    lineasSinAdj: 'no supplier in the record',

    /* 10 · EL OTRO NÚMERO: LOS INTENTOS */
    intentosTag: 'The other number',
    intentosTitle: 'The series of attempts starts in 2023, and changes unit in 2025',
    intentos: [
      'Notification of a suicide attempt is mandatory since December 2012. The Health Ministry never published the annual series of the paper form. The mandatory digital register in emergency departments starts in October 2022, so the first full calendar year is 2023.',
      'What exists is not a series: it is a table of measurements with different units. That is why it goes as a table and not as a line.',
      'Two unit traps govern it. The first: an episode is one recorded suicide attempt, and one person can have several. In 2025 the Health Ministry published both units together for the first time: 6,140 episodes by 5,144 people, that is 1.19 episodes per person.',
      'The second: the population base. The implied denominators of 2023 and 2024 sit around 3.57 million. The one of 2025 is 3.49 million. The ministry changed projection vintage between one year and the next, and the base falls 2.57%.',
      'The consequence is concrete. The 2024 rate and the 2025 rate are not compared. The unit changes, from episodes to people, and the base changes.',
      'The ministry itself warned about the quality of its own series. On the 2024 jump it wrote: "Este incremento podría estar vinculado a mejoras en los sistemas de registro, y no necesariamente a un aumento real de casos" — the rise may be linked to better recording systems, and not necessarily to a real rise in cases. That sentence alone rules out reading the series as an epidemiological trend.',
      'The 2021-2025 Strategy acknowledges in writing "el subregistro de IAE a nivel de los prestadores de salud" — the under-recording of suicide attempts at provider level. It does not quantify it. There is no official estimate of how much is missing.',
      'And there are two breakdowns the ministry publishes in no year: the suicide attempt by department, and the count by age band for 2024 and 2025.',
    ],
    intentosCols: { periodo: 'Period', value: 'Value', unidad: 'Unit', source: 'Source', esAnio: 'A full year?' },
    intentosUnidades: {
      casos: 'cases, as the source words it',
      registros: 'system records; the unit is not established',
      intentos: 'attempts, per the only source that publishes it',
      episodios: 'episodes',
      personas: 'people',
      tasaEpisodios: 'rate per 100,000, on episodes',
      tasaPersonas: 'rate per 100,000, on people',
    },
    intentosFuentes: {
      msp: 'Health Ministry, official publication',
      prensa: 'press, cited as press',
      prensaMsp: 'press citing the Health Ministry; the ministry did not publish this figure',
    },
    intentosSinConteo: 'the ministry published only the rate',
    intentosNota: 'The count of 4,723 for 2023 has one single source, and it is an opinion column that attributes the figure to the Health Ministry without citing a document. The rate of 147.56 for 2025 was not published by the ministry either: El Observador published it, citing the ministry. The only 2025 figures with a direct ministry stamp are the 6,140 episodes and the 5,144 people.',
    intentosPrensa: 'The press reported that suicide attempts rose by 436 cases against 2024. That number appears in no Health Ministry document and the press does not declare its unit. On episodes, the derivation gives 352.',
    sexoTitulo: 'Breakdown by sex, only where it exists',
    sexoCols: { year: 'Year', mujeres: 'Women', varones: 'Men', unidad: 'Unit' },
    sexoNota: 'Both internal checks of 2025 close: 3,685 plus 1,459 give 5,144 people, and 4,426 plus 1,714 give 6,140 episodes.',
    comparableTitulo: 'What can be compared with what',
    comparableCols: { key: 'Comparison', vale: 'Valid?', why: 'Why' },
    comparableLabels: {
      tasa2023vs2024: '2023 rate against 2024 rate',
      tasa2024vs2025: '2024 rate against 2025 rate',
      conteo2024vs2025: '2024 count against 2025 count',
      contra2022: 'Any of 2023, 2024 or 2025 against 2022 or earlier',
      tramo9meses: 'The nine-month window against a year',
      froVsDigital: 'The 2021 paper form against the digital register',
      emse: 'The 2012 school survey against the 2019 one',
      egresos: 'Hospital discharges from 2018 to 2021 against each other',
      iaeVsMortalidad: 'Any series of attempts against the mortality rate',
    },
    comparableWhy: {
      tasa2023vs2024: 'Same projection vintage and same Health Ministry presentation. The reservation: the unit of 2023 rests on an opinion column.',
      tasa2024vs2025: 'The unit changes, from episodes to people, and the population base changes by 2.57%.',
      conteo2024vs2025: 'The 2024 count is not published.',
      contra2022: 'The digital register starts in October 2022.',
      tramo9meses: 'Nine months are not compared with twelve, and the unit of the window is not established.',
      froVsDigital: 'The paper form covers only ages 10 to 24, it is another capture and it is only the forms that were completed.',
      emse: 'Same survey, same population, same question. It is not compared with any Health Ministry rate.',
      egresos: 'Same source and same definition. They are not compared with the 4,723 or with the 6,140.',
      iaeVsMortalidad: 'They are two different capture systems. No match would be a cause.',
    },
    comparableVale: { si: 'Yes', siReserva: 'Yes, with a reservation', no: 'No' },
    paralelasTitulo: 'Three parallel measurements, which are something else',
    paralelas: [
      'The 2021 paper form is the only pre-digital figure the Health Ministry published. It covers only ages 10 to 24 and recorded 1,171 cases. Its two internal checks close.',
      'The EMSE school survey asks students aged 13 to 17 whether they made a suicide attempt in the previous twelve months. It is the only source with two mutually comparable points: 9.2% in 2012 and 12% in 2019.',
      'Hospital discharges are yet another unit. They count admissions with ICD-10 secondary code X60-X84, not emergency department visits. They add up to 8,554 between 2018 and 2021.',
    ],
    froCols: { key: 'Breakdown', value: 'Cases' },
    froLabels: {
      total: 'Total, ages 10 to 24',
      e1014: 'Ages 10 to 14',
      e1519: 'Ages 15 to 19',
      e2024: 'Ages 20 to 24',
      mujeres: 'Women',
      varones: 'Men',
      sinDatoConsulta: 'No data on previous mental health consultation',
    },
    emseTitulo: 'School survey, students aged 13 to 17',
    egresosTitulo: 'Hospital discharges with ICD-10 secondary code X60-X84',
    estimacionNota: 'The only official estimate of magnitude applies an international ratio to local mortality: the 2021-2025 Strategy says that suicide attempts occur between 10 and 20 times more often than suicides, and estimates between 7,000 and 14,000 people reached. It is not a Uruguayan measurement. Against that range, the 5,144 people recorded in 2025 sit below the floor.',
    reiteracionTitulo: 'Half the recorded attempts were made by people who had already attempted',
    reiteracion: [
      'Of the 4,723 suicide attempts recorded in 2023, 2,392 records state a previous attempt. In the nine-month window the proportion was 1,346 of 2,896.',
      'The Health Ministry study on adolescent suicide worked on 149 death certificates and 54 clinical histories of people aged 19 and under. Of those 54 histories, 29 had consulted the system in the previous three months and 38 in the previous six months.',
      'The previous attempt is self-declared on the form. The 54 histories are not extrapolated to the country. And it cannot be slipped in that the system saw them and did not act: the figure is descriptive and no source states that cause.',
    ],

    /* 11 · LA LEY QUE CAMBIÓ DENTRO DE UN PRESUPUESTO */
    leyTag: 'The law',
    leyTitle: 'The closure of the asylums moved inside a budget law',
    ley: [
      'Article 381 of Ley 20.446, the 2025-2029 National Budget, rewrote article 38 of Ley 19.529, the Mental Health Act, in full.',
      'It moved the closure deadline of the asylum establishments from 2025 to 2029. It deleted the sentence that banned admitting people to the existing establishments. And it changed two express references to the Mental Health Act.',
      'The law was signed on 16 December 2025 and published on 8 January 2026. The change applies from 1 January 2026. The corrigendum of March 2026 only fixes the next article and touches none of this.',
      'The deletion does not by itself reopen any establishment. It allows people to be admitted to those that stay open.',
    ],
    art38Cols: { key: 'What changed', antes: '2017 text', ahora: 'Text in force' },
    art38Labels: {
      plazo: 'The closure deadline',
      prohibicion: 'The ban on admission',
      estaLey: 'The scope of application',
      reglamentacion: 'The mandate to make regulations',
    },
    art38Suprimido: 'deleted',
    inddhhTitulo: 'What the INDDHH said',
    inddhhCita: 'Las modificaciones introducidas, al suprimir la prohibición expresa de internación en establecimientos asilares es una alteración estructural del sentido de la ley y del modelo de atención que ella estableció. — Removing the express ban on admission to asylum establishments is a structural change to the meaning of the law and to the care model it established.',
    inddhhCita2: 'Es en ese mismo artículo que se extendió el plazo para el cierre de los establecimientos asilares y estructuras monovalentes hasta el año 2029. Sobre este último y único aspecto se desarrolló la exposición de la ministra de Salud Pública y la comunicación pública del Ministerio de Salud Pública a la ciudadanía. — That same article extended the closure deadline for asylum establishments and single-specialty structures to 2029. The appearance of the health minister and the public communication of the ministry covered that last and only aspect.',
    inddhhNota: 'The characterisation of what was communicated belongs to the INDDHH and is reported as the position of the INDDHH. We did not recover the verbatim record of the ministerial appearance.',
    cronogramaTitulo: 'The timetable the law orders since 2017 does not exist',
    cronograma: [
      'Article 38 orders the executive to set the closure timetable in the regulations. IMPO records two implementing decrees of Ley 19.529 in almost nine years, and neither contains it.',
      'In the nine articles of Decreto 226/018 the words «cronograma», «asilar», «monovalente», «desinstitucionalización», «comunitario» and «plaza» do not appear. The six counts are zero. The decree itself declares its partial scope.',
      'The Health Ministry confirms it in 2026: "Se avanzará en la reglamentación de: […] Los artículos pendientes de la Ley de Salud Mental, comenzando por el 19, 33, 37 y 38" — work will advance on regulating the pending articles of the Mental Health Act. Articles 37 and 38 are the ones that order deinstitutionalisation and closure.',
      '"Two decrees" is what IMPO records, not a closed census: its search tool asks for a login. And unregulated does not mean unapplied. It means the instrument the law demands was not issued.',
    ],
    contralorTitulo: 'The body that oversees the system depends on the ministry it oversees',
    contralor: [
      'The National Mental Health Care Oversight Commission is a decentralised body under the Health Ministry. Article 39 of Ley 19.529 created it that way.',
      'It owes the ministry an annual report within the first 120 days of each year. No rule requires it to publish that report. The duty runs to the ministry and not to the public.',
      'It has ten honorary members, a quorum of seven and a three-year term. Eleven months passed between the end of its first term and the swearing in of the next commission.',
      'The only report of its own that we found online is hosted by the psychology faculty, not by the ministry. The document itself mentions annual reports submitted to the ministry that are not published.',
      'That report carries a measurement of the real reach of the system. Between August and December 2022 the body received 224 hospitalisation notifications. Two hundred and twenty came from Montevideo and four from the whole rest of the country. That measures the notification system, not the occurrence of hospitalisations.',
    ],
    dispositivosTitulo: 'The asylum places are measured. What replaces them is not',
    dispositivos: [
      'The official census of CEREMOS, the state long-stay psychiatric facility, counted 443 users in October 2023: 276 in the Santín Carlos Rossi wing and 167 in the Etchepare wing. It counts users, not beds, and there is no later census.',
      'Hospital Vilardebó is listed with 300 beds in the PAHO report of 2022. In general hospitals in Montevideo there are two mental health wards with 19 beds.',
      'Against that, the State does not publish how many community services exist or how many places they hold. The 2025-2030 Strategy sets the assessment as an action to carry out, with a 2025-2025 deadline in its own matrix. The document was published in April 2026.',
      'The INDDHH adds the other end of the problem. At 31 December 2024, 58 people were serving curative security measures in psychiatric hospitals, some after up to 38 years of admission. These are measures ordered by the courts, not the total of long-stay inpatients. The same report says that there are no national records that allow them to be tracked.',
      'CEREMOS admits no new entrants, under article 38 of Ley 19.529. It is the direct counterweight to the change the budget made. The report covers 2025 and was published in April 2026: it does not assess the effect of the extension voted in December 2025.',
    ],

    /* 12 · RECURSOS HUMANOS */
    rrhhTag: 'The workforce',
    rrhhTitle: 'The figure exists, and it does not serve the purpose',
    rrhhBloqueo: 'Blocking sentence, before any figure of this section. Three psychiatrist numbers circulate: 628 from 2026, 544 from 2020 and 550 from 2011. They are three different definitions. The first counts accumulated qualifications with no removals. The second counts people who work in the sector, according to what the country declared to the WHO. The third is a spoken statement, and the source says "550 professionals", not "550 psychiatrists". They are neither compared nor subtracted.',
    rrhh: [
      'The register of licensed qualifications of the Health Ministry, at 31 July 2026, lists 628 people with a psychiatry qualification and 183 with child and adolescent psychiatry. Only 8 people hold both, so the union is 803.',
      'The same register lists 14,616 psychologists. And it lists 91 people with a mental health specialisation qualification, of whom 77 are registered nurses and 14 nursing auxiliaries. That the group is a nursing group comes from the cross-reference, not from the title of the qualification.',
      'The register does not say where any of those people work. It carries no department column. That the territorial figure of psychiatrists does not exist is something we cannot state: we can state that we did not find it in public sources.',
    ],
    controlTitulo: 'The quality control of the method, which is a finding in itself',
    control: [
      'The same register lists 27,834 licensed doctors of medicine. The WHO indicator gives 45.51 doctors per 10,000 people for Uruguay in 2023, which against the population of the 2023 census is some 15,700 practising doctors.',
      'That is 1.8 qualifications per practising doctor. The register accumulates qualifications and removes none on death, retirement or emigration. It is a ceiling, not a count of who practises.',
      'Converting the rate into an absolute number is our own arithmetic. We publish it because it is the argument that holds up the whole quality control of the method.',
    ],
    atlasTitulo: 'What the country declared to the WHO',
    atlasCols: { key: 'Category', n: 'People', tasa: 'Per 100,000' },
    atlasLabels: {
      psiquiatras: 'Psychiatrists',
      psiquiatrasNyA: 'Child and adolescent psychiatrists',
      enfermeros: 'Mental health nurses',
      psicologos: 'Psychologists',
      totalFicha: 'Total the profile prints',
      totalCorregido: 'The same total, corrected',
    },
    atlasNota: 'The profile prints a total of 1,549 people, or 44.7 per 100,000, and that total excludes the 1,063 psychologists the profile itself reports. Corrected, the sum gives 2,612 people, or 75.45 per 100,000. That sits above the median of the high-income countries, which is 67.2. The two figures are not comparable with each other: the Uruguayan one is from 2020 and covers three categories, the median is from 2024 and covers seven. The rate of 11.7 for child and adolescent psychiatrists has a base that we infer as the population under 19, because the profile prints "per 100 000 population" and the arithmetic rules out the total population.',
    regionalTitulo: 'The regional scale, in the past tense',
    regional: [
      'In 2016, the last year with a comparable figure, Uruguay declared 14.13 psychiatrists per 100,000 people. Argentina declared 21.71 and the United States 10.54.',
      'That year Uruguay came second among the 23 countries of the region that reported, and ninth among the 104 countries of the world with a figure. Not among the 35 countries of the region, and not among the 194 member states.',
      'The medians of the same indicator are 1.835 in the Americas and 1.231 in the world. The figure is ten years old.',
    ],
    atlas2024Titulo: 'And the WHO sets no recommended number',
    atlas2024: [
      'The WHO publishes medians, not targets. None of the eight targets of its Comprehensive Mental Health Action Plan is a staffing target.',
      'The psychiatrist medians of the Atlas 2024 are 1.5 in the world, 1.7 in the Americas, 7.0 in the high-income countries and 9.9 in Europe. Comparing them against the Uruguayan 15.7 mixes 2020 with 2024.',
      'The consequence matters: there is no official threshold against which to measure Uruguay. That closes the door on any figure of the "the WHO recommends this many" kind.',
      'The Uruguay country profile of the Atlas 2024 is not published. Uruguay answered the questionnaire and appears in the list of contributors. The expected address returns 404, and the 2020 one responds. The last complete portrait of the Uruguayan system holds 2020 data.',
    ],
    territorioTitulo: 'The only territorial map is from 2014, and it is of psychologists',
    territorio: [
      'The 1st National Census in Psychology, from 2014, counted 7,543 psychologists. That is 77.1% of the census universe, not the national total.',
      'Of those, 5,488 lived in Montevideo and 2,055 outside it. Montevideo had 240.4 inhabitants per psychologist and Artigas 2,530.3.',
      'The figure is twelve years old. It measures declared residence, not place of work. The inhabitants come from the 2011 census. There is no later census, and for psychiatry no equivalent exists.',
      'The other territorial figure available covers doctors of all specialties, from 2011: 78.8 per 10,000 people in Montevideo against 21.7 outside it. The stem "psiquiatr" appears zero times in that report.',
    ],
    esperaTitulo: 'The waiting list, in two figures that stay apart',
    espera: [
      'The government reported that 30,000 users were waiting for a psychiatry appointment at ASSE at the start of the term. It also reported a reduction of 15% over seven months, to November 2025.',
      'The two figures do not go together. The 30,000 are attributed to "los servicios de psiquiatría", the psychiatry services, of ASSE. The minus 15% is attributed to "los servicios de salud mental del prestador público", the mental health services of the public provider. The government does not say that they measure the same thing, and the absolute value of November 2025 is not published.',
      'There is a maximum waiting time for a specialty appointment, of 30 days. It is a decree, not an act, and it does not name psychiatry. The waiting-time targets the government set itself cover the whole system: none is about mental health.',
    ],
    estrategiaRrhhNota: 'The 2025-2030 Strategy has 67 pages and its Pillar 5, the workforce one, carries neither a baseline figure nor a numerical target. By exact word, «psiquiatra» appears 2 times and «psicólogos» 1; the stem «enfermer» appears 0 times. By stem, «psiquiatr» gives 10 and «psicolog» gives 3.',
    llamadasNota: 'The two help lines are not added up under one single label. In 2023 the emotional support line received 23,842 calls and the suicide prevention line answered 5,129. "Received" and "answered" are two different units.',

    /* 13 · RECOMENDACIONES */
    recosTag: 'What the country is told to do',
    recosTitle: 'Fifty-two recommendations, and their status in Uruguay',
    recosP: 'Each row carries the body that wrote it, its literal quote and the status in Uruguay with the source of that status. The status is never an opinion: it is what another source allows us to state. The WHO quotes are in English, which is the edition the WHO declares binding.',
    recosCols: { id: '#', org: 'Body', cita: 'Literal quote', estado: 'Status in Uruguay', fuente: 'Source of the status' },
    orgLabels: {
      oms: 'World Health Organization',
      ops: 'Pan American Health Organization',
      msp: 'Health Ministry',
      inddhh: 'INDDHH',
      cncasm: 'National Oversight Commission',
      asamblea: 'Asamblea Instituyente, 2015 draft bill',
    },
    estadoLabels: {
      si: 'yes',
      siReserva: 'yes, with a reservation',
      parcial: 'partial',
      no: 'no',
      noVerificado: 'not verified',
      norma: 'the rule exists; compliance is not published',
      anunciado: 'announced',
      ocurrio: 'what was warned about happened',
      participa: 'participates',
      noAplica: 'does not apply yet',
    },
    recosRemate: 'The closing row of the table is R5. The WHO asks for an earmarked budget allocated every year for suicide prevention. In Uruguay the status is NO, and the proof is the count this piece opens with.',
    recos: {
      R1: 'It is objective 6 of the 2021-2025 National Strategy, written as «restringir el acceso a medios letales», restricting access to lethal means. The corpus records no purchase tied to that objective.',
      R2: 'Three Uruguayan sources, and none is an enforceable coverage rule: Ley 18.097 article 4 ("según sus posibilidades", as far as possible), the presentation of the WHO material in 2015, and pillar 7 of the 2025-2030 Strategy as an expected result. R30 updates it.',
      R3: 'The two Health Ministry guides of October 2023. A guide is not a curriculum: the evidence behind this intervention comes from a programme with a defined dose and a trained instructor.',
      R4: 'The 2024-2025 care target for follow-up after discharge exists. It sits in tension with Ordenanza Ministerial 384/017, which demands active follow-up for six months: the instrument that pays stops at 30 days.',
      R5: 'Zero mentions of "suicidio" in seven budget and accountability laws, 2020-2025, over the enacted text.',
      R6: 'The official series runs from 20.55 in 2019 to 19.16 in 2025, with a maximum of 23.20 in 2022. We did not verify which base year Uruguay uses for the one-third.',
      R7: 'Uruguay has Ley 19.529 since 2017. The reservation: Ley 20.446 article 381 removed the ban on admission to asylums, and the INDDHH called it "una alteración estructural del sentido de la ley", a structural change to the meaning of the law.',
      R8: 'It is a recommendation of the 2024 Clinical Practice Guideline, written outside the Ordenanza Ministerial 384/017 block. It matches the 2-day milestone of the care target. There is no public compliance figure.',
      R9: 'It is a duty of Ordenanza Ministerial 384/017, from 2017. Seven years before the clinical guideline, and by ministerial ordinance. There is no public compliance figure.',
      R10: 'There is no budget line for the National Honorary Commission for Suicide Prevention. Ley 20.446 does not name it. Its founding decree of 2004 does not either: zero occurrences of five spending stems, and one single amendment in twenty-two years, which adds a delegate.',
      R11: 'There is no budget line. The body spent eleven months between the end of one term and the swearing in of the next, and published one single document online.',
      R12: 'The indicator the strategy set itself is "Estrategia 2026-2030 aprobada por resolución ministerial (Sí/No)", 2026-2030 Strategy approved by ministerial resolution. It is not on record as approved at 18 August 2026.',
      R13: 'The indicator is "Plan nacional de desinstitucionalización aprobado y en ejecución", national deinstitutionalisation plan approved and under way. The matrix deadline is 2025-2027, in the hands of two forums that the oversight body described as inactive.',
      R14: 'The deadline matrix sets it at 2025-2025. It had already expired when the document was published, in April 2026.',
      R15: 'The indicator is "Tasa de recurrencia de intentos de autoeliminación entre personas con antecedentes previos", recurrence rate of suicide attempts among people with a previous attempt. There is no published baseline.',
      R16: 'Two implementing decrees in almost nine years, and none of those four articles.',
      R17: 'Article 38 orders it since 2017. It does not exist.',
      R18: 'Baseline 0 and cumulative target 4 for 2029, in Tomo II of the 2025-2029 Budget.',
      R19: 'It is the rule that creates the digital register of October 2022. It repeals point 2 of Ordenanza 801/012, which was the paper form. The ordinance is dated 28/09/2022 and orders the responsible officers to be notified before 10 October 2022: those are the signature and the start, two dates that measure different things.',
      R20: 'We found no sanction applied. The under-recording is still acknowledged by the Health Ministry itself.',
      R21: 'No rule that reverses article 381 is on record at 18 August 2026.',
      R22: 'We did not recover the verbatim record of the ministerial appearance.',
      R23: 'The deadline moved to 2029 in December 2025, inside the budget law.',
      R24: 'The State does not publish how many transition services exist.',
      R25: 'Article 39 of Ley 19.529 created it as a decentralised body under the Health Ministry, not as a body independent of the legislature.',
      R26: 'The act set 2025 and the 2025 budget moved it to 2029.',
      R27: 'Five of the ten LIVE LIFE elements have a mirror objective in the 2021-2025 Strategy. Two foundations do not: the situation analysis and the financing. The mapping is our own reading: "LIVE LIFE" appears zero times in the Uruguayan strategy, which names another framework.',
      R28: 'The measure does not exist in Uruguay yet. It is the standard objection to R1, and the WHO answers it in writing. "Not inevitably" is not "never".',
      R29: 'The Health Ministry holds the breakdown in its publications. It is not on record as a declared input of objective 6. This row carries no breakdown: it says that the policy must look at that figure, not what the figure is.',
      R30: 'The same three sources as R2. None is an enforceable coverage rule.',
      R31: 'No reproach mechanism for coverage is on record, from the Health Ministry or from a press body. The guide does not quantify the effect of the Austrian measure on the rate.',
      R32: 'It sits inside a country case box, not in the normative body of the guide.',
      R33: 'In 2023 the Health Ministry published one guide for schools and another for primary care.',
      R34: 'The two Health Ministry guides of 2023. A guide is not a curriculum. We did not verify that Uruguay has a programme with a defined dose and a trained instructor delivered at scale.',
      R35: 'It is the only thing the procurement corpus sees: two purchases of a suicide response line in twenty-four years. Crisis lines are not one of the four LIVE LIFE interventions, and that they are not does not mean that the WHO advises against them.',
      R36: 'The Health Ministry publishes rates by sex for 2024 and 2025. It publishes the suicide attempt by department in no year. For 2024 and 2025 it describes the concentration by age without figures.',
      R37: 'Ley 19.979, signed on 20/08/2021. Its article 3 designates the Health Ministry, MIDES, MEC, INAU and INJU. The act allocates no budget of its own and leaves content and frequency to the authorities.',
      R38: 'Ley 18.097, article 3, since 2007. The act sets no deadlines, no minimum coverage and no budget. We found nothing published on what share of the staff is trained, almost twenty years later.',
      R39: 'Uruguay presented its register of suicide attempts at the regional launch of 10/09/2025. The initiative commits no amount.',
      R40: 'No compliance percentage by provider is published.',
      R41: '2024 Clinical Practice Guideline, inside the Ordenanza Ministerial 384/017 block. Compliance is not published.',
      R42: 'The indicator the strategy set itself is "Protocolo elaborado y aprobado", protocol drafted and approved, in the hands of the Interior Ministry. It cannot be stated that the protocol does not exist. It can be stated that it is not public.',
      R43: 'The Health Ministry announced it again as future work on 17/07/2025, in almost the same words as in 2021. The Mental Health Strategy of November 2025 does not contain the expression "zonas de riesgo", risk areas, once in its 67 pages.',
      R44: 'The indicator the strategy set itself is "Control del acceso", access control, with no baseline and no target. We found no published result.',
      R45: 'It is the only access restriction instrument that already exists. It predates the strategy and was not born as suicide prevention. The strategy did not ask for the requirement to be created, but for the assessment method to be standardised. The requirement lives in article 18, point 5, of Decreto 345/020.',
      R46: 'The indicator is defined: "Porcentaje de puertas de emergencia que registran IAE a través de SIVISA", share of emergency departments that record suicide attempts through SIVISA. Its value is not published. The strategy does not create the duty: it restates it. It applies since Ordenanza 1323/022.',
      R47: 'The decree delegates the content to guidelines that it does not define. Those guidelines arrive with the 2017 protocol.',
      R48: 'In 2025 the Health Ministry stated that it holds no central register with the breakdown requested, and refused the freedom-of-information request.',
      R49: 'These 48 hours are not the 48 hours of the care target. These run towards the Reception Committee, which is the entry door to the benefit. The care target ones run after hospital discharge.',
      R50: 'The other users wait six months after dropping out and two years after finishing a course of treatment. For the population with a suicide attempt the rule sets no barrier to re-entry.',
      R51: 'The document does not acknowledge: it announces. Fifteen years after the decree, that analysis appears as a future action. That it is not analysed today is an inference from the future tense. The typos are in the original.',
      R52: 'The same text proposes as an indicator "Porcentaje de casos de IAE en cada prestador del SNIS que cumplen con el Protocolo", share of suicide attempt cases at each SNIS provider that comply with the protocol. It is an indicator still to be built: today it is not published.',
    },

    /* 14 · PEDIDOS DE DATOS */
    pedidosTag: 'What we ask for',
    pedidosTitle: 'Forty-six figures that are missing',
    pedidosP: 'This is our own request, and it is a request for data. We do not ask for health policy. We ask that what is already measured be published, so that the management of these resources can be audited from outside. Each row names the body and the exact gap.',
    pedidosCols: { id: '#', q: 'Request', organismo: 'Body', why: 'Why it is missing today' },
    bloqueLabels: {
      intentos: 'The series of suicide attempts',
      plata: 'Money',
      camas: 'Beds, services and closure',
      rrhh: 'Workforce and compliance',
      compras: 'The procurement record, which is where this site lives',
      prestaciones: 'Benefits and care target',
      estrategia: 'Compliance with the expired strategy',
      internacional: 'International comparison',
    },
    pedidos: {
      P1: { q: 'The annual series since 2023, with the unit declared on every row: episodes and people kept apart', why: '2023 and 2024 are published in one unit and 2025 in another, without saying so' },
      P2: { q: 'The raw count of 2024. Today only the rate exists', why: 'The count was never published; it has to be derived at third hand' },
      P3: { q: 'The population denominator of each rate, year by year, with the projection vintage used', why: 'The implied denominators of 2023 and 2024 exceed the 2023 census and the INE maximum' },
      P4: { q: 'Suicide attempts by department, by year', why: 'They were never published. The only territorial figure in circulation comes from another capture system' },
      P5: { q: 'Suicide attempts by age band, in counts and in rates, for 2024 and 2025', why: 'Only a qualitative description is published' },
      P6: { q: 'The annual series of the paper form, 2013-2022, if it exists in any archive', why: 'Notification is mandatory since December 2012 and the series was never published' },
      P7: { q: 'A dataset in the national open data catalogue', why: 'Searches for «autoeliminación» and for «IAE» return zero results' },
      P8: { q: 'The recurrence rate, which the Strategy itself sets as an indicator', why: 'There is no published baseline' },
      P9: { q: 'The execution of each mental health budget line, by line and by year, not only the allocated credit', why: 'Execution is published by budget head and programme, and the programme contains all care' },
      P10: { q: 'A mental health breakdown in the National Health Accounts', why: '22 pages and zero mentions in the 2024 bulletin' },
      P11: { q: 'Reporting mental health spending to the WHO', why: 'Two consecutive Atlas editions with the financing boxes empty' },
      P12: { q: 'The breakdown of ASSE spending by care area, so that mental health can be separated', why: 'The total spending of ASSE is published unopened' },
      P13: { q: 'The split of the 60,000,000 of article 508 between urological pathology and mental health', why: 'The law gives a double purpose with no breakdown' },
      P14: { q: 'The annual cost of running the two help lines', why: 'It appears neither in the law, nor in the procurement record, nor on the ASSE website' },
      P15: { q: 'The annual series of calls to the two lines', why: 'There is only press from April 2024, with data of 2023 and of the first quarter of 2024' },
      P16: { q: 'The closure timetable of asylum and single-specialty establishments', why: 'Article 38 orders it since 2017 and it is in neither of the two implementing decrees' },
      P17: { q: 'The register of community services: how many, where, how many places, which provider', why: 'The Strategy itself sets "do the assessment" as a target, and that target expired in 2025' },
      P18: { q: 'An updated census of CEREMOS', why: 'The latest public one is from October 2023' },
      P19: { q: 'The annual series of psychiatric beds by provider, public and private', why: 'The only source with detail is a consultancy report of 2022, which contradicts itself' },
      P20: { q: 'The annual reports of the National Oversight Commission, which the decree requires it to submit', why: 'The duty runs to the ministry, not to the public. One single document online' },
      P21: { q: 'Practising psychiatrists and psychologists, by department and by provider', why: 'The register of qualifications accumulates and removes none. It lists 27,834 licensed doctors of medicine' },
      P22: { q: 'The ASSE psychiatry waiting list in absolute terms, by month and by unit', why: 'A reduction of 15% was published with no reference absolute figure' },
      P23: { q: 'The compliance rate of the follow-up care target, by provider', why: 'The Strategy sets it as an indicator still to be built' },
      P24: { q: 'The share of emergency departments that record the suicide attempt, which is an indicator of the Strategy itself', why: 'Not published' },
      P25: { q: 'The amount with taxes in the feed, or the tax field on its own', why: 'The feed publishes the amount without taxes and the portal shows the amount with taxes' },
      P26: { q: 'The buyer of the central medicine purchases', why: 'The central tenders of 2005-2008 come with no buyer' },
      P27: { q: 'The itemised award of the central sedative channel, today in an attachment outside the feed', why: 'The tender is listed with one item of quantity 1 and no award' },
      P28: { q: 'Correcting the line-total artefacts below the ceiling of 50 billion', why: 'A 2020 record is worth 646,289,368 in the corpus and 788,473,028.96 on the portal. Both are inflated' },
      P29: { q: 'The list of bidders of each tender in the feed', why: 'Only 28 of 1,368 lexicon purchases carry that figure. Competition cannot be measured' },
      P30: { q: 'Resolving the duplicate records: three INAU purchases with the same amount to the thousandth and the same six suppliers', why: 'If only one is real, the double count reaches 78,329,902 pesos' },
      P31: { q: 'Compliance with the follow-up target broken down by the four milestones', why: 'The instruction measures the four milestones separately. A global compliance figure does not say which milestone fails' },
      P32: { q: 'The annual total of sessions by Mode, with no breakdown by person', why: 'The Health Ministry refused the request for lack of a breakdown. It never said it holds no usage figure at all: a narrower request would test that' },
      P33: { q: 'How many providers declared non-adherence on the suicide attempt indicator', why: 'It decides whether the incentive reaches the whole system or only those who sign up' },
      P34: { q: 'How often the milestone of the face-to-face consultation at 7 days closes by telephone', why: 'The instruction expressly allows it. Without that number there is no way to know how much of the 30% is paid for consultations that happened' },
      P35: { q: 'The national cap in force in pesos of the Mode 2 and Mode 3 co-payment', why: 'The original caps of 2011 are updated by percentage, and no recent decree names the Modes again' },
      P36: { q: 'The price of the psychotherapy session by provider, in the open co-payment dataset', why: 'That dataset has 46 columns and none is about mental health' },
      P37: { q: 'The waiting time for mental health by provider', why: 'The waiting time dataset covers five specialties and none is psychiatry' },
      P38: { q: 'How Mode 2 is paid for at ASSE', why: 'The decree binds every comprehensive provider, and co-payments are set for the mutual insurers. It decides whether the 9,072 pesos apply to half the country or to the other half' },
      P39: { q: 'The result of the three activities of Objective 6 of the 2021-2025 Strategy', why: 'All three have an indicator written by the strategy itself and none has a published result' },
      P40: { q: 'The evaluation report of the 2021-2025 Strategy', why: 'In 2025 the Health Ministry stated that the evaluation is under way. Without the report there is no saying which objectives were met' },
      P41: { q: 'The monitoring of press coverage of suicide', why: 'The 2025-2030 Strategy sets responsible coverage as an expected result and does not say how it will be measured' },
      P42: { q: 'The psychiatry residency posts that the State funds each year', why: 'The list of places links a PDF that returns 404' },
      P43: { q: 'How many associated teaching centres in psychiatry exist today and in which departments', why: 'The Strategy plans to guarantee them "in every department" and publishes no baseline' },
      P44: { q: 'An updated census of psychologists by department', why: 'The only map is from 2014, measures declared residence and covers 77.1% of the census universe' },
      P45: { q: 'The Uruguay country profile of the Mental Health Atlas 2024', why: 'Uruguay answered the questionnaire and appears among the contributors. The expected address returns 404' },
      P46: { q: 'The numerator and the population with which PAHO computes its attempt rate for 2024', why: 'The Health Ministry publishes 161.74 for the same year and the same unit. Without the PAHO base it cannot be reconciled' },
    },

    /* 15 · LÍMITES Y FUENTES */
    limitesTag: 'The limits',
    limitesTitle: 'What we could not verify',
    limitesP: 'It goes whole. Each limit says what could not be verified and why.',
    limites: [
      {
        key: 'corpus',
        title: 'Limits of the procurement corpus',
        items: [
          'The lexicon measures text, not spending. A purchase enters whole even when the lexicon touches only one of its lines. At ASSE the effect has a measured ceiling of 22.8% of the lexicon total. Every percentage of this piece is a ceiling, not an exact measure.',
          'The lexicon has false positives and false negatives at the same time. At the Health Ministry, banners, cloth bags, video editing, toner and cards come in, because the tender document names the Mental Health Programme. And an antidepressant bought under its brand name does not come in.',
          'The corpus does not see the bulk of the spending. ASSE salaries, the mandatory benefits of the system and the budgets of the establishments generate no purchase.',
          'Every amount is nominal pesos with no deflation. The sum of twenty-four years is not comparable across years.',
          'The maximum-per-purchase rule drops the extensions. Any contract extended below its base amount is undervalued.',
          'The corpus is without taxes and the portal is with taxes. The total mixes exempt purchases measured gross with taxable purchases measured net.',
          'There is no bidder figure for 98% of the lexicon purchases. A single-bidder rate for mental health cannot be published.',
          'No database of the site carries the legal form of the supplier. The split between non-profit organisation and company is not published.',
          '2026 is a partial year. The corpus runs to 18 August.',
          'The line-total artefacts are not all identified. The ceiling of 50 billion catches fifteen, and there is at least one large one below the ceiling.',
          'We did not verify each of the 622 ASSE lexicon purchases against the portal. We verified the six largest and the two anomalous cases.',
          'The list of psychotropic molecules is our own and is not exhaustive. Neither an international catalogue nor the full official catalogue was used.',
          'The feed does not carry the dose. The item code is generic, so no price-per-tablet series measures an identical product.',
          'The psychotropic drug amount does not use the normalised field. It uses quantity times line unit price, which is the only way to measure by molecule. It is not comparable with any other peso figure of the site.',
          'The count of tablets is a floor. Some 33.6 million units carry the generic label "UNIDAD" and cannot be separated.',
          'The 792,946,097 pesos of August 2026 are also a floor. Twelve lines do not deflate because the Indexed Unit of their month is missing.',
          'The false positive filter of the lexicon was applied to a single token. Five measured noise sources remain, and three are not netted out.',
          'The nine-family lexicon cannot be reproduced bit for bit. The original script is neither on disk nor in the repository, and the rewrite reproduces three families exactly.',
          'The «crisis» family has no publishable figure. Two measurements of the same family differ by three purchases that the new expression does not find, and which token brings them is unknown.',
          'The INAU triplicate decides the sign of the «salud mental» correction. Until it is resolved, the correction is not stated as an upward correction.',
          'The multiple between defibrillator and suicide depends on the imputation rule. The stable figure is the count of purchases.',
          'The corpus grows during the measurement session. That is why every figure carries its date and its time.',
          'Almost four in ten lexicon purchases carry no amount. In «salud mental» they are 62 of 167, and in 23 of those 62 the award exists and is cancelled.',
          'Of the purchases that name a psychiatric molecule, 1,568 show no awarded item at all.',
        ],
      },
      {
        key: 'prestaciones',
        title: 'Limits of the benefits and of the care target',
        items: [
          'The national cap in force of the co-payment cannot be cited. The 573 and the 189 pesos are the published price list of one provider.',
          'The 9,072 pesos are a theoretical ceiling. Nobody publishes how many sessions a person who attempted suicide uses on average.',
          'The 48 hours of the Reception Committee are not the 48 hours of the care target. They are two different clocks.',
          'The cover of ASSE against the mutual insurers on these benefits is not measured. How Mode 2 is paid for at ASSE was left unverified.',
          'Decreto 366/011 contradicts itself, and the contradiction is shown, not resolved. The same article authorises charging for the interview with the Mode 1 coordinator and three lines later orders access to Mode 1 to be free.',
          'We did not measure whether the outsourcing that the annex to Decreto 305/011 allows leaves a trail in ASSE purchases. It would be the only bridge between that rule and what this site measures.',
          'The observed compliance with the follow-up target does not exist as public data. It is the central hole of the whole services strand.',
        ],
      },
      {
        key: 'fuentes',
        title: 'Limits of the official and international sources',
        items: [
          'The count of 4,723 suicide attempts in 2023 has one single source, and it is an opinion column that attributes the figure to the Health Ministry without citing a document.',
          'The unit of the 2023 rate is not proved by arithmetic. The sum closes just the same if they were people.',
          'The rate of 147.56 of 2025 was not published by the Health Ministry. A news outlet published it, citing the ministry.',
          'There is no official quantified estimate of the under-recording. The Strategy acknowledges it in writing and does not measure it.',
          'We did not recover the verbatim record of the ministerial appearance on article 381.',
          'We could not enumerate the corpus of implementing decrees of Ley 19.529: the IMPO search tool asks for a login.',
          'We did not read the credit schedules of the Tomo III volumes. They are published. Without them the previous budget cycle cannot be compared with the current one.',
          'We did not read the 2026-2027 Care Targets Instruction.',
          'No public list of community services exists at any body that we were able to consult.',
          'The current membership of the National Oversight Commission was not verified independently.',
          'The international ranking ends in 2021 and the Health Ministry series runs to 2025. The two ends do not finish in the same year.',
          'The quotes from the WHO guide are from the English original. The Spanish edition could not be downloaded.',
          'The register of qualifications carries no department. We cannot state that the State lacks the territorial figure: we can state that we did not find it in public sources.',
          'The Uruguay country profile of the Mental Health Atlas 2024 is not published. The last complete portrait of the Uruguayan system holds 2020 data.',
          'The conversion of the doctor rate into an absolute number is ours.',
          'The 2021-2025 Strategy presents itself as a proposal. Its text says "El presente documento constituye la propuesta en materia de Estrategia Nacional", this document is the proposal for a National Strategy.',
          'We did not recover the full text of Ordenanza 801/012 or of Ordenanza Ministerial 384/017. Of the second, the PDF of the protocol it approves circulates, not the administrative act.',
          'The 2025-2030 Strategy has three incompatible dates in circulation. One single date is used here: the document is dated "Noviembre, 2025" on its cover and the Health Ministry published it on 20 April 2026. 16 April 2026 is the creation date of the PDF and does not appear in the body.',
        ],
      },
      {
        key: 'responsable',
        title: 'Limits of responsible communication',
        items: [
          'Several primary sources carry a breakdown by method. They were read and not carried over, because of the WHO recommendation. Whoever needs it will find it in the PDFs cited.',
          'The sentence "the health system saw them and did not act" cannot be written. The percentages of previous consultation are descriptive and no source states that cause.',
          'The 93.09 of the prison is not placed next to the national rate without warning that the denominator is another one.',
          'One individual case was left out by rule. A resolution number that points to a case with the person named is a pointer to the case, and no caveat protects it.',
          'The risk of the transition period after discharge, which the Uruguayan guide puts at 300 times in the first week and 200 in the first month, is international literature cited by the guide. It is not a Uruguayan measurement.',
        ],
      },
    ],

    sourcesTag: 'Where to check',
    sourcesTitle: 'All of this is public',
    sourcesP: 'The laws sit in IMPO. The decrees, ordinances and instructions sit on the Health Ministry portal. The purchases sit in the state procurement record, each one with its identifier. One single figure came from a freedom-of-information request, and its answer is published too.',
    srcOficial: 'State documents and international bodies',
    srcPrensa: 'Press, cited as press',
  },
} as const

export function srContent(locale: string) {
  return SR_CONTENT[(locale === 'en' ? 'en' : 'es') as Locale]
}

/** La tarjeta del índice, por idioma. Misma forma que `srContent`. */
export function srCard(locale: string) {
  return SR_CARD[(locale === 'en' ? 'en' : 'es') as Locale]
}
