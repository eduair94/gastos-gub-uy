<template>
  <div class="spending-trends-chart">
    <div
      v-if="chartData && chartData.datasets.length > 0"
      class="chart-wrapper"
    >
      <Line
        :data="chartData"
        :options="chartOptions"
        :height="300"
      />
    </div>
    <div
      v-else
      class="d-flex justify-center align-center"
      style="height: 300px;"
    >
      <div class="text-center">
        <v-icon
          size="64"
          color="primary"
          class="mb-4"
        >
          mdi-chart-line
        </v-icon>
        <div class="text-h6">
          Loading Spending Trends...
        </div>
        <div class="text-body-2 text-medium-emphasis">
          Please wait while we fetch the data
        </div>
      </div>
    </div>
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
  Title,
  Tooltip,
} from 'chart.js'
import { computed } from 'vue'
import { Line } from 'vue-chartjs'

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
)

// Props
interface SpendingTrend {
  date: string
  value: number
  count?: number
}

interface Props {
  trends: SpendingTrend[]
  timeframe: string
}

const props = withDefaults(defineProps<Props>(), {
  trends: () => [],
  timeframe: '10y',
})

// Chart data computation
const chartData = computed(() => {
  if (!props.trends || props.trends.length === 0) {
    return null
  }

  const labels = props.trends.map(trend => new Date(trend.date).getFullYear().toString())
  const spendingData = props.trends.map(trend => trend.value / 1000000) // Convert to millions
  const contractData = props.trends.map(trend => trend.count || 0)

  return {
    labels,
    datasets: [
      {
        label: 'Total Spending (Millions UYU)',
        data: spendingData,
        borderColor: 'rgb(76, 175, 80)',
        backgroundColor: 'rgba(76, 175, 80, 0.1)',
        fill: true,
        tension: 0.4,
        pointBackgroundColor: 'rgb(76, 175, 80)',
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        pointRadius: 6,
        pointHoverRadius: 8,
        yAxisID: 'y',
      },
      {
        label: 'Number of Contracts',
        data: contractData,
        borderColor: 'rgb(33, 150, 243)',
        backgroundColor: 'rgba(33, 150, 243, 0.1)',
        fill: false,
        tension: 0.4,
        pointBackgroundColor: 'rgb(33, 150, 243)',
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6,
        yAxisID: 'y1',
      },
    ],
  }
})

// Chart options
const chartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  interaction: {
    mode: 'index' as const,
    intersect: false,
  },
  plugins: {
    title: {
      display: false,
    },
    legend: {
      display: true,
      position: 'top' as const,
      labels: {
        usePointStyle: true,
        padding: 20,
        font: {
          size: 12,
          weight: 'bold' as const,
        },
      },
    },
    tooltip: {
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      titleColor: '#fff',
      bodyColor: '#fff',
      borderColor: 'rgba(255, 255, 255, 0.1)',
      borderWidth: 1,
      cornerRadius: 8,
      displayColors: true,
      callbacks: {
        title: (context: any[]) => {
          return `Year ${context[0].label}`
        },
        label: (context: any) => {
          const datasetLabel = context.dataset.label
          const value = context.parsed.y

          if (datasetLabel.includes('Spending')) {
            return `${datasetLabel}: ${new Intl.NumberFormat('es-UY', {
              style: 'currency',
              currency: 'UYU',
              minimumFractionDigits: 0,
            }).format(value * 1000000)}`
          }
          else {
            return `${datasetLabel}: ${value.toLocaleString()}`
          }
        },
      },
    },
  },
  scales: {
    x: {
      display: true,
      title: {
        display: true,
        text: 'Year',
        font: {
          size: 14,
          weight: 'bold' as const,
        },
      },
      grid: {
        display: false,
      },
    },
    y: {
      type: 'linear' as const,
      display: true,
      position: 'left' as const,
      title: {
        display: true,
        text: 'Spending (Millions UYU)',
        color: 'rgb(76, 175, 80)',
        font: {
          size: 12,
          weight: 'bold' as const,
        },
      },
      grid: {
        color: 'rgba(0, 0, 0, 0.1)',
        drawBorder: false,
      },
      ticks: {
        callback: (value: number | string) => {
          return `${Number(value).toLocaleString()}M`
        },
        color: 'rgb(76, 175, 80)',
        font: {
          size: 11,
        },
      },
    },
    y1: {
      type: 'linear' as const,
      display: true,
      position: 'right' as const,
      title: {
        display: true,
        text: 'Number of Contracts',
        color: 'rgb(33, 150, 243)',
        font: {
          size: 12,
          weight: 'bold' as const,
        },
      },
      grid: {
        drawOnChartArea: false,
      },
      ticks: {
        callback: (value: number | string) => {
          return Number(value).toLocaleString()
        },
        color: 'rgb(33, 150, 243)',
        font: {
          size: 11,
        },
      },
    },
  },
  elements: {
    point: {
      hoverBorderWidth: 3,
    },
    line: {
      borderWidth: 3,
    },
  },
}))
</script>

<style scoped>
.spending-trends-chart {
  height: 100%;
  width: 100%;
}

.chart-wrapper {
  height: 300px;
  position: relative;
}
</style>
