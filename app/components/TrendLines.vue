<script setup lang="ts">
/**
 * Multi-series year lines — the "same money, four lenses" chart.
 *
 * <YearBars> already plots one yearly figure; this plots SEVERAL against the
 * same axis, which is the whole point of the spending-evolution page: nominal
 * and real pesos side by side is what shows how much of a rise is inflation.
 * Kept separate from YearBars rather than bolted onto it — bars answer "how big
 * was each year", lines answer "how did the years move relative to each other",
 * and merging them would mean a props object that is really two components.
 *
 * A `dashed` series reads as "not the headline number" (the as-reported series,
 * which still contains the artefacts). Client-only: canvas cannot SSR, and the
 * placeholder keeps the same height so hydration does not shift the page.
 */
import {
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js'
import { Line } from 'vue-chartjs'

ChartJS.register(LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend, Filler)

export interface TrendSeries {
  label: string
  values: (number | null)[]
  /** Token name without the leading dashes, e.g. `celeste-deep`. */
  colorVar: string
  fallback: string
  /** Renders dashed — used for the unsanitised "as reported" series. */
  dashed?: boolean
}

const props = withDefaults(defineProps<{
  labels: string[]
  series: TrendSeries[]
  /** How to format the axis and tooltip values. */
  format?: 'money' | 'usd' | 'pct' | 'count'
  height?: number
  /** Index of a year to mark as incomplete (drawn hollow). */
  partialIndex?: number | null
}>(), { format: 'money', height: 300, partialIndex: null })

const { t } = useI18n()

function fmt(v?: number | null): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—'
  if (props.format === 'pct') return `${(v * 100).toFixed(2).replace('.', ',')}%`
  if (props.format === 'count') return formatCount(v)
  if (props.format === 'usd') return formatMoney(v, 'USD', { compact: true })
  return formatMoney(v, 'UYU', { compact: true })
}

// Read live token values so the chart follows the theme toggle instead of
// freezing whatever was set at mount (same approach as YearBars/InvHBars).
const theme = ref<Record<string, string>>({ text: '#64757f', rule: '#d3dade', ink: '#0f2233', surface: '#ffffff' })
function readTokens() {
  if (!import.meta.client) return
  const cs = getComputedStyle(document.documentElement)
  const v = (n: string, f: string) => cs.getPropertyValue(n).trim() || f
  const next: Record<string, string> = {
    text: v('--text-muted', '#64757f'),
    rule: v('--rule', '#d3dade'),
    ink: v('--ink', '#0f2233'),
    surface: v('--surface', '#ffffff'),
  }
  for (const s of props.series) next[s.colorVar] = v(`--${s.colorVar}`, s.fallback)
  theme.value = next
}

onMounted(() => {
  readTokens()
  const mo = new MutationObserver(readTokens)
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] })
  onBeforeUnmount(() => mo.disconnect())
})

// Chart.js defers a resize while its entry animation runs, so a viewport change
// in those first frames leaves the canvas at its old width. Re-measure explicitly.
const wrap = ref<HTMLElement | null>(null)
const lineRef = ref<any>(null)
let ro: ResizeObserver | undefined
onMounted(() => {
  if (!wrap.value || typeof ResizeObserver === 'undefined') return
  ro = new ResizeObserver(() => lineRef.value?.chart?.resize())
  ro.observe(wrap.value)
})
onBeforeUnmount(() => ro?.disconnect())

const chartData = computed(() => ({
  labels: props.labels,
  datasets: props.series.map(s => ({
    label: s.label,
    data: s.values,
    borderColor: theme.value[s.colorVar] ?? s.fallback,
    backgroundColor: theme.value[s.colorVar] ?? s.fallback,
    borderWidth: s.dashed ? 1.5 : 2.5,
    borderDash: s.dashed ? [5, 4] : [],
    tension: 0.25,
    pointRadius: (ctx: any) => (ctx.dataIndex === props.partialIndex ? 4 : 2.5),
    pointStyle: (ctx: any) => (ctx.dataIndex === props.partialIndex ? 'crossRot' : 'circle'),
    pointHoverRadius: 5,
    spanGaps: true,
  })),
}))

const chartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: 'index' as const, intersect: false },
  animation: { duration: 420, easing: 'easeOutQuart' as const },
  plugins: {
    legend: {
      display: props.series.length > 1,
      position: 'top' as const,
      align: 'start' as const,
      labels: {
        boxWidth: 10,
        boxHeight: 10,
        usePointStyle: true,
        pointStyle: 'line',
        color: theme.value.text,
        font: { family: 'IBM Plex Mono, monospace', size: 11 },
      },
    },
    tooltip: {
      backgroundColor: theme.value.ink,
      titleColor: '#fff',
      bodyColor: '#fff',
      padding: 10,
      cornerRadius: 6,
      titleFont: { family: 'IBM Plex Mono, monospace', size: 12, weight: 700 as const },
      bodyFont: { family: 'IBM Plex Mono, monospace', size: 12 },
      callbacks: {
        title: (items: any[]) => {
          const label = items[0]?.label ?? ''
          return items[0]?.dataIndex === props.partialIndex ? `${label} · ${t('evolucion.partialShort')}` : label
        },
        label: (ctx: any) => `${ctx.dataset.label}: ${fmt(ctx.parsed.y)}`,
      },
    },
  },
  scales: {
    x: {
      grid: { display: false },
      border: { color: theme.value.rule },
      ticks: {
        color: theme.value.text,
        font: { family: 'IBM Plex Mono, monospace', size: 11 },
        autoSkip: true,
        maxRotation: 0,
        minRotation: 0,
        autoSkipPadding: 12,
      },
    },
    y: {
      beginAtZero: true,
      border: { display: false },
      grid: { color: theme.value.rule, drawTicks: false },
      ticks: {
        color: theme.value.text,
        font: { family: 'IBM Plex Mono, monospace', size: 11 },
        maxTicksLimit: 6,
        padding: 6,
        callback: (v: number | string) => fmt(Number(v)),
      },
    },
  },
}))
</script>

<template>
  <div
    ref="wrap"
    class="tl"
    :style="{ height: `${height}px` }"
  >
    <ClientOnly>
      <Line
        ref="lineRef"
        :data="chartData"
        :options="chartOptions"
      />
      <template #fallback>
        <div
          class="tl__ph"
          aria-hidden="true"
        />
      </template>
    </ClientOnly>
  </div>
</template>

<style scoped>
.tl { position: relative; width: 100%; min-width: 0; }
.tl__ph {
  width: 100%;
  height: 100%;
  border-radius: var(--r-md);
  background: var(--surface-sunken);
}
</style>
