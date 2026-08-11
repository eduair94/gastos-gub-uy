<script setup lang="ts">
/**
 * Investigación · ¿Es cierto que cada vez estamos peor?
 *
 * La única de la serie que no arranca en un contrato. Arranca en una pregunta que
 * circula todo el tiempo —«cada vez estamos peor»— y la contesta con 52 series
 * oficiales en vez de con una opinión.
 *
 * Dos decisiones de método sostienen la página y conviene no deshacerlas:
 *
 *  1. DOS veredictos por indicador, no uno. 2004 es el piso de la peor crisis del
 *     país: cualquier presente se ve bien contra ese año. 2014 es el final del boom
 *     y es la comparación que la gente hace de verdad. Publicar sólo la primera
 *     sería propaganda; publicar sólo la segunda, otra clase de propaganda.
 *  2. Los indicadores de PERCEPCIÓN y los de COMPRAS quedan fuera del conteo
 *     «cuántos mejoraron». Son otro eje: mezclarlos convertiría el tablero en una
 *     suma de peras y manzanas que además haría de la percepción un hecho.
 *
 * Datos en ~/data/investigaciones-mejor-o-peor (generado, no editar los números a
 * mano). Todo lo que se afirma acá sale de ahí.
 */
import type { IndicatorGroup, IndicatorRow, IndicatorVerdict } from '~/data/investigaciones-mejor-o-peor'
import { MOP_INDICATORS, MOP_MECHANISMS, MOP_SOURCES, MOP_TALLY } from '~/data/investigaciones-mejor-o-peor'

const { locale } = useI18n()
const isEn = computed(() => locale.value === 'en')

const ES = {
  file: { org: 'URUGUAY', scope: '52 series oficiales', period: '2004 – 2026', source: 'INE · BCU · MEF · Ministerio del Interior · MSP · INEEd · Latinobarómetro' },
  kicker: 'Investigación · El país en números',
  title: '¿Cada vez estamos peor? Depende de contra qué año te compares',
  dek: 'Cincuenta y dos series oficiales, de 2004 a hoy, cada una buscada por un agente y después re-buscada por un verificador independiente. Contra 2004 mejoraron 21 indicadores y empeoraron 2. Contra 2014 mejoraron 19, se frenaron 10 y empeoraron 4 — y los que empeoraron son justo los que se ven. Mientras tanto, 87% de los uruguayos está conforme con su propia vida y sólo 41% cree que el país progresa.',
  chips: ['21 mejor / 2 peor vs 2004', '10 frenados desde 2014', 'homicidios ×1,7', 'brecha yo / país: 46 puntos'],
  tiles: {
    a: 'Mejoraron / empeoraron vs 2004', aSub: 'sobre 37 indicadores objetivos comparables',
    b: 'Se frenaron desde 2014', bSub: 'eran 2 en la comparación de veinte años',
    c: 'Homicidios contra 2004', cSub: '6,0 → 10,3 cada 100.000 habitantes',
    d: 'Brecha yo / el país', dSub: '87% conforme con su vida · 41% cree que el país progresa',
  },

  baseTag: 'El método',
  baseTitle: 'La trampa está en el año contra el que comparás',
  base1: 'Casi toda discusión sobre si el país mejoró o empeoró se gana o se pierde en la elección del año de referencia, y casi nadie la explicita. **2004 es el piso de la peor crisis económica de la historia uruguaya**: pobreza en 39,9%, desempleo en 13,1%, deuda del Gobierno Central en 85,4% del PIB, la deuda soberana calificada como bono basura. Comparar contra ese año hace ver bien a cualquier presente. Es cierto que estamos mucho mejor que en 2004, y también es una vara tramposa.',
  base2: '**2014 es el otro año, el que la gente usa sin decirlo.** Es el final del ciclo de commodities, el punto donde la mayoría de las series dejó de mejorar rápido. Contra 2014 el panorama cambia: la cantidad de indicadores frenados pasa de 2 a 10, y los cuatro que empeoraron son de los más visibles que hay. Quien tenía veinte años en 2014 hoy tiene treinta y dos y no vivió de adulto ninguna otra cosa que la meseta. Su pesimismo es cronológicamente coherente aunque la comparación larga sea positiva.',
  base3: 'Por eso cada indicador de esta página lleva dos veredictos y no uno. Un indicador se marca «igual» sólo dentro de una banda —5% relativo, o una banda absoluta cuando la escala es acotada, como PISA, Gini, IDH o los escalones de calificación— para que el ruido de medición no se lea como cambio.',

  cardsTitle: 'Los dos tableros, lado a lado',
  vsStartLabel: 'Contra 2004-2006',
  vs14Label: 'Contra 2014',
  mejor: 'mejoraron', peor: 'empeoraron', igual: 'se frenaron', sinDato: 'sin dato en ese año', neutro: 'sin dirección buena',

  worseTag: 'Lo que sí empeoró',
  worseTitle: 'Siete deterioros que no admiten matices',
  worseIntro: 'Empezamos por acá y no por las buenas noticias, porque el reclamo merece que se le conteste primero lo que tiene razón. Tres de estos siete no tienen ancla en 2004 —la serie oficial arranca después— y se comparan contra el primer año disponible, que se indica en cada fila.',
  worseFinding: 'La tasa de homicidios de Uruguay estuvo clavada en torno a 6 cada 100.000 habitantes durante treinta años, de 1989 a 2011. Saltó a 7,8 en 2012, a 12,0 en 2018, y desde entonces se estabilizó cerca de 10,3. No fue un deterioro gradual: fueron dos escalones, y el nivel de hoy es casi el doble del que este país tuvo durante tres décadas.',

  contraTag: 'Lo que contradice el relato',
  contraTitle: 'El delito que más gente sufre viene bajando hace seis años',
  contra1: 'Las rapiñas denunciadas treparon de 524 cada 100.000 habitantes en 2013 a un pico de 871 en 2019: un aumento del 66% en seis años. **Ese período existió y fue real**, y es probablemente donde se formó buena parte del discurso. Desde entonces cayeron a 436 en 2025, el valor más bajo de toda la serie disponible y un 25% por debajo de 2014. Los hurtos siguen el mismo camino, más lento.',
  contra2: 'Lo que quedó, entonces, es un diagnóstico que fue exacto entre 2013 y 2019 y que sobrevivió a los datos que lo sostenían. Con una salvedad que no hay que perder de vista: los homicidios no acompañaron esa baja. Se puede estar más seguro frente a la rapiña y menos frente al homicidio al mismo tiempo, y eso es exactamente lo que muestran las dos series.',

  gapTag: 'La brecha',
  gapTitle: 'Yo estoy bien, el país está mal',
  gapIntro: 'El número más importante de esta investigación no es un indicador económico: es la distancia entre dos preguntas de la misma encuesta. Cuando a un uruguayo le preguntan por su propia vida contesta desde la experiencia; cuando le preguntan por el país contesta desde lo que le llega. La distancia entre las dos respuestas era de 31 puntos en 2013 y es de 46 en 2024. No se cerró: se ensanchó mientras casi todos los indicadores duros mejoraban.',
  gapLife: 'Satisfecho con su propia vida',
  gapCountry: 'Cree que el país progresa',
  gapDiff: 'brecha',
  gapPts: 'puntos',
  gapOnlyBoth: 'sólo los años en que se hicieron las dos preguntas; no se interpola',

  mechTag: 'Por qué se siente peor',
  mechTitle: 'Seis mecanismos documentados, y dos dicen que el pesimismo tiene razón',
  mechIntro: 'No es una lista de errores cognitivos ajenos. Dos de los seis explican por qué una percepción negativa puede ser exacta, y uno lo dice la propia encuestadora sobre su indicador más citado.',
  mechEvidence: 'La evidencia',

  scoreTag: 'El tablero',
  scoreTitle: 'Los 52 indicadores, uno por uno',
  scoreIntro: 'Cada fila trae la serie completa, el valor en los años ancla, los dos veredictos y el enlace a la fuente oficial. Ordenados por tema. La línea punteada de cada minigráfico marca 2014.',
  filters: { todos: 'Todos', mejor: 'Mejoraron', peor: 'Empeoraron', igual: 'Se frenaron' },
  colStart: 'inicio', col14: '2014', colLast: 'último', colSpark: 'serie',
  srcLink: 'fuente',
  emptyFilter: 'Ningún indicador de este grupo cae en ese filtro.',

  groups: {
    seguridad: 'Seguridad y delito',
    bienestar: 'Economía de los hogares',
    salud: 'Salud',
    educacion: 'Educación',
    servicios: 'Servicios, vivienda e infraestructura',
    macro: 'Estado, macro e instituciones',
    percepcion: 'Percepción — no entra en el conteo',
    transparencia: 'Transparencia — no entra en el conteo',
  } as Record<IndicatorGroup, string>,
  groupNote: {
    percepcion: 'Estas series miden lo que la gente cree, no lo que pasa. Se muestran porque son la otra mitad de la pregunta, y quedan fuera del conteo de arriba para no convertir una opinión en un hecho.',
    transparencia: 'Salen de la base de compras del propio sitio. Miden sobre todo cuánto más publica el Estado, no cuánto más gasta — por eso no se suman al tablero.',
  } as Partial<Record<IndicatorGroup, string>>,

  ceilTitle: 'Ojo con los «frenados»',
  ceilBody: 'Tres de los diez indicadores que se frenaron desde 2014 están contra el techo, no estancados por fracaso: la indigencia se quedó en 0,3% porque ya casi no queda dónde bajar, la generación eléctrica renovable en 98,2% por lo mismo, y la percepción de corrupción en 73 puntos siendo la mejor de América Latina. Los otros siete —desigualdad, pobreza infantil, femicidios, egreso de PISA, saneamiento— sí son estancamiento del que duele.',

  transTag: 'Un indicador que este sitio puede medir solo',
  transTitle: 'Hace veinte años esta página no se podía escribir',
  trans1: 'En 2002, 110 organismos del Estado publicaban sus compras y quedaban 14.327 registros en el año. En 2024 fueron 278 organismos y 129.965 registros. La base sobre la que corre este sitio existe porque ese número creció, y es en sí misma una de las cosas que mejoró: el Estado uruguayo de 2004 no era más limpio, era menos observable.',
  trans2: 'La contracara es que ese mismo crecimiento vuelve engañosa cualquier lectura ingenua del gasto publicado. El total adjudicado que figura en la base pasó de USD 451 millones en 2002 a USD 5.353 millones en 2024, pero eso mide sobre todo cuánta compra empezó a dejar rastro. Por eso estas cuatro series están acá abajo y no en el tablero de arriba.',
  transCta: 'Ver la evolución del gasto con el puente completo',

  discTitle: 'Cómo leer esta investigación',
  disc: [
    '**No es un informe optimista ni pesimista: es un conteo.** Cada indicador se clasificó con la misma regla mecánica, sin elegir cuáles mostrar. Los que empeoraron van primero y con nombre propio. Si el resultado se inclina hacia la mejora es porque las series se inclinan hacia la mejora, no porque se hayan elegido las series.',
    '**Un promedio nacional esconde una distribución.** Que la pobreza haya caído a 8,3% no dice nada sobre quién quedó adentro: la pobreza infantil sigue en 20,1% y el egreso del liceo es de 30,5% en el nivel socioeconómico muy bajo contra 84,8% en el muy alto. Un indicador país que mejora es compatible con que a mucha gente le vaya peor.',
    '**Las series tienen quiebres y están señalados.** La pobreza aparece dos veces porque el INE cambió la línea en 2017 y las dos mediciones no son continuas. El conteo de delitos alcanzó cobertura nacional recién en 2013. Los datos de percepción mezclan encuestadoras. Donde el quiebre existe está dicho en la fila.',
    '**Verificación, no confianza.** Cada serie externa fue investigada por un agente y después re-buscada por un verificador independiente con instrucción de descartar antes que publicar: de 49 series, 43 quedaron confirmadas sin cambios, 6 fueron corregidas —casi todas cifras de encuesta— y ninguna sobrevivió sin fuente. Las 4 de compras salen de la propia base del sitio.',
    '**Nada de esto dice cómo tenés que sentirte.** Los datos contestan «¿cambió?», no «¿alcanza?». Que la mortalidad infantil se haya reducido a la mitad no vuelve aceptable el nivel actual, y que las rapiñas bajen no le devuelve nada a quien la sufrió el mes pasado.',
  ],
  srcTitle: 'Fuentes',
  srcIntro: 'Todas las series enlazan a la publicación oficial de la que salen. Ninguna cifra de esta página se calculó a mano salvo las cuatro de compras públicas, que salen de la base del sitio.',
}

const EN: typeof ES = {
  file: { org: 'URUGUAY', scope: '52 official series', period: '2004 – 2026', source: 'INE · BCU · MEF · Ministry of the Interior · MSP · INEEd · Latinobarómetro' },
  kicker: 'Investigation · The country in numbers',
  title: 'Are we getting worse? It depends which year you compare against',
  dek: 'Fifty-two official series, from 2004 to today, each found by one agent and then re-sourced by an independent verifier. Against 2004, 21 indicators improved and 2 got worse. Against 2014, 19 improved, 10 stalled and 4 got worse — and the ones that got worse are precisely the visible ones. Meanwhile 87% of Uruguayans are satisfied with their own life and only 41% think the country is progressing.',
  chips: ['21 better / 2 worse vs 2004', '10 stalled since 2014', 'homicides x1.7', 'me vs country gap: 46 points'],
  tiles: {
    a: 'Improved / worsened vs 2004', aSub: 'out of 37 comparable objective indicators',
    b: 'Stalled since 2014', bSub: 'only 2 did in the twenty-year comparison',
    c: 'Homicides against 2004', cSub: '6.0 → 10.3 per 100,000 people',
    d: 'Me vs the country gap', dSub: '87% satisfied with their life · 41% think the country progresses',
  },

  baseTag: 'The method',
  baseTitle: 'The trap is the year you compare against',
  base1: 'Almost every argument about whether the country improved or worsened is won or lost on the choice of reference year, and almost nobody states it. **2004 is the floor of the worst economic crisis in Uruguayan history**: poverty at 39.9%, unemployment at 13.1%, Central Government debt at 85.4% of GDP, sovereign debt rated junk. Comparing against that year flatters any present. It is true that we are far better off than in 2004, and it is also a rigged yardstick.',
  base2: '**2014 is the other year, the one people use without saying so.** It is the end of the commodity cycle, the point where most series stopped improving fast. Against 2014 the picture changes: stalled indicators go from 2 to 10, and the four that worsened are among the most visible there are. Someone who was twenty in 2014 is thirty-two today and has known no adult life other than the plateau. Their pessimism is chronologically coherent even when the long comparison is positive.',
  base3: 'That is why every indicator here carries two verdicts rather than one. An indicator is marked "stalled" only inside a band — 5% relative, or an absolute band where the scale is bounded, as with PISA, Gini, HDI or rating notches — so that measurement noise does not read as change.',

  cardsTitle: 'The two scoreboards, side by side',
  vsStartLabel: 'Against 2004-2006',
  vs14Label: 'Against 2014',
  mejor: 'improved', peor: 'worsened', igual: 'stalled', sinDato: 'no data that year', neutro: 'no good direction',

  worseTag: 'What really did get worse',
  worseTitle: 'Seven deteriorations that admit no nuance',
  worseIntro: 'We start here rather than with the good news, because the complaint deserves to be answered first on what it gets right. Three of these seven have no 2004 anchor — the official series starts later — and are compared against the first available year, shown in each row.',
  worseFinding: 'Uruguay\'s homicide rate sat at around 6 per 100,000 people for thirty years, from 1989 to 2011. It jumped to 7.8 in 2012, to 12.0 in 2018, and has since settled near 10.3. It was not a gradual deterioration: it was two steps, and today\'s level is close to double what this country lived with for three decades.',

  contraTag: 'What contradicts the story',
  contraTitle: 'The crime most people actually suffer has been falling for six years',
  contra1: 'Reported robberies climbed from 524 per 100,000 people in 2013 to a peak of 871 in 2019: a 66% rise in six years. **That period existed and was real**, and it is probably where much of the discourse was formed. They have since fallen to 436 in 2025, the lowest value in the available series and 25% below 2014. Thefts follow the same path, more slowly.',
  contra2: 'What is left, then, is a diagnosis that was accurate between 2013 and 2019 and outlived the data that supported it. With one caveat worth keeping in view: homicides did not follow that fall. You can be safer from robbery and less safe from homicide at the same time, and that is exactly what the two series show.',

  gapTag: 'The gap',
  gapTitle: 'I am fine, the country is not',
  gapIntro: 'The most important number in this investigation is not economic: it is the distance between two questions in the same survey. Asked about their own life, a Uruguayan answers from experience; asked about the country, they answer from what reaches them. The distance between the two answers was 31 points in 2013 and is 46 in 2024. It did not close: it widened while almost every hard indicator improved.',
  gapLife: 'Satisfied with their own life',
  gapCountry: 'Think the country is progressing',
  gapDiff: 'gap',
  gapPts: 'points',
  gapOnlyBoth: 'only years when both questions were asked; nothing is interpolated',

  mechTag: 'Why it feels worse',
  mechTitle: 'Six documented mechanisms, and two of them say the pessimism is right',
  mechIntro: 'This is not a list of other people\'s cognitive errors. Two of the six explain why a negative perception can be accurate, and one of them is the pollster\'s own warning about its most-quoted indicator.',
  mechEvidence: 'The evidence',

  scoreTag: 'The scoreboard',
  scoreTitle: 'All 52 indicators, one by one',
  scoreIntro: 'Each row carries the full series, the values at the anchor years, both verdicts and a link to the official source. Grouped by theme. The dashed line in each sparkline marks 2014.',
  filters: { todos: 'All', mejor: 'Improved', peor: 'Worsened', igual: 'Stalled' },
  colStart: 'start', col14: '2014', colLast: 'latest', colSpark: 'series',
  srcLink: 'source',
  emptyFilter: 'No indicator in this group matches that filter.',

  groups: {
    seguridad: 'Security and crime',
    bienestar: 'Household economics',
    salud: 'Health',
    educacion: 'Education',
    servicios: 'Services, housing and infrastructure',
    macro: 'State, macro and institutions',
    percepcion: 'Perception — not in the tally',
    transparencia: 'Transparency — not in the tally',
  } as Record<IndicatorGroup, string>,
  groupNote: {
    percepcion: 'These series measure what people believe, not what happens. They are shown because they are the other half of the question, and left out of the tally above so an opinion does not become a fact.',
    transparencia: 'They come from this site\'s own procurement data. They mostly measure how much more the State publishes, not how much more it spends — hence their exclusion from the scoreboard.',
  } as Partial<Record<IndicatorGroup, string>>,

  ceilTitle: 'Careful with the "stalled" ones',
  ceilBody: 'Three of the ten indicators stalled since 2014 are against the ceiling, not stuck through failure: extreme poverty stayed at 0.3% because there is almost nowhere left to fall, renewable electricity at 98.2% for the same reason, and corruption perceptions at 73 points while remaining the best in Latin America. The other seven — inequality, child poverty, femicides, secondary completion, PISA, sewerage — are the kind of stagnation that hurts.',

  transTag: 'One indicator this site can measure on its own',
  transTitle: 'Twenty years ago this page could not have been written',
  trans1: 'In 2002, 110 State bodies published their purchases and 14,327 records were left for the year. In 2024 it was 278 bodies and 129,965 records. The database this site runs on exists because that number grew, and it is itself one of the things that improved: the Uruguayan State of 2004 was not cleaner, it was less observable.',
  trans2: 'The flip side is that the same growth makes any naive reading of published spending misleading. The awarded total in the data went from USD 451 million in 2002 to USD 5,353 million in 2024, but that mostly measures how much purchasing started leaving a trace. Which is why these four series sit down here and not in the scoreboard above.',
  transCta: 'See the spending evolution with the full bridge',

  discTitle: 'How to read this investigation',
  disc: [
    '**This is not an optimistic or a pessimistic report: it is a count.** Every indicator was classified by the same mechanical rule, without picking which to show. The ones that worsened come first and by name. If the result leans towards improvement it is because the series lean that way, not because the series were chosen.',
    '**A national average hides a distribution.** Poverty falling to 8.3% says nothing about who was left inside: child poverty is still 20.1% and secondary completion is 30.5% in the lowest socioeconomic level against 84.8% in the highest. A country indicator improving is compatible with many people doing worse.',
    '**The series have breaks and they are flagged.** Poverty appears twice because INE changed the line in 2017 and the two measurements are not continuous. Crime recording only reached national coverage in 2013. Perception data splices pollsters. Where a break exists it is stated in the row.',
    '**Verification, not trust.** Every external series was researched by one agent and then re-sourced by an independent verifier instructed to discard rather than publish: of 49 series, 43 were confirmed unchanged, 6 were corrected — nearly all survey figures — and none survived without a source. The 4 procurement ones come from the site\'s own data.',
    '**None of this tells you how to feel.** The data answers "did it change?", not "is it enough?". Infant mortality halving does not make the current level acceptable, and robberies falling gives nothing back to whoever was robbed last month.',
  ],
  srcTitle: 'Sources',
  srcIntro: 'Every series links to the official publication it comes from. No figure on this page was computed by hand except the four procurement ones, which come from the site\'s own data.',
}

const c = computed(() => (isEn.value ? EN : ES))

// ---- Formatting ----------------------------------------------------------
// A single locale-aware formatter: these are rates, indices and shares, never
// money, so nothing here goes through the gold money helpers.
function num(v: number | null, decimals: number): string {
  if (v === null || !Number.isFinite(v)) return '—'
  return new Intl.NumberFormat(isEn.value ? 'en-US' : 'es-UY', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(v)
}

const label = (r: IndicatorRow) => (isEn.value ? r.labelEn : r.labelEs)
const unit = (r: IndicatorRow) => (isEn.value ? r.unitEn : r.unitEs)
const note = (r: IndicatorRow) => (isEn.value ? r.noteEn : r.noteEs)

/** Inline **bold** without v-html: the copy needs emphasis, not markup rights. */
function segments(text: string) {
  return text.split(/\*\*(.+?)\*\*/g).map((part, i) => ({ text: part, strong: i % 2 === 1 }))
}

// ---- Scoreboard ----------------------------------------------------------
const GROUP_ORDER: IndicatorGroup[] = ['seguridad', 'bienestar', 'salud', 'educacion', 'servicios', 'macro', 'percepcion', 'transparencia']

type Filter = 'todos' | 'mejor' | 'peor' | 'igual'
const FILTERS: Filter[] = ['todos', 'mejor', 'peor', 'igual']
const filter = ref<Filter>('todos')

/** A row matches a filter if EITHER verdict does — a series that improved over
 *  twenty years and stalled after 2014 belongs in both lists, which is the
 *  whole point of carrying two verdicts. */
function matches(r: IndicatorRow): boolean {
  if (filter.value === 'todos') return true
  return r.vsStart === filter.value || r.vs14 === filter.value
}

const grouped = computed(() => GROUP_ORDER.map(g => ({
  group: g,
  rows: MOP_INDICATORS.filter(r => r.group === g && matches(r)),
  total: MOP_INDICATORS.filter(r => r.group === g).length,
})).filter(s => s.total > 0))

const shown = computed(() => grouped.value.reduce((n, s) => n + s.rows.length, 0))

/**
 * A neutral indicator has no good direction, so it gets ONE chip saying so
 * rather than two em-dashes, which read as a rendering failure.
 */
function verdictsFor(r: IndicatorRow): IndicatorVerdict[] {
  return r.direction === 'neutral' ? ['neutro'] : [r.vsStart, r.vs14]
}

/** Colour the sparkline from the verdict the row actually shows, preferring the
 *  2014 reading — otherwise the line and the chip can disagree. */
function toneFor(r: IndicatorRow): 'up' | 'down' | 'flat' {
  const v = r.vs14 === 'sin-dato' ? r.vsStart : r.vs14
  if (v === 'mejor') return 'up'
  if (v === 'peor') return 'down'
  return 'flat'
}

function verdictLabel(v: IndicatorVerdict): string {
  if (v === 'mejor') return c.value.mejor
  if (v === 'peor') return c.value.peor
  if (v === 'igual') return c.value.igual
  if (v === 'sin-dato') return c.value.sinDato
  return c.value.neutro
}

// ---- Featured charts -----------------------------------------------------
const byKey = Object.fromEntries(MOP_INDICATORS.map(r => [r.key, r])) as Record<string, IndicatorRow>

/**
 * Build a shared year axis for one or more series. Every year in the span gets
 * a label and a missing observation stays `null`, because <TrendLines> is set to
 * `spanGaps: false` — a year with no survey must show as a gap, not as a line
 * drawn straight through it.
 */
function chart(keys: string[], colors: { colorVar: string, fallback: string }[]) {
  const rows = keys.map(k => byKey[k]!).filter(Boolean)
  const years = [...new Set(rows.flatMap(r => r.series.map(p => p.year)))].sort((a, b) => a - b)
  const span: number[] = []
  for (let y = years[0]!; y <= years[years.length - 1]!; y++) span.push(y)
  return {
    labels: span.map(String),
    series: rows.map((r, i) => ({
      label: label(r),
      values: span.map(y => r.series.find(p => p.year === y)?.value ?? null),
      colorVar: colors[i]!.colorVar,
      fallback: colors[i]!.fallback,
    })),
  }
}

const ALERTA = { colorVar: 'alerta', fallback: '#b2423b' }
const CELESTE = { colorVar: 'celeste-deep', fallback: '#3c6d9c' }

const homicideChart = computed(() => chart(['homicidios-tasa'], [ALERTA]))
const robberyChart = computed(() => chart(['rapinas-tasa'], [CELESTE]))

/**
 * The gap gets a dumbbell, not a line chart. Latinobarómetro only fields in some
 * years, so plotted as lines these two series are mostly isolated dots (we refuse
 * to interpolate across a year with no survey) and the one thing the reader must
 * see — the distance between "my life" and "the country" — is the thing a scatter
 * of dots hides. One row per year where BOTH questions were asked.
 */
const gapRows = computed(() => {
  const life = byKey['satisfaccion-con-la-vida']!
  const country = byKey['pais-progresando']!
  const at = (r: IndicatorRow, y: number) => r.series.find(p => p.year === y)?.value ?? null
  return life.series
    .map(p => p.year)
    .map(year => ({ year, life: at(life, year), country: at(country, year) }))
    .filter((r): r is { year: number, life: number, country: number } => r.life !== null && r.country !== null)
    .map(r => ({ ...r, gap: r.life - r.country }))
})

/** The seven honest deteriorations, in the order the copy argues them. */
const WORSE_KEYS = ['homicidios-tasa', 'suicidios', 'poblacion-privada-libertad', 'deuda-gobierno-central-serie-larga', 'resultado-fiscal-spg', 'asentamientos-personas', 'desempleo']
const worseRows = computed(() => WORSE_KEYS.map(k => byKey[k]!).filter(Boolean))

// ---- SEO -----------------------------------------------------------------
const localePath = useLocalePath()
const siteUrl = useRuntimeConfig().public.siteUrl as string
const personLd = usePersonLd()
const orgLd = useOrgLd()

function breadcrumbLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    'itemListElement': [
      { '@type': 'ListItem', 'position': 1, 'name': 'Investigaciones', 'item': `${siteUrl}/investigaciones` },
      { '@type': 'ListItem', 'position': 2, 'name': c.value.title },
    ],
  }
}

useSeo(() => ({
  title: c.value.title,
  description: c.value.dek.slice(0, 155),
  path: '/investigaciones/mejor-o-peor',
  type: 'article',
  kicker: 'Investigación',
  jsonLd: [
    {
      '@context': 'https://schema.org',
      '@type': 'Article',
      'headline': c.value.title,
      'description': c.value.dek.slice(0, 155),
      'author': personLd,
      'publisher': orgLd,
    },
    breadcrumbLd(),
  ],
}))
</script>

<template>
  <div class="inv mop">
    <!-- Cover -->
    <header class="inv-cover">
      <div class="u-container">
        <div class="inv-file">
          <span>EXPEDIENTE&nbsp; <b>{{ c.file.org }}</b></span>
          <span>{{ c.file.scope }}</span>
          <span>PERÍODO&nbsp; <b>{{ c.file.period }}</b></span>
          <span>{{ c.file.source }}</span>
        </div>
        <p class="inv-kicker">
          {{ c.kicker }}
        </p>
        <h1>{{ c.title }}</h1>
        <p class="inv-dek">
          {{ c.dek }}
        </p>
        <div class="inv-chips">
          <span
            v-for="ch in c.chips"
            :key="ch"
            class="inv-chip"
          >{{ ch }}</span>
        </div>
      </div>
    </header>

    <!-- Tiles -->
    <section class="inv-sec inv-sec--alt">
      <div class="u-container">
        <div class="inv-tiles">
          <div class="inv-tile">
            <div class="inv-tile__n">
              <span class="mop-good">{{ MOP_TALLY.vsStart.mejor }}</span>
              <span class="mop-sep">/</span>
              <span class="mop-bad">{{ MOP_TALLY.vsStart.peor }}</span>
            </div>
            <div class="inv-tile__l">
              {{ c.tiles.a }}
            </div>
            <div class="inv-tile__s">
              {{ c.tiles.aSub }}
            </div>
          </div>
          <div class="inv-tile">
            <div class="inv-tile__n">
              {{ MOP_TALLY.vs14.igual }}
            </div>
            <div class="inv-tile__l">
              {{ c.tiles.b }}
            </div>
            <div class="inv-tile__s">
              {{ c.tiles.bSub }}
            </div>
          </div>
          <div class="inv-tile">
            <div class="inv-tile__n inv-tile__n--alerta">
              ×1,7
            </div>
            <div class="inv-tile__l">
              {{ c.tiles.c }}
            </div>
            <div class="inv-tile__s">
              {{ c.tiles.cSub }}
            </div>
          </div>
          <div class="inv-tile">
            <div class="inv-tile__n">
              46 pts
            </div>
            <div class="inv-tile__l">
              {{ c.tiles.d }}
            </div>
            <div class="inv-tile__s">
              {{ c.tiles.dSub }}
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- The baseline trap -->
    <section class="inv-sec">
      <div class="u-container">
        <div class="inv-head">
          <span class="inv-serie__tag">{{ c.baseTag }}</span>
          <h2>{{ c.baseTitle }}</h2>
        </div>
        <div class="inv-prose">
          <p
            v-for="(p, i) in [c.base1, c.base2, c.base3]"
            :key="i"
          >
            <template
              v-for="(s, j) in segments(p)"
              :key="j"
            >
              <strong v-if="s.strong">{{ s.text }}</strong>
              <template v-else>
                {{ s.text }}
              </template>
            </template>
          </p>
        </div>

        <h3 class="mop-h3">
          {{ c.cardsTitle }}
        </h3>
        <div class="mop-boards">
          <div
            v-for="b in [
              { k: 'start', title: c.vsStartLabel, t: MOP_TALLY.vsStart },
              { k: '14', title: c.vs14Label, t: MOP_TALLY.vs14 },
            ]"
            :key="b.k"
            class="mop-board"
          >
            <h4>{{ b.title }}</h4>
            <ul>
              <li>
                <b class="mop-good">{{ b.t.mejor }}</b><span>{{ c.mejor }}</span>
              </li>
              <li>
                <b class="mop-flat">{{ b.t.igual }}</b><span>{{ c.igual }}</span>
              </li>
              <li>
                <b class="mop-bad">{{ b.t.peor }}</b><span>{{ c.peor }}</span>
              </li>
              <li class="is-dim">
                <b>{{ b.t.sinDato }}</b><span>{{ c.sinDato }}</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>

    <!-- What got worse -->
    <section class="inv-sec inv-sec--alt">
      <div class="u-container">
        <div class="inv-head">
          <span class="inv-serie__tag">{{ c.worseTag }}</span>
          <h2>{{ c.worseTitle }}</h2>
          <p>{{ c.worseIntro }}</p>
        </div>

        <ol class="mop-worse">
          <li
            v-for="r in worseRows"
            :key="r.key"
          >
            <div class="mop-worse__head">
              <h3>{{ label(r) }}</h3>
              <p class="mop-worse__delta">
                <span class="mop-worse__from">{{ r.startYear ?? r.series[0]!.year }}: {{ num(r.vStart ?? r.series[0]!.value, r.decimals) }}</span>
                <span aria-hidden="true">→</span>
                <span class="mop-worse__to">{{ r.lastYear }}: {{ num(r.vLast, r.decimals) }}</span>
                <span class="mop-worse__unit">{{ unit(r) }}</span>
              </p>
            </div>
            <p class="mop-worse__note">
              {{ note(r) }}
            </p>
          </li>
        </ol>

        <div class="inv-finding mop-finding">
          <span class="inv-obs__tag">1989 – 2025</span>
          <h3>{{ c.worseFinding }}</h3>
        </div>

        <ChartBlock
          :title="label(byKey['homicidios-tasa']!)"
          :help="unit(byKey['homicidios-tasa']!)"
          class="mop-chart"
        >
          <TrendLines
            :labels="homicideChart.labels"
            :series="homicideChart.series"
            format="plain"
            :decimals="1"
            :unit="unit(byKey['homicidios-tasa']!)"
            :height="300"
            :label="label(byKey['homicidios-tasa']!)"
          />
          <template #meta>
            <a
              :href="byKey['homicidios-tasa']!.sourceUrl"
              target="_blank"
              rel="noopener"
            >{{ byKey['homicidios-tasa']!.source }}</a>
          </template>
        </ChartBlock>
      </div>
    </section>

    <!-- What contradicts the story -->
    <section class="inv-sec">
      <div class="u-container">
        <div class="inv-head">
          <span class="inv-serie__tag">{{ c.contraTag }}</span>
          <h2>{{ c.contraTitle }}</h2>
        </div>
        <div class="inv-prose">
          <p
            v-for="(p, i) in [c.contra1, c.contra2]"
            :key="i"
          >
            <template
              v-for="(s, j) in segments(p)"
              :key="j"
            >
              <strong v-if="s.strong">{{ s.text }}</strong>
              <template v-else>
                {{ s.text }}
              </template>
            </template>
          </p>
        </div>

        <ChartBlock
          :title="label(byKey['rapinas-tasa']!)"
          :help="unit(byKey['rapinas-tasa']!)"
          class="mop-chart"
        >
          <TrendLines
            :labels="robberyChart.labels"
            :series="robberyChart.series"
            format="plain"
            :decimals="0"
            :unit="unit(byKey['rapinas-tasa']!)"
            :height="280"
            :label="label(byKey['rapinas-tasa']!)"
          />
          <template #meta>
            <a
              :href="byKey['rapinas-tasa']!.sourceUrl"
              target="_blank"
              rel="noopener"
            >{{ byKey['rapinas-tasa']!.source }}</a>
          </template>
        </ChartBlock>
      </div>
    </section>

    <!-- The gap -->
    <section class="inv-sec inv-sec--alt">
      <div class="u-container">
        <div class="inv-head">
          <span class="inv-serie__tag">{{ c.gapTag }}</span>
          <h2>{{ c.gapTitle }}</h2>
          <p>{{ c.gapIntro }}</p>
        </div>
        <div class="mop-gap">
          <div class="mop-gap__legend">
            <span class="mop-gap__key mop-gap__key--life">{{ c.gapLife }}</span>
            <span class="mop-gap__key mop-gap__key--country">{{ c.gapCountry }}</span>
          </div>
          <ol class="mop-gap__rows">
            <li
              v-for="g in gapRows"
              :key="g.year"
            >
              <span class="mop-gap__year">{{ g.year }}</span>
              <span
                class="mop-gap__track"
                role="img"
                :aria-label="`${g.year}: ${c.gapLife} ${g.life}%, ${c.gapCountry} ${g.country}%, ${c.gapDiff} ${g.gap}`"
              >
                <span
                  class="mop-gap__bar"
                  :style="{ left: `${Math.min(g.life, g.country)}%`, width: `${Math.abs(g.gap)}%` }"
                />
                <span
                  class="mop-gap__dot mop-gap__dot--country"
                  :style="{ left: `${g.country}%` }"
                ><b>{{ g.country }}%</b></span>
                <span
                  class="mop-gap__dot mop-gap__dot--life"
                  :style="{ left: `${g.life}%` }"
                ><b>{{ g.life }}%</b></span>
              </span>
              <span class="mop-gap__diff">{{ g.gap }} {{ c.gapPts }}</span>
            </li>
          </ol>
          <p class="mop-gap__src">
            <a
              href="https://www.latinobarometro.org/latOnline.jsp"
              target="_blank"
              rel="noopener"
            >Corporación Latinobarómetro</a> · {{ c.gapOnlyBoth }}
          </p>
        </div>
      </div>
    </section>

    <!-- Mechanisms -->
    <section class="inv-sec">
      <div class="u-container">
        <div class="inv-head">
          <span class="inv-serie__tag">{{ c.mechTag }}</span>
          <h2>{{ c.mechTitle }}</h2>
          <p>{{ c.mechIntro }}</p>
        </div>
        <div class="mop-mechs">
          <article
            v-for="m in MOP_MECHANISMS"
            :key="m.key"
            class="mop-mech"
          >
            <h3>{{ isEn ? m.titleEn : m.titleEs }}</h3>
            <p>{{ isEn ? m.bodyEn : m.bodyEs }}</p>
            <div class="mop-mech__ev">
              <span class="mop-mech__evtag">{{ c.mechEvidence }}</span>
              <p>{{ isEn ? m.evidenceEn : m.evidenceEs }}</p>
              <a
                :href="m.sourceUrl"
                target="_blank"
                rel="noopener"
              >{{ m.source }}</a>
            </div>
          </article>
        </div>
      </div>
    </section>

    <!-- Scoreboard -->
    <section class="inv-sec inv-sec--alt">
      <div class="u-container">
        <div class="inv-head">
          <span class="inv-serie__tag">{{ c.scoreTag }}</span>
          <h2>{{ c.scoreTitle }}</h2>
          <p>{{ c.scoreIntro }}</p>
        </div>

        <div
          class="mop-filters"
          role="group"
          :aria-label="c.scoreTitle"
        >
          <button
            v-for="f in FILTERS"
            :key="f"
            type="button"
            class="mop-filter"
            :class="{ 'is-on': filter === f }"
            :aria-pressed="filter === f"
            @click="filter = f"
          >
            {{ c.filters[f] }}
          </button>
        </div>
        <p
          class="u-visually-hidden"
          role="status"
        >
          {{ shown }}
        </p>

        <div
          v-for="sec in grouped"
          :key="sec.group"
          class="mop-group"
        >
          <h3 class="mop-group__h">
            {{ c.groups[sec.group] }}
            <span class="mop-group__n">{{ sec.rows.length }}/{{ sec.total }}</span>
          </h3>
          <p
            v-if="c.groupNote[sec.group]"
            class="mop-group__note"
          >
            {{ c.groupNote[sec.group] }}
          </p>

          <p
            v-if="!sec.rows.length"
            class="mop-empty"
          >
            {{ c.emptyFilter }}
          </p>

          <article
            v-for="r in sec.rows"
            :key="r.key"
            class="mop-row"
          >
            <div class="mop-row__id">
              <h4>{{ label(r) }}</h4>
              <p class="mop-row__unit">
                {{ unit(r) }} ·
                <a
                  :href="r.sourceUrl"
                  target="_blank"
                  rel="noopener"
                >{{ c.srcLink }} ↗</a>
              </p>
            </div>

            <div class="mop-row__spark">
              <InvSpark
                :series="r.series"
                :direction="r.direction"
                :tone="toneFor(r)"
                :mark-year="2014"
                :label="`${label(r)} — ${r.series[0]!.year}–${r.lastYear}`"
              />
            </div>

            <dl class="mop-row__vals">
              <div>
                <dt>{{ r.startYear ?? c.colStart }}</dt>
                <dd>{{ num(r.vStart, r.decimals) }}</dd>
              </div>
              <div>
                <dt>{{ r.y14 ?? c.col14 }}</dt>
                <dd>{{ num(r.v14, r.decimals) }}</dd>
              </div>
              <div>
                <dt>{{ r.lastYear }}</dt>
                <dd class="is-last">
                  {{ num(r.vLast, r.decimals) }}
                </dd>
              </div>
            </dl>

            <div class="mop-row__verdicts">
              <span
                v-for="(v, i) in verdictsFor(r)"
                :key="i"
                class="mop-v"
                :class="`mop-v--${v}`"
              >{{ verdictLabel(v) }}</span>
            </div>

            <p class="mop-row__note">
              {{ note(r) }}
            </p>
          </article>
        </div>

        <div class="mop-ceiling">
          <h3>{{ c.ceilTitle }}</h3>
          <p>{{ c.ceilBody }}</p>
        </div>
      </div>
    </section>

    <!-- Transparency -->
    <section class="inv-sec">
      <div class="u-container">
        <div class="inv-head">
          <span class="inv-serie__tag">{{ c.transTag }}</span>
          <h2>{{ c.transTitle }}</h2>
        </div>
        <div class="inv-prose">
          <p
            v-for="(p, i) in [c.trans1, c.trans2]"
            :key="i"
          >
            {{ p }}
          </p>
          <p>
            <NuxtLink :to="localePath('/analytics/evolucion-gasto')">
              {{ c.transCta }} →
            </NuxtLink>
          </p>
        </div>
      </div>
    </section>

    <!-- How to read -->
    <section class="inv-sec inv-sec--alt">
      <div class="u-container">
        <div class="inv-disclaimer">
          <h3>{{ c.discTitle }}</h3>
          <p
            v-for="(d, i) in c.disc"
            :key="i"
          >
            <template
              v-for="(s, j) in segments(d)"
              :key="j"
            >
              <strong v-if="s.strong">{{ s.text }}</strong>
              <template v-else>
                {{ s.text }}
              </template>
            </template>
          </p>
        </div>
      </div>
    </section>

    <!-- Sources -->
    <section class="inv-sec">
      <div class="u-container">
        <div class="inv-head">
          <h2>{{ c.srcTitle }}</h2>
          <p>{{ c.srcIntro }}</p>
        </div>
        <ul class="inv-srclist mop-srclist">
          <li
            v-for="s in MOP_SOURCES"
            :key="s.url"
          >
            <a
              :href="s.url"
              target="_blank"
              rel="noopener"
            >{{ s.label }}</a>
          </li>
        </ul>
      </div>
    </section>
  </div>
</template>

<style scoped lang="scss">
.mop-h3 {
  font-family: var(--font-display);
  font-size: 1.15rem;
  font-weight: 700;
  margin: var(--s-7) 0 var(--s-4);
}

.mop-good { color: var(--verde); }
.mop-bad { color: var(--alerta); }
.mop-flat { color: var(--text-muted); }
.mop-sep { color: var(--rule-strong); margin: 0 0.15em; }

/* Two scoreboards ------------------------------------------------------- */
.mop-boards {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--s-5);
}

.mop-board {
  border: 1px solid var(--rule);
  border-radius: var(--r-lg);
  background: var(--surface);
  padding: var(--s-5);

  h4 {
    font-family: var(--font-mono);
    font-size: 0.72rem;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: var(--text-muted);
    margin: 0 0 var(--s-4);
  }

  ul { list-style: none; margin: 0; padding: 0; }

  li {
    display: flex;
    align-items: baseline;
    gap: var(--s-3);
    padding-block: var(--s-2);

    + li { border-top: 1px solid var(--rule); }

    b {
      font-family: var(--font-display);
      font-size: 1.5rem;
      font-weight: 700;
      min-width: 2.2ch;
      font-variant-numeric: tabular-nums;
    }

    span { color: var(--text-muted); font-size: 0.92rem; }
    &.is-dim { opacity: 0.65; b { font-size: 1.1rem; } }
  }
}

/* What got worse -------------------------------------------------------- */
.mop-worse {
  list-style: none;
  margin: 0 0 var(--s-7);
  padding: 0;
  display: grid;
  gap: var(--s-4);

  li {
    border: 1px solid var(--rule);
    border-left: 3px solid var(--alerta);
    border-radius: var(--r-md);
    background: var(--surface);
    padding: var(--s-4) var(--s-5);
  }
}

.mop-worse__head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--s-3);

  h3 { font-family: var(--font-display); font-size: 1.05rem; font-weight: 700; margin: 0; }
}

.mop-worse__delta {
  display: flex;
  align-items: baseline;
  gap: var(--s-2);
  margin: 0;
  font-family: var(--font-mono);
  font-size: 0.85rem;
  font-variant-numeric: tabular-nums;
}

.mop-worse__from { color: var(--text-muted); }
.mop-worse__to { color: var(--alerta); font-weight: 600; }
.mop-worse__unit { color: var(--text-muted); font-size: 0.72rem; }

.mop-worse__note {
  margin: var(--s-2) 0 0;
  color: var(--text-muted);
  font-size: 0.92rem;
  max-width: 78ch;
}

.mop-finding { margin-bottom: var(--s-6); }
.mop-chart { margin-top: var(--s-6); }

/* The gap dumbbell ------------------------------------------------------ */
.mop-gap {
  border: 1px solid var(--rule);
  border-radius: var(--r-lg);
  background: var(--surface);
  padding: var(--s-5) var(--s-6);
}

.mop-gap__legend {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-5);
  margin-bottom: var(--s-5);
  font-family: var(--font-mono);
  font-size: 0.72rem;
  color: var(--text-muted);
}

.mop-gap__key::before {
  content: '';
  display: inline-block;
  width: 9px;
  height: 9px;
  border-radius: var(--r-full);
  margin-right: var(--s-2);
}

.mop-gap__key--life::before { background: var(--verde); }
.mop-gap__key--country::before { background: var(--alerta); }

.mop-gap__rows {
  list-style: none;
  margin: 0;
  padding: 0;

  li {
    display: grid;
    grid-template-columns: 4ch minmax(0, 1fr) 9ch;
    align-items: center;
    gap: var(--s-4);
    /* Tall enough for the value labels sitting under each dot. */
    padding-block: var(--s-5) var(--s-4);

    + li { border-top: 1px solid var(--rule); }
  }
}

.mop-gap__year {
  font-family: var(--font-mono);
  font-size: 0.8rem;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}

/* The track is a 0-100% scale, so `left` can take the survey value directly. */
.mop-gap__track {
  position: relative;
  display: block;
  height: 2px;
  background: var(--rule);
}

.mop-gap__bar {
  position: absolute;
  top: 0;
  height: 2px;
  background: var(--ink);
  opacity: 0.35;
}

.mop-gap__dot {
  position: absolute;
  top: 50%;
  width: 11px;
  height: 11px;
  margin-left: -5.5px;
  border-radius: var(--r-full);
  transform: translateY(-50%);

  b {
    position: absolute;
    top: 11px;
    left: 50%;
    transform: translateX(-50%);
    font-family: var(--font-mono);
    font-size: 0.72rem;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
}

.mop-gap__dot--life { background: var(--verde); b { color: var(--verde); } }
.mop-gap__dot--country { background: var(--alerta); b { color: var(--alerta); } }

.mop-gap__diff {
  font-family: var(--font-mono);
  font-size: 0.8rem;
  font-weight: 600;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.mop-gap__src {
  margin: var(--s-4) 0 0;
  font-family: var(--font-mono);
  font-size: 0.68rem;
  color: var(--text-muted);
}

/* Mechanisms ------------------------------------------------------------ */
.mop-mechs {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 340px), 1fr));
  gap: var(--s-5);
}

.mop-mech {
  border: 1px solid var(--rule);
  border-radius: var(--r-lg);
  background: var(--surface);
  padding: var(--s-5);

  h3 {
    font-family: var(--font-display);
    font-size: 1.05rem;
    font-weight: 700;
    margin: 0 0 var(--s-3);
  }

  > p { margin: 0 0 var(--s-4); font-size: 0.95rem; }
}

.mop-mech__ev {
  border-top: 1px solid var(--rule);
  padding-top: var(--s-3);

  p { margin: var(--s-2) 0; font-size: 0.86rem; color: var(--text-muted); }
  a { font-family: var(--font-mono); font-size: 0.7rem; }
}

.mop-mech__evtag {
  font-family: var(--font-mono);
  font-size: 0.66rem;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--text-muted);
}

/* Scoreboard ------------------------------------------------------------ */
.mop-filters {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-2);
  margin-bottom: var(--s-6);
}

.mop-filter {
  border: 1px solid var(--rule-strong);
  border-radius: var(--r-full);
  background: var(--surface);
  color: var(--text-muted);
  font-size: 0.85rem;
  padding: var(--s-1) var(--s-4);
  cursor: pointer;

  &:hover { border-color: var(--celeste-deep); color: var(--text); }

  &.is-on {
    background: var(--celeste-deep);
    border-color: var(--celeste-deep);
    color: #fff;
  }
}

.mop-group { margin-bottom: var(--s-7); }

.mop-group__h {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--text-muted);
  font-weight: 600;
  border-bottom: 1px solid var(--rule-strong);
  padding-bottom: var(--s-2);
  margin: 0 0 var(--s-3);
  display: flex;
  justify-content: space-between;
  gap: var(--s-3);
}

.mop-group__n { font-variant-numeric: tabular-nums; opacity: 0.7; }

.mop-group__note {
  margin: 0 0 var(--s-4);
  font-size: 0.88rem;
  color: var(--text-muted);
  max-width: 80ch;
}

.mop-empty { color: var(--text-muted); font-size: 0.9rem; margin: 0 0 var(--s-4); }

/* One record row. Grid rather than a table: 52 rows of five very different
   field types reflow far more predictably as a grid, and the note needs a full
   row of its own on every width. */
.mop-row {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) auto minmax(0, 1.1fr) minmax(0, 0.9fr);
  grid-template-areas: 'id spark vals verdicts' 'note note note note';
  align-items: center;
  gap: var(--s-2) var(--s-4);
  padding: var(--s-3) 0;
  border-bottom: 1px solid var(--rule);
}

.mop-row__id { grid-area: id; min-width: 0; }
.mop-row__id h4 { font-size: 0.98rem; font-weight: 600; margin: 0; }

.mop-row__unit {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 0.68rem;
  color: var(--text-muted);
}

.mop-row__spark { grid-area: spark; }

.mop-row__vals {
  grid-area: vals;
  display: flex;
  gap: var(--s-4);
  margin: 0;
  min-width: 0;

  div { min-width: 0; }

  dt {
    font-family: var(--font-mono);
    font-size: 0.62rem;
    color: var(--text-muted);
    letter-spacing: 0.05em;
  }

  dd {
    margin: 0;
    font-family: var(--font-mono);
    font-size: 0.92rem;
    font-variant-numeric: tabular-nums;
    color: var(--text-muted);
  }

  .is-last { color: var(--text); font-weight: 600; }
}

.mop-row__verdicts {
  grid-area: verdicts;
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-1);
  justify-content: flex-end;
}

.mop-v {
  font-family: var(--font-mono);
  font-size: 0.62rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  border-radius: var(--r-sm);
  padding: 2px var(--s-2);
  border: 1px solid transparent;
  white-space: nowrap;
}

.mop-v--mejor { color: var(--verde); border-color: var(--verde); }
.mop-v--peor { color: var(--alerta); border-color: var(--alerta); }
.mop-v--igual { color: var(--text-muted); border-color: var(--rule-strong); }
.mop-v--neutro,
.mop-v--sin-dato { color: var(--text-muted); border-color: var(--rule); opacity: 0.7; }

.mop-row__note {
  grid-area: note;
  margin: 0;
  font-size: 0.86rem;
  color: var(--text-muted);
  max-width: 90ch;
}

.mop-ceiling {
  border: 1px solid var(--rule-strong);
  border-radius: var(--r-lg);
  background: var(--surface-sunken);
  padding: var(--s-5);
  margin-top: var(--s-6);

  h3 { font-family: var(--font-display); font-size: 1.05rem; font-weight: 700; margin: 0 0 var(--s-2); }
  p { margin: 0; color: var(--text-muted); font-size: 0.95rem; max-width: 84ch; }
}

.mop-srclist {
  columns: 2;
  column-gap: var(--s-7);

  li { break-inside: avoid; }

  /* Some institutional source strings carry a bare URL with no break
     opportunity; without this the line box runs past the viewport and the
     whole page scrolls sideways at 360px. */
  a { overflow-wrap: anywhere; }
}

/* Below the desktop grid the row becomes a stacked card: the label line, then
   the sparkline and the three values sharing a line, then the verdicts. */
@media (max-width: 900px) {
  .mop-boards { grid-template-columns: minmax(0, 1fr); }
  .mop-srclist { columns: 1; }

  .mop-row {
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas: 'id id' 'vals spark' 'verdicts verdicts' 'note note';
    align-items: end;
    gap: var(--s-2);
  }

  .mop-row__verdicts { justify-content: flex-start; }
}

@media (max-width: 560px) {
  .mop-row__vals { gap: var(--s-3); }
  .mop-worse__head { flex-direction: column; gap: var(--s-1); }
}
</style>
