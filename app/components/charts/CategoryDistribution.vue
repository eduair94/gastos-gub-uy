<template>
  <div class="category-chart">
    <canvas ref="chartCanvas" />
  </div>
</template>

<script setup lang="ts">
import {
  ArcElement,
  Chart as ChartJS,
  Legend,
  Tooltip,
} from 'chart.js'

ChartJS.register(ArcElement, Tooltip, Legend)

interface Props {
  data: Array<{
    category: string
    totalAmount: number
    percentage: number
  }>
}

const props = defineProps<Props>()
const chartCanvas = ref<HTMLCanvasElement>()
let chartInstance: ChartJS | null = null

const createChart = () => {
  if (!chartCanvas.value || !props.data.length) return

  const ctx = chartCanvas.value.getContext('2d')
  if (!ctx) return

  if (chartInstance) {
    chartInstance.destroy()
  }

  const colors = [
    '#1976D2',
    '#388E3C',
    '#F57C00',
    '#7B1FA2',
    '#C2185B',
    '#0097A7',
    '#5D4037',
    '#616161',
  ]

  chartInstance = new ChartJS(ctx, {
    type: 'doughnut',
    data: {
      labels: props.data.map(item => item.category),
      datasets: [
        {
          data: props.data.map(item => item.totalAmount),
          backgroundColor: colors,
          borderWidth: 2,
          borderColor: '#fff',
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            boxWidth: 12,
            padding: 15,
            usePointStyle: true,
          },
        },
        tooltip: {
          callbacks: {
            label: (context) => {
              const item = props.data[context.dataIndex]
              return `${item.category}: ${item.percentage.toFixed(1)}%`
            },
          },
        },
      },
    },
  })
}

watch(() => props.data, createChart, { deep: true })

onMounted(() => {
  nextTick(() => {
    createChart()
  })
})

onUnmounted(() => {
  if (chartInstance) {
    chartInstance.destroy()
  }
})
</script>

<style scoped>
.category-chart {
  position: relative;
  height: 300px;
  width: 100%;
}
</style>
