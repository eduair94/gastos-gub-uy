<script setup lang="ts">
/**
 * Unit-price dispersion: one horizontal floating bar per {currency, unitName}
 * spanning p25 → p95, with a gold marker at the median (p50). Shows how widely
 * what the state pays for one catalogue code varies — the spread an anomaly sits
 * in. Chart.js, client-only, theme-token-aware (scaffolding copied from InvHBars).
 */
import {
  BarController,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  LinearScale,
  PointElement,
  ScatterController,
  Tooltip,
} from 'chart.js'
import { Chart } from 'vue-chartjs'

ChartJS.register(BarController, BarElement, ScatterController, PointElement, CategoryScale, LinearScale, Tooltip)

interface Unit { currency: string, unitName?: string, p25: number, p50: number, p95: number, n: number }
const props = defineProps<{ units: Unit[] }>()

const theme = ref({ celeste: '#3f74a6', gold: '#c69528', text: '#12212e', muted: '#576673', rule: '#d6dde2', surface: '#ffffff' })
function readTokens() {
  if (!import.meta.client) return
  const cs = getComputedStyle(document.documentElement)
  const v = (n: string, f: string) => cs.getPropertyValue(n).trim() || f
  theme.value = {
    celeste: v('--celeste', '#3f74a6'),
    gold: v('--money-rule', '#c69528'),
    text: v('--text', '#12212e'),
    muted: v('--text-muted', '#576673'),
    rule: v('--rule', '#d6dde2'),
    surface: v('--surface', '#ffffff'),
  }
}
onMounted(() => {
  readTokens()
  const mo = new MutationObserver(readTokens)
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] })
  onBeforeUnmount(() => mo.disconnect())
})

const rows = computed(() => props.units.filter(u => u.n >= 5 && u.p95 > 0))
const labels = computed(() => rows.value.map(u => [u.currency, u.unitName].filter(Boolean).join(' · ')))
const height = computed(() => Math.max(120, rows.value.length * 44 + 40))

function fmt(v: number, cur: string): string {
  return formatMoney(v, cur, { compact: true })
}

const chartData = computed(() => ({
  labels: labels.value,
  datasets: [
    {
      type: 'bar' as const,
      label: 'p25–p95',
      data: rows.value.map(u => [u.p25, u.p95] as [number, number]),
      backgroundColor: theme.value.celeste + '55',
      borderColor: theme.value.celeste,
      borderWidth: 1,
      borderSkipped: false,
      borderRadius: 3,
      barThickness: 14,
    },
    {
      type: 'scatter' as const,
      label: 'mediana',
      data: rows.value.map((u, i) => ({ x: u.p50, y: labels.value[i]! })),
      backgroundColor: theme.value.gold,
      borderColor: theme.value.surface,
      borderWidth: 1,
      pointRadius: 5,
      pointHoverRadius: 6,
    },
  ],
}))

const options = computed(() => ({
  indexAxis: 'y' as const,
  responsive: true,
  maintainAspectRatio: false,
  scales: {
    x: {
      beginAtZero: true,
      grid: { color: theme.value.rule },
      ticks: { color: theme.value.muted, callback: (v: any) => fmt(Number(v), rows.value[0]?.currency ?? 'UYU') },
    },
    y: { type: 'category' as const, grid: { display: false }, ticks: { color: theme.value.text } },
  },
  plugins: {
    legend: { display: false },
    tooltip: {
      callbacks: {
        label: (ctx: any) => {
          const u = rows.value[ctx.dataIndex]
          if (!u) return ''
          if (ctx.dataset.type === 'scatter') return `mediana ${fmt(u.p50, u.currency)}`
          return `p25 ${fmt(u.p25, u.currency)} · p95 ${fmt(u.p95, u.currency)} (n=${u.n})`
        },
      },
    },
  },
}))
</script>

<template>
  <div :style="{ height: height + 'px' }">
    <Chart
      type="bar"
      :data="chartData"
      :options="options"
    />
  </div>
</template>
