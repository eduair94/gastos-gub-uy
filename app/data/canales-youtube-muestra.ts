/**
 * La medición por canal: de qué habla y a quién nombra.
 *
 * POR QUÉ EXISTE. La página evita ponerle una etiqueta ideológica a un medio: no hay
 * forma de medirla y sería nuestra opinión disfrazada de dato. Lo que sí se puede medir
 * es lo que el canal PUBLICA. Por eso cada ficha muestra dos números sobre una muestra
 * de títulos: cuántos tocan gasto público o política, y a qué partidos nombra por su
 * nombre completo.
 *
 * QUÉ NO ES. No mide sesgo, ni tono, ni encuadre. Nombrar a un partido no dice si lo
 * critica o lo apoya. Un canal que no nombra a nadie no es neutral: puede estar hablando
 * de otra cosa.
 *
 * CÓMO SE MIDIÓ. El 2026-08-18 se leyó la pestaña «Videos» de cada canal, que
 * devuelve hasta 30 títulos recientes. Sobre esos títulos corrió `matchesTopic` —el
 * mismo filtro de la página, por palabra completa— y la búsqueda de cada partido por su
 * nombre. La muestra es chica y reciente; `n` va siempre al lado del número.
 *
 * Los partidos se cuentan por NOMBRE («frente amplio», «partido nacional»), nunca por
 * sus dirigentes: nombrar a una persona no es nombrar a su partido, y una tabla de
 * personas volvería el conteo imposible de reproducir.
 *
 * OJO CON «CABILDO ABIERTO». También nombra una asamblea vecinal, así que el conteo de
 * ese partido puede traer falsos positivos. En la muestra del 2026-08-18 se revisaron
 * los cinco casos uno por uno y los cinco eran el partido.
 *
 * `selfDescription` es la descripción que el propio canal publica en YouTube, textual.
 * Se muestra entre comillas y atribuida: es lo que el canal dice de sí mismo.
 *
 * Generado. Para rehacerlo, ver el método arriba.
 */

export interface ChannelSample {
  /** Títulos leídos. Cero significa que la pestaña no devolvió ninguno. */
  n: number
  /** Cuántos de esos títulos tocan gasto público o política. */
  topicHits: number
  /** Cuántos títulos nombran a cada partido. Sólo aparecen los que tienen alguno. */
  mentions: Partial<Record<'fa' | 'pn' | 'pc' | 'ca' | 'pi' | 'is' | 'coalicion', number>>
  /** La descripción que publica el canal, textual. */
  selfDescription: string | null
  /** Fecha de alta del canal, con las palabras de YouTube. */
  joined: string | null
  /** Vistas totales del canal. */
  views: string | null
}

export const SAMPLED_ON = '2026-08-18'

export const SAMPLES: Record<string, ChannelSample> = {
  'UCz1Li9JcQB9XP-HfgN0IYLQ': {
    n: 30,
    topicHits: 11,
    mentions: {},
    selfDescription: 'Comunicación Presidencial - República Oriental del Uruguay. En nuestro canal encontrarás parte de las acciones que ejecuta el Gobierno Nacional para el período 2025-2030. 🔔 Suscríbite y accedé a nuestras publicaciones.',
    joined: '4 abr 2011',
    views: '29,437,734 vistas',
  },
  'UCyM7oro5NhR5oPyMEFB_rUA': {
    n: 30,
    topicHits: 29,
    mentions: {},
    selfDescription: 'Canal oficial de la Cámara de Senadores de la República Oriental del Uruguay',
    joined: '6 jul 2016',
    views: '2,226,918 vistas',
  },
  'UCUxioxgZ7obrP3wVJApAK1w': {
    n: 30,
    topicHits: 5,
    mentions: {},
    selfDescription: 'Canal Oficial de Youtube de la Cámara de Representantes de la República Oriental del Uruguay',
    joined: '11 may 2016',
    views: '2,201,613 vistas',
  },
  'UCMHQqhtbpxfcnPPYpryapHA': {
    n: 30,
    topicHits: 10,
    mentions: { fa: 1, pn: 1, ca: 2 },
    selfDescription: '¡Bienvenidos a Canal 5 Uruguay! Este es el canal oficial de YouTube del canal público uruguayo, que forma parte del SECAN, unidad ejecutora del Ministerio de Educación y Cultura. ¡Gracias por visitarnos!',
    joined: '23 abr 2014',
    views: '76,682,647 vistas',
  },
  'UCcEFFCUo9fD5DK1FcclyKUA': {
    n: 30,
    topicHits: 1,
    mentions: {},
    selfDescription: null,
    joined: '18 abr 2012',
    views: '71,053,371 vistas',
  },
  'UCfV6oJPalBI6mXUwG6p2KZQ': {
    n: 30,
    topicHits: 0,
    mentions: {},
    selfDescription: 'Canal oficial de la Intendencia de Montevideo, capital de la República Oriental del Uruguay.',
    joined: '17 nov 2010',
    views: '27,934,314 vistas',
  },
  'UC9fkm72wx-bBK-le5rYh2Fw': {
    n: 30,
    topicHits: 14,
    mentions: {},
    selfDescription: null,
    joined: '23 sept 2013',
    views: '3,439,204 vistas',
  },
  'UCVKp6bAT-JfruLq39qKsQyA': {
    n: 30,
    topicHits: 1,
    mentions: {},
    selfDescription: 'Canal oficial del Instituto Nacional de Estadística (INE) 🇺🇾 Tenemos como objetivo la elaboración, supervisión y coordinación de las estadísticas nacionales. #Censo2023UY ¡Contamos contigo! Liniers 1280 - Montevideo ine.gub.uy',
    joined: '4 sept 2020',
    views: '3,405,296 vistas',
  },
  'UCu6vr8WRDa_4vxKeZZS7sxg': {
    n: 30,
    topicHits: 21,
    mentions: {},
    selfDescription: 'Cuenta oficial del Ministerio de Economía y Finanzas de la República Oriental del Uruguay',
    joined: '13 oct 2011',
    views: '106,204 vistas',
  },
  'UCpA43PbOMswp_XMOdsHBUdw': {
    n: 30,
    topicHits: 0,
    mentions: {},
    selfDescription: 'Canal oficial de la Oﬁcina de Planeamiento y Presupuesto (OPP), unidad ejecutora de la Presidencia de la República Oriental del Uruguay.',
    joined: '29 may 2015',
    views: '5,319,013 vistas',
  },
  'UCY04W7gCXX-POpNbSRArhLA': {
    n: 1,
    topicHits: 0,
    mentions: {},
    selfDescription: 'Canal Institucional de la Auditoría Interna de la Nación.',
    joined: '13 nov 2015',
    views: '856 vistas',
  },
  'UC0vIwy6dZNIBRzdNw87CIhg': {
    n: 30,
    topicHits: 10,
    mentions: {},
    selfDescription: 'Agencia de Compras y Contrataciones del Estado (Uruguay)',
    joined: '19 feb 2013',
    views: '308,132 vistas',
  },
  'UCp6X5jzfmwbOeclRArOi18g': {
    n: 30,
    topicHits: 1,
    mentions: {},
    selfDescription: 'Mirá todos los contenidos de canal 4 acá.',
    joined: '25 oct 2012',
    views: '110,333,856 vistas',
  },
  'UCJI9kSwvvHX2CJeF8iZ6x8Q': {
    n: 30,
    topicHits: 0,
    mentions: {},
    selfDescription: 'Bienvenidos a SAETA TV Canal 10, el canal uruguayo. ¡Visitá nuestra web!: http://www.canal10.com.uy/',
    joined: '11 jul 2016',
    views: '49,092,029 vistas',
  },
  'UCimPJKAbuM6z6b6DPZz86Mw': {
    n: 30,
    topicHits: 3,
    mentions: {},
    selfDescription: 'Somos el canal oficial de La Tele. La emoción de estar juntos en todas tus pantallas 💙📺 Programas completos, entrevistas, juegos, contenidos especiales y grandes momentos de nuestra programación.',
    joined: '8 oct 2011',
    views: '39,622,313 vistas',
  },
  'UCA4VRT895OOPPHq-pc2V2CQ': {
    n: 30,
    topicHits: 1,
    mentions: {},
    selfDescription: 'VTV, la señal líder en el Uruguay de televisión para abonados, transmite 24 horas de programación los siete días a la semana. Sus contenidos contemplan una diversa gama de programas, múltiples eventos y deportes.',
    joined: '14 ago 2012',
    views: '22,345,852 vistas',
  },
  'UCLvbVJDsVX4-qoyladIiVaQ': {
    n: 30,
    topicHits: 3,
    mentions: {},
    selfDescription: 'El 🌎 explicado en español',
    joined: '12 oct 2010',
    views: '60,309,304 vistas',
  },
  'UCzj1iuImjo-Eb8JMELC1Jwg': {
    n: 30,
    topicHits: 6,
    mentions: { fa: 1, ca: 1 },
    selfDescription: 'El programa que marcó un antes y un después en el periodismo radial. Con Emiliano Cotelo, su equipo, los espacios de siempre y una buena dosis de innovación. Transmisión en vivo en @EnPerspectivaEnVivo. ✅ Suscribite al canal y comentá 👉 Podés ver la transmisión en vivo en nuestro canal secundario: 🔴 @EnPerspectivaEnVivo 📲 Seguinos en todas nuestras plataformas:',
    joined: '17 ene 2015',
    views: '42,963,190 vistas',
  },
  'UCu0rrtxKLExB_fNSAJ_SU9A': {
    n: 30,
    topicHits: 5,
    mentions: { ca: 1 },
    selfDescription: 'Una comunidad sosteniendo el periodismo',
    joined: '17 ago 2016',
    views: '30,080,895 vistas',
  },
  'UCwxfiP2WBmLEblsrGgwWNMA': {
    n: 30,
    topicHits: 7,
    mentions: { fa: 1, ca: 1 },
    selfDescription: 'DelSol – 99.5 FM',
    joined: '21 dic 2016',
    views: '19,809,924 vistas',
  },
  'UC3QAqpAruUVvqKuWOzmkItg': {
    n: 30,
    topicHits: 9,
    mentions: {},
    selfDescription: 'Bienvenidos al canal de Youtube de El País Uruguay. Queremos acercarte en video a las noticias y a las historias que suceden en Uruguay y del mundo. En este canal podés encontrar entrevistas con artistas, deportistas y políticos, videos que explican conflictos mundiales pero también hechos que nos impactan en la vida cotidiana explicados de una forma fácil y sencilla. Hay noticias de último moment',
    joined: '26 may 2009',
    views: '22,722,489 vistas',
  },
  'UC0HcjuycMRw7SbZ7s4CnaGQ': {
    n: 30,
    topicHits: 4,
    mentions: {},
    selfDescription: null,
    joined: '29 oct 2024',
    views: '3,534,971 vistas',
  },
  'UCa2cus7gyarXD8049iaLHBg': {
    n: 30,
    topicHits: 8,
    mentions: {},
    selfDescription: 'Hacemos periodismo independiente desde Uruguay. https://www.busqueda.com.uy/home',
    joined: '14 mar 2023',
    views: '640,042 vistas',
  },
  'UCp-xwj7EBBAWG6Kuu5D5ECw': {
    n: 10,
    topicHits: 1,
    mentions: {},
    selfDescription: 'Semanario Brecha es una publicación periodística independiente de izquierda fundada en 1985 en Montevideo, Uruguay.',
    joined: '16 jul 2015',
    views: '5,356 vistas',
  },
  'UCu-U3hwhBTR3lzyZnPUL2Hg': {
    n: 30,
    topicHits: 1,
    mentions: {},
    selfDescription: '🔊 Sentí lo nuestro 📲 m24.com.uy 📻97.9 FM MVD | 102.5 FM Maldonado',
    joined: '14 sept 2020',
    views: '20,782,364 vistas',
  },
  'UCV8W9j9ibdHeOWNudYKouIA': {
    n: 30,
    topicHits: 21,
    mentions: { fa: 8 },
    selfDescription: 'frenteamplio.uy',
    joined: '18 jun 2007',
    views: '16,842,924 vistas',
  },
  'UChOvhoIUvGENpuCPN3n-1ag': {
    n: 30,
    topicHits: 14,
    mentions: { pn: 2, coalicion: 1 },
    selfDescription: 'Partido político. Bajo el lema "defensores de las leyes" consolidó el orden institucional, el sistema republicano representativo y la independencia.',
    joined: '18 jun 2010',
    views: '1,295,537 vistas',
  },
  'UCjuOpeUQHpRKe114HUdyayA': {
    n: 30,
    topicHits: 26,
    mentions: { pi: 2, coalicion: 1 },
    selfDescription: null,
    joined: '1 dic 2013',
    views: '2,800,281 vistas',
  },
  'UChcXJjUHFD8CwtR3BDWcPTw': {
    n: 30,
    topicHits: 15,
    mentions: { fa: 1, pc: 2 },
    selfDescription: 'Canal Oficial del Partido Colorado (Uruguay). Colectividad política fundada por Rivera, afirmada en la gesta de la Defensa y renovada con Batlle y Ordóñez',
    joined: '16 may 2011',
    views: '325,264 vistas',
  },
  'UC5MglaJ502q71hg3tIS4vdQ': {
    n: 30,
    topicHits: 24,
    mentions: { coalicion: 1 },
    selfDescription: 'Canal oficial del Partido Cabildo Abierto',
    joined: '20 may 2020',
    views: '192,984 vistas',
  },
  'UCOIYve64PJyzQMxaw3fMN7Q': {
    n: 3,
    topicHits: 0,
    mentions: {},
    selfDescription: 'Canal oficial de Identidad Soberana - Partido político liderado por el Dr. Gustavo Salle Lorier.',
    joined: '12 ene 2021',
    views: '1,741 vistas',
  },
  'UCnUBLJIHakWlH5foMVFnsSg': {
    n: 30,
    topicHits: 4,
    mentions: { fa: 1 },
    selfDescription: '🎙️ Bienvenidos a Vertice, un espacio de entrevistas en Uruguay donde conversamos sin filtro con políticos, músicos, artistas, influencers, cineastas y referentes de la cultura pop y geek. Aquí encontrarás charlas profundas, debates y experiencias de vida que muestran la otra cara de quienes marcan la historia y la sociedad uruguaya. Desde la política y las elecciones, hasta el rock y el cine urug',
    joined: '24 feb 2024',
    views: '2,374,128 vistas',
  },
  'UCKp4MO61532tT7x5Gx0vj-A': {
    n: 30,
    topicHits: 12,
    mentions: {},
    selfDescription: 'Analizamos y generamos propuestas de políticas públicas para lograr un Uruguay más justo, libre y próspero.',
    joined: '4 jun 2016',
    views: '412,063 vistas',
  },
  'UC-93r-Go3w15TiNHtYhKdAA': {
    n: 30,
    topicHits: 0,
    mentions: {},
    selfDescription: 'CERES (Centro de Estudios de la Realidad Económica y Social) es un centro de investigación independiente y sin fines de lucro, dedicado al análisis económico de las economías de América Latina, al diseño de políticas públicas y a promover su debate a nivel local y en foros internacionales. Nuestro objetivo es contribuir a generar y debatir una agenda de políticas públicas capaces de promover el de',
    joined: '19 ene 2016',
    views: '26,731 vistas',
  },
}
