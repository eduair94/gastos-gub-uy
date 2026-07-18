<script setup lang="ts">
/**
 * Horizontal ranked bars — suppliers, rubros, procurement methods. One bar per item,
 * its own colour, a value label at the bar end. Chart.js, client-only, theme-aware.
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
  format?: 'moneyM' | 'count'
  /** Bar height per row, drives the canvas height. */
  rowHeight?: number
}>(), { format: 'moneyM', rowHeight: 34 })

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
onMounted(() => {
  readTokens()
  const mo = new MutationObserver(readTokens)
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] })
  onBeforeUnmount(() => mo.disconnect())
})

const height = computed(() => Math.max(120, props.items.length * props.rowHeight + 16))

function fmtVal(v: number): string {
  return props.format === 'count' ? formatNumber(v) : `$ ${(v / 1e6).toFixed(1).replace('.', ',')} M`
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

// Inline plugin: draw the formatted value at the end of each bar.
const valueLabels = {
  id: 'valueLabels',
  afterDatasetsDraw(chart: any) {
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
  layout: { padding: { right: 64 } },
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
      grid: { display: false },
      border: { color: theme.value.rule },
      ticks: {
        color: theme.value.text,
        font: { family: 'IBM Plex Mono, monospace', size: 11.5 },
        crossAlign: 'far' as const,
      },
    },
  },
}))
</script>

<template>
  <div
    class="hb"
    :style="{ height: `${height}px` }"
  >
    <ClientOnly>
      <Bar
        :data="chartData"
        :options="chartOptions as any"
        :plugins="[valueLabels]"
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
.hb__ph {
  width: 100%; height: 100%; border-radius: var(--r-md);
  background: linear-gradient(90deg, var(--surface) 25%, var(--surface-sunken) 37%, var(--surface) 63%);
  background-size: 400% 100%; animation: hb-sh 1.4s ease infinite;
}
@keyframes hb-sh { 0% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }
</style>
