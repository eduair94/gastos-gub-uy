<script setup lang="ts">
/**
 * La serie de UNA encuestadora: aprobación y desaprobación, un punto por medición.
 *
 * POR QUÉ NO SE REUSA InvScatter. Ese componente pide `median` y `yMax` y está tallado para la
 * dispersión de precios unitarios. Acá hace falta lo contrario: dos series en el mismo eje, con
 * el eje fijo de 0 a 100, y —sobre todo— la garantía de que nunca se una un punto de una casa con
 * el de otra. Una casa por gráfico es la regla, y por eso el componente recibe una sola serie.
 *
 * EL EJE VA DE 0 A 100 SIEMPRE. Un eje recortado convertiría dos puntos de diferencia en un
 * derrumbe visual, que es la forma más común de mentir con un gráfico de encuestas sin decir una
 * sola cifra falsa. No es configurable a propósito.
 *
 * COLOR SIN VALENCIA. Aprobación en celeste sólido, desaprobación en tinta punteada. Ni verde ni
 * rojo: pintar la desaprobación de rojo sería decir que desaprobar está mal, y este sitio no
 * opina sobre eso. El oro no aparece: no hay dinero acá (app/DESIGN.md).
 *
 * SVG en línea como InvSpark, para que server-renderice y no dependa de hidratación.
 */
export interface PollPoint {
  /** Fecha de FIN de campo, en ISO. Es la que ordena y ubica el punto. */
  date: string
  approve: number
  disapprove: number
  /** Etiqueta corta del período de campo, para la lista accesible y el tooltip nativo. */
  label: string
  /** Punto con metodología distinta a la del resto de la serie: se dibuja hueco. */
  hollow?: boolean | undefined
}

const props = withDefaults(defineProps<{
  points: PollPoint[]
  /** Nombre accesible. Un gráfico sin nombre se anuncia como nada. */
  label: string
  approveLabel: string
  disapproveLabel: string
  height?: number
}>(), { height: 168 })

const W = 320
const PAD_L = 22
const PAD_R = 8
const PAD_T = 8
const PAD_B = 20

const pts = computed(() =>
  [...props.points].sort((a, b) => a.date.localeCompare(b.date)),
)

const geom = computed(() => {
  const p = pts.value
  if (!p.length) return null
  const times = p.map(d => Date.parse(d.date))
  const t0 = Math.min(...times)
  const t1 = Math.max(...times)
  const w = W - PAD_L - PAD_R
  const h = props.height - PAD_T - PAD_B
  // Una serie de un solo punto (o dos mediciones el mismo día) dividiría por cero: se centra.
  const sx = (t: number) => (t1 === t0 ? PAD_L + w / 2 : PAD_L + ((t - t0) / (t1 - t0)) * w)
  const sy = (v: number) => PAD_T + h - (v / 100) * h

  const nodes = p.map((d, i) => ({
    ...d,
    x: sx(times[i]!),
    ya: sy(d.approve),
    yd: sy(d.disapprove),
  }))
  const path = (key: 'ya' | 'yd') =>
    nodes.map((n, i) => `${i ? 'L' : 'M'}${n.x.toFixed(1)} ${n[key].toFixed(1)}`).join(' ')

  return {
    nodes,
    approve: path('ya'),
    disapprove: path('yd'),
    grid: [0, 25, 50, 75, 100].map(v => ({ v, y: sy(v) })),
    first: p[0]!.label,
    last: p[p.length - 1]!.label,
  }
})
</script>

<template>
  <figure
    v-if="geom"
    class="ps"
  >
    <svg
      class="ps__svg"
      :viewBox="`0 0 ${W} ${height}`"
      role="img"
      :aria-label="label"
      focusable="false"
    >
      <g class="ps__grid">
        <template
          v-for="g in geom.grid"
          :key="g.v"
        >
          <line
            :x1="PAD_L"
            :x2="W - PAD_R"
            :y1="g.y"
            :y2="g.y"
          />
          <text
            :x="PAD_L - 5"
            :y="g.y + 3"
            text-anchor="end"
          >{{ g.v }}</text>
        </template>
      </g>

      <path
        class="ps__line ps__line--dis"
        :d="geom.disapprove"
      />
      <path
        class="ps__line ps__line--app"
        :d="geom.approve"
      />

      <g
        v-for="n in geom.nodes"
        :key="n.date"
      >
        <circle
          class="ps__dot ps__dot--dis"
          :class="{ 'ps__dot--hollow': n.hollow }"
          :cx="n.x"
          :cy="n.yd"
          r="3.4"
        >
          <title>{{ n.label }} · {{ disapproveLabel }} {{ n.disapprove }}%</title>
        </circle>
        <circle
          class="ps__dot ps__dot--app"
          :class="{ 'ps__dot--hollow': n.hollow }"
          :cx="n.x"
          :cy="n.ya"
          r="3.4"
        >
          <title>{{ n.label }} · {{ approveLabel }} {{ n.approve }}%</title>
        </circle>
      </g>
    </svg>

    <figcaption class="ps__foot">
      <span class="ps__key">
        <span class="ps__swatch ps__swatch--app" />{{ approveLabel }}
      </span>
      <span class="ps__key">
        <span class="ps__swatch ps__swatch--dis" />{{ disapproveLabel }}
      </span>
    </figcaption>

    <!-- La tabla equivalente: un gráfico no es un dato accesible por sí solo. -->
    <ul class="u-visually-hidden">
      <li
        v-for="n in geom.nodes"
        :key="n.date"
      >
        {{ n.label }}: {{ approveLabel }} {{ n.approve }}%, {{ disapproveLabel }} {{ n.disapprove }}%
      </li>
    </ul>
  </figure>
</template>

<style scoped lang="scss">
.ps {
  margin: 0;
  display: grid;
  gap: var(--s-2);
}

.ps__svg {
  display: block;
  width: 100%;
  height: auto;
  overflow: visible;
}

.ps__grid line {
  stroke: var(--rule);
  stroke-width: 1;
  vector-effect: non-scaling-stroke;
}

.ps__grid text {
  fill: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 8px;
}

.ps__line {
  fill: none;
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
  vector-effect: non-scaling-stroke;

  &--app { stroke: var(--celeste-deep); }

  /* Punteada, no roja: la desaprobación se distingue por trazo, no por valencia. */
  &--dis {
    stroke: var(--text-muted);
    stroke-dasharray: 4 3;
  }
}

.ps__dot {
  &--app { fill: var(--celeste-deep); }
  &--dis { fill: var(--text-muted); }

  /* Metodología distinta al resto de la serie. */
  &--hollow {
    fill: var(--surface);
    stroke: currentColor;
    stroke-width: 1.4;
  }

  &--hollow.ps__dot--app { stroke: var(--celeste-deep); }
  &--hollow.ps__dot--dis { stroke: var(--text-muted); }
}

.ps__foot {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-2) var(--s-4);
  font-size: var(--t-xs);
  color: var(--text-muted);
}

.ps__key {
  display: inline-flex;
  align-items: center;
  gap: var(--s-2);
}

.ps__swatch {
  width: 14px;
  height: 0;
  border-top: 2px solid var(--celeste-deep);

  &--dis {
    border-top-style: dashed;
    border-top-color: var(--text-muted);
  }
}
</style>
