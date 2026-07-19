<script setup lang="ts">
/**
 * Horizontal ranked bars — suppliers, rubros, procurement methods. One bar per item,
 * its own colour, a value label at the bar end. Chart.js, client-only, theme-aware.
 *
 * Two layouts, one component:
 *
 *  - wide (>640px): the category axis sits on the left, full labels, value at
 *    the end of each bar. Needs ~480px, hence the min-width floor and the
 *    `.u-scroll-x` / <ChartBlock> wrapper every caller uses.
 *  - compact (<=640px): the axis is turned OFF and the label is drawn ABOVE its
 *    bar, so 100% of a 320px viewport goes to the label line and the bar. The
 *    alternatives were all worse: truncating the tick labels destroys the data
 *    (the labels ARE the suppliers), and shrinking the mono to 9px only buys
 *    ~80px and is unreadable. This is the layout that makes a phone not need a
 *    sideways gesture at all.
 */
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  LinearScale,
  Tooltip,
} from 'chart.js'
import { Bar } from 'vue-chartjs'

ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip)

const props = withDefaults(defineProps<{
  items: { label: string, value: number, color?: string, sub?: string }[]
  /** How to format the value label + tooltip. */
  format?: 'moneyM' | 'money' | 'count'
  /** Bar height per row, drives the canvas height. */
  rowHeight?: number
  /** Called with the bar's index when activated. Return a URL to make the bar a
   *  link (pointer cursor + navigate on click). Omit for a static chart. */
  hrefFor?: (index: number) => string | undefined
}>(), { format: 'moneyM', rowHeight: 34 })

const router = useRouter()

const theme = ref({ gold: '#c69528', verde: '#3f7d62', alerta: '#b2423b', celeste: '#3f74a6', neutral: '#9aa7b1', text: '#12212e', muted: '#576673', rule: '#d6dde2', ink: '#0f1f2e', surface: '#ffffff' })
function readTokens() {
  if (!import.meta.client) return
  const cs = getComputedStyle(document.documentElement)
  const v = (n: string, f: string) => cs.getPropertyValue(n).trim() || f
  theme.value = {
    gold: v('--money-rule', '#c69528'),
    verde: v('--verde', '#3f7d62'),
    alerta: v('--alerta', '#b2423b'),
    celeste: v('--celeste', '#3f74a6'),
    neutral: v('--grafito', '#9aa7b1'),
    text: v('--text', '#12212e'),
    muted: v('--text-muted', '#576673'),
    rule: v('--rule', '#d6dde2'),
    ink: v('--ink', '#0f1f2e'),
    surface: v('--surface', '#ffffff'),
  }
}
/** Semantic colour names resolve to live token values; anything else is used as-is. */
function resolveColor(c?: string): string {
  if (!c) return theme.value.gold
  const map: Record<string, string> = { gold: theme.value.gold, verde: theme.value.verde, alerta: theme.value.alerta, celeste: theme.value.celeste, neutral: theme.value.neutral }
  return map[c] ?? c
}
/** Phone layout: label above the bar, no category axis. Matched to the
 *  breakpoint where `.hb`'s 480px floor is dropped in the style block below. */
const compact = ref(false)

const barRef = ref<any>(null)
const wrap = ref<HTMLElement | null>(null)
let ro: ResizeObserver | undefined

onMounted(() => {
  readTokens()

  // Same stale-size trap as YearBars: Chart.js defers a resize while its entry
  // animation runs, so a viewport change in those 420ms leaves the canvas at its
  // previous width and the chart draws outside its own panel.
  if (wrap.value && typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(() => barRef.value?.chart?.resize())
    ro.observe(wrap.value)
    onBeforeUnmount(() => ro?.disconnect())
  }
  const mo = new MutationObserver(readTokens)
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] })

  const mq = window.matchMedia('(max-width: 640px)')
  const syncCompact = () => {
    compact.value = mq.matches
  }
  syncCompact()
  mq.addEventListener('change', syncCompact)

  onBeforeUnmount(() => {
    mo.disconnect()
    mq.removeEventListener('change', syncCompact)
  })
})

// Compact rows carry a label line above the bar, so they need the extra leading.
const height = computed(() => {
  const row = props.rowHeight + (compact.value ? 18 : 0)
  return Math.max(120, props.items.length * row + 16)
})

// Chart.js lays out into the size cached by its last resize; `chart.update()`
// never re-measures the DOM. When the row count changes, the wrapper's inline
// height changes in the same flush, so without this the bars are drawn once
// into the stale box (visible on the filter-driven charts in
// /analytics/proveedores-anomalias, which go 10 rows -> 3 in one interaction).
watch(() => props.items.length, async () => {
  await nextTick()
  barRef.value?.chart?.resize()
})

function fmtVal(v: number): string {
  // `money` renders a full compact peso figure (adapts mil/M/mil M) — for values
  // that aren't in the millions, like per-capita spend. `moneyM` fixes the unit at
  // millions so a ranked column reads on one scale.
  if (props.format === 'count') return formatNumber(v)
  if (props.format === 'money') return formatMoney(v, 'UYU', { compact: true })
  return `$ ${(v / 1e6).toFixed(1).replace('.', ',')} M`
}

const chartData = computed(() => ({
  labels: props.items.map(i => i.label),
  datasets: [{
    data: props.items.map(i => i.value),
    backgroundColor: props.items.map(i => resolveColor(i.color)),
    borderRadius: 3,
    borderSkipped: false,
    barThickness: Math.max(10, props.rowHeight - 14),
  }],
}))

/** Trim to fit `max` px, binary-searching the break point. */
function ellipsize(ctx: any, s: string, max: number): string {
  if (max <= 0) return ''
  if (ctx.measureText(s).width <= max) return s
  let lo = 0
  let hi = s.length
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (ctx.measureText(`${s.slice(0, mid)}…`).width <= max) lo = mid
    else hi = mid - 1
  }
  return `${s.slice(0, lo)}…`
}

// Compact layout: the y axis is off, so the category label goes above its bar
// and the value is right-aligned on the same line.
const stackedLabels = {
  id: 'stackedLabels',
  afterDatasetsDraw(chart: any) {
    if (!compact.value) return
    const { ctx, chartArea } = chart
    const meta = chart.getDatasetMeta(0)
    ctx.save()
    ctx.textBaseline = 'alphabetic'
    meta.data.forEach((bar: any, i: number) => {
      const it = props.items[i]
      if (!it) return
      const y = bar.y - bar.height / 2 - 5
      const val = fmtVal(it.value)
      ctx.font = '600 11px "IBM Plex Mono", monospace'
      ctx.fillStyle = theme.value.muted
      ctx.textAlign = 'right'
      ctx.fillText(val, chartArea.right, y)
      const valW = ctx.measureText(val).width
      ctx.font = '600 12px "Public Sans", system-ui, sans-serif'
      ctx.fillStyle = theme.value.text
      ctx.textAlign = 'left'
      ctx.fillText(ellipsize(ctx, it.label, chartArea.right - chartArea.left - valW - 12), chartArea.left, y)
    })
    ctx.restore()
  },
}

// Inline plugin: draw the formatted value at the end of each bar.
const valueLabels = {
  id: 'valueLabels',
  afterDatasetsDraw(chart: any) {
    // Compact draws its own value label above the bar; letting both run
    // double-draws it, and the end-of-bar copy is clipped once the right
    // padding drops to 2px.
    if (compact.value) return
    const { ctx } = chart
    const meta = chart.getDatasetMeta(0)
    ctx.save()
    ctx.font = '600 11px "IBM Plex Mono", monospace'
    ctx.fillStyle = theme.value.muted
    ctx.textBaseline = 'middle'
    meta.data.forEach((bar: any, i: number) => {
      ctx.fillText(fmtVal(props.items[i].value), bar.x + 8, bar.y)
    })
    ctx.restore()
  },
}

const chartOptions = computed(() => ({
  indexAxis: 'y' as const,
  responsive: true,
  maintainAspectRatio: false,
  layout: { padding: compact.value ? { right: 2, top: 16 } : { right: 64 } },
  animation: { duration: 420 },
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: theme.value.ink,
      titleColor: '#fff',
      bodyColor: '#e7eef4',
      padding: 10,
      cornerRadius: 6,
      displayColors: false,
      titleFont: { family: 'IBM Plex Mono, monospace', size: 12, weight: 700 as const },
      bodyFont: { family: 'IBM Plex Mono, monospace', size: 12 },
      callbacks: {
        title: (items: any[]) => props.items[items[0]?.dataIndex]?.label ?? '',
        label: (ctx: any) => {
          const it = props.items[ctx.dataIndex]
          return it?.sub ? [fmtVal(it.value), it.sub] : fmtVal(it?.value ?? 0)
        },
      },
    },
  },
  scales: {
    x: {
      beginAtZero: true,
      grid: { color: theme.value.rule, drawTicks: false },
      border: { display: false },
      ticks: { display: false },
    },
    y: {
      // Hidden, not removed: the scale still maps categories to bars, it just
      // stops reserving ~110px of a 320px canvas for labels that the
      // stackedLabels plugin now draws full-width above each bar.
      display: !compact.value,
      grid: { display: false },
      border: { color: theme.value.rule },
      ticks: {
        color: theme.value.text,
        font: { family: 'IBM Plex Mono, monospace', size: 11.5 },
        crossAlign: 'far' as const,
      },
    },
  },
  // Optional drill-through: a bar becomes a link when `hrefFor` yields a URL.
  onClick: (_e: unknown, els: any[]) => {
    const i = els?.[0]?.index
    if (i === undefined || i === null) return
    const href = props.hrefFor?.(i)
    if (href) router.push(href)
  },
  onHover: (e: any, els: any[]) => {
    if (e?.native?.target) {
      const i = els?.[0]?.index
      const clickable = i !== undefined && i !== null && props.hrefFor && props.hrefFor(i)
      e.native.target.style.cursor = clickable ? 'pointer' : 'default'
    }
  },
}))
</script>

<template>
  <div
    ref="wrap"
    class="hb"
    :style="{ height: `${height}px` }"
  >
    <ClientOnly>
      <Bar
        ref="barRef"
        :data="chartData"
        :options="chartOptions as any"
        :plugins="[valueLabels, stackedLabels]"
      />
      <template #fallback>
        <div
          class="hb__ph"
          aria-hidden="true"
        />
      </template>
    </ClientOnly>
  </div>
</template>

<style scoped>
.hb { position: relative; width: 100%; min-width: 480px; }
/* Compact layout draws the labels above the bars, so the floor that the wide
   layout needs for its category axis is not just unnecessary here — it is the
   thing that was forcing the page to scroll sideways. Keep in step with the
   `compact` media query in the script. */
@media (max-width: 640px) { .hb { min-width: 0; } }
.hb__ph {
  width: 100%; height: 100%; border-radius: var(--r-md);
  background: linear-gradient(90deg, var(--surface) 25%, var(--surface-sunken) 37%, var(--surface) 63%);
  background-size: 400% 100%; animation: hb-sh 1.4s ease infinite;
}
@keyframes hb-sh { 0% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }
</style>
