<template>
  <div class="spending-trends-chart">
    <!-- Timeframe selector -->
    <div class="d-flex justify-end mb-4">
      <v-btn-group
        v-model="selectedTimeframe"
        mandatory
        density="compact"
        variant="outlined"
      >
        <v-btn
          value="5y"
          size="small"
          @click="updateTimeframe('5y')"
        >
          5Y
        </v-btn>
        <v-btn
          value="10y"
          size="small"
          @click="updateTimeframe('10y')"
        >
          10Y
        </v-btn>
        <v-btn
          value="all"
          size="small"
          @click="updateTimeframe('all')"
        >
          All
        </v-btn>
      </v-btn-group>
    </div>

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
import { computed, ref, watch } from 'vue'
import { Line } from 'vue-chartjs'
import { useDashboardStore } from '../../stores/dashboard'

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
interface Props {
  initialTimeframe?: string
}

const props = withDefaults(defineProps<Props>(), {
  initialTimeframe: '10y',
})

// Store and reactive state
const dashboardStore = useDashboardStore()
const selectedTimeframe = ref(props.initialTimeframe)

// Get trends from store
const spendingTrends = computed(() => dashboardStore.spendingTrends)

const getLastYear = () => {
  if (!spendingTrends.value || !spendingTrends.value.length) return new Date().getFullYear()
  return parseInt((spendingTrends.value as any).at(-1).date.split('-')[0])
}

// Filtered trends based on timeframe
const filteredTrends = computed(() => {
  if (!spendingTrends.value || spendingTrends.value.length === 0) return []

  console.log('All spending trends:', spendingTrends.value)

  if (selectedTimeframe.value === 'all') return spendingTrends.value

  const yearsToShow = selectedTimeframe.value === '5y' ? 5 : 10
  const lastAvailableYear = getLastYear()
  const cutoffYear = lastAvailableYear - yearsToShow + 1

  console.log(`Filtering for ${yearsToShow} years, from ${cutoffYear} to ${lastAvailableYear}`)

  const filtered = spendingTrends.value.filter((trend) => {
    const year = new Date(trend.date).getFullYear() + 1 // Adjust to next year for display
    const inRange = year >= cutoffYear && year <= lastAvailableYear
    console.log(`Trend date: ${trend.date}, year: ${year}, in range: ${inRange}`)
    return inRange
  }).slice(-yearsToShow)

  console.log('Filtered trends:', filtered)
  return filtered
})

// Method to update timeframe and fetch new data
const updateTimeframe = async (timeframe: string) => {
  selectedTimeframe.value = timeframe

  // Calculate years array based on timeframe
  let years: number[] | undefined

  if (timeframe !== 'all') {
    const lastAvailableYear = getLastYear() // Data goes up to current year
    const yearsCount = timeframe === '5y' ? 5 : 10
    years = Array.from({ length: yearsCount }, (_, i) => lastAvailableYear - yearsCount + 1 + i)
  }

  // Fetch filtered data from API
  await dashboardStore.fetchSpendingTrends({
    years,
    groupBy: 'year',
  })
}

// Watch for initial load to fetch data
watch(() => selectedTimeframe.value, (newTimeframe) => {
  if (spendingTrends.value.length === 0) {
    updateTimeframe(newTimeframe)
  }
}, { immediate: true })

// Chart data computation
const chartData = computed(() => {
  const trends = filteredTrends.value

  if (!trends || trends.length === 0) {
    return null
  }

  console.log('Raw trends data:', trends)

  const labels = trends.map((trend) => {
    const year = new Date(trend.date).getFullYear() + 1
    console.log(`Date: ${trend.date}, Parsed Year: ${year}`)
    return year.toString()
  })

  console.log('Chart labels:', labels)

  const spendingData = trends.map(trend => trend.value / 1000000) // Convert to millions
  const contractData = trends.map(trend => trend.count || 0)

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
