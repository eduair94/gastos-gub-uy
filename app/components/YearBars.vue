<script setup lang="ts">
/**
 * Spending by year, on Chart.js.
 *
 * This was hand-rolled bars + CSS at first. That was the wrong call: at
 * 24 years the axis collapsed into "010203040506…", the hover card was a
 * homemade div, and none of it adapted to a phone. Chart.js already
 * solves tick skipping, hit-testing and tooltips properly, and it is
 * already a dependency of this project — so use it.
 *
 * Renders client-side only (canvas cannot SSR); the server sends a
 * fixed-height placeholder so the page does not jump on hydration.
 */
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  Title,
  Tooltip,
} from 'chart.js'
import { Bar } from 'vue-chartjs'

ChartJS.register(Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale)

const props = withDefaults(defineProps<{
  data: { year: number, value: number, count?: number }[]
  height?: number
  /** Called when a bar is activated. Omit to render a non-interactive chart. */
  hrefFor?: (year: number) => string | undefined
}>(), { height: 180 })

const { t } = useI18n()
const router = useRouter()

// Read the live token values so the chart follows the theme (and the
// theme toggle) instead of freezing whatever was set at mount.
const theme = ref({ money: '#d9a441', text: '#64757f', rule: '#d3dade', ink: '#0f2233' })

function readTokens() {
  if (!import.meta.client) return
  const cs = getComputedStyle(document.documentElement)
  const v = (n: string, f: string) => cs.getPropertyValue(n).trim() || f
  theme.value = {
    money: v('--money-rule', '#d9a441'),
    text: v('--text-muted', '#64757f'),
    rule: v('--rule', '#d3dade'),
    ink: v('--ink', '#0f2233'),
  }
}

onMounted(() => {
  readTokens()
  const mo = new MutationObserver(readTokens)
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] })
  onBeforeUnmount(() => mo.disconnect())
})

const sorted = computed(() => [...props.data].sort((a, b) => a.year - b.year))

const chartData = computed(() => ({
  labels: sorted.value.map(d => String(d.year)),
  datasets: [{
    label: t('home.trendsTitle'),
    data: sorted.value.map(d => d.value),
    backgroundColor: theme.value.money,
    hoverBackgroundColor: theme.value.money,
    borderRadius: 3,
    borderSkipped: false,
    maxBarThickness: 44,
  }],
}))

const chartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  animation: { duration: 420, easing: 'easeOutQuart' as const },
  layout: { padding: { top: 4 } },
  plugins: {
    legend: { display: false },
    title: { display: false },
    tooltip: {
      backgroundColor: theme.value.ink,
      titleColor: theme.value.money,
      bodyColor: '#fff',
      padding: 10,
      cornerRadius: 6,
      displayColors: false,
      titleFont: { family: 'IBM Plex Mono, monospace', size: 12, weight: 700 as const },
      bodyFont: { family: 'IBM Plex Mono, monospace', size: 12 },
      callbacks: {
        title: (items: any[]) => items[0]?.label ?? '',
        label: (ctx: any) => {
          const d = sorted.value[ctx.dataIndex]
          const money = formatMoney(d?.value, 'UYU', { compact: true })
          if (!d?.count) return money
          return [money, `${formatNumber(d.count)} ${t('common.contracts').toLowerCase()}`]
        },
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
        // Chart.js drops ticks that would collide instead of letting
        // them run together, which is exactly what the hand-rolled axis
        // got wrong. autoSkip does it responsively at any width.
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
        maxTicksLimit: 5,
        padding: 6,
        callback: (v: number | string) => formatMoney(Number(v), 'UYU', { compact: true }),
      },
    },
  },
  onClick: (_e: unknown, els: any[]) => {
    const i = els?.[0]?.index
    if (i === undefined) return
    const href = props.hrefFor?.(sorted.value[i]?.year)
    if (href) router.push(href)
  },
  onHover: (e: any, els: any[]) => {
    if (e?.native?.target) e.native.target.style.cursor = els?.length && props.hrefFor ? 'pointer' : 'default'
  },
}))
</script>

<template>
  <div
    class="yb"
    :style="{ height: `${height}px` }"
  >
    <ClientOnly>
      <Bar
        :data="chartData"
        :options="chartOptions"
      />
      <template #fallback>
        <div
          class="yb__ph"
          aria-hidden="true"
        />
      </template>
    </ClientOnly>
  </div>
</template>

<style scoped>
.yb {
  position: relative;
  width: 100%;
}

.yb__ph {
  width: 100%;
  height: 100%;
  border-radius: var(--r-md);
  background: linear-gradient(90deg, var(--surface) 25%, var(--surface-sunken) 37%, var(--surface) 63%);
  background-size: 400% 100%;
  animation: yb-shimmer 1.4s ease infinite;
}

@keyframes yb-shimmer {
  0% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}
</style>
