<script setup lang="ts">
/**
 * Unit-price dispersion for a catalogue code: one dot per contract, plus a median
 * reference line. Highlighted points (a supplier billing a flat premium) render red.
 * Chart.js, client-only (canvas can't SSR), theme-token aware like YearBars.
 */
import {
  Chart as ChartJS,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  ScatterController,
  Tooltip,
} from 'chart.js'
import { Scatter } from 'vue-chartjs'

// Register controllers, not just elements: the median is a `type: 'line'` dataset
// (LineController) and the dots are `type: 'scatter'` (ScatterController). Missing
// LineController throws `"line" is not a registered controller` at chart init and
// takes the whole page to Nuxt's 500 — masked in dev by module-load order.
ChartJS.register(ScatterController, LineController, PointElement, LineElement, LinearScale, Tooltip, Legend)

const props = withDefaults(defineProps<{
  /** Each point: x (unix ms), y (unit price), label (supplier), hi (highlight) */
  points: { x: number, y: number, label: string, qty: number, tot: number, hi?: boolean }[]
  median: number
  yMax: number
  height?: number
  medianLabel?: string
  unitLabel?: string
}>(), { height: 380, medianLabel: 'mediana', unitLabel: 'unidad' })

const { t } = useI18n()

const theme = ref({ gold: '#c69528', red: '#b2423b', celeste: '#3f74a6', text: '#576673', rule: '#d6dde2', ink: '#0f1f2e', surface: '#ffffff' })
function readTokens() {
  if (!import.meta.client) return
  const cs = getComputedStyle(document.documentElement)
  const v = (n: string, f: string) => cs.getPropertyValue(n).trim() || f
  theme.value = {
    gold: v('--money-rule', '#c69528'),
    red: v('--alerta', '#b2423b'),
    celeste: v('--celeste', '#3f74a6'),
    text: v('--text-muted', '#576673'),
    rule: v('--rule', '#d6dde2'),
    ink: v('--ink', '#0f1f2e'),
    surface: v('--surface', '#ffffff'),
  }
}
onMounted(() => {
  readTokens()
  const mo = new MutationObserver(readTokens)
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] })
  onBeforeUnmount(() => mo.disconnect())
})

const xMin = computed(() => Math.min(...props.points.map(p => p.x)))
const xMax = computed(() => Math.max(...props.points.map(p => p.x)))

const chartData = computed(() => ({
  datasets: [
    {
      type: 'line' as const,
      label: props.medianLabel,
      data: [{ x: xMin.value, y: props.median }, { x: xMax.value, y: props.median }],
      borderColor: theme.value.celeste,
      borderWidth: 1.4,
      borderDash: [5, 4],
      pointRadius: 0,
      fill: false,
    },
    {
      type: 'scatter' as const,
      label: 'contracts',
      data: props.points.map(p => ({ x: p.x, y: Math.min(p.y, props.yMax), _p: p })),
      pointBackgroundColor: props.points.map(p => p.hi ? theme.value.red : theme.value.gold),
      pointBorderColor: theme.value.surface,
      pointBorderWidth: 1.5,
      pointRadius: props.points.map(p => p.hi ? 6 : 5),
      pointHoverRadius: props.points.map(p => p.hi ? 8 : 7),
    },
  ],
}))

const fmt = (v: number) => formatMoney(v, 'UYU', { compact: true })

const chartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
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
      filter: (item: any) => item.datasetIndex === 1,
      callbacks: {
        title: (items: any[]) => items[0]?.raw?._p?.label ?? '',
        label: (ctx: any) => {
          const p = ctx.raw?._p
          if (!p) return ''
          const d = new Date(p.x)
          const dt = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
          return [`${fmt(p.y)} / ${props.unitLabel}`, `${dt} · ${t('common.quantity')} ${p.qty}`, `${t('common.total')} ${fmt(p.tot)}`]
        },
      },
    },
  },
  scales: {
    x: {
      type: 'linear' as const,
      min: xMin.value,
      max: xMax.value,
      grid: { color: theme.value.rule, drawTicks: false },
      border: { color: theme.value.rule },
      ticks: {
        color: theme.value.text,
        font: { family: 'IBM Plex Mono, monospace', size: 11 },
        maxTicksLimit: 7,
        callback: (v: number | string) => new Date(Number(v)).getUTCFullYear(),
      },
    },
    y: {
      beginAtZero: true,
      max: props.yMax,
      grid: { color: theme.value.rule, drawTicks: false },
      border: { display: false },
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
    class="sc"
    :style="{ height: `${height}px` }"
  >
    <ClientOnly>
      <Scatter
        :data="chartData as any"
        :options="chartOptions as any"
      />
      <template #fallback>
        <div
          class="sc__ph"
          aria-hidden="true"
        />
      </template>
    </ClientOnly>
  </div>
</template>

<style scoped>
.sc { position: relative; width: 100%; min-width: 560px; }
.sc__ph {
  width: 100%; height: 100%; border-radius: var(--r-md);
  background: linear-gradient(90deg, var(--surface) 25%, var(--surface-sunken) 37%, var(--surface) 63%);
  background-size: 400% 100%; animation: sc-sh 1.4s ease infinite;
}
@keyframes sc-sh { 0% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }
</style>
