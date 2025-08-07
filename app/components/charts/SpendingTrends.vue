<template>
  <div class="spending-trends-chart">
    <canvas ref="chartCanvas" />
  </div>
</template>

<script setup lang="ts">
import {
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  TimeScale,
  Title,
  Tooltip,
} from 'chart.js'
import 'chartjs-adapter-date-fns'

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  TimeScale,
)

interface Props {
  data: Array<{
    date: string
    value: number
    count?: number
  }>
  timeframe?: string
}

const props = withDefaults(defineProps<Props>(), {
  timeframe: 'all',
})

const chartCanvas = ref<HTMLCanvasElement>()
let chartInstance: ChartJS | null = null

const formatCurrency = (value: number): string => {
  if (value >= 1000000000) {
    return `$${(value / 1000000000).toFixed(1)}B`
  }
  else if (value >= 1000000) {
    return `$${(value / 1000000).toFixed(1)}M`
  }
  else if (value >= 1000) {
    return `$${(value / 1000).toFixed(1)}K`
  }
  return `$${value.toLocaleString()}`
}

const createChart = () => {
  if (!chartCanvas.value || !props.data.length) return

  // Filter data based on timeframe
  let filteredData = props.data
  if (props.timeframe !== 'all') {
    const yearsToShow = props.timeframe === '5y' ? 5 : 10
    const cutoffYear = new Date().getFullYear() - yearsToShow
    filteredData = props.data.filter((item) => {
      const year = new Date(item.date).getFullYear()
      return year >= cutoffYear
    })
  }

  // Sort data by date
  filteredData.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  const ctx = chartCanvas.value.getContext('2d')
  if (!ctx) return

  // Destroy existing chart
  if (chartInstance) {
    chartInstance.destroy()
  }

  chartInstance = new ChartJS(ctx, {
    type: 'line',
    data: {
      labels: filteredData.map(item => item.date),
      datasets: [
        {
          label: 'Government Spending',
          data: filteredData.map(item => item.value),
          borderColor: 'rgb(76, 175, 80)',
          backgroundColor: 'rgba(76, 175, 80, 0.1)',
          borderWidth: 3,
          fill: true,
          tension: 0.4,
          pointBackgroundColor: 'rgb(76, 175, 80)',
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
          pointRadius: 6,
          pointHoverRadius: 8,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        title: {
          display: false,
        },
        legend: {
          display: false,
        },
        tooltip: {
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          titleColor: '#fff',
          bodyColor: '#fff',
          borderColor: 'rgba(76, 175, 80, 0.8)',
          borderWidth: 1,
          callbacks: {
            label: (context) => {
              const dataPoint = filteredData[context.dataIndex]
              return [
                `Amount: ${formatCurrency(context.parsed.y)}`,
                `Contracts: ${dataPoint.count?.toLocaleString() || 'N/A'}`,
              ]
            },
          },
        },
      },
      scales: {
        x: {
          type: 'time',
          time: {
            unit: 'year',
            displayFormats: {
              year: 'yyyy',
            },
          },
          grid: {
            display: false,
          },
          ticks: {
            color: '#666',
          },
        },
        y: {
          beginAtZero: true,
          grid: {
            color: 'rgba(0, 0, 0, 0.1)',
          },
          ticks: {
            color: '#666',
            callback: value => formatCurrency(Number(value)),
          },
        },
      },
      interaction: {
        intersect: false,
        mode: 'index',
      },
    },
  })
}

// Watch for data changes
watch(() => [props.data, props.timeframe], createChart, { deep: true })

// Create chart on mount
onMounted(() => {
  nextTick(() => {
    createChart()
  })
})

// Cleanup on unmount
onUnmounted(() => {
  if (chartInstance) {
    chartInstance.destroy()
  }
})
</script>

<style scoped>
.spending-trends-chart {
  position: relative;
  height: 300px;
  width: 100%;
}
</style>
