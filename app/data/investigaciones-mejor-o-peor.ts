/**
 * Investigación · ¿Es cierto que cada vez estamos peor? Uruguay 2004 → hoy.
 *
 * Cincuenta y dos series oficiales, cada una investigada por un agente y después
 * RE-BUSCADA por un verificador independiente que abrió la fuente citada, comparó
 * los años ancla contra la publicación original y tenía instrucción de descartar
 * antes que publicar. De 49 indicadores externos, 43 quedaron confirmados sin
 * cambios, 6 corregidos (sobre todo cifras de encuesta) y ninguno inventado
 * sobrevivió. Los 4 de compras públicas no vienen de esa ronda: salen de la
 * colección `spending_trend` del propio sitio, la misma que publica
 * /analytics/evolucion-gasto, para que el sitio no se contradiga a sí mismo.
 *
 * Dos veredictos por indicador y no uno, porque la respuesta cambia según contra
 * qué se compare: 2004 es el piso de la peor crisis del país y hace ver bien casi
 * cualquier presente; 2014 es el final del boom y es la comparación que la gente
 * hace de verdad. Un indicador se marca «igual» dentro de una banda —5% relativo,
 * o una banda absoluta cuando la escala es acotada (PISA, Gini, IDH, notches)—
 * para que el ruido de medición no se lea como cambio.
 *
 * Como el resto de las investigaciones, esto es una FOTO verificada a una fecha
 * (2026-08), no una vista en vivo. Los anclas y los veredictos se calcularon con
 * la regla descrita arriba, no a ojo. Al actualizar una serie hay que rehacer
 * `vStart`/`v14`/`vLast` y los dos veredictos junto con `series`, o la fila va a
 * decir una cosa y su gráfico otra.
 */

export type IndicatorDirection = 'higherIsBetter' | 'lowerIsBetter' | 'neutral'
export type IndicatorVerdict = 'mejor' | 'peor' | 'igual' | 'neutro' | 'sin-dato'
export type IndicatorGroup = 'seguridad' | 'bienestar' | 'salud' | 'educacion' | 'servicios' | 'macro' | 'percepcion' | 'transparencia'

export interface IndicatorPoint { year: number, value: number }

export interface IndicatorRow {
  key: string
  group: IndicatorGroup
  direction: IndicatorDirection
  labelEs: string
  labelEn: string
  unitEs: string
  unitEn: string
  decimals: number
  /** Earliest anchor at or before 2008; null when the series starts later. */
  startYear: number | null
  vStart: number | null
  y14: number | null
  v14: number | null
  lastYear: number
  vLast: number
  vsStart: IndicatorVerdict
  vs14: IndicatorVerdict
  source: string
  sourceUrl: string
  noteEs: string
  noteEn: string
  series: IndicatorPoint[]
}

/** Counts over the objective, non-neutral indicators only — perception and
 *  procurement are separate axes and would corrupt a "how many improved" tally. */
export const MOP_TALLY = {
  scorable: 37,
  vsStart: {
    mejor: 21,
    peor: 2,
    igual: 2,
    sinDato: 12,
  },
  vs14: {
    mejor: 19,
    peor: 4,
    igual: 10,
    sinDato: 4,
  },
} as const

export const MOP_INDICATORS: IndicatorRow[] = [
  {
    key: 'homicidios-tasa',
    group: 'seguridad',
    direction: 'lowerIsBetter',
    labelEs: 'Homicidios',
    labelEn: 'Homicides',
    unitEs: 'cada 100.000 hab.',
    unitEn: 'per 100,000 people',
    decimals: 1,
    startYear: 2004,
    vStart: 6,
    y14: 2014,
    v14: 7.8,
    lastYear: 2025,
    vLast: 10.3,
    vsStart: 'peor',
    vs14: 'peor',
    source: 'Ministerio del Interior — Área de Estadística y Criminología Aplicada (AECA, ex Observatorio Nacional sobre Violencia y Criminalidad), Anuario AECA 2025, Tabla 2.1; población INE (Revisión 2013)',
    sourceUrl: 'https://www.gub.uy/ministerio-interior/comunicacion/publicaciones/anuario-aeca-2025-evolucion-anual-2013-2025',
    noteEs: 'El indicador que le da la razón al pesimismo. Uruguay tuvo unos 6 homicidios cada 100.000 durante treinta años (1989-2011). Saltó a 7,8 en 2012, a 12 en 2018, y se estabilizó cerca de 10,3. El nivel de hoy es casi el doble del histórico.',
    noteEn: 'The indicator that vindicates the pessimism. Uruguay ran at about 6 homicides per 100,000 for thirty years (1989-2011). It jumped to 7.8 in 2012, to 12 in 2018, and settled near 10.3. Today\'s level is close to double the historical norm.',
    series: [
      {
        year: 1989,
        value: 6.4,
      },
      {
        year: 1990,
        value: 6.6,
      },
      {
        year: 1991,
        value: 6.2,
      },
      {
        year: 1992,
        value: 5.8,
      },
      {
        year: 1993,
        value: 7.3,
      },
      {
        year: 1994,
        value: 5.8,
      },
      {
        year: 1995,
        value: 5.9,
      },
      {
        year: 1996,
        value: 6.3,
      },
      {
        year: 1997,
        value: 7.4,
      },
      {
        year: 1998,
        value: 7.4,
      },
      {
        year: 1999,
        value: 6.5,
      },
      {
        year: 2000,
        value: 6.4,
      },
      {
        year: 2001,
        value: 6.5,
      },
      {
        year: 2002,
        value: 6.9,
      },
      {
        year: 2003,
        value: 5.9,
      },
      {
        year: 2004,
        value: 6,
      },
      {
        year: 2005,
        value: 5.6,
      },
      {
        year: 2006,
        value: 6,
      },
      {
        year: 2007,
        value: 5.8,
      },
      {
        year: 2008,
        value: 6.6,
      },
      {
        year: 2009,
        value: 6.7,
      },
      {
        year: 2010,
        value: 6,
      },
      {
        year: 2011,
        value: 5.8,
      },
      {
        year: 2012,
        value: 7.8,
      },
      {
        year: 2013,
        value: 7.6,
      },
      {
        year: 2014,
        value: 7.8,
      },
      {
        year: 2015,
        value: 8.5,
      },
      {
        year: 2016,
        value: 7.7,
      },
      {
        year: 2017,
        value: 8.2,
      },
      {
        year: 2018,
        value: 12,
      },
      {
        year: 2019,
        value: 11.2,
      },
      {
        year: 2020,
        value: 9.7,
      },
      {
        year: 2021,
        value: 8.7,
      },
      {
        year: 2022,
        value: 10.8,
      },
      {
        year: 2023,
        value: 10.7,
      },
      {
        year: 2024,
        value: 10.7,
      },
      {
        year: 2025,
        value: 10.3,
      },
    ],
  },
  {
    key: 'suicidios',
    group: 'salud',
    direction: 'lowerIsBetter',
    labelEs: 'Suicidios',
    labelEn: 'Suicides',
    unitEs: 'cada 100.000 habitantes',
    unitEn: 'per 100,000 people',
    decimals: 1,
    startYear: 2004,
    vStart: 15.9,
    y14: 2014,
    v14: 17.4,
    lastYear: 2025,
    vLast: 19.16,
    vsStart: 'peor',
    vs14: 'peor',
    source: 'MSP – Estadísticas Vitales / División Epidemiología',
    sourceUrl: 'https://www.gub.uy/ministerio-salud-publica/comunicacion/noticias/suicidios-uruguay-nueva-orientacion-politicas-publicas-ante-evolucion',
    noteEs: 'El otro que empeoró sin matices: 15,9 cada 100.000 en 2004, pico de 23,2 en 2022 y 19,16 en 2025. El quiebre es 2015-2016 y todavía no volvió al nivel previo.',
    noteEn: 'The other unambiguous deterioration: 15.9 per 100,000 in 2004, a peak of 23.2 in 2022 and 19.16 in 2025. The break is 2015-2016 and it has not returned to the earlier level.',
    series: [
      {
        year: 2000,
        value: 16.9,
      },
      {
        year: 2001,
        value: 15.1,
      },
      {
        year: 2002,
        value: 20.6,
      },
      {
        year: 2003,
        value: 16.1,
      },
      {
        year: 2004,
        value: 15.9,
      },
      {
        year: 2005,
        value: 15,
      },
      {
        year: 2006,
        value: 16,
      },
      {
        year: 2007,
        value: 17.5,
      },
      {
        year: 2008,
        value: 16,
      },
      {
        year: 2009,
        value: 15.9,
      },
      {
        year: 2010,
        value: 16.5,
      },
      {
        year: 2012,
        value: 17.6,
      },
      {
        year: 2013,
        value: 16.1,
      },
      {
        year: 2014,
        value: 17.4,
      },
      {
        year: 2015,
        value: 18.6,
      },
      {
        year: 2016,
        value: 20.5,
      },
      {
        year: 2017,
        value: 19.7,
      },
      {
        year: 2018,
        value: 20.2,
      },
      {
        year: 2019,
        value: 20.6,
      },
      {
        year: 2020,
        value: 20.3,
      },
      {
        year: 2021,
        value: 21.6,
      },
      {
        year: 2022,
        value: 23.2,
      },
      {
        year: 2023,
        value: 21.39,
      },
      {
        year: 2024,
        value: 21.35,
      },
      {
        year: 2025,
        value: 19.16,
      },
    ],
  },
  {
    key: 'rapinas-tasa',
    group: 'seguridad',
    direction: 'lowerIsBetter',
    labelEs: 'Rapiñas denunciadas',
    labelEn: 'Reported robberies',
    unitEs: 'cada 100.000 hab.',
    unitEn: 'per 100,000 people',
    decimals: 1,
    startYear: null,
    vStart: null,
    y14: 2014,
    v14: 582.7,
    lastYear: 2025,
    vLast: 436.2,
    vsStart: 'sin-dato',
    vs14: 'mejor',
    source: 'Ministerio del Interior — AECA, Anuario AECA 2025, Tabla 15.1 (Sistema de Gestión de Seguridad Pública); población INE (Revisión 2013)',
    sourceUrl: 'https://www.gub.uy/ministerio-interior/comunicacion/publicaciones/anuario-aeca-2025-evolucion-anual-2013-2025',
    noteEs: 'El que más contradice el relato: 582,7 en 2014, pico de 870,8 en 2019 y 436,2 en 2025 — el valor más bajo de la serie y 25% por debajo de 2014. El delito que más gente sufre viene bajando hace seis años.',
    noteEn: 'The one that most contradicts the story: 582.7 in 2014, a peak of 870.8 in 2019 and 436.2 in 2025 — the lowest in the series and 25% below 2014. The crime most people actually suffer has been falling for six years.',
    series: [
      {
        year: 2013,
        value: 524.4,
      },
      {
        year: 2014,
        value: 582.7,
      },
      {
        year: 2015,
        value: 611.4,
      },
      {
        year: 2016,
        value: 585.6,
      },
      {
        year: 2017,
        value: 556.8,
      },
      {
        year: 2018,
        value: 852.3,
      },
      {
        year: 2019,
        value: 870.8,
      },
      {
        year: 2020,
        value: 814.5,
      },
      {
        year: 2021,
        value: 702.5,
      },
      {
        year: 2022,
        value: 659.4,
      },
      {
        year: 2023,
        value: 628.5,
      },
      {
        year: 2024,
        value: 488.8,
      },
      {
        year: 2025,
        value: 436.2,
      },
    ],
  },
  {
    key: 'hurtos-tasa',
    group: 'seguridad',
    direction: 'lowerIsBetter',
    labelEs: 'Hurtos denunciados',
    labelEn: 'Reported thefts',
    unitEs: 'cada 100.000 hab.',
    unitEn: 'per 100,000 people',
    decimals: 1,
    startYear: null,
    vStart: null,
    y14: 2014,
    v14: 3069.8,
    lastYear: 2025,
    vLast: 2795.7,
    vsStart: 'sin-dato',
    vs14: 'mejor',
    source: 'Ministerio del Interior — AECA, Anuario AECA 2025, Tabla 17.1 (Sistema de Gestión de Seguridad Pública); población INE (Revisión 2013)',
    sourceUrl: 'https://www.gub.uy/ministerio-interior/comunicacion/publicaciones/anuario-aeca-2025-evolucion-anual-2013-2025',
    noteEs: '3.069,8 en 2014, 2.795,7 en 2025. Bajan, aunque bastante menos que las rapiñas.',
    noteEn: '3,069.8 in 2014, 2,795.7 in 2025. Falling, though far less than robberies.',
    series: [
      {
        year: 2013,
        value: 2949.7,
      },
      {
        year: 2014,
        value: 3069.8,
      },
      {
        year: 2015,
        value: 3154.9,
      },
      {
        year: 2016,
        value: 3305.9,
      },
      {
        year: 2017,
        value: 3311.6,
      },
      {
        year: 2018,
        value: 4163.8,
      },
      {
        year: 2019,
        value: 3979.8,
      },
      {
        year: 2020,
        value: 3364.7,
      },
      {
        year: 2021,
        value: 3181.9,
      },
      {
        year: 2022,
        value: 3262.2,
      },
      {
        year: 2023,
        value: 3209.3,
      },
      {
        year: 2024,
        value: 3058,
      },
      {
        year: 2025,
        value: 2795.7,
      },
    ],
  },
  {
    key: 'femicidios-hmvbg',
    group: 'seguridad',
    direction: 'lowerIsBetter',
    labelEs: 'Femicidios',
    labelEn: 'Femicides',
    unitEs: 'casos por año',
    unitEn: 'cases per year',
    decimals: 1,
    startYear: null,
    vStart: null,
    y14: 2014,
    v14: 18,
    lastYear: 2025,
    vLast: 18,
    vsStart: 'sin-dato',
    vs14: 'igual',
    source: 'Ministerio del Interior — AECA con la Dirección Nacional de Políticas de Género (DNPG), Anuario AECA 2025, Tabla 12.1',
    sourceUrl: 'https://www.gub.uy/ministerio-interior/comunicacion/publicaciones/anuario-aeca-2025-evolucion-anual-2013-2025',
    noteEs: '18 casos en 2014, 18 en 2025. Sin tendencia: el número oscila y no baja.',
    noteEn: '18 cases in 2014, 18 in 2025. No trend: the number oscillates and does not fall.',
    series: [
      {
        year: 2013,
        value: 23,
      },
      {
        year: 2014,
        value: 18,
      },
      {
        year: 2015,
        value: 26,
      },
      {
        year: 2016,
        value: 22,
      },
      {
        year: 2017,
        value: 28,
      },
      {
        year: 2018,
        value: 30,
      },
      {
        year: 2019,
        value: 25,
      },
      {
        year: 2020,
        value: 20,
      },
      {
        year: 2021,
        value: 27,
      },
      {
        year: 2022,
        value: 28,
      },
      {
        year: 2023,
        value: 24,
      },
      {
        year: 2024,
        value: 22,
      },
      {
        year: 2025,
        value: 18,
      },
    ],
  },
  {
    key: 'poblacion-privada-libertad',
    group: 'seguridad',
    direction: 'neutral',
    labelEs: 'Población carcelaria',
    labelEn: 'Prison population',
    unitEs: 'cada 100.000 hab.',
    unitEn: 'per 100,000 people',
    decimals: 1,
    startYear: 2004,
    vStart: 213.6,
    y14: 2014,
    v14: 283.7,
    lastYear: 2025,
    vLast: 459.7,
    vsStart: 'neutro',
    vs14: 'neutro',
    source: 'Ministerio del Interior — AECA con el Área de Planificación Estratégica del Instituto Nacional de Rehabilitación (INR), Anuario AECA 2025, Tabla 28.1; población INE (Revisión 2013)',
    sourceUrl: 'https://www.gub.uy/ministerio-interior/comunicacion/publicaciones/anuario-aeca-2025-evolucion-anual-2013-2025',
    noteEs: '213,6 cada 100.000 en 2004, 459,7 en 2025: la población carcelaria se multiplicó por más de dos y creció casi todos los años. Se marca neutro porque puede leerse como más delito o como más castigo.',
    noteEn: '213.6 per 100,000 in 2004, 459.7 in 2025: the prison population more than doubled and grew in almost every year. Marked neutral because it can read as more crime or as more punishment.',
    series: [
      {
        year: 2003,
        value: 206.7,
      },
      {
        year: 2004,
        value: 213.6,
      },
      {
        year: 2005,
        value: 208.9,
      },
      {
        year: 2006,
        value: 202.2,
      },
      {
        year: 2007,
        value: 214.8,
      },
      {
        year: 2008,
        value: 230.1,
      },
      {
        year: 2009,
        value: 246.4,
      },
      {
        year: 2010,
        value: 258.3,
      },
      {
        year: 2011,
        value: 269.2,
      },
      {
        year: 2012,
        value: 274.7,
      },
      {
        year: 2013,
        value: 281.6,
      },
      {
        year: 2014,
        value: 283.7,
      },
      {
        year: 2015,
        value: 285.9,
      },
      {
        year: 2016,
        value: 296.4,
      },
      {
        year: 2017,
        value: 315,
      },
      {
        year: 2018,
        value: 290.4,
      },
      {
        year: 2019,
        value: 313.6,
      },
      {
        year: 2020,
        value: 351.6,
      },
      {
        year: 2021,
        value: 386.5,
      },
      {
        year: 2022,
        value: 405.3,
      },
      {
        year: 2023,
        value: 420,
      },
      {
        year: 2024,
        value: 445,
      },
      {
        year: 2025,
        value: 459.7,
      },
    ],
  },
  {
    key: 'pobreza-personas',
    group: 'bienestar',
    direction: 'lowerIsBetter',
    labelEs: 'Pobreza (personas) · línea 2006',
    labelEn: 'Poverty (persons) - 2006 line',
    unitEs: '% de personas',
    unitEn: '% of people',
    decimals: 1,
    startYear: 2004,
    vStart: 39.9,
    y14: 2014,
    v14: 9.7,
    lastYear: 2024,
    vLast: 8.3,
    vsStart: 'mejor',
    vs14: 'mejor',
    source: 'INE — Encuesta Continua de Hogares (ECH)',
    sourceUrl: 'https://www5.ine.gub.uy/documents/Demograf%C3%ADayEESS/HTML/ECH/Pobreza/2024/Estimacion%20de%20la%20pobreza%20por%20el%20metodo%20de%20ingreso%20anual%202024.html',
    noteEs: 'El indicador que más cambió en veinte años: 39,9% de las personas bajo la línea en 2004, 8,3% en 2024. No fue lineal — tocó piso en 7,9% (2017), volvió a 11,6% en 2020 y recién ahora está por debajo.',
    noteEn: 'The biggest twenty-year change: 39.9% of people below the poverty line in 2004, 8.3% in 2024. Not linear — it bottomed at 7.9% (2017), rebounded to 11.6% in 2020 and only now sits lower.',
    series: [
      {
        year: 2004,
        value: 39.9,
      },
      {
        year: 2005,
        value: 36.5,
      },
      {
        year: 2006,
        value: 32.5,
      },
      {
        year: 2007,
        value: 29.6,
      },
      {
        year: 2008,
        value: 24.2,
      },
      {
        year: 2009,
        value: 21,
      },
      {
        year: 2010,
        value: 18.5,
      },
      {
        year: 2011,
        value: 13.7,
      },
      {
        year: 2012,
        value: 12.4,
      },
      {
        year: 2013,
        value: 11.5,
      },
      {
        year: 2014,
        value: 9.7,
      },
      {
        year: 2015,
        value: 9.7,
      },
      {
        year: 2016,
        value: 9.4,
      },
      {
        year: 2017,
        value: 7.9,
      },
      {
        year: 2018,
        value: 8.1,
      },
      {
        year: 2019,
        value: 8.8,
      },
      {
        year: 2020,
        value: 11.6,
      },
      {
        year: 2021,
        value: 10.6,
      },
      {
        year: 2022,
        value: 9.9,
      },
      {
        year: 2023,
        value: 10.1,
      },
      {
        year: 2024,
        value: 8.3,
      },
    ],
  },
  {
    key: 'pobreza-personas-metodologia-2017',
    group: 'bienestar',
    direction: 'lowerIsBetter',
    labelEs: 'Pobreza (personas) · línea 2017',
    labelEn: 'Poverty (persons) - 2017 line',
    unitEs: '% de personas',
    unitEn: '% of people',
    decimals: 1,
    startYear: null,
    vStart: null,
    y14: 2015,
    v14: 18.1,
    lastYear: 2025,
    vLast: 16.6,
    vsStart: 'sin-dato',
    vs14: 'mejor',
    source: 'INE — Encuesta Continua de Hogares (ECH)',
    sourceUrl: 'https://www5.ine.gub.uy/documents/Demograf%C3%ADayEESS/HTML/ECH/Pobreza/2025/Informe%20pobreza%20Anual-2025.html',
    noteEs: 'La misma pobreza con la línea nueva (ENGIH 2016-17) da 16,6% en 2025. No es que se duplicó: es otra vara, más exigente. Va aparte para que ninguna serie se lea como continuación de la otra.',
    noteEn: 'The same poverty measured against the new line (ENGIH 2016-17) gives 16.6% in 2025. It did not double: it is a stricter yardstick. Shown separately so neither series reads as a continuation of the other.',
    series: [
      {
        year: 2015,
        value: 18.1,
      },
      {
        year: 2016,
        value: 17.9,
      },
      {
        year: 2017,
        value: 15.5,
      },
      {
        year: 2018,
        value: 16.4,
      },
      {
        year: 2019,
        value: 17.3,
      },
      {
        year: 2020,
        value: 23.3,
      },
      {
        year: 2021,
        value: 21.1,
      },
      {
        year: 2022,
        value: 20.1,
      },
      {
        year: 2023,
        value: 19.7,
      },
      {
        year: 2024,
        value: 17.3,
      },
      {
        year: 2025,
        value: 16.6,
      },
    ],
  },
  {
    key: 'indigencia-personas',
    group: 'bienestar',
    direction: 'lowerIsBetter',
    labelEs: 'Indigencia',
    labelEn: 'Extreme poverty',
    unitEs: '% de personas',
    unitEn: '% of people',
    decimals: 1,
    startYear: 2004,
    vStart: 4.7,
    y14: 2014,
    v14: 0.3,
    lastYear: 2024,
    vLast: 0.3,
    vsStart: 'mejor',
    vs14: 'igual',
    source: 'INE — Encuesta Continua de Hogares (ECH)',
    sourceUrl: 'https://www5.ine.gub.uy/documents/Demograf%C3%ADayEESS/HTML/ECH/Pobreza/2024/Estimacion%20de%20la%20pobreza%20por%20el%20metodo%20de%20ingreso%20anual%202024.html',
    noteEs: '4,7% en 2004, 0,3% desde 2014. Bajó hasta casi desaparecer de la estadística y ahí se quedó.',
    noteEn: '4.7% in 2004, 0.3% since 2014. It fell to near-statistical disappearance and stayed there.',
    series: [
      {
        year: 2004,
        value: 4.7,
      },
      {
        year: 2005,
        value: 3.9,
      },
      {
        year: 2006,
        value: 2.5,
      },
      {
        year: 2007,
        value: 2.4,
      },
      {
        year: 2008,
        value: 2.5,
      },
      {
        year: 2009,
        value: 1.6,
      },
      {
        year: 2010,
        value: 1.1,
      },
      {
        year: 2011,
        value: 0.5,
      },
      {
        year: 2012,
        value: 0.5,
      },
      {
        year: 2013,
        value: 0.5,
      },
      {
        year: 2014,
        value: 0.3,
      },
      {
        year: 2015,
        value: 0.3,
      },
      {
        year: 2016,
        value: 0.2,
      },
      {
        year: 2017,
        value: 0.1,
      },
      {
        year: 2018,
        value: 0.1,
      },
      {
        year: 2019,
        value: 0.2,
      },
      {
        year: 2020,
        value: 0.4,
      },
      {
        year: 2021,
        value: 0.3,
      },
      {
        year: 2022,
        value: 0.3,
      },
      {
        year: 2023,
        value: 0.2,
      },
      {
        year: 2024,
        value: 0.3,
      },
    ],
  },
  {
    key: 'pobreza-infantil-menores-6',
    group: 'bienestar',
    direction: 'lowerIsBetter',
    labelEs: 'Pobreza infantil (menores de 6)',
    labelEn: 'Child poverty (under 6)',
    unitEs: '% de menores de 6 años',
    unitEn: '% of children under 6',
    decimals: 1,
    startYear: 2006,
    vStart: 53.4,
    y14: 2014,
    v14: 20.4,
    lastYear: 2023,
    vLast: 20.1,
    vsStart: 'mejor',
    vs14: 'igual',
    source: 'INE — Estimación de la pobreza por el Método de Ingreso 2013, Cuadros 26-32 (anexo con la apertura por grupos de edades 2006-2012); complementado con los informes anuales 2014-2017 y los informes HTML 2019-2023',
    sourceUrl: 'https://www5.ine.gub.uy/documents/Demograf%C3%ADayEESS/PDF/ECH/Pobreza/Estimaci%C3%B3n%20de%20la%20pobreza%20por%20el%20M%C3%A9todo%20del%20Ingreso%202013.pdf',
    noteEs: 'El dato incómodo: la pobreza general se desplomó, la infantil no se mueve desde 2014 (20,4% → 20,1%). Uno de cada cinco menores de 6 años vive bajo la línea.',
    noteEn: 'The uncomfortable one: overall poverty collapsed, child poverty has not moved since 2014 (20.4% → 20.1%). One in five children under 6 lives below the line.',
    series: [
      {
        year: 2006,
        value: 53.4,
      },
      {
        year: 2007,
        value: 49.8,
      },
      {
        year: 2008,
        value: 43.1,
      },
      {
        year: 2009,
        value: 37.8,
      },
      {
        year: 2010,
        value: 33.8,
      },
      {
        year: 2011,
        value: 26.1,
      },
      {
        year: 2012,
        value: 24.5,
      },
      {
        year: 2013,
        value: 22.6,
      },
      {
        year: 2014,
        value: 20.4,
      },
      {
        year: 2015,
        value: 20.6,
      },
      {
        year: 2016,
        value: 20.1,
      },
      {
        year: 2017,
        value: 17.4,
      },
      {
        year: 2019,
        value: 17,
      },
      {
        year: 2020,
        value: 21.3,
      },
      {
        year: 2021,
        value: 18.6,
      },
      {
        year: 2022,
        value: 19.7,
      },
      {
        year: 2023,
        value: 20.1,
      },
    ],
  },
  {
    key: 'gini',
    group: 'bienestar',
    direction: 'lowerIsBetter',
    labelEs: 'Desigualdad (Gini)',
    labelEn: 'Inequality (Gini)',
    unitEs: 'índice 0–1',
    unitEn: 'index 0-1',
    decimals: 3,
    startYear: 2006,
    vStart: 0.455,
    y14: 2014,
    v14: 0.381,
    lastYear: 2024,
    vLast: 0.383,
    vsStart: 'mejor',
    vs14: 'igual',
    source: 'INE — Encuesta Continua de Hogares (ECH)',
    sourceUrl: 'https://www5.ine.gub.uy/documents/Demograf%C3%ADayEESS/HTML/ECH/Pobreza/2024/Desigualdad_informe-2024.html',
    noteEs: 'La desigualdad cayó fuerte hasta 2014 (0,455 → 0,381) y desde entonces está clavada (0,383 en 2024). El país se volvió menos desigual en la década del boom y dejó de hacerlo después.',
    noteEn: 'Inequality fell sharply to 2014 (0.455 → 0.381) and has been stuck since (0.383 in 2024). The country became less unequal during the boom decade and then stopped.',
    series: [
      {
        year: 2006,
        value: 0.455,
      },
      {
        year: 2007,
        value: 0.456,
      },
      {
        year: 2008,
        value: 0.439,
      },
      {
        year: 2009,
        value: 0.438,
      },
      {
        year: 2010,
        value: 0.425,
      },
      {
        year: 2011,
        value: 0.403,
      },
      {
        year: 2012,
        value: 0.379,
      },
      {
        year: 2013,
        value: 0.384,
      },
      {
        year: 2014,
        value: 0.381,
      },
      {
        year: 2015,
        value: 0.386,
      },
      {
        year: 2016,
        value: 0.383,
      },
      {
        year: 2017,
        value: 0.38,
      },
      {
        year: 2018,
        value: 0.38,
      },
      {
        year: 2019,
        value: 0.383,
      },
      {
        year: 2020,
        value: 0.387,
      },
      {
        year: 2021,
        value: 0.386,
      },
      {
        year: 2022,
        value: 0.389,
      },
      {
        year: 2023,
        value: 0.394,
      },
      {
        year: 2024,
        value: 0.383,
      },
    ],
  },
  {
    key: 'salario-real',
    group: 'bienestar',
    direction: 'higherIsBetter',
    labelEs: 'Salario real',
    labelEn: 'Real wages',
    unitEs: 'índice 2004=100',
    unitEn: 'index 2004=100',
    decimals: 1,
    startYear: 2004,
    vStart: 100,
    y14: 2014,
    v14: 151.5,
    lastYear: 2025,
    vLast: 169,
    vsStart: 'mejor',
    vs14: 'mejor',
    source: 'INE — Índice Medio de Salario Real (IMS)',
    sourceUrl: 'https://www.gub.uy/instituto-nacional-estadistica/datos-y-estadisticas/estadisticas/series-historicas-indice-medio-salarios-ims-base-julio-2008100',
    noteEs: 'El salario real de 2025 es 69% más alto que el de 2004 — pero 2004 era el piso de la crisis. Contra el año 2000 la mejora es de 32% en 25 años, y entre 2020 y 2022 hubo tres años seguidos de caída.',
    noteEn: 'The 2025 real wage is 69% above 2004 — but 2004 was the floor of the crisis. Against the year 2000 the gain is 32% over 25 years, and 2020-2022 saw three consecutive years of decline.',
    series: [
      {
        year: 2000,
        value: 128.4,
      },
      {
        year: 2001,
        value: 128.1,
      },
      {
        year: 2002,
        value: 114.3,
      },
      {
        year: 2003,
        value: 100.1,
      },
      {
        year: 2004,
        value: 100,
      },
      {
        year: 2005,
        value: 104.6,
      },
      {
        year: 2006,
        value: 109.2,
      },
      {
        year: 2007,
        value: 114.4,
      },
      {
        year: 2008,
        value: 118.4,
      },
      {
        year: 2009,
        value: 127,
      },
      {
        year: 2010,
        value: 131.2,
      },
      {
        year: 2011,
        value: 136.5,
      },
      {
        year: 2012,
        value: 142.3,
      },
      {
        year: 2013,
        value: 146.6,
      },
      {
        year: 2014,
        value: 151.5,
      },
      {
        year: 2015,
        value: 153.9,
      },
      {
        year: 2016,
        value: 156.3,
      },
      {
        year: 2017,
        value: 160.9,
      },
      {
        year: 2018,
        value: 161.2,
      },
      {
        year: 2019,
        value: 163.2,
      },
      {
        year: 2020,
        value: 160.4,
      },
      {
        year: 2021,
        value: 158,
      },
      {
        year: 2022,
        value: 157.1,
      },
      {
        year: 2023,
        value: 162.9,
      },
      {
        year: 2024,
        value: 167.1,
      },
      {
        year: 2025,
        value: 169,
      },
    ],
  },
  {
    key: 'desempleo',
    group: 'bienestar',
    direction: 'lowerIsBetter',
    labelEs: 'Desempleo',
    labelEn: 'Unemployment',
    unitEs: '% de la población económicamente activa',
    unitEn: '% of the labour force',
    decimals: 1,
    startYear: 2004,
    vStart: 13.1,
    y14: 2014,
    v14: 6.9,
    lastYear: 2025,
    vLast: 7.5,
    vsStart: 'mejor',
    vs14: 'peor',
    source: 'INE — Encuesta Continua de Hogares (ECH)',
    sourceUrl: 'https://www.gub.uy/instituto-nacional-estadistica/datos-y-estadisticas/estadisticas/series-historicas-actividad-empleo-desempleo',
    noteEs: '13,1% en 2004, 7,5% en 2025. Mejor que hace veinte años, peor que el 6,9% de 2014.',
    noteEn: '13.1% in 2004, 7.5% in 2025. Better than twenty years ago, worse than the 6.9% of 2014.',
    series: [
      {
        year: 2001,
        value: 15.3,
      },
      {
        year: 2002,
        value: 17,
      },
      {
        year: 2003,
        value: 16.9,
      },
      {
        year: 2004,
        value: 13.1,
      },
      {
        year: 2005,
        value: 12.2,
      },
      {
        year: 2006,
        value: 11.3,
      },
      {
        year: 2007,
        value: 9.8,
      },
      {
        year: 2008,
        value: 8.3,
      },
      {
        year: 2009,
        value: 8.2,
      },
      {
        year: 2010,
        value: 7.5,
      },
      {
        year: 2011,
        value: 6.6,
      },
      {
        year: 2012,
        value: 6.8,
      },
      {
        year: 2013,
        value: 6.7,
      },
      {
        year: 2014,
        value: 6.9,
      },
      {
        year: 2015,
        value: 7.8,
      },
      {
        year: 2016,
        value: 8.2,
      },
      {
        year: 2017,
        value: 8.3,
      },
      {
        year: 2018,
        value: 8.6,
      },
      {
        year: 2019,
        value: 9.2,
      },
      {
        year: 2020,
        value: 10.6,
      },
      {
        year: 2021,
        value: 9.8,
      },
      {
        year: 2022,
        value: 8.1,
      },
      {
        year: 2023,
        value: 8.6,
      },
      {
        year: 2024,
        value: 8.3,
      },
      {
        year: 2025,
        value: 7.5,
      },
    ],
  },
  {
    key: 'informalidad',
    group: 'bienestar',
    direction: 'lowerIsBetter',
    labelEs: 'Informalidad laboral',
    labelEn: 'Informal employment',
    unitEs: '% de ocupados',
    unitEn: '% of workers',
    decimals: 1,
    startYear: 2006,
    vStart: 35,
    y14: 2014,
    v14: 24.9,
    lastYear: 2025,
    vLast: 21.9,
    vsStart: 'mejor',
    vs14: 'mejor',
    source: 'INE — Encuesta Continua de Hogares (ECH)',
    sourceUrl: 'https://www.gub.uy/instituto-nacional-estadistica/datos-y-estadisticas/estadisticas/series-historicas-actividad-empleo-desempleo',
    noteEs: '35% de los ocupados sin aportes en 2006, 21,9% en 2025. Bajó de forma sostenida, también después de 2014.',
    noteEn: '35% of workers off the books in 2006, 21.9% in 2025. A sustained fall, including after 2014.',
    series: [
      {
        year: 2006,
        value: 35,
      },
      {
        year: 2007,
        value: 34.7,
      },
      {
        year: 2008,
        value: 33.4,
      },
      {
        year: 2009,
        value: 32.2,
      },
      {
        year: 2010,
        value: 31.7,
      },
      {
        year: 2011,
        value: 28.3,
      },
      {
        year: 2012,
        value: 26.6,
      },
      {
        year: 2013,
        value: 25.6,
      },
      {
        year: 2014,
        value: 24.9,
      },
      {
        year: 2015,
        value: 24.7,
      },
      {
        year: 2016,
        value: 25.3,
      },
      {
        year: 2017,
        value: 24.7,
      },
      {
        year: 2018,
        value: 24.6,
      },
      {
        year: 2019,
        value: 24.8,
      },
      {
        year: 2020,
        value: 22.2,
      },
      {
        year: 2021,
        value: 21.7,
      },
      {
        year: 2022,
        value: 20.9,
      },
      {
        year: 2023,
        value: 21.3,
      },
      {
        year: 2024,
        value: 21.7,
      },
      {
        year: 2025,
        value: 21.9,
      },
    ],
  },
  {
    key: 'inflacion',
    group: 'bienestar',
    direction: 'lowerIsBetter',
    labelEs: 'Inflación anual',
    labelEn: 'Annual inflation',
    unitEs: '% var. anual (dic/dic)',
    unitEn: '% annual change (Dec/Dec)',
    decimals: 1,
    startYear: 2004,
    vStart: 7.6,
    y14: 2014,
    v14: 8.3,
    lastYear: 2025,
    vLast: 3.7,
    vsStart: 'mejor',
    vs14: 'mejor',
    source: 'INE — Índice de Precios del Consumo (IPC)',
    sourceUrl: 'https://www.gub.uy/instituto-nacional-estadistica/datos-y-estadisticas/estadisticas/series-historicas-ipc-base-octubre-2022100',
    noteEs: '7,6% en 2004, 8,3% en 2014, 3,7% en 2025. Los precios siguen subiendo; hace décadas que no subían tan despacio.',
    noteEn: '7.6% in 2004, 8.3% in 2014, 3.7% in 2025. Prices still rise; they have not risen this slowly in decades.',
    series: [
      {
        year: 2002,
        value: 25.9,
      },
      {
        year: 2003,
        value: 10.2,
      },
      {
        year: 2004,
        value: 7.6,
      },
      {
        year: 2005,
        value: 4.9,
      },
      {
        year: 2006,
        value: 6.4,
      },
      {
        year: 2007,
        value: 8.5,
      },
      {
        year: 2008,
        value: 9.2,
      },
      {
        year: 2009,
        value: 5.9,
      },
      {
        year: 2010,
        value: 6.9,
      },
      {
        year: 2011,
        value: 8.6,
      },
      {
        year: 2012,
        value: 7.5,
      },
      {
        year: 2013,
        value: 8.5,
      },
      {
        year: 2014,
        value: 8.3,
      },
      {
        year: 2015,
        value: 9.4,
      },
      {
        year: 2016,
        value: 8.1,
      },
      {
        year: 2017,
        value: 6.6,
      },
      {
        year: 2018,
        value: 8,
      },
      {
        year: 2019,
        value: 8.8,
      },
      {
        year: 2020,
        value: 9.4,
      },
      {
        year: 2021,
        value: 8,
      },
      {
        year: 2022,
        value: 8.3,
      },
      {
        year: 2023,
        value: 5.1,
      },
      {
        year: 2024,
        value: 5.5,
      },
      {
        year: 2025,
        value: 3.7,
      },
    ],
  },
  {
    key: 'pib-per-capita-ppa',
    group: 'bienestar',
    direction: 'higherIsBetter',
    labelEs: 'PIB por habitante (PPA)',
    labelEn: 'GDP per capita (PPP)',
    unitEs: 'USD PPA constantes de 2021',
    unitEn: 'constant 2021 PPP USD',
    decimals: 0,
    startYear: 2004,
    vStart: 17519,
    y14: 2014,
    v14: 28935,
    lastYear: 2025,
    vLast: 32742,
    vsStart: 'mejor',
    vs14: 'mejor',
    source: 'Banco Mundial (indicador NY.GDP.PCAP.PP.KD), a partir de cuentas nacionales del BCU y del programa de comparación internacional',
    sourceUrl: 'https://data.worldbank.org/indicator/NY.GDP.PCAP.PP.KD?locations=UY',
    noteEs: 'De USD 17.519 (2004) a USD 32.742 (2025) en dólares PPA constantes: el producto por habitante casi se duplicó.',
    noteEn: 'From USD 17,519 (2004) to USD 32,742 (2025) in constant PPP dollars: output per head nearly doubled.',
    series: [
      {
        year: 2002,
        value: 16573,
      },
      {
        year: 2003,
        value: 16694,
      },
      {
        year: 2004,
        value: 17519,
      },
      {
        year: 2005,
        value: 18811,
      },
      {
        year: 2006,
        value: 19560,
      },
      {
        year: 2007,
        value: 20804,
      },
      {
        year: 2008,
        value: 22249,
      },
      {
        year: 2009,
        value: 23138,
      },
      {
        year: 2010,
        value: 24880,
      },
      {
        year: 2011,
        value: 26099,
      },
      {
        year: 2012,
        value: 26953,
      },
      {
        year: 2013,
        value: 28119,
      },
      {
        year: 2014,
        value: 28935,
      },
      {
        year: 2015,
        value: 28942,
      },
      {
        year: 2016,
        value: 29333,
      },
      {
        year: 2017,
        value: 29762,
      },
      {
        year: 2018,
        value: 29758,
      },
      {
        year: 2019,
        value: 30011,
      },
      {
        year: 2020,
        value: 27788,
      },
      {
        year: 2021,
        value: 29432,
      },
      {
        year: 2022,
        value: 30840,
      },
      {
        year: 2023,
        value: 31101,
      },
      {
        year: 2024,
        value: 32149,
      },
      {
        year: 2025,
        value: 32742,
      },
    ],
  },
  {
    key: 'esperanza-de-vida',
    group: 'salud',
    direction: 'higherIsBetter',
    labelEs: 'Esperanza de vida',
    labelEn: 'Life expectancy',
    unitEs: 'años',
    unitEn: 'years',
    decimals: 1,
    startYear: 2004,
    vStart: 75.32,
    y14: 2014,
    v14: 77.19,
    lastYear: 2024,
    vLast: 78.29,
    vsStart: 'mejor',
    vs14: 'mejor',
    source: 'Banco Mundial (estimaciones ONU-DESA/World Population Prospects sobre registros vitales del MSP/INE)',
    sourceUrl: 'https://datos.bancomundial.org/indicador/SP.DYN.LE00.IN?locations=UY',
    noteEs: '75,3 años en 2004, 78,3 en 2024: casi tres años más de vida en dos décadas.',
    noteEn: '75.3 years in 2004, 78.3 in 2024: almost three more years of life in two decades.',
    series: [
      {
        year: 2000,
        value: 74.69,
      },
      {
        year: 2001,
        value: 74.99,
      },
      {
        year: 2002,
        value: 74.98,
      },
      {
        year: 2003,
        value: 75.09,
      },
      {
        year: 2004,
        value: 75.32,
      },
      {
        year: 2005,
        value: 75.83,
      },
      {
        year: 2006,
        value: 75.89,
      },
      {
        year: 2007,
        value: 76.15,
      },
      {
        year: 2008,
        value: 76.28,
      },
      {
        year: 2009,
        value: 76.67,
      },
      {
        year: 2010,
        value: 76.69,
      },
      {
        year: 2011,
        value: 76.61,
      },
      {
        year: 2012,
        value: 76.69,
      },
      {
        year: 2013,
        value: 76.95,
      },
      {
        year: 2014,
        value: 77.19,
      },
      {
        year: 2015,
        value: 77.29,
      },
      {
        year: 2016,
        value: 77.35,
      },
      {
        year: 2017,
        value: 77.62,
      },
      {
        year: 2018,
        value: 77.53,
      },
      {
        year: 2019,
        value: 77.5,
      },
      {
        year: 2020,
        value: 78.38,
      },
      {
        year: 2021,
        value: 75.43,
      },
      {
        year: 2022,
        value: 76.47,
      },
      {
        year: 2023,
        value: 78.14,
      },
      {
        year: 2024,
        value: 78.29,
      },
    ],
  },
  {
    key: 'mortalidad-infantil',
    group: 'salud',
    direction: 'lowerIsBetter',
    labelEs: 'Mortalidad infantil',
    labelEn: 'Infant mortality',
    unitEs: 'defunciones de menores de 1 año cada 1.000 nacidos vivos',
    unitEn: 'deaths under age 1 per 1,000 live births',
    decimals: 1,
    startYear: 2004,
    vStart: 13.2,
    y14: 2014,
    v14: 7.8,
    lastYear: 2024,
    vLast: 6.5,
    vsStart: 'mejor',
    vs14: 'mejor',
    source: 'MSP – Departamento de Estadísticas Vitales / DIGESA',
    sourceUrl: 'https://www.gub.uy/ministerio-desarrollo-social/indicador/tasa-mortalidad-infantil-neonatal-posneonatal-cada-mil-nacidos-vivos-total-pais',
    noteEs: '13,2 muertes cada 1.000 nacidos vivos en 2004, 6,5 en 2024. Se redujo a la mitad.',
    noteEn: '13.2 deaths per 1,000 live births in 2004, 6.5 in 2024. Halved.',
    series: [
      {
        year: 2000,
        value: 14.1,
      },
      {
        year: 2001,
        value: 13.9,
      },
      {
        year: 2002,
        value: 13.7,
      },
      {
        year: 2003,
        value: 15.1,
      },
      {
        year: 2004,
        value: 13.2,
      },
      {
        year: 2005,
        value: 12.8,
      },
      {
        year: 2006,
        value: 10.6,
      },
      {
        year: 2007,
        value: 12.1,
      },
      {
        year: 2008,
        value: 10.6,
      },
      {
        year: 2009,
        value: 9.6,
      },
      {
        year: 2010,
        value: 7.7,
      },
      {
        year: 2011,
        value: 8.9,
      },
      {
        year: 2012,
        value: 9.3,
      },
      {
        year: 2013,
        value: 8.9,
      },
      {
        year: 2014,
        value: 7.8,
      },
      {
        year: 2015,
        value: 7.5,
      },
      {
        year: 2016,
        value: 8,
      },
      {
        year: 2017,
        value: 6.5,
      },
      {
        year: 2018,
        value: 6.8,
      },
      {
        year: 2019,
        value: 6.8,
      },
      {
        year: 2020,
        value: 6.2,
      },
      {
        year: 2021,
        value: 6.3,
      },
      {
        year: 2022,
        value: 6.2,
      },
      {
        year: 2023,
        value: 7.3,
      },
      {
        year: 2024,
        value: 6.5,
      },
    ],
  },
  {
    key: 'fecundidad-adolescente',
    group: 'salud',
    direction: 'lowerIsBetter',
    labelEs: 'Maternidad adolescente',
    labelEn: 'Teenage motherhood',
    unitEs: 'nacimientos cada 1.000 mujeres de 15 a 19 años',
    unitEn: 'births per 1,000 women aged 15-19',
    decimals: 1,
    startYear: 2004,
    vStart: 59.76,
    y14: 2014,
    v14: 58.23,
    lastYear: 2024,
    vLast: 25.1,
    vsStart: 'mejor',
    vs14: 'mejor',
    source: 'Banco Mundial (estimaciones ONU-DESA sobre registros vitales del MSP/INE)',
    sourceUrl: 'https://datos.bancomundial.org/indicador/SP.ADO.TFRT?locations=UY',
    noteEs: '59,8 nacimientos cada 1.000 adolescentes en 2004, 25,1 en 2024: una caída del 58%. Uno de los cambios sociales más grandes del período y casi no se discute.',
    noteEn: '59.8 births per 1,000 teenagers in 2004, 25.1 in 2024: a 58% fall. One of the largest social shifts of the period, and barely discussed.',
    series: [
      {
        year: 2000,
        value: 67.08,
      },
      {
        year: 2001,
        value: 66.87,
      },
      {
        year: 2002,
        value: 65.52,
      },
      {
        year: 2003,
        value: 61.62,
      },
      {
        year: 2004,
        value: 59.76,
      },
      {
        year: 2005,
        value: 60.26,
      },
      {
        year: 2006,
        value: 60,
      },
      {
        year: 2007,
        value: 59.8,
      },
      {
        year: 2008,
        value: 59.71,
      },
      {
        year: 2009,
        value: 59.58,
      },
      {
        year: 2010,
        value: 59.54,
      },
      {
        year: 2011,
        value: 59.11,
      },
      {
        year: 2012,
        value: 60.35,
      },
      {
        year: 2013,
        value: 60.54,
      },
      {
        year: 2014,
        value: 58.23,
      },
      {
        year: 2015,
        value: 55.91,
      },
      {
        year: 2016,
        value: 50.84,
      },
      {
        year: 2017,
        value: 44.28,
      },
      {
        year: 2018,
        value: 37.76,
      },
      {
        year: 2019,
        value: 33.07,
      },
      {
        year: 2020,
        value: 29.59,
      },
      {
        year: 2021,
        value: 27.36,
      },
      {
        year: 2022,
        value: 26.49,
      },
      {
        year: 2023,
        value: 26.19,
      },
      {
        year: 2024,
        value: 25.1,
      },
    ],
  },
  {
    key: 'tabaquismo-adultos',
    group: 'salud',
    direction: 'lowerIsBetter',
    labelEs: 'Tabaquismo',
    labelEn: 'Smoking',
    unitEs: '% de la población de 15 a 65 años',
    unitEn: '% of people aged 15-65',
    decimals: 1,
    startYear: 2006,
    vStart: 34,
    y14: 2014,
    v14: 29.5,
    lastYear: 2024,
    vLast: 24.2,
    vsStart: 'mejor',
    vs14: 'mejor',
    source: 'Junta Nacional de Drogas – Observatorio Uruguayo de Drogas, Encuestas Nacionales sobre Consumo de Drogas en Población General (en convenio con el INE)',
    sourceUrl: 'https://www.gub.uy/junta-nacional-drogas/comunicacion/noticias/presentacion-viii-encuesta-nacional-sobre-consumo-drogas-poblacion-general',
    noteEs: '34% de fumadores en 2006, 24,2% en 2024. Política pública que funcionó y se nota poco.',
    noteEn: '34% smokers in 2006, 24.2% in 2024. Public policy that worked and goes largely unnoticed.',
    series: [
      {
        year: 2001,
        value: 34.5,
      },
      {
        year: 2006,
        value: 34,
      },
      {
        year: 2011,
        value: 31,
      },
      {
        year: 2014,
        value: 29.5,
      },
      {
        year: 2018,
        value: 27.9,
      },
      {
        year: 2024,
        value: 24.2,
      },
    ],
  },
  {
    key: 'egreso-media-superior',
    group: 'educacion',
    direction: 'higherIsBetter',
    labelEs: 'Egreso de educación media',
    labelEn: 'Upper-secondary completion',
    unitEs: '% de jóvenes de 21 a 23 años',
    unitEn: '% of people aged 21-23',
    decimals: 1,
    startYear: 2006,
    vStart: 32.2,
    y14: 2014,
    v14: 38.6,
    lastYear: 2025,
    vLast: 56.4,
    vsStart: 'mejor',
    vs14: 'mejor',
    source: 'INEEd – Mirador Educativo, sobre microdatos de la Encuesta Continua de Hogares (INE)',
    sourceUrl: 'https://mirador.ineed.edu.uy/indicadores/tasa-de-egreso-de-educacion-media-superior-entre-jovenes-de-21-a-23-anos-8-2.html',
    noteEs: 'Clavado en torno al 38% entre 2011 y 2016, despegó recién en los 2020: 56,4% en 2025. Sigue significando que cuatro de cada diez jóvenes de 21 a 23 años no terminaron el liceo, con la meta oficial del 75% incumplida por dos gobiernos.',
    noteEn: 'Stuck near 38% between 2011 and 2016, it only took off in the 2020s: 56.4% in 2025. It still means four in ten 21-to-23-year-olds did not finish secondary school, with the official 75% target missed by two governments.',
    series: [
      {
        year: 2006,
        value: 32.2,
      },
      {
        year: 2007,
        value: 31.9,
      },
      {
        year: 2008,
        value: 35.6,
      },
      {
        year: 2009,
        value: 35,
      },
      {
        year: 2010,
        value: 34.6,
      },
      {
        year: 2011,
        value: 38.6,
      },
      {
        year: 2012,
        value: 37.7,
      },
      {
        year: 2013,
        value: 38.1,
      },
      {
        year: 2014,
        value: 38.6,
      },
      {
        year: 2015,
        value: 38.7,
      },
      {
        year: 2016,
        value: 38.3,
      },
      {
        year: 2017,
        value: 41.1,
      },
      {
        year: 2018,
        value: 42.7,
      },
      {
        year: 2019,
        value: 43.3,
      },
      {
        year: 2022,
        value: 50.9,
      },
      {
        year: 2023,
        value: 51.6,
      },
      {
        year: 2024,
        value: 53.2,
      },
      {
        year: 2025,
        value: 56.4,
      },
    ],
  },
  {
    key: 'pisa-lectura',
    group: 'educacion',
    direction: 'higherIsBetter',
    labelEs: 'PISA · lectura',
    labelEn: 'PISA - reading',
    unitEs: 'puntaje medio PISA',
    unitEn: 'mean PISA score',
    decimals: 1,
    startYear: 2006,
    vStart: 413,
    y14: 2015,
    v14: 437,
    lastYear: 2022,
    vLast: 430,
    vsStart: 'igual',
    vs14: 'igual',
    source: 'OCDE – Programme for International Student Assessment (PISA); Uruguay participa desde 2003 a través de ANEP',
    sourceUrl: 'https://www.oecd.org/en/publications/pisa-2022-results-volume-i-and-ii-country-notes_ed6fbcc5-en/uruguay_020b6715-en.html',
    noteEs: '413 en 2006, 430 en 2022. Dentro del ruido de la prueba: en dieciséis años ni mejora ni empeora.',
    noteEn: '413 in 2006, 430 in 2022. Within the test\'s noise: sixteen years of neither improvement nor decline.',
    series: [
      {
        year: 2003,
        value: 434,
      },
      {
        year: 2006,
        value: 413,
      },
      {
        year: 2009,
        value: 426,
      },
      {
        year: 2012,
        value: 411,
      },
      {
        year: 2015,
        value: 437,
      },
      {
        year: 2018,
        value: 427,
      },
      {
        year: 2022,
        value: 430,
      },
    ],
  },
  {
    key: 'pisa-matematica',
    group: 'educacion',
    direction: 'higherIsBetter',
    labelEs: 'PISA · matemática',
    labelEn: 'PISA - maths',
    unitEs: 'puntaje medio PISA',
    unitEn: 'mean PISA score',
    decimals: 1,
    startYear: 2006,
    vStart: 427,
    y14: 2015,
    v14: 418,
    lastYear: 2022,
    vLast: 409,
    vsStart: 'igual',
    vs14: 'igual',
    source: 'OCDE – Programme for International Student Assessment (PISA); Uruguay participa desde 2003 a través de ANEP',
    sourceUrl: 'https://www.oecd.org/en/publications/pisa-2022-results-volume-i-and-ii-country-notes_ed6fbcc5-en/uruguay_020b6715-en.html',
    noteEs: '427 en 2006, 409 en 2022. La única de las dos que apunta hacia abajo, aunque también dentro del margen.',
    noteEn: '427 in 2006, 409 in 2022. The one of the two pointing down, though also within the margin.',
    series: [
      {
        year: 2003,
        value: 422,
      },
      {
        year: 2006,
        value: 427,
      },
      {
        year: 2009,
        value: 427,
      },
      {
        year: 2012,
        value: 409,
      },
      {
        year: 2015,
        value: 418,
      },
      {
        year: 2018,
        value: 418,
      },
      {
        year: 2022,
        value: 409,
      },
    ],
  },
  {
    key: 'internet-hogares',
    group: 'servicios',
    direction: 'higherIsBetter',
    labelEs: 'Hogares con internet',
    labelEn: 'Households with internet',
    unitEs: '% de hogares',
    unitEn: '% of households',
    decimals: 1,
    startYear: null,
    vStart: null,
    y14: 2013,
    v14: 65,
    lastYear: 2024,
    vLast: 94,
    vsStart: 'sin-dato',
    vs14: 'mejor',
    source: 'INE + Agesic — Encuesta de Usos de Tecnologías de la Información y la Comunicación (EUTIC)',
    sourceUrl: 'https://www.gub.uy/agencia-gobierno-electronico-sociedad-informacion-conocimiento/sites/agencia-gobierno-electronico-sociedad-informacion-conocimiento/files/2025-11/_Informe_EUTIC_2025.pdf',
    noteEs: '65% de los hogares conectados en 2013, 94% en 2024.',
    noteEn: '65% of households connected in 2013, 94% in 2024.',
    series: [
      {
        year: 2010,
        value: 45,
      },
      {
        year: 2013,
        value: 65,
      },
      {
        year: 2016,
        value: 83,
      },
      {
        year: 2019,
        value: 88,
      },
      {
        year: 2022,
        value: 91,
      },
      {
        year: 2024,
        value: 94,
      },
    ],
  },
  {
    key: 'banda-ancha-fija-100hab',
    group: 'servicios',
    direction: 'higherIsBetter',
    labelEs: 'Banda ancha fija',
    labelEn: 'Fixed broadband',
    unitEs: 'cada 100 hab.',
    unitEn: 'per 100 people',
    decimals: 1,
    startYear: 2004,
    vStart: 0.82,
    y14: 2014,
    v14: 25.04,
    lastYear: 2024,
    vLast: 33.04,
    vsStart: 'mejor',
    vs14: 'mejor',
    source: 'Banco Mundial (datos reportados por UIT / URSEC)',
    sourceUrl: 'https://data.worldbank.org/indicator/IT.NET.BBND.P2?locations=UY',
    noteEs: '0,82 conexiones cada 100 habitantes en 2004, 33 en 2024. De casi nada a la cabeza de la región.',
    noteEn: '0.82 connections per 100 people in 2004, 33 in 2024. From almost nothing to the top of the region.',
    series: [
      {
        year: 2004,
        value: 0.82,
      },
      {
        year: 2005,
        value: 1.48,
      },
      {
        year: 2006,
        value: 3.24,
      },
      {
        year: 2007,
        value: 5.01,
      },
      {
        year: 2008,
        value: 7.41,
      },
      {
        year: 2009,
        value: 9.59,
      },
      {
        year: 2010,
        value: 11.56,
      },
      {
        year: 2011,
        value: 14.21,
      },
      {
        year: 2012,
        value: 17.41,
      },
      {
        year: 2013,
        value: 22.03,
      },
      {
        year: 2014,
        value: 25.04,
      },
      {
        year: 2015,
        value: 26.75,
      },
      {
        year: 2016,
        value: 27.27,
      },
      {
        year: 2017,
        value: 28.13,
      },
      {
        year: 2018,
        value: 28.79,
      },
      {
        year: 2019,
        value: 29.8,
      },
      {
        year: 2020,
        value: 31.29,
      },
      {
        year: 2021,
        value: 32.55,
      },
      {
        year: 2022,
        value: 33.49,
      },
      {
        year: 2023,
        value: 32.4,
      },
      {
        year: 2024,
        value: 33.04,
      },
    ],
  },
  {
    key: 'banda-ancha-fija-hogares',
    group: 'servicios',
    direction: 'higherIsBetter',
    labelEs: 'Hogares con banda ancha fija',
    labelEn: 'Households with fixed broadband',
    unitEs: '% de hogares',
    unitEn: '% of households',
    decimals: 1,
    startYear: null,
    vStart: null,
    y14: 2013,
    v14: 55,
    lastYear: 2024,
    vLast: 73,
    vsStart: 'sin-dato',
    vs14: 'mejor',
    source: 'INE + Agesic — Encuesta de Usos de Tecnologías de la Información y la Comunicación (EUTIC)',
    sourceUrl: 'https://www.gub.uy/agencia-gobierno-electronico-sociedad-informacion-conocimiento/sites/agencia-gobierno-electronico-sociedad-informacion-conocimiento/files/2025-11/_Informe_EUTIC_2025.pdf',
    noteEs: '55% de los hogares con banda ancha fija en 2013, 73% en 2024.',
    noteEn: '55% of households with fixed broadband in 2013, 73% in 2024.',
    series: [
      {
        year: 2010,
        value: 33,
      },
      {
        year: 2013,
        value: 55,
      },
      {
        year: 2016,
        value: 66,
      },
      {
        year: 2019,
        value: 71,
      },
      {
        year: 2022,
        value: 72,
      },
      {
        year: 2024,
        value: 73,
      },
    ],
  },
  {
    key: 'generacion-electrica-renovable',
    group: 'servicios',
    direction: 'higherIsBetter',
    labelEs: 'Electricidad renovable',
    labelEn: 'Renewable electricity',
    unitEs: '% de la generación total',
    unitEn: '% of total generation',
    decimals: 1,
    startYear: 2004,
    vStart: 81.7,
    y14: 2014,
    v14: 94.4,
    lastYear: 2025,
    vLast: 98.2,
    vsStart: 'mejor',
    vs14: 'igual',
    source: 'MIEM — Dirección Nacional de Energía, Balance Energético Nacional (BEN)',
    sourceUrl: 'https://catalogodatos.gub.uy/dataset/miem-generacion-de-electricidad-por-fuente',
    noteEs: '81,7% de la generación eléctrica en 2004, 98,2% en 2025. La transición energética no es un plan: ya ocurrió.',
    noteEn: '81.7% of electricity generation in 2004, 98.2% in 2025. The energy transition is not a plan: it already happened.',
    series: [
      {
        year: 2000,
        value: 93.5,
      },
      {
        year: 2001,
        value: 99.8,
      },
      {
        year: 2002,
        value: 99.7,
      },
      {
        year: 2003,
        value: 99.9,
      },
      {
        year: 2004,
        value: 81.7,
      },
      {
        year: 2005,
        value: 87.5,
      },
      {
        year: 2006,
        value: 64.5,
      },
      {
        year: 2007,
        value: 86.9,
      },
      {
        year: 2008,
        value: 61.4,
      },
      {
        year: 2009,
        value: 69.6,
      },
      {
        year: 2010,
        value: 89.1,
      },
      {
        year: 2011,
        value: 74.6,
      },
      {
        year: 2012,
        value: 64.6,
      },
      {
        year: 2013,
        value: 84,
      },
      {
        year: 2014,
        value: 94.4,
      },
      {
        year: 2015,
        value: 93,
      },
      {
        year: 2016,
        value: 96.7,
      },
      {
        year: 2017,
        value: 98.3,
      },
      {
        year: 2018,
        value: 97.3,
      },
      {
        year: 2019,
        value: 98,
      },
      {
        year: 2020,
        value: 93.9,
      },
      {
        year: 2021,
        value: 84.5,
      },
      {
        year: 2022,
        value: 90.9,
      },
      {
        year: 2023,
        value: 92.1,
      },
      {
        year: 2024,
        value: 98.9,
      },
      {
        year: 2025,
        value: 98.2,
      },
    ],
  },
  {
    key: 'saneamiento-red-general',
    group: 'servicios',
    direction: 'higherIsBetter',
    labelEs: 'Saneamiento por red',
    labelEn: 'Mains sewerage',
    unitEs: '% de hogares',
    unitEn: '% of households',
    decimals: 1,
    startYear: 2006,
    vStart: 56.7,
    y14: 2014,
    v14: 61.4,
    lastYear: 2023,
    vLast: 62.2,
    vsStart: 'mejor',
    vs14: 'igual',
    source: 'INE — Encuesta Continua de Hogares (2006-2018, vía Observatorio Social del MIDES) y Censo 2023 ponderado',
    sourceUrl: 'https://catalogodatos.gub.uy/dataset/mides-indicador-7736',
    noteEs: '56,7% de los hogares en 2006, 62,2% en 2023. Subió poco y hace una década que casi no se mueve.',
    noteEn: '56.7% of households in 2006, 62.2% in 2023. It rose little and has barely moved for a decade.',
    series: [
      {
        year: 2006,
        value: 56.7,
      },
      {
        year: 2007,
        value: 56.7,
      },
      {
        year: 2008,
        value: 57.9,
      },
      {
        year: 2009,
        value: 58.8,
      },
      {
        year: 2010,
        value: 55.9,
      },
      {
        year: 2011,
        value: 60.5,
      },
      {
        year: 2012,
        value: 62.4,
      },
      {
        year: 2013,
        value: 61.1,
      },
      {
        year: 2014,
        value: 61.4,
      },
      {
        year: 2015,
        value: 62,
      },
      {
        year: 2016,
        value: 62.4,
      },
      {
        year: 2017,
        value: 62.7,
      },
      {
        year: 2018,
        value: 63.4,
      },
      {
        year: 2023,
        value: 62.2,
      },
    ],
  },
  {
    key: 'asentamientos-personas',
    group: 'servicios',
    direction: 'lowerIsBetter',
    labelEs: 'Personas en asentamientos',
    labelEn: 'People in informal settlements',
    unitEs: 'personas',
    unitEn: 'people',
    decimals: 0,
    startYear: null,
    vStart: null,
    y14: null,
    v14: null,
    lastYear: 2023,
    vLast: 193260,
    vsStart: 'sin-dato',
    vs14: 'sin-dato',
    source: 'INE — Censos de Población 2011 y 2023 (Censo 2023 ponderado)',
    sourceUrl: 'https://www.gub.uy/instituto-nacional-estadistica/comunicacion/noticias/censo-2023-ponderado',
    noteEs: '165.271 personas en asentamientos en el censo 2011, 193.260 en el de 2023: 17% más gente, mientras la pobreza por ingresos caía. Dos cosas que deberían moverse juntas y no lo hacen.',
    noteEn: '165,271 people in informal settlements in the 2011 census, 193,260 in 2023: 17% more people, while income poverty fell. Two things that should move together and do not.',
    series: [
      {
        year: 2011,
        value: 165271,
      },
      {
        year: 2023,
        value: 193260,
      },
    ],
  },
  {
    key: 'nbi-personas',
    group: 'servicios',
    direction: 'lowerIsBetter',
    labelEs: 'Necesidades básicas insatisfechas',
    labelEn: 'Unmet basic needs',
    unitEs: '% de personas',
    unitEn: '% of people',
    decimals: 1,
    startYear: null,
    vStart: null,
    y14: null,
    v14: null,
    lastYear: 2011,
    vLast: 33.8,
    vsStart: 'sin-dato',
    vs14: 'sin-dato',
    source: 'INE — Censos de Población (Atlas sociodemográfico y de la desigualdad del Uruguay, fascículo 1: NBI)',
    sourceUrl: 'https://www5.ine.gub.uy/documents/Demograf%C3%ADayEESS/PDF/Demograf%C3%ADa/Atlas_fasciculo_1_NBI_versionrevisada.pdf',
    noteEs: '33,8% de las personas con al menos una necesidad básica insatisfecha en el censo 2011. Es un dato censal, no anual: la comparación siguiente depende del procesamiento del censo 2023.',
    noteEn: '33.8% of people with at least one unmet basic need in the 2011 census. A census figure, not an annual one: the next comparison depends on 2023 census processing.',
    series: [
      {
        year: 1985,
        value: 27.6,
      },
      {
        year: 1996,
        value: 38.7,
      },
      {
        year: 2011,
        value: 33.8,
      },
    ],
  },
  {
    key: 'mortalidad-transito-100k',
    group: 'servicios',
    direction: 'lowerIsBetter',
    labelEs: 'Muertes en el tránsito',
    labelEn: 'Road deaths',
    unitEs: 'cada 100.000 hab.',
    unitEn: 'per 100,000 people',
    decimals: 1,
    startYear: null,
    vStart: null,
    y14: 2014,
    v14: 15.6,
    lastYear: 2025,
    vLast: 13.5,
    vsStart: 'sin-dato',
    vs14: 'mejor',
    source: 'UNASEV — Unidad Nacional de Seguridad Vial, Informe Anual de Siniestralidad Vial 2025 (Tabla 2)',
    sourceUrl: 'https://www.gub.uy/unidad-nacional-seguridad-vial/sites/unidad-nacional-seguridad-vial/files/documentos/noticias/2025%20-%20Informe%20Anual%20de%20Seguridad%20Vial_.pdf',
    noteEs: '15,6 muertes cada 100.000 en 2014, 13,5 en 2025 — con casi 50% más vehículos por habitante circulando.',
    noteEn: '15.6 deaths per 100,000 in 2014, 13.5 in 2025 — with nearly 50% more vehicles per head on the road.',
    series: [
      {
        year: 2011,
        value: 16.8,
      },
      {
        year: 2012,
        value: 14.9,
      },
      {
        year: 2013,
        value: 16.5,
      },
      {
        year: 2014,
        value: 15.6,
      },
      {
        year: 2015,
        value: 14.6,
      },
      {
        year: 2016,
        value: 12.8,
      },
      {
        year: 2017,
        value: 13.5,
      },
      {
        year: 2018,
        value: 15.1,
      },
      {
        year: 2019,
        value: 12,
      },
      {
        year: 2020,
        value: 11.1,
      },
      {
        year: 2021,
        value: 12.2,
      },
      {
        year: 2022,
        value: 12.1,
      },
      {
        year: 2023,
        value: 11.8,
      },
      {
        year: 2024,
        value: 12.4,
      },
      {
        year: 2025,
        value: 13.5,
      },
    ],
  },
  {
    key: 'parque-automotor-1000hab',
    group: 'servicios',
    direction: 'neutral',
    labelEs: 'Vehículos por habitante',
    labelEn: 'Vehicles per head',
    unitEs: 'cada 1.000 hab.',
    unitEn: 'per 1,000 people',
    decimals: 1,
    startYear: null,
    vStart: null,
    y14: 2014,
    v14: 604.7,
    lastYear: 2025,
    vLast: 896.9,
    vsStart: 'sin-dato',
    vs14: 'neutro',
    source: 'UNASEV — Informe Anual de Siniestralidad Vial 2025 (Tabla 2: parque vehicular y población)',
    sourceUrl: 'https://www.gub.uy/unidad-nacional-seguridad-vial/sites/unidad-nacional-seguridad-vial/files/documentos/noticias/2025%20-%20Informe%20Anual%20de%20Seguridad%20Vial_.pdf',
    noteEs: '604,7 vehículos cada 1.000 habitantes en 2014, 896,9 en 2025. El tránsito no empeoró por casualidad: hay casi 50% más autos por persona en once años.',
    noteEn: '604.7 vehicles per 1,000 people in 2014, 896.9 in 2025. Traffic did not worsen by accident: there are nearly 50% more cars per person in eleven years.',
    series: [
      {
        year: 2011,
        value: 516.2,
      },
      {
        year: 2012,
        value: 550.6,
      },
      {
        year: 2013,
        value: 579,
      },
      {
        year: 2014,
        value: 604.7,
      },
      {
        year: 2015,
        value: 650.3,
      },
      {
        year: 2016,
        value: 673,
      },
      {
        year: 2017,
        value: 693.8,
      },
      {
        year: 2018,
        value: 708.1,
      },
      {
        year: 2019,
        value: 720.4,
      },
      {
        year: 2020,
        value: 723.1,
      },
      {
        year: 2021,
        value: 746.7,
      },
      {
        year: 2022,
        value: 799.2,
      },
      {
        year: 2023,
        value: 811.4,
      },
      {
        year: 2024,
        value: 858.9,
      },
      {
        year: 2025,
        value: 896.9,
      },
    ],
  },
  {
    key: 'deuda-gobierno-central-serie-larga',
    group: 'macro',
    direction: 'lowerIsBetter',
    labelEs: 'Deuda del Gobierno Central',
    labelEn: 'Central Government debt',
    unitEs: '% del PIB',
    unitEn: '% of GDP',
    decimals: 1,
    startYear: 2004,
    vStart: 85.4,
    y14: 2014,
    v14: 41.3,
    lastYear: 2024,
    vLast: 65.3,
    vsStart: 'mejor',
    vs14: 'peor',
    source: 'Banco Mundial (a partir de estadísticas de finanzas públicas del FMI)',
    sourceUrl: 'https://datos.bancomundial.org/indicador/GC.DOD.TOTL.GD.ZS?locations=UY',
    noteEs: '85,4% del PIB en 2004 (resaca de la crisis), 41,3% en 2014, 65,3% en 2024. Mucho mejor que hace veinte años, bastante peor que hace diez.',
    noteEn: '85.4% of GDP in 2004 (the crisis hangover), 41.3% in 2014, 65.3% in 2024. Far better than twenty years ago, considerably worse than ten.',
    series: [
      {
        year: 2001,
        value: 40.6,
      },
      {
        year: 2002,
        value: 95.3,
      },
      {
        year: 2003,
        value: 105.6,
      },
      {
        year: 2004,
        value: 85.4,
      },
      {
        year: 2005,
        value: 76.1,
      },
      {
        year: 2006,
        value: 68.5,
      },
      {
        year: 2007,
        value: 57.6,
      },
      {
        year: 2008,
        value: 55.9,
      },
      {
        year: 2009,
        value: 47.7,
      },
      {
        year: 2010,
        value: 42.5,
      },
      {
        year: 2011,
        value: 43.2,
      },
      {
        year: 2012,
        value: 41,
      },
      {
        year: 2013,
        value: 40.1,
      },
      {
        year: 2014,
        value: 41.3,
      },
      {
        year: 2015,
        value: 47.3,
      },
      {
        year: 2016,
        value: 46.5,
      },
      {
        year: 2017,
        value: 45.1,
      },
      {
        year: 2018,
        value: 47.3,
      },
      {
        year: 2019,
        value: 50.1,
      },
      {
        year: 2020,
        value: 60.4,
      },
      {
        year: 2021,
        value: 58.1,
      },
      {
        year: 2022,
        value: 53.7,
      },
      {
        year: 2023,
        value: 61.4,
      },
      {
        year: 2024,
        value: 65.3,
      },
    ],
  },
  {
    key: 'deuda-bruta-spg',
    group: 'macro',
    direction: 'lowerIsBetter',
    labelEs: 'Deuda bruta del sector público',
    labelEn: 'Gross public-sector debt',
    unitEs: '% del PIB',
    unitEn: '% of GDP',
    decimals: 1,
    startYear: null,
    vStart: null,
    y14: null,
    v14: null,
    lastYear: 2025,
    vLast: 75.01,
    vsStart: 'sin-dato',
    vs14: 'sin-dato',
    source: 'Ministerio de Economía y Finanzas (MEF) – Unidad de Gestión de Deuda, con datos del Banco Central del Uruguay',
    sourceUrl: 'https://deuda.mef.gub.uy/6473/14/areas/base-de-datos-economicos.html',
    noteEs: '58,2% del PIB en 2016, 75% en 2025. La serie oficial actual no llega a 2014, por eso el contraste largo se hace con la del Gobierno Central.',
    noteEn: '58.2% of GDP in 2016, 75% in 2025. The current official series does not reach 2014, so the long contrast uses the Central Government one.',
    series: [
      {
        year: 2016,
        value: 58.17,
      },
      {
        year: 2017,
        value: 59.77,
      },
      {
        year: 2018,
        value: 58.89,
      },
      {
        year: 2019,
        value: 59.93,
      },
      {
        year: 2020,
        value: 74.62,
      },
      {
        year: 2021,
        value: 69.83,
      },
      {
        year: 2022,
        value: 67.63,
      },
      {
        year: 2023,
        value: 68.51,
      },
      {
        year: 2024,
        value: 67.49,
      },
      {
        year: 2025,
        value: 75.01,
      },
    ],
  },
  {
    key: 'resultado-fiscal-spg',
    group: 'macro',
    direction: 'higherIsBetter',
    labelEs: 'Resultado fiscal',
    labelEn: 'Fiscal balance',
    unitEs: '% del PIB (negativo = déficit)',
    unitEn: '% of GDP (negative = deficit)',
    decimals: 1,
    startYear: null,
    vStart: null,
    y14: null,
    v14: null,
    lastYear: 2025,
    vLast: -4.81,
    vsStart: 'sin-dato',
    vs14: 'sin-dato',
    source: 'Ministerio de Economía y Finanzas (MEF)',
    sourceUrl: 'https://deuda.mef.gub.uy/6473/14/areas/base-de-datos-economicos.html',
    noteEs: 'Déficit de 3,37% del PIB en 2016 y de 4,81% en 2025. No hay un solo año de superávit en la serie.',
    noteEn: 'A deficit of 3.37% of GDP in 2016 and 4.81% in 2025. Not one year of surplus in the series.',
    series: [
      {
        year: 2016,
        value: -3.37,
      },
      {
        year: 2017,
        value: -3.22,
      },
      {
        year: 2018,
        value: -2.69,
      },
      {
        year: 2019,
        value: -3.19,
      },
      {
        year: 2020,
        value: -5.16,
      },
      {
        year: 2021,
        value: -3.54,
      },
      {
        year: 2022,
        value: -3.19,
      },
      {
        year: 2023,
        value: -3.73,
      },
      {
        year: 2024,
        value: -4.1,
      },
      {
        year: 2025,
        value: -4.81,
      },
    ],
  },
  {
    key: 'calificacion-soberana',
    group: 'macro',
    direction: 'higherIsBetter',
    labelEs: 'Calificación soberana',
    labelEn: 'Sovereign rating',
    unitEs: 'escalones (notches): 6=B3 · 9=Ba3 · 12=Baa3 (grado inversor) · 14=Baa1 · 21=Aaa',
    unitEn: 'notches: 6=B3 - 9=Ba3 - 12=Baa3 (investment grade) - 14=Baa1 - 21=Aaa',
    decimals: 0,
    startYear: 2004,
    vStart: 6,
    y14: 2014,
    v14: 13,
    lastYear: 2025,
    vLast: 14,
    vsStart: 'mejor',
    vs14: 'igual',
    source: 'Moody\'s Ratings (acciones de calificación difundidas por la Unidad de Gestión de Deuda del MEF)',
    sourceUrl: 'https://deuda.mef.gub.uy/15601/14/areas/reportes-de-calificacion.html',
    noteEs: 'De B3 —bono basura— en 2004 a Baa1 en 2025. Uruguay recuperó el grado inversor en 2012 y siguió subiendo escalones.',
    noteEn: 'From B3 — junk — in 2004 to Baa1 in 2025. Uruguay regained investment grade in 2012 and kept climbing notches.',
    series: [
      {
        year: 2004,
        value: 6,
      },
      {
        year: 2005,
        value: 6,
      },
      {
        year: 2006,
        value: 8,
      },
      {
        year: 2007,
        value: 8,
      },
      {
        year: 2008,
        value: 8,
      },
      {
        year: 2009,
        value: 9,
      },
      {
        year: 2010,
        value: 11,
      },
      {
        year: 2011,
        value: 11,
      },
      {
        year: 2012,
        value: 12,
      },
      {
        year: 2013,
        value: 12,
      },
      {
        year: 2014,
        value: 13,
      },
      {
        year: 2015,
        value: 13,
      },
      {
        year: 2016,
        value: 13,
      },
      {
        year: 2017,
        value: 13,
      },
      {
        year: 2018,
        value: 13,
      },
      {
        year: 2019,
        value: 13,
      },
      {
        year: 2020,
        value: 13,
      },
      {
        year: 2021,
        value: 13,
      },
      {
        year: 2022,
        value: 13,
      },
      {
        year: 2023,
        value: 13,
      },
      {
        year: 2024,
        value: 14,
      },
      {
        year: 2025,
        value: 14,
      },
    ],
  },
  {
    key: 'presion-fiscal',
    group: 'macro',
    direction: 'neutral',
    labelEs: 'Presión fiscal',
    labelEn: 'Tax take',
    unitEs: '% del PIB',
    unitEn: '% of GDP',
    decimals: 1,
    startYear: 2004,
    vStart: 22.3,
    y14: 2014,
    v14: 25.1,
    lastYear: 2024,
    vLast: 27.3,
    vsStart: 'neutro',
    vs14: 'neutro',
    source: 'OCDE / CEPAL / CIAT / BID — Revenue Statistics in Latin America and the Caribbean 2026 (con datos oficiales de Uruguay)',
    sourceUrl: 'https://www.oecd.org/en/publications/revenue-statistics-in-latin-america-and-the-caribbean-2026_2f21f131-en.html',
    noteEs: '22,3% del PIB en 2004, 27,3% en 2024. Neutro por definición, pero es el número detrás de «todo es caro»: el Estado recauda cinco puntos del PIB más que hace veinte años.',
    noteEn: '22.3% of GDP in 2004, 27.3% in 2024. Neutral by definition, but it is the number behind "everything is expensive": the State collects five points of GDP more than twenty years ago.',
    series: [
      {
        year: 2000,
        value: 21.3,
      },
      {
        year: 2001,
        value: 21.6,
      },
      {
        year: 2002,
        value: 21.1,
      },
      {
        year: 2003,
        value: 21.8,
      },
      {
        year: 2004,
        value: 22.3,
      },
      {
        year: 2005,
        value: 22.9,
      },
      {
        year: 2006,
        value: 24.1,
      },
      {
        year: 2007,
        value: 23.5,
      },
      {
        year: 2008,
        value: 24,
      },
      {
        year: 2009,
        value: 23.8,
      },
      {
        year: 2010,
        value: 24.2,
      },
      {
        year: 2011,
        value: 24.5,
      },
      {
        year: 2012,
        value: 24.8,
      },
      {
        year: 2013,
        value: 25.2,
      },
      {
        year: 2014,
        value: 25.1,
      },
      {
        year: 2015,
        value: 25.1,
      },
      {
        year: 2016,
        value: 25.5,
      },
      {
        year: 2017,
        value: 26.5,
      },
      {
        year: 2018,
        value: 26.6,
      },
      {
        year: 2019,
        value: 26.2,
      },
      {
        year: 2020,
        value: 26.7,
      },
      {
        year: 2021,
        value: 25.9,
      },
      {
        year: 2022,
        value: 26.8,
      },
      {
        year: 2023,
        value: 27.2,
      },
      {
        year: 2024,
        value: 27.3,
      },
    ],
  },
  {
    key: 'idh',
    group: 'macro',
    direction: 'higherIsBetter',
    labelEs: 'Índice de Desarrollo Humano',
    labelEn: 'Human Development Index',
    unitEs: 'índice 0-1',
    unitEn: 'index 0-1',
    decimals: 3,
    startYear: 2004,
    vStart: 0.779,
    y14: 2014,
    v14: 0.816,
    lastYear: 2023,
    vLast: 0.862,
    vsStart: 'mejor',
    vs14: 'mejor',
    source: 'Programa de las Naciones Unidas para el Desarrollo (PNUD), Informe sobre Desarrollo Humano 2025',
    sourceUrl: 'https://hdr.undp.org/data-center/specific-country-data#/countries/URY',
    noteEs: '0,779 en 2004, 0,862 en 2023. Uruguay está en el grupo de desarrollo humano muy alto.',
    noteEn: '0.779 in 2004, 0.862 in 2023. Uruguay sits in the very-high human development group.',
    series: [
      {
        year: 1990,
        value: 0.713,
      },
      {
        year: 1991,
        value: 0.717,
      },
      {
        year: 1992,
        value: 0.719,
      },
      {
        year: 1993,
        value: 0.722,
      },
      {
        year: 1994,
        value: 0.727,
      },
      {
        year: 1995,
        value: 0.729,
      },
      {
        year: 1996,
        value: 0.736,
      },
      {
        year: 1997,
        value: 0.747,
      },
      {
        year: 1998,
        value: 0.757,
      },
      {
        year: 1999,
        value: 0.76,
      },
      {
        year: 2000,
        value: 0.764,
      },
      {
        year: 2001,
        value: 0.771,
      },
      {
        year: 2002,
        value: 0.775,
      },
      {
        year: 2003,
        value: 0.78,
      },
      {
        year: 2004,
        value: 0.779,
      },
      {
        year: 2005,
        value: 0.778,
      },
      {
        year: 2006,
        value: 0.777,
      },
      {
        year: 2007,
        value: 0.78,
      },
      {
        year: 2008,
        value: 0.783,
      },
      {
        year: 2009,
        value: 0.787,
      },
      {
        year: 2010,
        value: 0.796,
      },
      {
        year: 2011,
        value: 0.801,
      },
      {
        year: 2012,
        value: 0.804,
      },
      {
        year: 2013,
        value: 0.812,
      },
      {
        year: 2014,
        value: 0.816,
      },
      {
        year: 2015,
        value: 0.818,
      },
      {
        year: 2016,
        value: 0.821,
      },
      {
        year: 2017,
        value: 0.827,
      },
      {
        year: 2018,
        value: 0.826,
      },
      {
        year: 2019,
        value: 0.83,
      },
      {
        year: 2020,
        value: 0.837,
      },
      {
        year: 2021,
        value: 0.837,
      },
      {
        year: 2022,
        value: 0.852,
      },
      {
        year: 2023,
        value: 0.862,
      },
    ],
  },
  {
    key: 'democracy-index',
    group: 'macro',
    direction: 'higherIsBetter',
    labelEs: 'Índice de democracia',
    labelEn: 'Democracy Index',
    unitEs: 'puntaje 0-10 (≥8,0 = democracia plena)',
    unitEn: 'score 0-10 (>=8.0 = full democracy)',
    decimals: 2,
    startYear: 2006,
    vStart: 7.96,
    y14: 2014,
    v14: 8.17,
    lastYear: 2025,
    vLast: 8.92,
    vsStart: 'mejor',
    vs14: 'mejor',
    source: 'Economist Intelligence Unit (EIU)',
    sourceUrl: 'https://www.eiu.com/topic/democracy-index',
    noteEs: '7,96 en 2006, 8,92 en 2025. Uruguay es una de las pocas «democracias plenas» del mundo y su puntaje subió mientras el promedio regional bajaba.',
    noteEn: '7.96 in 2006, 8.92 in 2025. Uruguay is one of the world\'s few "full democracies" and its score rose while the regional average fell.',
    series: [
      {
        year: 2006,
        value: 7.96,
      },
      {
        year: 2008,
        value: 8.08,
      },
      {
        year: 2010,
        value: 8.1,
      },
      {
        year: 2011,
        value: 8.17,
      },
      {
        year: 2012,
        value: 8.17,
      },
      {
        year: 2013,
        value: 8.17,
      },
      {
        year: 2014,
        value: 8.17,
      },
      {
        year: 2015,
        value: 8.17,
      },
      {
        year: 2016,
        value: 8.17,
      },
      {
        year: 2017,
        value: 8.12,
      },
      {
        year: 2018,
        value: 8.38,
      },
      {
        year: 2019,
        value: 8.38,
      },
      {
        year: 2020,
        value: 8.61,
      },
      {
        year: 2021,
        value: 8.85,
      },
      {
        year: 2022,
        value: 8.91,
      },
      {
        year: 2023,
        value: 8.66,
      },
      {
        year: 2024,
        value: 8.67,
      },
      {
        year: 2025,
        value: 8.92,
      },
    ],
  },
  {
    key: 'cpi-corrupcion',
    group: 'macro',
    direction: 'higherIsBetter',
    labelEs: 'Percepción de corrupción',
    labelEn: 'Corruption perceptions',
    unitEs: 'puntaje 0-100 (100 = menos corrupción percibida)',
    unitEn: 'score 0-100 (100 = least corruption perceived)',
    decimals: 1,
    startYear: null,
    vStart: null,
    y14: 2014,
    v14: 73,
    lastYear: 2025,
    vLast: 73,
    vsStart: 'sin-dato',
    vs14: 'igual',
    source: 'Transparency International',
    sourceUrl: 'https://www.transparency.org/en/countries/uruguay',
    noteEs: '73 puntos sobre 100 en 2014, 73 en 2025. Uruguay sigue siendo el mejor calificado de América Latina y no mejoró ni empeoró en once años.',
    noteEn: '73 out of 100 in 2014, 73 in 2025. Uruguay remains Latin America\'s best-rated and has neither improved nor worsened in eleven years.',
    series: [
      {
        year: 2012,
        value: 72,
      },
      {
        year: 2013,
        value: 73,
      },
      {
        year: 2014,
        value: 73,
      },
      {
        year: 2015,
        value: 74,
      },
      {
        year: 2016,
        value: 71,
      },
      {
        year: 2017,
        value: 70,
      },
      {
        year: 2018,
        value: 70,
      },
      {
        year: 2019,
        value: 71,
      },
      {
        year: 2020,
        value: 71,
      },
      {
        year: 2021,
        value: 73,
      },
      {
        year: 2022,
        value: 74,
      },
      {
        year: 2023,
        value: 73,
      },
      {
        year: 2024,
        value: 76,
      },
      {
        year: 2025,
        value: 73,
      },
    ],
  },
  {
    key: 'satisfaccion-con-la-vida',
    group: 'percepcion',
    direction: 'higherIsBetter',
    labelEs: 'Satisfacción con la propia vida',
    labelEn: 'Satisfaction with one\'s own life',
    unitEs: '% muy o bastante satisfecho',
    unitEn: '% very or fairly satisfied',
    decimals: 1,
    startYear: null,
    vStart: null,
    y14: 2013,
    v14: 81,
    lastYear: 2024,
    vLast: 87,
    vsStart: 'sin-dato',
    vs14: 'mejor',
    source: 'Corporación Latinobarómetro, Informe 2013 p.44 (gráfico Satisfacción con la vida, totales por país 2013), Informe 2015 Tabla 9, Informe 2018 p.68 e Informe 2024 p.25',
    sourceUrl: 'https://www.latinobarometro.org/documents/LAT-2018/informe-latinobarometro-2018.pdf',
    noteEs: '87% de los uruguayos dice estar satisfecho con su propia vida en 2024, contra 81% en 2013. Es el segundo registro más alto de la región.',
    noteEn: '87% of Uruguayans say they are satisfied with their own life in 2024, against 81% in 2013. The second-highest reading in the region.',
    series: [
      {
        year: 2013,
        value: 81,
      },
      {
        year: 2015,
        value: 83,
      },
      {
        year: 2018,
        value: 77,
      },
      {
        year: 2024,
        value: 87,
      },
    ],
  },
  {
    key: 'pais-progresando',
    group: 'percepcion',
    direction: 'higherIsBetter',
    labelEs: '«El país está progresando»',
    labelEn: '"The country is progressing"',
    unitEs: '% que dice «está progresando»',
    unitEn: '% saying "it is progressing"',
    decimals: 1,
    startYear: null,
    vStart: null,
    y14: 2013,
    v14: 50,
    lastYear: 2024,
    vLast: 41,
    vsStart: 'sin-dato',
    vs14: 'peor',
    source: 'Corporación Latinobarómetro, informes anuales: 2009 (gráfico Imagen de progreso por país) para 2009; Informe 2015 (texto comparativo 2013-2015, «Uruguay, de 50% a 59%») para 2013 y 2015; Informe 2017 p.58 para 2017; Informe 2018 p.5 para 2018; Informe 2024 p.26 para 2024',
    sourceUrl: 'https://www.latinobarometro.org/documents/LAT-2017/informe-latinobarometro-2017.pdf',
    noteEs: '41% cree que el país está progresando (2024), contra 50% en 2013 y 58% en 2009. Contra el 87% que está conforme con su propia vida, la brecha es de 46 puntos.',
    noteEn: '41% believe the country is progressing (2024), against 50% in 2013 and 58% in 2009. Against the 87% content with their own life, the gap is 46 points.',
    series: [
      {
        year: 2009,
        value: 58,
      },
      {
        year: 2013,
        value: 50,
      },
      {
        year: 2015,
        value: 59,
      },
      {
        year: 2017,
        value: 25,
      },
      {
        year: 2018,
        value: 22,
      },
      {
        year: 2024,
        value: 41,
      },
    ],
  },
  {
    key: 'situacion-economica-pais-buena',
    group: 'percepcion',
    direction: 'higherIsBetter',
    labelEs: '«La economía del país está bien»',
    labelEn: '"The country\'s economy is doing well"',
    unitEs: '% «muy buena» + «buena»',
    unitEn: '% "very good" + "good"',
    decimals: 1,
    startYear: 2007,
    vStart: 23,
    y14: 2013,
    v14: 47,
    lastYear: 2024,
    vLast: 33,
    vsStart: 'mejor',
    vs14: 'peor',
    source: 'Corporación Latinobarómetro, informes anuales 2007 (gráfico por país), 2013 (texto, «Uruguay con 47%»), 2015 (texto, «solo en Uruguay... un 47%»), 2017 p.62, 2018 pp.8-9 y 2024 p.19',
    sourceUrl: 'https://www.latinobarometro.org/documents/LAT-2017/informe-latinobarometro-2017.pdf',
    noteEs: '33% califica de buena la situación económica del país (2024), contra 47% en 2013. Cayó mientras el PIB por habitante subía.',
    noteEn: '33% rate the country\'s economic situation as good (2024), against 47% in 2013. It fell while GDP per head rose.',
    series: [
      {
        year: 2007,
        value: 23,
      },
      {
        year: 2013,
        value: 47,
      },
      {
        year: 2015,
        value: 47,
      },
      {
        year: 2017,
        value: 22,
      },
      {
        year: 2018,
        value: 21,
      },
      {
        year: 2024,
        value: 33,
      },
    ],
  },
  {
    key: 'satisfaccion-democracia',
    group: 'percepcion',
    direction: 'higherIsBetter',
    labelEs: 'Satisfacción con la democracia',
    labelEn: 'Satisfaction with democracy',
    unitEs: '% que está muy satisfecho o satisfecho',
    unitEn: '% very or fairly satisfied',
    decimals: 1,
    startYear: 2004,
    vStart: 45,
    y14: 2013,
    v14: 82,
    lastYear: 2024,
    vLast: 63,
    vsStart: 'mejor',
    vs14: 'peor',
    source: 'Corporación Latinobarómetro (Informe 2024, tabla país-año 1995-2024; en Uruguay el trabajo de campo lo hace Equipos Consultores)',
    sourceUrl: 'https://www.latinobarometro.org/documents/LAT-2024/latinobarometro-informe-2024.pdf',
    noteEs: '82% de satisfacción con el funcionamiento de la democracia en 2013, 63% en 2024. Cayó fuerte, pero sigue muy por encima del 45% de 2004.',
    noteEn: '82% satisfaction with how democracy works in 2013, 63% in 2024. A sharp fall, but still well above the 45% of 2004.',
    series: [
      {
        year: 1995,
        value: 58,
      },
      {
        year: 1996,
        value: 51,
      },
      {
        year: 1997,
        value: 65,
      },
      {
        year: 1998,
        value: 68,
      },
      {
        year: 2000,
        value: 69,
      },
      {
        year: 2001,
        value: 56,
      },
      {
        year: 2002,
        value: 53,
      },
      {
        year: 2003,
        value: 44,
      },
      {
        year: 2004,
        value: 45,
      },
      {
        year: 2005,
        value: 63,
      },
      {
        year: 2006,
        value: 66,
      },
      {
        year: 2007,
        value: 66,
      },
      {
        year: 2008,
        value: 71,
      },
      {
        year: 2009,
        value: 79,
      },
      {
        year: 2010,
        value: 78,
      },
      {
        year: 2011,
        value: 72,
      },
      {
        year: 2013,
        value: 82,
      },
      {
        year: 2015,
        value: 70,
      },
      {
        year: 2016,
        value: 51,
      },
      {
        year: 2017,
        value: 57,
      },
      {
        year: 2018,
        value: 47,
      },
      {
        year: 2020,
        value: 68,
      },
      {
        year: 2023,
        value: 59,
      },
      {
        year: 2024,
        value: 63,
      },
    ],
  },
  {
    key: 'apoyo-democracia',
    group: 'percepcion',
    direction: 'higherIsBetter',
    labelEs: 'Apoyo a la democracia',
    labelEn: 'Support for democracy',
    unitEs: '% de acuerdo',
    unitEn: '% who agree',
    decimals: 1,
    startYear: 2004,
    vStart: 78,
    y14: 2013,
    v14: 71,
    lastYear: 2024,
    vLast: 70,
    vsStart: 'peor',
    vs14: 'igual',
    source: 'Corporación Latinobarómetro (Informe 2024, tabla país-año 1995-2024)',
    sourceUrl: 'https://www.latinobarometro.org/documents/LAT-2024/latinobarometro-informe-2024.pdf',
    noteEs: '78% en 2004, 70% en 2024. El apoyo a la democracia como régimen bajó ocho puntos en veinte años.',
    noteEn: '78% in 2004, 70% in 2024. Support for democracy as a system fell eight points in twenty years.',
    series: [
      {
        year: 1995,
        value: 80,
      },
      {
        year: 1996,
        value: 80,
      },
      {
        year: 1997,
        value: 86,
      },
      {
        year: 1998,
        value: 81,
      },
      {
        year: 2000,
        value: 83,
      },
      {
        year: 2001,
        value: 79,
      },
      {
        year: 2002,
        value: 77,
      },
      {
        year: 2003,
        value: 78,
      },
      {
        year: 2004,
        value: 78,
      },
      {
        year: 2005,
        value: 77,
      },
      {
        year: 2006,
        value: 77,
      },
      {
        year: 2007,
        value: 75,
      },
      {
        year: 2008,
        value: 79,
      },
      {
        year: 2009,
        value: 81,
      },
      {
        year: 2010,
        value: 75,
      },
      {
        year: 2011,
        value: 75,
      },
      {
        year: 2013,
        value: 71,
      },
      {
        year: 2015,
        value: 76,
      },
      {
        year: 2016,
        value: 68,
      },
      {
        year: 2017,
        value: 70,
      },
      {
        year: 2018,
        value: 61,
      },
      {
        year: 2020,
        value: 74,
      },
      {
        year: 2023,
        value: 70,
      },
      {
        year: 2024,
        value: 70,
      },
    ],
  },
  {
    key: 'confianza-gobierno',
    group: 'percepcion',
    direction: 'higherIsBetter',
    labelEs: 'Confianza en el gobierno',
    labelEn: 'Trust in government',
    unitEs: '% con mucha o algo de confianza',
    unitEn: '% with a lot or some trust',
    decimals: 1,
    startYear: null,
    vStart: null,
    y14: null,
    v14: null,
    lastYear: 2024,
    vLast: 49,
    vsStart: 'sin-dato',
    vs14: 'sin-dato',
    source: 'Corporación Latinobarómetro, Informe 2017 p.25 (gráfico y texto), Informe 2018 p.54 (gráfico y texto) e Informe 2024 p.60 (gráfico Confianza en el gobierno, total por país 2024)',
    sourceUrl: 'https://www.latinobarometro.org/documents/LAT-2024/latinobarometro-informe-2024.pdf',
    noteEs: '39% en 2017, 49% en 2024.',
    noteEn: '39% in 2017, 49% in 2024.',
    series: [
      {
        year: 2017,
        value: 39,
      },
      {
        year: 2018,
        value: 39,
      },
      {
        year: 2024,
        value: 49,
      },
    ],
  },
  {
    key: 'confianza-partidos-politicos',
    group: 'percepcion',
    direction: 'higherIsBetter',
    labelEs: 'Confianza en los partidos',
    labelEn: 'Trust in political parties',
    unitEs: '% con mucha o algo de confianza',
    unitEn: '% with a lot or some trust',
    decimals: 1,
    startYear: 2007,
    vStart: 34,
    y14: null,
    v14: null,
    lastYear: 2024,
    vLast: 36,
    vsStart: 'mejor',
    vs14: 'sin-dato',
    source: 'Corporación Latinobarómetro (informes anuales 2007, 2017, 2018 y 2024)',
    sourceUrl: 'https://www.latinobarometro.org/documents/LAT-2024/latinobarometro-informe-2024.pdf',
    noteEs: '34% en 2007, 36% en 2024. No se movió.',
    noteEn: '34% in 2007, 36% in 2024. Unmoved.',
    series: [
      {
        year: 2007,
        value: 34,
      },
      {
        year: 2017,
        value: 25,
      },
      {
        year: 2018,
        value: 21,
      },
      {
        year: 2024,
        value: 36,
      },
    ],
  },
  {
    key: 'inseguridad-principal-problema',
    group: 'percepcion',
    direction: 'lowerIsBetter',
    labelEs: 'La inseguridad como principal problema',
    labelEn: 'Insecurity as the main problem',
    unitEs: '% de la población',
    unitEn: '% of the population',
    decimals: 1,
    startYear: null,
    vStart: null,
    y14: null,
    v14: null,
    lastYear: 2024,
    vLast: 35,
    vsStart: 'sin-dato',
    vs14: 'sin-dato',
    source: '2017-2023: Ministerio del Interior — AECA, Complemento del Diagnóstico general de la criminalidad y la violencia en Uruguay (PNSP 2025-2035), sección 4.2 "Seguridad como demanda prioritaria" y Gráfico 20, en base a Corporación Latinobarómetro. 2024: Corporación Latinobarómetro, Informe Latinobarómetro 2024 "La democracia resiliente", sección 1.5 y gráfico "Problemas más importantes: la seguridad — delincuencia", categoría "Delincuencia" (https://www.latinobarometro.org/documents/latinobarometro-informe-2024.pdf).',
    sourceUrl: 'https://www.gub.uy/plan-nacional-de-seguridad-publica/documentos/resumen-del-diagnostico-general-de-la-criminalidad-y',
    noteEs: 'Entre 20% y 44% menciona la inseguridad como principal problema según el año y la encuesta. La serie mezcla fuentes y no admite lectura de tendencia: va como orden de magnitud, no como curva.',
    noteEn: 'Between 20% and 44% name insecurity as the main problem depending on year and pollster. The series splices sources and does not support a trend reading: it is an order of magnitude, not a curve.',
    series: [
      {
        year: 2017,
        value: 28.5,
      },
      {
        year: 2018,
        value: 43.7,
      },
      {
        year: 2020,
        value: 19.9,
      },
      {
        year: 2023,
        value: 23,
      },
      {
        year: 2024,
        value: 35,
      },
    ],
  },
  {
    key: 'compras-organismos-reportan',
    group: 'transparencia',
    direction: 'neutral',
    labelEs: 'Organismos que publican sus compras',
    labelEn: 'Bodies publishing their purchases',
    unitEs: 'organismos',
    unitEn: 'public bodies',
    decimals: 0,
    startYear: 2004,
    vStart: 182,
    y14: 2014,
    v14: 234,
    lastYear: 2025,
    vLast: 275,
    vsStart: 'neutro',
    vs14: 'neutro',
    source: 'gastos.gub.uy sobre datos abiertos de Compras Estatales (OCDS) · colección spending_trend',
    sourceUrl: 'https://www.gub.uy/agencia-reguladora-compras-estatales/datos-y-estadisticas/datos/datos-abiertos-compras-estatales',
    noteEs: '110 organismos publicaban sus compras en 2002, 278 en 2024. Esta página existe porque ese número creció.',
    noteEn: '110 public bodies published their purchases in 2002, 278 in 2024. This page exists because that number grew.',
    series: [
      {
        year: 2002,
        value: 110,
      },
      {
        year: 2003,
        value: 176,
      },
      {
        year: 2004,
        value: 182,
      },
      {
        year: 2005,
        value: 189,
      },
      {
        year: 2006,
        value: 191,
      },
      {
        year: 2007,
        value: 200,
      },
      {
        year: 2008,
        value: 264,
      },
      {
        year: 2009,
        value: 172,
      },
      {
        year: 2010,
        value: 175,
      },
      {
        year: 2011,
        value: 182,
      },
      {
        year: 2012,
        value: 204,
      },
      {
        year: 2013,
        value: 227,
      },
      {
        year: 2014,
        value: 234,
      },
      {
        year: 2015,
        value: 236,
      },
      {
        year: 2016,
        value: 263,
      },
      {
        year: 2017,
        value: 255,
      },
      {
        year: 2018,
        value: 256,
      },
      {
        year: 2019,
        value: 258,
      },
      {
        year: 2020,
        value: 257,
      },
      {
        year: 2021,
        value: 271,
      },
      {
        year: 2022,
        value: 268,
      },
      {
        year: 2023,
        value: 273,
      },
      {
        year: 2024,
        value: 278,
      },
      {
        year: 2025,
        value: 275,
      },
    ],
  },
  {
    key: 'compras-cobertura',
    group: 'transparencia',
    direction: 'neutral',
    labelEs: 'Registros de compra publicados',
    labelEn: 'Procurement records published',
    unitEs: 'registros de compra',
    unitEn: 'procurement records',
    decimals: 0,
    startYear: 2004,
    vStart: 30844,
    y14: 2014,
    v14: 36436,
    lastYear: 2025,
    vLast: 109466,
    vsStart: 'neutro',
    vs14: 'neutro',
    source: 'gastos.gub.uy sobre datos abiertos de Compras Estatales (OCDS) · colección spending_trend',
    sourceUrl: 'https://www.gub.uy/agencia-reguladora-compras-estatales/datos-y-estadisticas/datos/datos-abiertos-compras-estatales',
    noteEs: '14.327 registros de compra publicados en 2002, 129.965 en 2024. Es cuánto se publica, no cuánto se gasta.',
    noteEn: '14,327 procurement records published in 2002, 129,965 in 2024. It measures how much is disclosed, not how much is spent.',
    series: [
      {
        year: 2002,
        value: 14327,
      },
      {
        year: 2003,
        value: 29640,
      },
      {
        year: 2004,
        value: 30844,
      },
      {
        year: 2005,
        value: 33223,
      },
      {
        year: 2006,
        value: 32668,
      },
      {
        year: 2007,
        value: 48801,
      },
      {
        year: 2008,
        value: 54612,
      },
      {
        year: 2009,
        value: 29967,
      },
      {
        year: 2010,
        value: 30780,
      },
      {
        year: 2011,
        value: 33559,
      },
      {
        year: 2012,
        value: 34046,
      },
      {
        year: 2013,
        value: 34608,
      },
      {
        year: 2014,
        value: 36436,
      },
      {
        year: 2015,
        value: 46920,
      },
      {
        year: 2016,
        value: 58967,
      },
      {
        year: 2017,
        value: 65056,
      },
      {
        year: 2018,
        value: 73724,
      },
      {
        year: 2019,
        value: 80779,
      },
      {
        year: 2020,
        value: 69790,
      },
      {
        year: 2021,
        value: 88901,
      },
      {
        year: 2022,
        value: 97904,
      },
      {
        year: 2023,
        value: 96688,
      },
      {
        year: 2024,
        value: 129965,
      },
      {
        year: 2025,
        value: 109466,
      },
    ],
  },
  {
    key: 'compras-proveedores',
    group: 'transparencia',
    direction: 'neutral',
    labelEs: 'Proveedores con ficha pública',
    labelEn: 'Suppliers with a public record',
    unitEs: 'proveedores adjudicados',
    unitEn: 'awarded suppliers',
    decimals: 0,
    startYear: 2004,
    vStart: 4205,
    y14: 2014,
    v14: 5323,
    lastYear: 2025,
    vLast: 11759,
    vsStart: 'neutro',
    vs14: 'neutro',
    source: 'gastos.gub.uy sobre datos abiertos de Compras Estatales (OCDS) · colección spending_trend',
    sourceUrl: 'https://www.gub.uy/agencia-reguladora-compras-estatales/datos-y-estadisticas/datos/datos-abiertos-compras-estatales',
    noteEs: '2.870 proveedores con adjudicación pública en 2002, 11.759 en 2025.',
    noteEn: '2,870 suppliers with a public award in 2002, 11,759 in 2025.',
    series: [
      {
        year: 2002,
        value: 2870,
      },
      {
        year: 2003,
        value: 4488,
      },
      {
        year: 2004,
        value: 4205,
      },
      {
        year: 2005,
        value: 4318,
      },
      {
        year: 2006,
        value: 4444,
      },
      {
        year: 2007,
        value: 5099,
      },
      {
        year: 2008,
        value: 5137,
      },
      {
        year: 2009,
        value: 4502,
      },
      {
        year: 2010,
        value: 4649,
      },
      {
        year: 2011,
        value: 4917,
      },
      {
        year: 2012,
        value: 5217,
      },
      {
        year: 2013,
        value: 5533,
      },
      {
        year: 2014,
        value: 5323,
      },
      {
        year: 2015,
        value: 6016,
      },
      {
        year: 2016,
        value: 7665,
      },
      {
        year: 2017,
        value: 8144,
      },
      {
        year: 2018,
        value: 8537,
      },
      {
        year: 2019,
        value: 9066,
      },
      {
        year: 2020,
        value: 8145,
      },
      {
        year: 2021,
        value: 9069,
      },
      {
        year: 2022,
        value: 9816,
      },
      {
        year: 2023,
        value: 10206,
      },
      {
        year: 2024,
        value: 11715,
      },
      {
        year: 2025,
        value: 11759,
      },
    ],
  },
  {
    key: 'compras-gasto-real',
    group: 'transparencia',
    direction: 'neutral',
    labelEs: 'Total adjudicado publicado',
    labelEn: 'Published awarded total',
    unitEs: 'millones de USD publicados',
    unitEn: 'USD millions disclosed',
    decimals: 0,
    startYear: 2004,
    vStart: 681,
    y14: 2014,
    v14: 928,
    lastYear: 2025,
    vLast: 4375,
    vsStart: 'neutro',
    vs14: 'neutro',
    source: 'gastos.gub.uy sobre datos abiertos de Compras Estatales (OCDS) · colección spending_trend',
    sourceUrl: 'https://www.gub.uy/agencia-reguladora-compras-estatales/datos-y-estadisticas/datos/datos-abiertos-compras-estatales',
    noteEs: 'El total adjudicado publicado pasó de USD 451 M (2002) a USD 5.353 M (2024). Mide sobre todo cuánto más se publica: por eso está acá y no en el tablero de arriba.',
    noteEn: 'Published awarded totals went from USD 451 M (2002) to USD 5,353 M (2024). It mostly measures how much more is disclosed: hence its place here and not in the scorecard above.',
    series: [
      {
        year: 2002,
        value: 451,
      },
      {
        year: 2003,
        value: 621,
      },
      {
        year: 2004,
        value: 681,
      },
      {
        year: 2005,
        value: 865,
      },
      {
        year: 2006,
        value: 362,
      },
      {
        year: 2007,
        value: 347,
      },
      {
        year: 2008,
        value: 338,
      },
      {
        year: 2009,
        value: 271,
      },
      {
        year: 2010,
        value: 337,
      },
      {
        year: 2011,
        value: 463,
      },
      {
        year: 2012,
        value: 627,
      },
      {
        year: 2013,
        value: 768,
      },
      {
        year: 2014,
        value: 928,
      },
      {
        year: 2015,
        value: 959,
      },
      {
        year: 2016,
        value: 895,
      },
      {
        year: 2017,
        value: 1318,
      },
      {
        year: 2018,
        value: 1786,
      },
      {
        year: 2019,
        value: 2446,
      },
      {
        year: 2020,
        value: 3347,
      },
      {
        year: 2021,
        value: 3424,
      },
      {
        year: 2022,
        value: 4433,
      },
      {
        year: 2023,
        value: 4799,
      },
      {
        year: 2024,
        value: 5353,
      },
      {
        year: 2025,
        value: 4375,
      },
    ],
  },
]

export interface PerceptionMechanism {
  key: string
  titleEs: string
  titleEn: string
  bodyEs: string
  bodyEn: string
  evidenceEs: string
  evidenceEn: string
  source: string
  sourceUrl: string
}

/** Why the mood diverges from the series. Not "you are wrong to feel bad" —
 *  two of these six say the pessimism is reading a real deterioration. */
export const MOP_MECHANISMS: PerceptionMechanism[] = [
  {
    key: 'brecha-personal-pais',
    titleEs: '«Yo estoy bien, el país está mal»',
    titleEn: '"I am fine, the country is not"',
    bodyEs: 'Sobre su propia vida la gente responde desde la experiencia; sobre el país responde desde lo que le llega mediado. Las dos respuestas se separan siempre en la misma dirección, y en Uruguay la brecha no se cerró: se ensanchó de 31 puntos en 2013 a 46 en 2024. Significa que la pregunta «¿estamos peor?» no mide la vida de quien la contesta.',
    bodyEn: 'About their own life people answer from experience; about the country they answer from what reaches them mediated. The two answers always separate in the same direction, and in Uruguay the gap did not close: it widened from 31 points in 2013 to 46 in 2024. It means the question "are we worse off?" does not measure the life of whoever answers it.',
    evidenceEs: 'Latinobarómetro sobre su propia serie de veinte años: «los latinoamericanos están todos mejor que lo que creen que están sus países». En Uruguay: 81% satisfecho con su vida contra 50% que ve al país progresando (2013); 87% contra 41% (2024).',
    evidenceEn: 'Latinobarómetro on its own twenty-year series: "Latin Americans are all better off than they believe their countries are". In Uruguay: 81% satisfied with their life against 50% seeing the country progressing (2013); 87% against 41% (2024).',
    source: 'Corporación Latinobarómetro, Informes 2013, 2015 y 2024',
    sourceUrl: 'https://www.latinobarometro.org/documents/LAT-2015/informe-latinobarometro-2015.pdf',
  },
  {
    key: 'miedo-no-delito',
    titleEs: '«La inseguridad es el principal problema» mide miedo, no delito',
    titleEn: '"Insecurity is the main problem" measures fear, not crime',
    bodyEs: 'Es la advertencia que hace la propia encuestadora sobre su indicador más citado: la correlación con la victimización efectiva es nula. En 2024 Uruguay marcó 35% y Honduras —el país con la tasa de homicidios más alta de la región— apenas 12%. Que mucha gente lo nombre no dice cuánto delito hay: dice cuánto miedo hay, que es un dato real y distinto.',
    bodyEn: 'This is the pollster\'s own warning about its most-quoted indicator: the correlation with actual victimisation is nil. In 2024 Uruguay scored 35% and Honduras — the country with the region\'s highest homicide rate — just 12%. That many people name it does not say how much crime there is: it says how much fear there is, which is a real and different fact.',
    evidenceEs: 'Informe Latinobarómetro 2024, textual: «no hay relación alguna entre el número de víctimas y la proporción de población que menciona la delincuencia como problema principal (…) Este es un mal indicador del problema real, y un muy buen indicador del miedo al respecto».',
    evidenceEn: 'Latinobarómetro 2024 report, verbatim: "there is no relationship at all between the number of victims and the share of the population naming crime as the main problem (…) This is a bad indicator of the real problem, and a very good indicator of the fear about it".',
    source: 'Corporación Latinobarómetro, Informe 2024 «La democracia resiliente», §1.5',
    sourceUrl: 'https://www.latinobarometro.org/documents/LAT-2024/latinobarometro-informe-2024.pdf',
  },
  {
    key: 'linea-de-base-movil',
    titleEs: 'La vara se mueve: lo que antes era tolerable hoy no lo es',
    titleEn: 'The bar moves: what used to be tolerable no longer is',
    bodyEs: 'La gente no compara el país de hoy con el de 2004: lo compara con lo que espera. Cuando una urgencia se descomprime, el problema que seguía sube al primer lugar y el mismo nivel objetivo pasa a leerse como inaceptable. Por eso un indicador de percepción puede empeorar mientras el indicador duro mejora, sin que nadie mienta.',
    bodyEn: 'People do not compare today\'s country with 2004: they compare it with what they expect. When one urgency eases, the next problem moves to the top and the same objective level starts reading as unacceptable. That is how a perception indicator can worsen while the hard indicator improves, with nobody lying.',
    evidenceEs: 'En Uruguay se ve en cinco años: la inseguridad como principal problema cayó a 7% en agosto de 2021, con la pandemia arriba de la agenda, y volvió a 47% en marzo de 2024 cuando esa urgencia aflojó. Latinobarómetro lo formula así: «lo que era tolerable antes, no es tolerable hoy».',
    evidenceEn: 'Uruguay shows it in five years: insecurity as the main problem fell to 7% in August 2021, with the pandemic at the top of the agenda, and returned to 47% in March 2024 once that urgency eased. Latinobarómetro puts it as: "what was tolerable before is not tolerable today".',
    source: 'Corporación Latinobarómetro (Informes 2015 y 2016) y CIFRA (olas 2021 y 2024)',
    sourceUrl: 'https://www.latinobarometro.org/documents/LAT-2016/informe-latinobarometro-2016.pdf',
  },
  {
    key: 'deterioro-real-saliente',
    titleEs: 'Un dominio empeoró de verdad, y tiñe el juicio sobre todos los demás',
    titleEn: 'One domain really did get worse, and it colours the judgement of all the others',
    bodyEs: 'Este no explica un error: explica un acierto que se generaliza. Los homicidios se duplicaron y son el dominio más visible, más noticiable y más presente en la conversación diaria. Cuando la pregunta es abierta —«¿estamos peor?»— el dominio que empeoró contesta por todos los demás, incluso por aquellos donde los datos mejoraron. Quien dice «estamos peor» pensando en seguridad no se equivoca: está contestando otra pregunta que la de pobreza o ingreso.',
    bodyEn: 'This one does not explain an error: it explains a correct judgement being generalised. Homicides doubled and are the most visible, most reportable, most present domain in daily conversation. When the question is open — "are we worse off?" — the domain that worsened answers for all the others, including those where the data improved. Whoever says "we are worse off" thinking about security is not wrong: they are answering a different question from the one about poverty or income.',
    evidenceEs: 'Ministerio del Interior: la tasa de homicidios pasó de 6,0 cada 100.000 en 2004 a un máximo de 12,0 en 2018 y quedó en 10,3 en 2025 — cerca del doble del nivel de referencia, sostenido por más de un lustro.',
    evidenceEn: 'Ministry of the Interior: the homicide rate went from 6.0 per 100,000 in 2004 to a peak of 12.0 in 2018 and stood at 10.3 in 2025 — close to double the reference level, sustained for over five years.',
    source: 'Ministerio del Interior — Área de Estadística y Criminología Aplicada',
    sourceUrl: 'https://www.gub.uy/ministerio-interior/comunicacion/publicaciones/anuario-aeca-2025-evolucion-anual-2013-2025',
  },
  {
    key: 'negatividad-demanda',
    titleEs: 'El sesgo de negatividad está en la demanda, no sólo en la oferta',
    titleEn: 'The negativity bias is on the demand side, not just the supply side',
    bodyEs: 'No es sólo que los medios elijan malas noticias: el público reacciona más intensamente a lo negativo, y esa reacción se mide en el cuerpo, no en lo que la gente declara. Eso vuelve al pesimismo informativo un equilibrio estable: la nota del homicidio circula, la de la pobreza que baja no.',
    bodyEn: 'It is not only that outlets pick bad news: audiences react more strongly to the negative, and that reaction is measurable in the body, not in what people say. That makes informational pessimism a stable equilibrium: the homicide story travels, the falling-poverty story does not.',
    evidenceEs: 'Soroka, Fournier y Nir midieron conductancia de la piel y ritmo cardíaco ante notas de TV reales en 17 países de seis continentes: en promedio la activación es mayor ante lo negativo. En el experimento previo de Trussler y Soroka, los participantes elegían notas negativas aunque declaraban preferir buenas noticias.',
    evidenceEn: 'Soroka, Fournier and Nir measured skin conductance and heart rate against real TV stories in 17 countries across six continents: on average activation is higher for the negative. In Trussler and Soroka\'s earlier experiment, participants chose negative stories while stating they preferred good news.',
    source: 'PNAS, Soroka, Fournier & Nir (2019), 116(38); Trussler & Soroka (2014), IJPP 19(3)',
    sourceUrl: 'https://www.pnas.org/doi/10.1073/pnas.1908369116',
  },
  {
    key: 'direccion-equivocada',
    titleEs: 'Los públicos erran el signo, no sólo el nivel',
    titleEn: 'Publics get the sign wrong, not just the level',
    bodyEs: 'Preguntada por la dirección de un indicador duro —¿los homicidios subieron o bajaron desde 2000?— la mayoría contesta «subió» casi en todas partes, incluso donde bajaron fuerte. Con una salvedad obligatoria: Uruguay no estuvo en esa muestra, y acá los homicidios sí subieron. El mecanismo documenta un sesgo de dirección en otros países; no prueba que los uruguayos se equivoquen sobre su propio delito.',
    bodyEn: 'Asked about the direction of a hard indicator — did homicides rise or fall since 2000? — the majority answers "rose" almost everywhere, including where they fell sharply. With a mandatory caveat: Uruguay was not in that sample, and here homicides did rise. The mechanism documents a direction bias in other countries; it does not prove Uruguayans are wrong about their own crime.',
    evidenceEs: 'Ipsos «Perils of Perception 2017», 38 países y 29.133 entrevistas: sólo el 7% respondió correctamente que la tasa de homicidios de su país era menor que en 2000, cuando en el conjunto había caído 29%.',
    evidenceEn: 'Ipsos "Perils of Perception 2017", 38 countries and 29,133 interviews: only 7% correctly answered that their country\'s homicide rate was lower than in 2000, when across the set it had fallen 29%.',
    source: 'Ipsos, «The Perils of Perception» (Global Advisor, 2017 y 2018)',
    sourceUrl: 'https://www.ipsos.com/en-uk/perils-perception-2017',
  },
]

export const MOP_SOURCES: { label: string, url: string }[] = [
  {
    label: 'Ministerio del Interior — Área de Estadística y Criminología Aplicada (AECA, ex Observatorio Nacional sobre Violencia y Criminalidad), Anuario AECA 2025, Tabla 2.1; población INE (Revisión 2013)',
    url: 'https://www.gub.uy/ministerio-interior/comunicacion/publicaciones/anuario-aeca-2025-evolucion-anual-2013-2025',
  },
  {
    label: 'MSP – Estadísticas Vitales / División Epidemiología',
    url: 'https://www.gub.uy/ministerio-salud-publica/comunicacion/noticias/suicidios-uruguay-nueva-orientacion-politicas-publicas-ante-evolucion',
  },
  {
    label: 'INE — Encuesta Continua de Hogares (ECH)',
    url: 'https://www5.ine.gub.uy/documents/Demograf%C3%ADayEESS/HTML/ECH/Pobreza/2024/Estimacion%20de%20la%20pobreza%20por%20el%20metodo%20de%20ingreso%20anual%202024.html',
  },
  {
    label: 'INE — Encuesta Continua de Hogares (ECH)',
    url: 'https://www5.ine.gub.uy/documents/Demograf%C3%ADayEESS/HTML/ECH/Pobreza/2025/Informe%20pobreza%20Anual-2025.html',
  },
  {
    label: 'INE — Estimación de la pobreza por el Método de Ingreso 2013, Cuadros 26-32 (anexo con la apertura por grupos de edades 2006-2012); complementado con los informes anuales 2014-2017 y los informes HTML 2019-2023',
    url: 'https://www5.ine.gub.uy/documents/Demograf%C3%ADayEESS/PDF/ECH/Pobreza/Estimaci%C3%B3n%20de%20la%20pobreza%20por%20el%20M%C3%A9todo%20del%20Ingreso%202013.pdf',
  },
  {
    label: 'INE — Encuesta Continua de Hogares (ECH)',
    url: 'https://www5.ine.gub.uy/documents/Demograf%C3%ADayEESS/HTML/ECH/Pobreza/2024/Desigualdad_informe-2024.html',
  },
  {
    label: 'INE — Índice Medio de Salario Real (IMS)',
    url: 'https://www.gub.uy/instituto-nacional-estadistica/datos-y-estadisticas/estadisticas/series-historicas-indice-medio-salarios-ims-base-julio-2008100',
  },
  {
    label: 'INE — Encuesta Continua de Hogares (ECH)',
    url: 'https://www.gub.uy/instituto-nacional-estadistica/datos-y-estadisticas/estadisticas/series-historicas-actividad-empleo-desempleo',
  },
  {
    label: 'INE — Índice de Precios del Consumo (IPC)',
    url: 'https://www.gub.uy/instituto-nacional-estadistica/datos-y-estadisticas/estadisticas/series-historicas-ipc-base-octubre-2022100',
  },
  {
    label: 'Banco Mundial (indicador NY.GDP.PCAP.PP.KD), a partir de cuentas nacionales del BCU y del programa de comparación internacional',
    url: 'https://data.worldbank.org/indicator/NY.GDP.PCAP.PP.KD?locations=UY',
  },
  {
    label: 'Banco Mundial (estimaciones ONU-DESA/World Population Prospects sobre registros vitales del MSP/INE)',
    url: 'https://datos.bancomundial.org/indicador/SP.DYN.LE00.IN?locations=UY',
  },
  {
    label: 'MSP – Departamento de Estadísticas Vitales / DIGESA',
    url: 'https://www.gub.uy/ministerio-desarrollo-social/indicador/tasa-mortalidad-infantil-neonatal-posneonatal-cada-mil-nacidos-vivos-total-pais',
  },
  {
    label: 'Banco Mundial (estimaciones ONU-DESA sobre registros vitales del MSP/INE)',
    url: 'https://datos.bancomundial.org/indicador/SP.ADO.TFRT?locations=UY',
  },
  {
    label: 'Junta Nacional de Drogas – Observatorio Uruguayo de Drogas, Encuestas Nacionales sobre Consumo de Drogas en Población General (en convenio con el INE)',
    url: 'https://www.gub.uy/junta-nacional-drogas/comunicacion/noticias/presentacion-viii-encuesta-nacional-sobre-consumo-drogas-poblacion-general',
  },
  {
    label: 'INEEd – Mirador Educativo, sobre microdatos de la Encuesta Continua de Hogares (INE)',
    url: 'https://mirador.ineed.edu.uy/indicadores/tasa-de-egreso-de-educacion-media-superior-entre-jovenes-de-21-a-23-anos-8-2.html',
  },
  {
    label: 'OCDE – Programme for International Student Assessment (PISA); Uruguay participa desde 2003 a través de ANEP',
    url: 'https://www.oecd.org/en/publications/pisa-2022-results-volume-i-and-ii-country-notes_ed6fbcc5-en/uruguay_020b6715-en.html',
  },
  {
    label: 'INE + Agesic — Encuesta de Usos de Tecnologías de la Información y la Comunicación (EUTIC)',
    url: 'https://www.gub.uy/agencia-gobierno-electronico-sociedad-informacion-conocimiento/sites/agencia-gobierno-electronico-sociedad-informacion-conocimiento/files/2025-11/_Informe_EUTIC_2025.pdf',
  },
  {
    label: 'Banco Mundial (datos reportados por UIT / URSEC)',
    url: 'https://data.worldbank.org/indicator/IT.NET.BBND.P2?locations=UY',
  },
  {
    label: 'MIEM — Dirección Nacional de Energía, Balance Energético Nacional (BEN)',
    url: 'https://catalogodatos.gub.uy/dataset/miem-generacion-de-electricidad-por-fuente',
  },
  {
    label: 'INE — Encuesta Continua de Hogares (2006-2018, vía Observatorio Social del MIDES) y Censo 2023 ponderado',
    url: 'https://catalogodatos.gub.uy/dataset/mides-indicador-7736',
  },
  {
    label: 'INE — Censos de Población 2011 y 2023 (Censo 2023 ponderado)',
    url: 'https://www.gub.uy/instituto-nacional-estadistica/comunicacion/noticias/censo-2023-ponderado',
  },
  {
    label: 'INE — Censos de Población (Atlas sociodemográfico y de la desigualdad del Uruguay, fascículo 1: NBI)',
    url: 'https://www5.ine.gub.uy/documents/Demograf%C3%ADayEESS/PDF/Demograf%C3%ADa/Atlas_fasciculo_1_NBI_versionrevisada.pdf',
  },
  {
    label: 'UNASEV — Unidad Nacional de Seguridad Vial, Informe Anual de Siniestralidad Vial 2025 (Tabla 2)',
    url: 'https://www.gub.uy/unidad-nacional-seguridad-vial/sites/unidad-nacional-seguridad-vial/files/documentos/noticias/2025%20-%20Informe%20Anual%20de%20Seguridad%20Vial_.pdf',
  },
  {
    label: 'Banco Mundial (a partir de estadísticas de finanzas públicas del FMI)',
    url: 'https://datos.bancomundial.org/indicador/GC.DOD.TOTL.GD.ZS?locations=UY',
  },
  {
    label: 'Ministerio de Economía y Finanzas (MEF) – Unidad de Gestión de Deuda, con datos del Banco Central del Uruguay',
    url: 'https://deuda.mef.gub.uy/6473/14/areas/base-de-datos-economicos.html',
  },
  {
    label: 'Moody\'s Ratings (acciones de calificación difundidas por la Unidad de Gestión de Deuda del MEF)',
    url: 'https://deuda.mef.gub.uy/15601/14/areas/reportes-de-calificacion.html',
  },
  {
    label: 'OCDE / CEPAL / CIAT / BID — Revenue Statistics in Latin America and the Caribbean 2026 (con datos oficiales de Uruguay)',
    url: 'https://www.oecd.org/en/publications/revenue-statistics-in-latin-america-and-the-caribbean-2026_2f21f131-en.html',
  },
  {
    label: 'Programa de las Naciones Unidas para el Desarrollo (PNUD), Informe sobre Desarrollo Humano 2025',
    url: 'https://hdr.undp.org/data-center/specific-country-data#/countries/URY',
  },
  {
    label: 'Economist Intelligence Unit (EIU)',
    url: 'https://www.eiu.com/topic/democracy-index',
  },
  {
    label: 'Transparency International',
    url: 'https://www.transparency.org/en/countries/uruguay',
  },
  {
    label: 'Corporación Latinobarómetro, Informe 2013 p.44 (gráfico Satisfacción con la vida, totales por país 2013), Informe 2015 Tabla 9, Informe 2018 p.68 e Informe 2024 p.25',
    url: 'https://www.latinobarometro.org/documents/LAT-2018/informe-latinobarometro-2018.pdf',
  },
  {
    label: 'Corporación Latinobarómetro, informes anuales: 2009 (gráfico Imagen de progreso por país) para 2009; Informe 2015 (texto comparativo 2013-2015, «Uruguay, de 50% a 59%») para 2013 y 2015; Informe 2017 p.58 para 2017; Informe 2018 p.5 para 2018; Informe 2024 p.26 para 2024',
    url: 'https://www.latinobarometro.org/documents/LAT-2017/informe-latinobarometro-2017.pdf',
  },
  {
    label: 'Corporación Latinobarómetro (Informe 2024, tabla país-año 1995-2024; en Uruguay el trabajo de campo lo hace Equipos Consultores)',
    url: 'https://www.latinobarometro.org/documents/LAT-2024/latinobarometro-informe-2024.pdf',
  },
  {
    label: '2017-2023: Ministerio del Interior — AECA, Complemento del Diagnóstico general de la criminalidad y la violencia en Uruguay (PNSP 2025-2035), sección 4.2 "Seguridad como demanda prioritaria" y Gráfico 20, en base a Corporación Latinobarómetro. 2024: Corporación Latinobarómetro, Informe Latinobarómetro 2024 "La democracia resiliente", sección 1.5 y gráfico "Problemas más importantes: la seguridad — delincuencia", categoría "Delincuencia" (https://www.latinobarometro.org/documents/latinobarometro-informe-2024.pdf).',
    url: 'https://www.gub.uy/plan-nacional-de-seguridad-publica/documentos/resumen-del-diagnostico-general-de-la-criminalidad-y',
  },
  {
    label: 'gastos.gub.uy sobre datos abiertos de Compras Estatales (OCDS) · colección spending_trend',
    url: 'https://www.gub.uy/agencia-reguladora-compras-estatales/datos-y-estadisticas/datos/datos-abiertos-compras-estatales',
  },
  {
    label: 'Corporación Latinobarómetro, Informes 2013, 2015 y 2024',
    url: 'https://www.latinobarometro.org/documents/LAT-2015/informe-latinobarometro-2015.pdf',
  },
  {
    label: 'Corporación Latinobarómetro (Informes 2015 y 2016) y CIFRA (olas 2021 y 2024)',
    url: 'https://www.latinobarometro.org/documents/LAT-2016/informe-latinobarometro-2016.pdf',
  },
  {
    label: 'PNAS, Soroka, Fournier & Nir (2019), 116(38); Trussler & Soroka (2014), IJPP 19(3)',
    url: 'https://www.pnas.org/doi/10.1073/pnas.1908369116',
  },
  {
    label: 'Ipsos, «The Perils of Perception» (Global Advisor, 2017 y 2018)',
    url: 'https://www.ipsos.com/en-uk/perils-perception-2017',
  },
]
