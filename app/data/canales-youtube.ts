/**
 * Canales de YouTube uruguayos sobre gasto público y política.
 *
 * Es un DIRECTORIO VERIFICADO, no una lista de favoritos. La página existe porque
 * buscar estos canales a mano falla de tres formas medidas el 2026-08-18:
 *
 *   1. Adivinar el handle trae impostores. `youtube.com/@subrayado` responde 200 y
 *      es un canal de 9 suscriptores con dos videos de 2009. El informativo real se
 *      publica en el canal de Canal 10.
 *   2. El canal más grande que aparece buscando un medio uruguayo puede ser de otro
 *      país. «El Observador 107.9» tiene 289 mil suscriptores y YouTube publica
 *      Argentina como su país: es la radio hermana en Buenos Aires.
 *   3. Un canal oficial puede estar muerto. Cabildo Abierto no publica desde
 *      noviembre de 2024 y la JUTEP tiene canal sin ningún video.
 *
 * REGLA DE ENTRADA, y se aplica a todos por igual. Un canal entra sólo con al menos
 * UNA de estas dos pruebas, y la ficha dice cuál tiene:
 *
 *   - `pais`: YouTube publica «Uruguay» en la pestaña «Más información» del canal.
 *   - `sitio`: el sitio oficial del organismo, medio o partido enlaza ESE canal.
 *
 * Ninguna prueba es la opinión de nadie. Las dos se vuelven a correr con
 * `npx tsx tests/unit/canales-youtube.verify.ts`.
 *
 * LO QUE NO ENTRA, por regla y no por gusto:
 *
 *   - Canales personales de políticos. Elegir cuáles sería una decisión editorial
 *     sobre quién importa, y no hay forma de medirla.
 *   - Sectores y listas dentro de un partido. Sólo entra el canal del partido.
 *   - Canales sin ninguna de las dos pruebas, por grandes que sean.
 *
 * Las cifras de suscriptores y videos son las que publica YouTube, con su redondeo,
 * repuntuadas al español. `subscribersApprox` sólo existe para ordenar y para que el
 * verificador compare magnitudes en vez de textos; nunca se muestra.
 *
 * Verificación: 2026-08-18. Método completo abajo, en METODO.
 */

export interface Bi { es: string, en: string }

/** Qué es el canal respecto del dinero público. Ordena la página. */
export type Category = 'estado' | 'medios' | 'partidos' | 'analisis'

/** Cómo se probó que el canal es uruguayo y es de quien dice ser. */
export type Proof = 'pais' | 'sitio'

/**
 * Dónde está el canal respecto del gobierno, cuando eso es un hecho institucional.
 *
 * Sólo lo llevan los partidos. El Frente Amplio gobierna desde marzo de 2025 y el resto
 * de los partidos con bancas está fuera del gobierno. No es una ubicación ideológica:
 * a los medios NO se les pone etiqueta, y en su lugar la ficha publica una medición de
 * lo que cada uno publica (ver ~/data/canales-youtube-muestra).
 */
export type Bloc = 'gobierno' | 'oposicion'

export interface Channel {
  /** Identificador de YouTube (UC…). Es la clave estable: el handle cambia. */
  id: string
  /** Nombre tal como lo publica el canal. */
  name: string
  /** Parte final de la URL de su ficha en este sitio. */
  slug: string
  /** Handle actual. Se muestra, pero los enlaces salen por `id`. */
  handle: string
  category: Category
  /** Sólo partidos. Hecho institucional, no ubicación ideológica. */
  bloc?: Bloc
  /** Qué publica el canal. */
  what: Bi
  /** Por qué sirve para seguir el dinero público. */
  why: Bi
  /** Pruebas de identidad que pasó. Al menos una. */
  proofs: Proof[]
  /** URL del sitio oficial que enlaza el canal. Sólo con la prueba `sitio`. */
  proofUrl?: string
  /** Suscriptores, con la redacción de YouTube. `null` = el canal los oculta. */
  subscribers: string | null
  /** Sólo para ordenar la lista. Sale de `subscribers`. */
  subscribersApprox: number
  /** Videos publicados, con la redacción de YouTube. */
  videos: string | null
  /** ISO. Último video del feed público del canal. `null` = feed vacío. */
  lastUpload: string | null
  /** Sitio oficial del organismo, medio o partido. */
  site?: string
  /** Ficha del organismo en este sitio. Es `buyer.id`, o sea inciso-unidad. */
  buyerId?: string
  /** Página propia relacionada, cuando medimos algo sobre este canal. */
  related?: { to: string, label: Bi }
}

/** Fecha de la verificación de toda la tabla. */
export const VERIFIED_ON = '2026-08-18'

/** Un canal cuenta como activo si publicó dentro de esta ventana. */
export const ACTIVE_WINDOW_DAYS = 90

export const CHANNELS: Channel[] = [
  // ─── El Estado filmándose a sí mismo ─────────────────────────────────────────
  {
    id: 'UCz1Li9JcQB9XP-HfgN0IYLQ',
    name: 'Presidencia Uruguay',
    slug: 'presidencia',
    handle: '@PresidenciaUruguay-b2s',
    category: 'estado',
    what: {
      es: 'Actos, conferencias de prensa y anuncios del Poder Ejecutivo, subidos el mismo día.',
      en: 'Executive branch events, press conferences and announcements, uploaded the same day.',
    },
    why: {
      es: 'El anuncio de una obra o de un programa llega acá antes que la licitación al feed de compras. Sirve para saber qué buscar después.',
      en: 'A public-works or programme announcement lands here before the tender reaches the procurement feed. It tells you what to search for next.',
    },
    proofs: ['pais'],
    subscribers: '78,1 mil',
    subscribersApprox: 78100,
    videos: '20.163',
    lastUpload: '2026-08-18',
    site: 'https://www.gub.uy/presidencia/',
    buyerId: '2-1',
  },
  {
    id: 'UCyM7oro5NhR5oPyMEFB_rUA',
    name: 'Cámara de Senadores',
    slug: 'camara-de-senadores',
    handle: '@SenadoUY',
    category: 'estado',
    what: {
      es: 'Sesiones completas del Senado, sin edición y sin relato.',
      en: 'Full Senate sessions, unedited and without commentary.',
    },
    why: {
      es: 'La Rendición de Cuentas y el Presupuesto se votan acá. Es la fuente primaria de lo que después se resume en dos minutos de informativo.',
      en: 'The budget and the annual accounts are voted here. It is the primary source behind the two-minute TV summary.',
    },
    proofs: ['pais'],
    subscribers: '23,8 mil',
    subscribersApprox: 23800,
    videos: '645',
    lastUpload: '2026-08-18',
    site: 'https://parlamento.gub.uy/',
    buyerId: '1-1',
  },
  {
    id: 'UCUxioxgZ7obrP3wVJApAK1w',
    name: 'Cámara de Representantes',
    slug: 'camara-de-representantes',
    handle: '@diputados_uy',
    category: 'estado',
    what: {
      es: 'Sesiones de Diputados y comisiones, incluidas las que citan a un ministro.',
      en: 'Chamber of Deputies sessions and committees, including ministerial hearings.',
    },
    why: {
      es: 'En las comisiones se pregunta por contratos concretos. Es donde un organismo explica una compra antes de que exista una nota sobre ella.',
      en: 'Committees ask about specific contracts. It is where an agency explains a purchase before any article covers it.',
    },
    proofs: ['pais'],
    subscribers: '19,8 mil',
    subscribersApprox: 19800,
    videos: '1.207',
    lastUpload: '2026-08-18',
    site: 'https://parlamento.gub.uy/',
    buyerId: '1-2',
  },
  {
    id: 'UCMHQqhtbpxfcnPPYpryapHA',
    name: 'Canal 5 Uruguay',
    slug: 'canal-5',
    handle: '@Canal5UY',
    category: 'estado',
    what: {
      es: 'La televisión pública nacional, con sus informativos en vivo.',
      en: 'The national public broadcaster, with its live newscasts.',
    },
    why: {
      es: 'Es un medio y a la vez un organismo que compra. Su gasto figura en esta base como cualquier otro comprador estatal.',
      en: 'It is both a newsroom and a purchasing agency. Its spending sits in this database like any other state buyer.',
    },
    proofs: ['pais'],
    subscribers: '205 mil',
    subscribersApprox: 205000,
    videos: '42.494',
    lastUpload: '2026-08-18',
    site: 'https://www.tvnacional.uy/',
    buyerId: '11-24',
  },
  {
    id: 'UCcEFFCUo9fD5DK1FcclyKUA',
    name: 'TV Ciudad',
    slug: 'tv-ciudad',
    handle: '@TVCiudad6.1',
    category: 'estado',
    what: {
      es: 'El canal de la Intendencia de Montevideo, con programación completa en vivo.',
      en: 'The Montevideo city government channel, streaming its full schedule.',
    },
    why: {
      es: 'Es televisión pagada por la Intendencia. Ya medimos cuánto cuesta y con qué contratos.',
      en: 'It is television paid for by the city government. We already measured what it costs and through which contracts.',
    },
    proofs: ['pais'],
    subscribers: '223 mil',
    subscribersApprox: 223000,
    videos: '32.466',
    lastUpload: '2026-08-18',
    site: 'https://tvciudad.uy/',
    related: { to: '/investigaciones/tv-ciudad', label: { es: 'Cuánto cuesta TV Ciudad', en: 'What TV Ciudad costs' } },
  },
  {
    id: 'UCfV6oJPalBI6mXUwG6p2KZQ',
    name: 'Intendencia de Montevideo',
    slug: 'intendencia-de-montevideo',
    handle: '@IntendenciaMdeo',
    category: 'estado',
    what: {
      es: 'Obras, servicios y llamados del gobierno departamental de Montevideo.',
      en: 'Public works, services and calls from the Montevideo departmental government.',
    },
    why: {
      es: 'Es el mayor comprador departamental del país. Lo que anuncia en video se puede cruzar con sus adjudicaciones.',
      en: 'It is the largest departmental buyer in the country. What it announces on video can be cross-checked against its awards.',
    },
    proofs: ['pais', 'sitio'],
    proofUrl: 'https://montevideo.gub.uy/',
    subscribers: '11,8 mil',
    subscribersApprox: 11800,
    videos: '1.832',
    lastUpload: '2026-08-14',
    site: 'https://montevideo.gub.uy/',
    buyerId: '98-1',
  },
  {
    id: 'UC9fkm72wx-bBK-le5rYh2Fw',
    name: 'Banco Central del Uruguay',
    slug: 'banco-central',
    handle: '@BCUUy',
    category: 'estado',
    what: {
      es: 'Presentaciones de política monetaria y explicaciones técnicas del BCU.',
      en: 'Monetary policy presentations and technical explainers from the central bank.',
    },
    why: {
      es: 'La Unidad Indexada y el tipo de cambio del BCU son los que este sitio usa para comparar precios entre años.',
      en: 'The BCU indexed unit and exchange rates are what this site uses to compare prices across years.',
    },
    proofs: ['pais', 'sitio'],
    proofUrl: 'https://www.bcu.gub.uy/Paginas/Default.aspx',
    subscribers: '7,78 mil',
    subscribersApprox: 7780,
    videos: '149',
    lastUpload: '2026-08-05',
    site: 'https://www.bcu.gub.uy/',
    buyerId: '50-1',
  },
  {
    id: 'UCVKp6bAT-JfruLq39qKsQyA',
    name: 'INE Uruguay',
    slug: 'ine',
    handle: '@ine_uruguay',
    category: 'estado',
    what: {
      es: 'Presentaciones de censos, encuestas de hogares e índices de precios.',
      en: 'Census, household survey and price index presentations.',
    },
    why: {
      es: 'El índice de precios del INE es el que convierte un precio de 2014 en un precio de hoy.',
      en: 'The INE price index is what turns a 2014 price into a present-day one.',
    },
    proofs: ['pais', 'sitio'],
    proofUrl: 'https://www.gub.uy/instituto-nacional-estadistica/',
    subscribers: '2,17 mil',
    subscribersApprox: 2170,
    videos: '208',
    lastUpload: '2026-07-17',
    site: 'https://www.gub.uy/instituto-nacional-estadistica/',
    buyerId: '2-7',
  },
  {
    id: 'UCu6vr8WRDa_4vxKeZZS7sxg',
    name: 'Ministerio de Economía y Finanzas',
    slug: 'ministerio-de-economia',
    handle: '@DGSUruguay',
    category: 'estado',
    what: {
      es: 'Presentaciones del equipo económico, entre ellas la entrega de la Rendición de Cuentas.',
      en: 'Finance ministry briefings, including the annual accounts hand-over.',
    },
    why: {
      es: 'Es el organismo que fija el marco del gasto de todos los demás.',
      en: 'It sets the spending frame every other agency works within.',
    },
    proofs: ['pais'],
    subscribers: '1,05 mil',
    subscribersApprox: 1050,
    videos: '495',
    lastUpload: '2026-07-01',
    site: 'https://www.gub.uy/ministerio-economia-finanzas/',
    buyerId: '24-5',
  },
  {
    id: 'UCpA43PbOMswp_XMOdsHBUdw',
    name: 'Oficina de Planeamiento y Presupuesto',
    slug: 'opp',
    handle: '@opp_uruguay',
    category: 'estado',
    what: {
      es: 'Convocatorias a fondos, programas territoriales y presentaciones de la OPP.',
      en: 'Fund calls, territorial programmes and OPP presentations.',
    },
    why: {
      es: 'La OPP reparte fondos a intendencias y programas. Su convocatoria en video antecede al gasto en el registro.',
      en: 'OPP distributes funds to departments and programmes. Its video calls precede the spending in the record.',
    },
    proofs: ['pais'],
    subscribers: '1,47 mil',
    subscribersApprox: 1470,
    videos: '333',
    lastUpload: '2026-08-15',
    site: 'https://www.gub.uy/oficina-planeamiento-presupuesto/',
    buyerId: '2-4',
  },
  {
    id: 'UCY04W7gCXX-POpNbSRArhLA',
    name: 'Auditoría Interna de la Nación',
    slug: 'auditoria-interna',
    handle: '@auditoriainternadelanacion9617',
    category: 'estado',
    what: {
      es: 'Talleres y material institucional del organismo de auditoría del Estado.',
      en: 'Workshops and institutional material from the state internal audit body.',
    },
    why: {
      es: 'Audita a los organismos que compran. Publica poco: cuatro videos en total.',
      en: 'It audits the agencies that buy. It publishes little: four videos in total.',
    },
    proofs: ['pais'],
    subscribers: '58',
    subscribersApprox: 58,
    videos: '4',
    lastUpload: '2026-08-05',
    site: 'https://www.gub.uy/auditoria-interna-nacion/',
    buyerId: '5-3',
  },
  {
    id: 'UC0vIwy6dZNIBRzdNw87CIhg',
    name: 'Agencia Reguladora de Compras Estatales',
    slug: 'arce',
    handle: '@accegubuy',
    category: 'estado',
    what: {
      es: 'Tutoriales del sistema de compras estatales y material institucional.',
      en: 'Tutorials for the state procurement system, plus institutional material.',
    },
    why: {
      es: 'Es la agencia que publica el feed de datos abiertos del que sale todo este sitio. No publica un video desde diciembre de 2025.',
      en: 'It runs the open-data feed this entire site is built on. It has not published a video since December 2025.',
    },
    proofs: ['sitio'],
    proofUrl: 'https://www.gub.uy/agencia-reguladora-compras-estatales/',
    subscribers: '832',
    subscribersApprox: 832,
    videos: '78',
    lastUpload: '2025-12-05',
    site: 'https://www.gub.uy/agencia-reguladora-compras-estatales/',
  },

  // ─── Medios que cubren la política nacional ──────────────────────────────────
  {
    id: 'UCp6X5jzfmwbOeclRArOi18g',
    name: 'Canal 4',
    slug: 'canal-4',
    handle: '@Canal4uy',
    category: 'medios',
    what: {
      es: 'Programación completa de Monte Carlo TV, con Telenoche entre sus informativos.',
      en: 'Monte Carlo TV full programming, including its Telenoche newscasts.',
    },
    why: {
      es: 'Cobra pauta oficial. Medimos cuánta, contra el ingreso declarado del canal.',
      en: 'It receives state advertising. We measured how much, against the channel’s declared revenue.',
    },
    proofs: ['pais', 'sitio'],
    proofUrl: 'https://www.canal4.com.uy/',
    subscribers: '374 mil',
    subscribersApprox: 374000,
    videos: '42.601',
    lastUpload: '2026-08-18',
    site: 'https://www.canal4.com.uy/',
    related: { to: '/investigaciones/canales-privados', label: { es: 'Pauta oficial a los canales', en: 'State advertising to TV channels' } },
  },
  {
    id: 'UCJI9kSwvvHX2CJeF8iZ6x8Q',
    name: 'Canal 10 Uruguay',
    slug: 'canal-10',
    handle: '@Canal10UruguayOficial',
    category: 'medios',
    what: {
      es: 'Programación de SAETA TV Canal 10, donde se publica Subrayado.',
      en: 'SAETA TV Canal 10 programming, home of the Subrayado newscast.',
    },
    why: {
      es: 'Cobra pauta oficial. Además: el handle `@subrayado` NO es de este informativo.',
      en: 'It receives state advertising. Also: the `@subrayado` handle is NOT this newscast.',
    },
    proofs: ['pais'],
    subscribers: '229 mil',
    subscribersApprox: 229000,
    videos: '11.154',
    lastUpload: '2026-08-18',
    site: 'https://www.canal10.com.uy/',
    related: { to: '/investigaciones/canales-privados', label: { es: 'Pauta oficial a los canales', en: 'State advertising to TV channels' } },
  },
  {
    id: 'UCimPJKAbuM6z6b6DPZz86Mw',
    name: 'Teledoce',
    slug: 'teledoce',
    handle: '@Teledocecom',
    category: 'medios',
    what: {
      es: 'Programación de Canal 12, con Telemundo entre sus informativos.',
      en: 'Canal 12 programming, including its Telemundo newscasts.',
    },
    why: {
      es: 'Cobra pauta oficial. Su sociedad titular declaró pérdida en 2025, y la pauta se mide contra eso.',
      en: 'It receives state advertising. Its holding company reported a 2025 loss, which is what the advertising is measured against.',
    },
    proofs: ['pais', 'sitio'],
    proofUrl: 'https://www.teledoce.com/',
    subscribers: '152 mil',
    subscribersApprox: 152000,
    videos: '3.653',
    lastUpload: '2026-08-18',
    site: 'https://www.teledoce.com/',
    related: { to: '/investigaciones/canales-privados', label: { es: 'Pauta oficial a los canales', en: 'State advertising to TV channels' } },
  },
  {
    id: 'UCA4VRT895OOPPHq-pc2V2CQ',
    name: 'VTV Uruguay',
    slug: 'vtv',
    handle: '@VTVSitioOficial',
    category: 'medios',
    what: {
      es: 'Señal de cable con informativo propio y análisis político diario.',
      en: 'Cable channel with its own newscast and daily political analysis.',
    },
    why: {
      es: 'Cubre la sesión parlamentaria y el conflicto sindical con más minutos que la televisión abierta.',
      en: 'It gives parliamentary sessions and labour disputes more airtime than broadcast television.',
    },
    proofs: ['pais', 'sitio'],
    proofUrl: 'https://www.vtv.com.uy/',
    subscribers: '100 mil',
    subscribersApprox: 100000,
    videos: '34.991',
    lastUpload: '2026-08-18',
    site: 'https://www.vtv.com.uy/',
  },
  {
    id: 'UCLvbVJDsVX4-qoyladIiVaQ',
    name: 'El Observador',
    slug: 'el-observador',
    handle: '@ObservaUY',
    category: 'medios',
    what: {
      es: 'Entrevistas y explicadores del diario, en video.',
      en: 'The newspaper’s interviews and explainers, in video form.',
    },
    why: {
      es: 'Cubre economía y negocios con detalle de contratos. Ojo con el homónimo: «El Observador 107.9» es argentino.',
      en: 'It covers business with contract-level detail. Watch the namesake: “El Observador 107.9” is Argentine.',
    },
    proofs: ['pais', 'sitio'],
    proofUrl: 'https://www.elobservador.com.uy/',
    subscribers: '182 mil',
    subscribersApprox: 182000,
    videos: '7.483',
    lastUpload: '2026-08-18',
    site: 'https://www.elobservador.com.uy/',
  },
  {
    id: 'UCzj1iuImjo-Eb8JMELC1Jwg',
    name: 'En Perspectiva',
    slug: 'en-perspectiva',
    handle: '@EnPerspectiva',
    category: 'medios',
    what: {
      es: 'El programa periodístico de Radiomundo, con la entrevista central en video.',
      en: 'The Radiomundo current-affairs show, with its main interview on video.',
    },
    why: {
      es: 'La entrevista larga a un ministro o a un director de organismo suele salir primero acá.',
      en: 'The long interview with a minister or agency head usually airs here first.',
    },
    proofs: ['pais', 'sitio'],
    proofUrl: 'https://enperspectiva.uy/',
    subscribers: '125 mil',
    subscribersApprox: 125000,
    videos: '18.274',
    lastUpload: '2026-08-18',
    site: 'https://enperspectiva.uy/',
  },
  {
    id: 'UCu0rrtxKLExB_fNSAJ_SU9A',
    name: 'la diaria',
    slug: 'la-diaria',
    handle: '@ladiaria_',
    category: 'medios',
    what: {
      es: 'Coberturas, mesas y presentaciones del diario cooperativo.',
      en: 'Reporting, panels and events from the co-operative newspaper.',
    },
    why: {
      es: 'Publica investigación propia sobre contratos del Estado, del tipo que después aparece en nuestras fichas de caso.',
      en: 'It runs its own investigations into state contracts, the kind that later shows up in our case files.',
    },
    proofs: ['pais', 'sitio'],
    proofUrl: 'https://ladiaria.com.uy/',
    subscribers: '104 mil',
    subscribersApprox: 104000,
    videos: '9.065',
    lastUpload: '2026-08-18',
    site: 'https://ladiaria.com.uy/',
    related: { to: '/investigaciones/casos', label: { es: 'Fichas de caso', en: 'Case files' } },
  },
  {
    id: 'UCwxfiP2WBmLEblsrGgwWNMA',
    name: 'DelSol 99.5 FM',
    slug: 'delsol',
    handle: '@DelSolUy',
    category: 'medios',
    what: {
      es: 'Programas de la radio en video, con mesas de actualidad y política.',
      en: 'The radio station’s shows on video, including current-affairs panels.',
    },
    why: {
      es: 'La mesa política diaria es la forma más barata de saber qué se está discutiendo esta semana.',
      en: 'Its daily political panel is the cheapest way to know what is being argued about this week.',
    },
    proofs: ['pais', 'sitio'],
    proofUrl: 'https://delsol.uy/',
    subscribers: '65,8 mil',
    subscribersApprox: 65800,
    videos: '5.458',
    lastUpload: '2026-08-18',
    site: 'https://delsol.uy/',
  },
  {
    id: 'UC3QAqpAruUVvqKuWOzmkItg',
    name: 'El País Uruguay',
    slug: 'el-pais',
    handle: '@elpaisuy',
    category: 'medios',
    what: {
      es: 'Entrevistas y videos del diario.',
      en: 'The newspaper’s interviews and video pieces.',
    },
    why: {
      es: 'Cubre la agenda política nacional todos los días.',
      en: 'It covers the national political agenda every day.',
    },
    proofs: ['pais', 'sitio'],
    proofUrl: 'https://www.elpais.com.uy/',
    subscribers: '62,2 mil',
    subscribersApprox: 62200,
    videos: '2.768',
    lastUpload: '2026-08-18',
    site: 'https://www.elpais.com.uy/',
  },
  {
    id: 'UC0HcjuycMRw7SbZ7s4CnaGQ',
    name: 'Sarandí 690',
    slug: 'sarandi-690',
    handle: '@sarandi690ok',
    category: 'medios',
    what: {
      es: 'La radio en video, con su programa de entrevistas políticas.',
      en: 'The radio station on video, including its political interview show.',
    },
    why: {
      es: 'YouTube no publica el país de este canal. Entra igual porque el sitio de la radio embebe su transmisión en vivo, con el identificador del canal en la URL del reproductor.',
      en: 'YouTube does not publish this channel’s country. It qualifies because the station’s own site embeds its live stream, with the channel id in the player URL.',
    },
    proofs: ['sitio'],
    proofUrl: 'https://sarandi690.com.uy/',
    subscribers: '14,6 mil',
    subscribersApprox: 14600,
    videos: '4.018',
    lastUpload: '2026-08-18',
    site: 'https://sarandi690.com.uy/',
  },
  {
    id: 'UCa2cus7gyarXD8049iaLHBg',
    name: 'Búsqueda',
    slug: 'busqueda',
    handle: '@busquedaonline',
    category: 'medios',
    what: {
      es: 'Videos del semanario, con sus adelantos y entrevistas.',
      en: 'Video pieces from the weekly, including previews and interviews.',
    },
    why: {
      es: 'Varias compras cuestionadas se conocieron primero en sus páginas.',
      en: 'Several questioned purchases were first reported in its pages.',
    },
    proofs: ['pais', 'sitio'],
    proofUrl: 'https://www.busqueda.com.uy/',
    subscribers: '2,33 mil',
    subscribersApprox: 2330,
    videos: '827',
    lastUpload: '2026-08-18',
    site: 'https://www.busqueda.com.uy/',
  },
  {
    id: 'UCp-xwj7EBBAWG6Kuu5D5ECw',
    name: 'Brecha',
    slug: 'brecha',
    handle: '@SemanarioBrecha',
    category: 'medios',
    what: {
      es: 'Entrevistas del semanario. Publica poco: dieciocho videos en total.',
      en: 'Interviews from the weekly. It publishes little: eighteen videos in total.',
    },
    why: {
      es: 'Su cobertura escrita de política y trabajo no tiene equivalente en video.',
      en: 'Its written coverage of politics and labour has no video equivalent.',
    },
    proofs: ['pais'],
    subscribers: '197',
    subscribersApprox: 197,
    videos: '18',
    lastUpload: '2026-07-26',
    site: 'https://brecha.com.uy/',
  },
  {
    id: 'UCu-U3hwhBTR3lzyZnPUL2Hg',
    name: 'M24',
    slug: 'm24',
    handle: '@M24Radio',
    category: 'medios',
    what: {
      es: 'La radio en video. No publica desde noviembre de 2025.',
      en: 'The radio station on video. It has not published since November 2025.',
    },
    why: {
      es: 'Queda listado porque el archivo de sus transmisiones sigue en línea.',
      en: 'It stays listed because the archive of its broadcasts is still online.',
    },
    proofs: ['pais'],
    subscribers: '54,1 mil',
    subscribersApprox: 54100,
    videos: '6.573',
    lastUpload: '2025-11-24',
    site: 'https://m24.com.uy/',
  },

  // ─── Partidos con representación parlamentaria ───────────────────────────────
  {
    id: 'UCV8W9j9ibdHeOWNudYKouIA',
    name: 'Frente Amplio',
    slug: 'frente-amplio',
    handle: '@frenteampliotv',
    bloc: 'gobierno',
    category: 'partidos',
    what: {
      es: 'Actos, informes de bancada y comunicados del partido de gobierno.',
      en: 'Rallies, caucus reports and statements from the governing party.',
    },
    why: {
      es: 'La versión sin editar del argumento oficial sobre cada gasto discutido.',
      en: 'The unedited version of the official argument about each contested expense.',
    },
    proofs: ['pais', 'sitio'],
    proofUrl: 'https://frenteamplio.uy/',
    subscribers: '35,6 mil',
    subscribersApprox: 35600,
    videos: '1.234',
    lastUpload: '2026-08-18',
    site: 'https://frenteamplio.uy/',
    related: { to: '/analytics/partidos', label: { es: 'Compras por partido', en: 'Purchases by party' } },
  },
  {
    id: 'UChOvhoIUvGENpuCPN3n-1ag',
    name: 'Partido Nacional',
    slug: 'partido-nacional',
    handle: '@PartidoNacionalTV',
    bloc: 'oposicion',
    category: 'partidos',
    what: {
      es: 'Conferencias del Directorio y actividad de sus legisladores.',
      en: 'Party board press conferences and legislative activity.',
    },
    why: {
      es: 'La oposición explica acá qué gasto va a cuestionar antes de llevarlo a una comisión.',
      en: 'The opposition explains here which spending it will challenge before taking it to committee.',
    },
    proofs: ['pais', 'sitio'],
    proofUrl: 'https://www.partidonacional.org.uy/',
    subscribers: '9,67 mil',
    subscribersApprox: 9670,
    videos: '1.103',
    lastUpload: '2026-08-18',
    site: 'https://www.partidonacional.org.uy/',
    related: { to: '/analytics/partidos', label: { es: 'Compras por partido', en: 'Purchases by party' } },
  },
  {
    id: 'UCjuOpeUQHpRKe114HUdyayA',
    name: 'Partido Independiente',
    slug: 'partido-independiente',
    handle: '@PIndependienteUY',
    bloc: 'oposicion',
    category: 'partidos',
    what: {
      es: 'Declaraciones de sus dirigentes sobre la agenda económica.',
      en: 'Statements from its leaders on the economic agenda.',
    },
    why: {
      es: 'Publica análisis de la Rendición de Cuentas con más detalle que su tamaño parlamentario.',
      en: 'It publishes budget analysis in more detail than its parliamentary size suggests.',
    },
    proofs: ['pais', 'sitio'],
    proofUrl: 'https://partidoindependiente.uy/',
    subscribers: '1,16 mil',
    subscribersApprox: 1160,
    videos: '942',
    lastUpload: '2026-08-17',
    site: 'https://partidoindependiente.uy/',
  },
  {
    id: 'UChcXJjUHFD8CwtR3BDWcPTw',
    name: 'Partido Colorado',
    slug: 'partido-colorado',
    handle: '@PartidoColorado',
    bloc: 'oposicion',
    category: 'partidos',
    what: {
      es: 'Actos y eventos del partido.',
      en: 'Party rallies and events.',
    },
    why: {
      es: 'Publica de a tandas, alrededor de cada acto.',
      en: 'It publishes in bursts, around each event.',
    },
    proofs: ['pais'],
    subscribers: '2,43 mil',
    subscribersApprox: 2430,
    videos: '300',
    lastUpload: '2026-07-27',
    site: 'https://partidocolorado.uy/',
  },
  {
    id: 'UC5MglaJ502q71hg3tIS4vdQ',
    name: 'Cabildo Abierto',
    slug: 'cabildo-abierto',
    handle: '@CabildoAbierto',
    bloc: 'oposicion',
    category: 'partidos',
    what: {
      es: 'Canal oficial del partido. No publica desde noviembre de 2024.',
      en: 'The party’s official channel. It has not published since November 2024.',
    },
    why: {
      es: 'Tiene bancas en las dos cámaras y su canal quedó en la campaña anterior.',
      en: 'It holds seats in both chambers and its channel stopped at the previous campaign.',
    },
    proofs: ['pais', 'sitio'],
    proofUrl: 'https://cabildoabierto.uy/',
    subscribers: '1,39 mil',
    subscribersApprox: 1390,
    videos: '607',
    lastUpload: '2024-11-21',
    site: 'https://cabildoabierto.uy/',
  },
  {
    id: 'UCOIYve64PJyzQMxaw3fMN7Q',
    name: 'Identidad Soberana',
    slug: 'identidad-soberana',
    handle: '@identidadsoberana5983',
    bloc: 'oposicion',
    category: 'partidos',
    what: {
      es: 'Canal oficial del partido, con cuatro videos. El último es de agosto de 2022.',
      en: 'The party’s official channel, with four videos. The latest is from August 2022.',
    },
    why: {
      es: 'Tiene bancas en Diputados y su difusión ocurre en canales que el partido no declara como oficiales.',
      en: 'It holds seats in the lower chamber, and its outreach happens on channels the party does not declare official.',
    },
    proofs: ['pais'],
    subscribers: '297',
    subscribersApprox: 297,
    videos: '4',
    lastUpload: '2022-08-27',
  },

  // ─── Centros de estudio y entrevistas ────────────────────────────────────────
  {
    id: 'UCnUBLJIHakWlH5foMVFnsSg',
    name: 'Vértice',
    slug: 'vertice',
    handle: '@Vertice_uy',
    category: 'analisis',
    what: {
      es: 'Entrevistas largas sobre política y actualidad uruguaya, nativas de YouTube.',
      en: 'Long-form interviews on Uruguayan politics and current affairs, native to YouTube.',
    },
    why: {
      es: 'Entra por regla de tamaño: es el único canal nativo digital de entrevistas políticas que pasa los 5.000 suscriptores y publica todas las semanas.',
      en: 'It qualifies by a size rule: the only digital-native political interview channel above 5,000 subscribers that publishes weekly.',
    },
    proofs: ['pais'],
    subscribers: '9,83 mil',
    subscribersApprox: 9830,
    videos: '2.185',
    lastUpload: '2026-08-18',
  },
  {
    id: 'UCKp4MO61532tT7x5Gx0vj-A',
    name: 'CED Uruguay',
    slug: 'ced',
    handle: '@ceduruguay',
    category: 'analisis',
    what: {
      es: 'Presentaciones del Centro de Estudios para el Desarrollo sobre políticas públicas.',
      en: 'Public-policy presentations from the Centre for Development Studies.',
    },
    why: {
      es: 'Publica evaluaciones de programas del Estado, que son la pregunta previa a cuánto costaron.',
      en: 'It publishes evaluations of state programmes, which is the question that precedes what they cost.',
    },
    proofs: ['sitio'],
    proofUrl: 'https://ced.uy/',
    subscribers: '4,35 mil',
    subscribersApprox: 4350,
    videos: '161',
    lastUpload: '2026-08-07',
    site: 'https://ced.uy/',
  },
  {
    id: 'UC-93r-Go3w15TiNHtYhKdAA',
    name: 'CERES Uruguay',
    slug: 'ceres',
    handle: '@ceresuruguay6980',
    category: 'analisis',
    what: {
      es: 'Desayunos y presentaciones de coyuntura económica.',
      en: 'Economic outlook briefings and breakfast events.',
    },
    why: {
      es: 'Sus presentaciones discuten el nivel del gasto público, no un contrato en particular.',
      en: 'Its briefings argue about the level of public spending rather than any single contract.',
    },
    proofs: ['pais'],
    subscribers: '433',
    subscribersApprox: 433,
    videos: '104',
    lastUpload: '2026-06-24',
    site: 'https://ceres-uy.org/',
  },
]

/** Canal que buscamos, medimos y NO publicamos. Cada uno con el motivo medido. */
export interface Rejected {
  name: string
  handle: string
  /** Qué se midió y por qué eso lo deja afuera. */
  reason: Bi
}

export const REJECTED: Rejected[] = [
  {
    name: 'El Observador 107.9',
    handle: '@ElObservador107.9',
    reason: {
      es: 'Tiene 289 mil suscriptores y YouTube publica «Argentina» como su país. Es la radio hermana en Buenos Aires, no el diario uruguayo.',
      en: 'It has 289,000 subscribers and YouTube publishes “Argentina” as its country. It is the sister radio station in Buenos Aires, not the Uruguayan newspaper.',
    },
  },
  {
    name: 'Montevideo Portal',
    handle: '@MvdPortal',
    reason: {
      es: 'YouTube no publica su país y el sitio del medio enlaza otro canal, @RedesMvdPortal, que responde 404. Sin ninguna de las dos pruebas, no entra.',
      en: 'YouTube does not publish its country, and the outlet’s site links a different channel, @RedesMvdPortal, which returns 404. With neither proof, it does not qualify.',
    },
  },
  {
    name: 'ARCE Uruguay',
    handle: '@ARCEUruguay',
    reason: {
      es: 'Publicó once videos en 2026, pero YouTube no publica su país y el sitio de ARCE enlaza el canal viejo, @accegubuy. Publicamos el enlazado.',
      en: 'It posted eleven videos in 2026, but YouTube does not publish its country and the ARCE site links the old channel, @accegubuy. We list the linked one.',
    },
  },
  {
    name: 'Congreso de Intendentes',
    handle: '@cintendentesuy',
    reason: {
      es: 'YouTube no publica su país y la página oficial del organismo no enlaza ningún canal.',
      en: 'YouTube does not publish its country and the body’s official page links no channel at all.',
    },
  },
  {
    name: 'subrayado',
    handle: '@subrayado',
    reason: {
      es: 'El handle existe y responde 200. Son nueve suscriptores y dos videos de 2009, ninguno del informativo. Adivinar el handle de un medio no sirve como método.',
      en: 'The handle exists and returns 200. It is nine subscribers and two videos from 2009, none of them the newscast. Guessing an outlet’s handle is not a method.',
    },
  },
]

/** Lo que buscamos y no existe. Un vacío medido también es información. */
export const GAPS: Bi[] = [
  {
    es: 'El Tribunal de Cuentas no tiene canal de YouTube. Es el organismo que observa los gastos del Estado y sus resoluciones sólo salen en PDF.',
    en: 'The Court of Audit has no YouTube channel. It is the body that flags state spending, and its rulings only come out as PDFs.',
  },
  {
    es: 'La Junta de Transparencia y Ética Pública tiene canal con 34 suscriptores y su feed público no devuelve ningún video.',
    en: 'The public ethics board has a channel with 34 subscribers, and its public feed returns no videos at all.',
  },
  {
    es: 'La agencia que publica los datos de compras no sube un video desde diciembre de 2025.',
    en: 'The agency that publishes the procurement data has not uploaded a video since December 2025.',
  },
]

/**
 * Palabras que marcan un video como de gasto público o política nacional.
 *
 * Filtran los títulos del feed en vivo, y sólo dentro del directorio ya verificado.
 * Ese orden importa: el mismo filtro sobre YouTube entero devolvería cualquier cosa.
 * El filtro es del lector — la página muestra todo salvo que él lo pida.
 *
 * TRAMPA, y ya nos costó una vez con la búsqueda de prensa: comparar por SUBCADENA
 * convierte a «OSE» en «José» y a «ley» en «Bradley». La comparación es por PALABRA
 * COMPLETA sobre el título sin tildes, así que los términos van sin tilde y en
 * minúscula. `matchesTopic` es lo único que los lee.
 */
export const TOPIC_TERMS = [
  // Compras y plata
  'licitacion', 'adjudicacion', 'compra', 'compra directa', 'contrato', 'presupuesto',
  'presupuestal', 'rendicion de cuentas', 'deficit', 'gasto', 'impuesto', 'tarifa',
  'subsidio', 'fideicomiso', 'salario', 'sueldo', 'jubilacion', 'inflacion', 'economia',
  'obra publica',
  // Instituciones
  'ministerio', 'ministro', 'ministra', 'intendencia', 'intendente', 'senado', 'senador',
  'senadora', 'diputado', 'parlamento', 'comision', 'sesion', 'presidencia', 'presidente',
  'gobierno', 'oposicion', 'bancada', 'legislador', 'ley', 'decreto', 'tribunal de cuentas',
  'jutep', 'auditoria', 'transparencia', 'corrupcion',
  // Empresas públicas y organismos que aparecen por sigla
  'ute', 'antel', 'ancap', 'ose', 'asse', 'bps', 'inau', 'mides', 'bcu',
  // Actores políticos
  'partido', 'frente amplio', 'coalicion', 'blanco', 'colorado', 'cabildo', 'sindicato',
  'pit-cnt', 'paro', 'eleccion', 'plebiscito', 'referendum', 'politica', 'politico',
] as const

/** Qué se hizo para armar la tabla, en el orden en que se hizo. */
export const METODO: Bi[] = [
  {
    es: 'Se buscó cada organismo, medio, partido y centro de estudio en el buscador de canales de YouTube. La búsqueda por nombre devuelve homónimos de otros países, así que ningún resultado se aceptó por aparecer primero.',
    en: 'Each agency, outlet, party and think tank was searched in YouTube’s channel search. Name search returns namesakes from other countries, so no result was accepted for ranking first.',
  },
  {
    es: 'De cada candidato se leyó la pestaña «Más información», que publica el país, los suscriptores, el total de videos y la fecha de alta.',
    en: 'For each candidate we read the “about” tab, which publishes country, subscribers, total videos and the join date.',
  },
  {
    es: 'De cada candidato se leyó además el feed público de videos, que da la fecha del último. Ahí se separó lo activo de lo abandonado.',
    en: 'We also read each candidate’s public video feed, which gives the date of the latest upload. That is what separates active from abandoned.',
  },
  {
    es: 'Cuando YouTube no publicaba el país, se buscó el enlace al canal en el sitio oficial del organismo, medio o partido. Sin esa prueba el canal no entra.',
    en: 'When YouTube published no country, we looked for the channel link on the official site of the agency, outlet or party. Without that proof the channel does not qualify.',
  },
  {
    es: 'Los enlaces salen del identificador del canal, no del handle. El handle cambia y deja el enlace roto; el identificador no.',
    en: 'Links are built from the channel id, not the handle. Handles change and break links; ids do not.',
  },
]

/** Lo que la página no hace. Va arriba de la lista, no al pie. */
export const LIMITES: Bi[] = [
  {
    es: 'No verificamos ni respaldamos lo que dice cada video. El directorio dice quién publica, no si tiene razón.',
    en: 'We neither verify nor endorse what any video says. The directory says who publishes, not who is right.',
  },
  {
    es: 'Los videos que se listan abajo salen del feed público de cada canal, sin curaduría. Es una lectura automática, igual que un lector de RSS.',
    en: 'The videos listed below come from each channel’s public feed, uncurated. It is an automatic read, like any RSS reader.',
  },
  {
    es: 'La tabla se verificó el ' + VERIFIED_ON + '. Los suscriptores y el total de videos de esa fecha envejecen; el último video se vuelve a leer en cada carga.',
    en: 'The table was verified on ' + VERIFIED_ON + '. Subscriber and video counts from that date age; the latest upload is re-read on every load.',
  },
  {
    es: 'Un canal ausente no es un juicio sobre el medio. Puede ser que no tenga canal, que YouTube no publique su país o que su sitio no lo enlace.',
    en: 'A missing channel is not a judgement about the outlet. It may have no channel, no published country, or no link from its own site.',
  },
]

export function channelUrl(id: string): string {
  return `https://www.youtube.com/channel/${id}`
}

/** Ficha del canal dentro de este sitio. Sin prefijo de idioma: eso lo pone `localePath`. */
export function channelPath(channel: Channel): string {
  return `/canales-youtube/${channel.slug}`
}

export function getChannelBySlug(slug: string): Channel | undefined {
  return CHANNELS.find(c => c.slug === slug)
}

/** Activo = publicó dentro de la ventana. Se mide contra `now`, nunca contra el reloj del módulo. */
export function isActive(channel: Channel, now: Date): boolean {
  if (!channel.lastUpload) return false
  const days = (now.getTime() - new Date(channel.lastUpload).getTime()) / 86_400_000
  return days <= ACTIVE_WINDOW_DAYS
}

/** Minúsculas y sin tildes, que es como están escritos los términos. */
function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/**
 * Un término por palabra completa, con el plural español detrás.
 *
 * `(es|s)?` cubre las dos formas del plural: «senador» alcanza a «senadores» y
 * «gasto» a «gastos». Sin eso el término singular no matchea el titular plural, que
 * es como se escriben casi todos.
 *
 * Los términos son letras, números, espacios y guiones — nada de metacaracteres —,
 * así que se interpolan sin escapar. El test lo exige, para que agregar un término
 * con un paréntesis no arme una expresión regular rota en silencio.
 */
const TOPIC_PATTERNS: RegExp[] = TOPIC_TERMS.map(term =>
  new RegExp(`(^|[^a-z0-9])${term}(es|s)?($|[^a-z0-9])`),
)

/** Un título habla de gasto o política si alguno de los términos aparece entero. */
export function matchesTopic(title: string): boolean {
  const t = normalize(title)
  return TOPIC_PATTERNS.some(re => re.test(t))
}
