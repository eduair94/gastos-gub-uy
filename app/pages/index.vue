<template>
  <div>
    <!-- Page Header -->
    <div class="d-flex align-center justify-space-between mb-6">
      <div>
        <h1 class="text-h4 font-weight-bold mb-2">
          Government Transparency Dashboard
        </h1>
        <p class="text-subtitle-1 text-medium-emphasis">
          Explore Uruguay's government contract data from 2002-2024
        </p>
      </div>
      <v-btn
        color="primary"
        prepend-icon="mdi-refresh"
        :loading="isLoading"
        @click="refreshData"
      >
        Refresh Data
      </v-btn>
    </div>

    <!-- Key Metrics Cards -->
    <v-row>
      <v-col
        v-for="
          metric
            in
              keyMetrics"
        :key="metric.title"
        cols="12"
        sm="6"
        md="3"
      >
        <v-card
          class="metric-card dashboard-card"
          :color="metric.color"
          variant="tonal"
          height="140"
        >
          <v-card-text class="d-flex flex-column justify-center align-center h-100">
            <div class="metric-value text-h4 font-weight-bold mb-2">
              {{ formatMetricValue(metric.value) }}
            </div>
            <div class="metric-label text-center">
              {{ metric.title }}
            </div>
            <div
              v-if="metric.change"
              class="metric-change text-caption mt-1"
              :class="metric.change > 0 ? 'text-success' : 'text-error'"
            >
              <v-icon
                size="small"
                class="mr-1"
              >
                {{ metric.change > 0 ? 'mdi-trending-up' : 'mdi-trending-down' }}
              </v-icon>
              {{ Math.abs(metric.change).toFixed(1) }}%
            </div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <!-- Charts Row -->
    <v-row class="mb-6">
      <!-- Spending Trends Chart -->
      <v-col
        cols="12"
        lg="8"
      >
        <v-card
          class="dashboard-card"
          height="400"
        >
          <v-card-title>
            <span>Spending Trends Over Time</span>
          </v-card-title>
          <v-card-text>
            <div class="chart-container">
              <!-- Show spending trends data -->
              <ChartsSpendingChart initial-timeframe="10y" />
            </div>
          </v-card-text>
        </v-card>
      </v-col>

      <!-- Category Distribution -->
      <v-col
        cols="12"
        lg="4"
      >
        <v-card
          class="dashboard-card"
          height="400"
        >
          <v-card-title>Top Spending Categories</v-card-title>
          <v-card-text>
            <div class="chart-container">
              <!-- Show category distribution data -->
              <div v-if="topCategories.length > 0">
                <v-list>
                  <v-list-item
                    v-for="(category, index) in topCategories.slice(0, 8)"
                    :key="category.description"
                    class="px-0"
                  >
                    <template #prepend>
                      <v-avatar
                        :color="getCategoryColor(index)"
                        size="32"
                        class="mr-3"
                      >
                        <span class="text-caption font-weight-bold">
                          {{ index + 1 }}
                        </span>
                      </v-avatar>
                    </template>
                    <v-list-item-title class="font-weight-medium">
                      {{ category.description }}
                    </v-list-item-title>
                    <template #append>
                      <div class="text-right">
                        <div class="font-weight-bold">
                          {{ calculatePercentage(category.totalAmount) }}%
                        </div>
                        <div class="text-caption text-medium-emphasis">
                          {{ formatCurrency(category.totalAmount) }}
                        </div>
                      </div>
                    </template>
                  </v-list-item>
                </v-list>
              </div>
              <!-- Placeholder if no data -->
              <div
                v-else
                class="d-flex justify-center align-center h-100"
              >
                <div class="text-center">
                  <v-icon
                    size="64"
                    color="secondary"
                    class="mb-4"
                  >
                    mdi-chart-donut
                  </v-icon>
                  <div class="text-h6">
                    Loading Categories...
                  </div>
                  <div class="text-body-2 text-medium-emphasis">
                    Please wait while we fetch the data
                  </div>
                </div>
              </div>
            </div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <!-- Data Tables Row -->
    <v-row class="mb-6">
      <!-- Top Suppliers -->
      <v-col
        cols="12"
        lg="6"
      >
        <v-card class="dashboard-card">
          <v-card-title class="d-flex align-center justify-space-between">
            <span>Top Suppliers</span>
            <v-btn
              variant="text"
              size="small"
              append-icon="mdi-arrow-right"
              to="/suppliers"
            >
              View All
            </v-btn>
          </v-card-title>
          <v-card-text>
            <v-list density="compact">
              <v-list-item
                v-for="(supplier, index) in topSuppliers"
                :key="supplier.id"
                class="px-0"
              >
                <template #prepend>
                  <v-avatar
                    :color="getSupplierRankColor(index)"
                    size="32"
                    class="mr-3"
                  >
                    <span class="text-caption font-weight-bold">
                      {{ index + 1 }}
                    </span>
                  </v-avatar>
                </template>
                <v-list-item-title class="font-weight-medium">
                  {{ supplier.name }}
                </v-list-item-title>
                <v-list-item-subtitle>
                  {{ supplier.transactionCount || 0 }} contracts
                </v-list-item-subtitle>
                <template #append>
                  <div class="text-right">
                    <div class="font-weight-bold">
                      {{ formatCurrency(supplier.totalAmount || 0) }}
                    </div>
                    <div class="text-caption text-medium-emphasis">
                      Total Value
                    </div>
                  </div>
                </template>
              </v-list-item>
            </v-list>
          </v-card-text>
        </v-card>
      </v-col>

      <!-- Top Buyers -->
      <v-col
        cols="12"
        lg="6"
      >
        <v-card class="dashboard-card">
          <v-card-title class="d-flex align-center justify-space-between">
            <span>Top Government Buyers</span>
            <v-btn
              variant="text"
              size="small"
              append-icon="mdi-arrow-right"
              to="/buyers"
            >
              View All
            </v-btn>
          </v-card-title>
          <v-card-text>
            <v-list density="compact">
              <v-list-item
                v-for="(buyer, index) in topBuyers"
                :key="buyer.id"
                class="px-0"
              >
                <template #prepend>
                  <v-avatar
                    :color="getBuyerRankColor(index)"
                    size="32"
                    class="mr-3"
                  >
                    <span class="text-caption font-weight-bold">
                      {{ index + 1 }}
                    </span>
                  </v-avatar>
                </template>
                <v-list-item-title class="font-weight-medium">
                  {{ buyer.name }}
                </v-list-item-title>
                <v-list-item-subtitle>
                  {{ buyer.transactionCount || 0 }} contracts
                </v-list-item-subtitle>
                <template #append>
                  <div class="text-right">
                    <div class="font-weight-bold">
                      {{ formatCurrency(buyer.totalAmount || 0) }}
                    </div>
                    <div class="text-caption text-medium-emphasis">
                      Total Spending
                    </div>
                  </div>
                </template>
              </v-list-item>
            </v-list>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <!-- Recent Activity & Alerts -->
    <v-row>
      <!-- Recent Anomalies -->
      <v-col
        cols="12"
        lg="8"
      >
        <v-card class="dashboard-card">
          <v-card-title class="d-flex align-center justify-space-between">
            <span>Recent Anomalies</span>
            <v-btn
              variant="text"
              size="small"
              append-icon="mdi-arrow-right"
              to="/analytics/anomalies"
            >
              View All
            </v-btn>
          </v-card-title>
          <v-card-text>
            <v-list>
              <v-list-item
                v-for="anomaly in recentAnomalies"
                :key="anomaly._id"
                class="px-0"
              >
                <template #prepend>
                  <v-avatar
                    :color="getAnomalySeverityColor(anomaly.severity)"
                    size="40"
                  >
                    <v-icon color="white">
                      {{ getAnomalyIcon(anomaly.type) }}
                    </v-icon>
                  </v-avatar>
                </template>
                <v-list-item-title class="font-weight-medium">
                  {{ anomaly.description }}
                </v-list-item-title>
                <v-list-item-subtitle>
                  {{ anomaly.metadata.supplierName || anomaly.metadata.buyerName }}
                  • {{ formatDate(anomaly.createdAt) }}
                </v-list-item-subtitle>
                <template #append>
                  <v-chip
                    :color="getAnomalySeverityColor(anomaly.severity)"
                    size="small"
                    variant="tonal"
                  >
                    {{ anomaly.severity.toUpperCase() }}
                  </v-chip>
                </template>
              </v-list-item>
            </v-list>
          </v-card-text>
        </v-card>
      </v-col>

      <!-- Quick Actions -->
      <v-col
        cols="12"
        lg="4"
      >
        <v-card class="dashboard-card">
          <v-card-title>Quick Actions</v-card-title>
          <v-card-text>
            <v-list>
              <v-list-item
                v-for="action in quickActions"
                :key="action.title"
                :to="action.to"
                class="px-0"
              >
                <template #prepend>
                  <v-icon :color="action.color">
                    {{ action.icon }}
                  </v-icon>
                </template>
                <v-list-item-title>{{ action.title }}</v-list-item-title>
                <v-list-item-subtitle>{{ action.description }}</v-list-item-subtitle>
              </v-list-item>
            </v-list>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useDashboardStore } from '../stores/dashboard'

// Store and reactive state
const dashboardStore = useDashboardStore()

// Initialize dashboard data on page load
onMounted(async () => {
  await dashboardStore.initializeDashboard()
})

// Loading state
const isLoading = computed(() => dashboardStore.isLoading)

// Computed properties for real-time data
const keyMetrics = computed(() => {
  if (!dashboardStore.metrics) {
    return [
      { title: 'Total Contracts', value: 0, color: 'primary', change: 0 },
      { title: 'Total Spending', value: 0, color: 'success', change: 0 },
      { title: 'Active Suppliers', value: 0, color: 'info', change: 0 },
      { title: 'Government Buyers', value: 0, color: 'warning', change: 0 },
    ]
  }

  return [
    {
      title: 'Total Contracts',
      value: dashboardStore.metrics.totalContracts,
      color: 'primary',
      change: 8.5, // TODO: Calculate from trends data
    },
    {
      title: 'Total Spending',
      value: dashboardStore.metrics.totalSpending,
      color: 'success',
      change: dashboardStore.metrics.currentYearGrowth,
    },
    {
      title: 'Active Suppliers',
      value: dashboardStore.metrics.totalSuppliers,
      color: 'info',
      change: -2.1, // TODO: Calculate from trends data
    },
    {
      title: 'Government Buyers',
      value: dashboardStore.metrics.totalBuyers,
      color: 'warning',
      change: 0, // TODO: Calculate from trends data
    },
  ]
})

// Real data from store
const topSuppliers = computed(() => dashboardStore.topSuppliers)
const topBuyers = computed(() => dashboardStore.topBuyers)
const recentAnomalies = computed(() => dashboardStore.recentAnomalies)
const topCategories = computed(() => dashboardStore.topCategories)

// Quick actions
const quickActions = ref([
  {
    title: 'Search Contracts',
    description: 'Find specific contracts or tenders',
    icon: 'mdi-magnify',
    color: 'primary',
    to: '/contracts',
  },
  {
    title: 'Supplier Analysis',
    description: 'Analyze supplier performance',
    icon: 'mdi-domain',
    color: 'success',
    to: '/suppliers',
  },
  // {
  //   title: 'Generate Report',
  //   description: 'Create custom reports',
  //   icon: 'mdi-file-chart',
  //   color: 'info',
  //   to: '/reports',
  // },
  {
    title: 'View Anomalies',
    description: 'Check detected irregularities',
    icon: 'mdi-alert-circle',
    color: 'warning',
    to: '/analytics/anomalies',
  },
])

// Methods
const refreshData = async () => {
  await dashboardStore.refreshData()
}

const formatMetricValue = (value: number): string => {
  if (value >= 1000000000) {
    return `${(value / 1000000000).toFixed(1)}B`
  }
  else if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1)}M`
  }
  else if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}K`
  }
  return value.toString()
}

const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('es-UY', {
    style: 'currency',
    currency: 'UYU',
    minimumFractionDigits: 0,
  }).format(amount)
}

const calculatePercentage = (amount: number): string => {
  if (!dashboardStore.metrics?.totalSpending) return '0.0'
  return ((amount / dashboardStore.metrics.totalSpending) * 100).toFixed(1)
}

const formatDate = (dateString: string): string => {
  return new Intl.DateTimeFormat('es-UY', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(dateString))
}

const getSupplierRankColor = (index: number): string => {
  const colors = ['success', 'info', 'warning', 'primary', 'secondary']
  return colors[index] || 'grey'
}

const getBuyerRankColor = (index: number): string => {
  const colors = ['primary', 'success', 'info', 'warning', 'secondary']
  return colors[index] || 'grey'
}

const getCategoryColor = (index: number): string => {
  const colors = ['primary', 'success', 'info', 'warning', 'secondary', 'purple', 'teal', 'orange']
  return colors[index] || 'grey'
}

const getAnomalySeverityColor = (severity: string): string => {
  const colors = {
    critical: 'error',
    high: 'warning',
    medium: 'info',
    low: 'success',
  }
  return colors[severity as keyof typeof colors] || 'grey'
}

const getAnomalyIcon = (type: string): string => {
  const icons = {
    price_spike: 'mdi-trending-up',
    suspicious_amount: 'mdi-currency-usd',
    unusual_supplier: 'mdi-domain',
    high_frequency: 'mdi-clock-fast',
    outlier_quantity: 'mdi-package-variant',
  }
  return icons[type as keyof typeof icons] || 'mdi-alert'
}
</script>

<style scoped>
.metric-card {
  transition: all 0.3s ease;
}

.dashboard-card {
  transition: transform 0.2s ease-in-out;
}

.chart-container {
  height: 300px;
  position: relative;
}

.metric-value {
  line-height: 1;
}

.metric-label {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-weight: 500;
}

.metric-change {
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
