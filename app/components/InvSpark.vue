<script setup lang="ts">
/**
 * Inline SVG sparkline for an indicator row.
 *
 * Deliberately NOT Chart.js. The scorecard of "¿estamos peor?" renders ~30 of
 * these at once; thirty canvases would cost thirty WebGL-ish contexts and could
 * not server-render, so the whole table would pop in after hydration. An SVG
 * polyline SSRs, costs nothing, and scales with the row.
 *
 * Colour is semantic, not decorative: the line takes `--verde` when the series
 * moved in the good direction and `--alerta` when it moved in the bad one, with
 * `direction` deciding which way is which (for `lowerIsBetter` a fall is good).
 * Gold is never used here — these are not amounts.
 *
 * `markYear` draws the reference rule the whole investigation turns on (2014):
 * the eye needs to see that most series bend there, not be told so in prose.
 */
export interface SparkPoint { year: number, value: number }

const props = withDefaults(defineProps<{
  series: SparkPoint[]
  direction?: 'higherIsBetter' | 'lowerIsBetter' | 'neutral'
  /** Force the colour instead of deriving it from first-vs-last. Pass this
   *  whenever the caller already shows a verdict: a line that reads green next
   *  to a chip that says "stalled" makes the reader distrust both. */
  tone?: 'up' | 'down' | 'flat'
  /** Draws a faint vertical rule at this year, if the series covers it. */
  markYear?: number | null
  height?: number
  width?: number
  /** Accessible name. Chart-shaped content with no name announces as nothing. */
  label: string
}>(), { direction: 'neutral', markYear: null, height: 30, width: 108 })

const PAD = 2

const pts = computed(() => props.series.filter(p => Number.isFinite(p.value)).sort((a, b) => a.year - b.year))

const geom = computed(() => {
  const p = pts.value
  if (p.length < 2) return null
  const xs = p.map(d => d.year)
  const ys = p.map(d => d.value)
  const x0 = Math.min(...xs)
  const x1 = Math.max(...xs)
  const y0 = Math.min(...ys)
  const y1 = Math.max(...ys)
  const w = props.width - PAD * 2
  const h = props.height - PAD * 2
  // A flat series would divide by zero; park it on the mid-line instead.
  const sx = (yr: number) => (x1 === x0 ? PAD + w / 2 : PAD + ((yr - x0) / (x1 - x0)) * w)
  const sy = (v: number) => (y1 === y0 ? PAD + h / 2 : PAD + h - ((v - y0) / (y1 - y0)) * h)
  return {
    d: p.map((q, i) => `${i ? 'L' : 'M'}${sx(q.year).toFixed(1)} ${sy(q.value).toFixed(1)}`).join(' '),
    lastX: sx(p[p.length - 1]!.year),
    lastY: sy(p[p.length - 1]!.value),
    markX: props.markYear != null && props.markYear > x0 && props.markYear < x1 ? sx(props.markYear) : null,
  }
})

/** Good / bad / flat, applying `direction`. Neutral series never colour. */
const tone = computed<'up' | 'down' | 'flat'>(() => {
  if (props.tone) return props.tone
  const p = pts.value
  if (props.direction === 'neutral' || p.length < 2) return 'flat'
  const first = p[0]!.value
  const last = p[p.length - 1]!.value
  if (first === 0) return 'flat'
  const rel = (last - first) / Math.abs(first)
  if (Math.abs(rel) < 0.05) return 'flat'
  const improved = props.direction === 'higherIsBetter' ? rel > 0 : rel < 0
  return improved ? 'up' : 'down'
})
</script>

<template>
  <svg
    v-if="geom"
    class="spark"
    :class="`spark--${tone}`"
    :viewBox="`0 0 ${width} ${height}`"
    :width="width"
    :height="height"
    role="img"
    :aria-label="label"
    preserveAspectRatio="none"
    focusable="false"
  >
    <line
      v-if="geom.markX !== null"
      class="spark__mark"
      :x1="geom.markX"
      :x2="geom.markX"
      :y1="0"
      :y2="height"
    />
    <path
      class="spark__line"
      :d="geom.d"
    />
    <circle
      class="spark__dot"
      :cx="geom.lastX"
      :cy="geom.lastY"
      r="2.2"
    />
  </svg>
  <span
    v-else
    class="spark spark--empty"
    :style="{ width: `${width}px`, height: `${height}px` }"
    aria-hidden="true"
  />
</template>

<style scoped lang="scss">
.spark {
  display: block;
  overflow: visible;
  color: var(--text-muted);

  &--up { color: var(--verde); }
  &--down { color: var(--alerta); }
  &--empty { display: inline-block; }
}

.spark__line {
  fill: none;
  stroke: currentColor;
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-linejoin: round;
  vector-effect: non-scaling-stroke;
}

.spark__dot {
  fill: currentColor;
}

.spark__mark {
  stroke: var(--rule-strong);
  stroke-width: 1;
  stroke-dasharray: 2 2;
  vector-effect: non-scaling-stroke;
}
</style>
