<template>
  <div>
    <!-- Page Header -->
    <div class="d-flex align-center justify-space-between mb-6">
      <div>
        <h1 class="text-h4 font-weight-bold mb-2">
          Anomaly Detection
        </h1>
        <p class="text-subtitle-1 text-medium-emphasis">
          Automated detection of unusual patterns in government contracts
        </p>
      </div>
      <div class="d-flex gap-2">
        <v-btn
          color="primary"
          prepend-icon="mdi-refresh"
          :loading="isLoading"
          @click="refreshData"
        >
          Refresh
        </v-btn>
        <v-btn
          color="success"
          prepend-icon="mdi-download"
          variant="outlined"
          @click="exportAnomalies"
        >
          Export
        </v-btn>
      </div>
    </div>

    <!-- Summary Cards -->
    <v-row class="mb-6">
      <v-col
        v-for="stat in summaryStats"
        :key="stat.title"
        cols="12"
        sm="6"
        md="3"
      >
        <v-card
          class="metric-card"
          :color="stat.color"
          variant="tonal"
          height="120"
        >
          <v-card-text class="d-flex flex-column justify-center align-center h-100">
            <div class="metric-value text-h4 font-weight-bold mb-2">
              {{ stat.value }}
            </div>
            <div class="metric-label text-center">
              {{ stat.title }}
            </div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <!-- Filters and Search -->
    <v-card class="mb-6">
      <v-card-title>Filters</v-card-title>
      <v-card-text>
        <v-row>
          <v-col
            cols="12"
            md="3"
          >
            <v-select
              v-model="filters.severity"
              label="Severity"
              :items="severityOptions"
              clearable
              variant="outlined"
              density="compact"
            />
          </v-col>
          <v-col
            cols="12"
            md="3"
          >
            <v-select
              v-model="filters.type"
              label="Type"
              :items="typeOptions"
              clearable
              variant="outlined"
              density="compact"
            />
          </v-col>
          <v-col
            cols="12"
            md="3"
          >
            <v-select
              v-model="filters.dateRange"
              label="Date Range"
              :items="dateRangeOptions"
              variant="outlined"
              density="compact"
            />
          </v-col>
          <v-col
            cols="12"
            md="3"
          >
            <v-btn
              color="primary"
              :loading="isLoading"
              block
              @click="applyFilters"
            >
              Apply Filters
            </v-btn>
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>

    <!-- Anomalies Table -->
    <v-card>
      <v-card-title class="d-flex align-center justify-space-between">
        <span>Detected Anomalies</span>
        <div class="d-flex align-center gap-2">
          <v-chip
            v-if="totalCount > 0"
            color="primary"
            variant="tonal"
          >
            {{ totalCount }} total
          </v-chip>
        </div>
      </v-card-title>

      <v-data-table-server
        v-model:items-per-page="pagination.limit"
        v-model:page="pagination.page"
        v-model:sort-by="sortBy"
        :headers="headers"
        :items="anomalies"
        :items-length="pagination.total"
        :loading="isLoading"
        :items-per-page-options="[10, 25, 50, 100]"
        class="elevation-0"
        @update:options="updateTableOptions"
      >
        <!-- Severity Column -->
        <template #item.severity="{ item }">
          <v-chip
            :color="getSeverityColor(item.severity)"
            size="small"
            variant="tonal"
          >
            {{ item.severity.toUpperCase() }}
          </v-chip>
        </template>

        <!-- Type Column -->
        <template #item.type="{ item }">
          <div class="d-flex align-center">
            <v-icon
              :color="getTypeColor(item.type)"
              class="mr-2"
            >
              {{ getTypeIcon(item.type) }}
            </v-icon>
            {{ formatType(item.type) }}
          </div>
        </template>

        <!-- Description Column -->
        <template #item.description="{ item }">
          <div style="max-width: 300px;">
            <div class="text-body-2 font-weight-medium">
              {{ item.description }}
            </div>
            <div
              v-if="item.metadata.supplierName || item.metadata.buyerName"
              class="text-caption text-medium-emphasis mt-1"
            >
              <span v-if="item.metadata.supplierName">
                Supplier: {{ item.metadata.supplierName }}
              </span>
              <span v-if="item.metadata.buyerName">
                Buyer: {{ item.metadata.buyerName }}
              </span>
            </div>
          </div>
        </template>

        <!-- Detected Value Column -->
        <template #item.detectedValue="{ item }">
          <div class="text-right">
            <div class="font-weight-bold">
              {{ formatValue(item.detectedValue, item.type) }}
            </div>
            <div class="text-caption text-medium-emphasis">
              Range: {{ formatValue(item.expectedRange.min, item.type) }} -
              {{ formatValue(item.expectedRange.max, item.type) }}
            </div>
          </div>
        </template>

        <!-- Confidence Column -->
        <template #item.confidence="{ item }">
          <div class="d-flex align-center">
            <v-progress-linear
              :model-value="item.confidence * 100"
              :color="getConfidenceColor(item.confidence)"
              height="6"
              class="mr-2"
              style="min-width: 60px;"
            />
            <span class="text-caption">
              {{ Math.round(item.confidence * 100) }}%
            </span>
          </div>
        </template>

        <!-- Created At Column -->
        <template #item.createdAt="{ item }">
          <div class="text-body-2">
            {{ formatDate(item.createdAt) }}
          </div>
        </template>

        <!-- Actions Column -->
        <template #item.actions="{ item }">
          <div class="d-flex gap-1">
            <v-btn
              icon="mdi-eye"
              size="small"
              variant="text"
              @click="viewDetails(item)"
            />
            <v-btn
              icon="mdi-open-in-new"
              size="small"
              variant="text"
              @click="viewContract(item.releaseId)"
            />
          </div>
        </template>
      </v-data-table-server>
    </v-card>

    <!-- Anomaly Details Dialog -->
    <v-dialog
      v-model="detailsDialog"
      max-width="600"
    >
      <v-card v-if="selectedAnomaly">
        <v-card-title class="d-flex align-center">
          <v-icon
            :color="getTypeColor(selectedAnomaly.type)"
            class="mr-2"
          >
            {{ getTypeIcon(selectedAnomaly.type) }}
          </v-icon>
          {{ formatType(selectedAnomaly.type) }}
          <v-spacer />
          <v-chip
            :color="getSeverityColor(selectedAnomaly.severity)"
            size="small"
            variant="tonal"
          >
            {{ selectedAnomaly.severity.toUpperCase() }}
          </v-chip>
        </v-card-title>

        <v-card-text>
          <div class="mb-4">
            <h3 class="text-h6 mb-2">
              Description
            </h3>
            <p>{{ selectedAnomaly.description }}</p>
          </div>

          <v-row>
            <v-col cols="6">
              <div class="mb-3">
                <div class="text-caption text-medium-emphasis">
                  Detected Value
                </div>
                <div class="text-h6">
                  {{ formatValue(selectedAnomaly.detectedValue, selectedAnomaly.type) }}
                </div>
              </div>
            </v-col>
            <v-col cols="6">
              <div class="mb-3">
                <div class="text-caption text-medium-emphasis">
                  Expected Range
                </div>
                <div class="text-body-1">
                  {{ formatValue(selectedAnomaly.expectedRange.min, selectedAnomaly.type) }} -
                  {{ formatValue(selectedAnomaly.expectedRange.max, selectedAnomaly.type) }}
                </div>
              </div>
            </v-col>
          </v-row>

          <div class="mb-3">
            <div class="text-caption text-medium-emphasis">
              Confidence
            </div>
            <v-progress-linear
              :model-value="selectedAnomaly.confidence * 100"
              :color="getConfidenceColor(selectedAnomaly.confidence)"
              height="8"
              class="mt-1"
            />
            <div class="text-body-2 mt-1">
              {{ Math.round(selectedAnomaly.confidence * 100) }}% confidence
            </div>
          </div>

          <div
            v-if="selectedAnomaly.metadata"
            class="mb-3"
          >
            <h3 class="text-h6 mb-2">
              Additional Information
            </h3>
            <v-list density="compact">
              <v-list-item
                v-if="selectedAnomaly.metadata.supplierName"
                prepend-icon="mdi-domain"
              >
                <v-list-item-title>Supplier</v-list-item-title>
                <v-list-item-subtitle>{{ selectedAnomaly.metadata.supplierName }}</v-list-item-subtitle>
              </v-list-item>
              <v-list-item
                v-if="selectedAnomaly.metadata.buyerName"
                prepend-icon="mdi-account-tie"
              >
                <v-list-item-title>Buyer</v-list-item-title>
                <v-list-item-subtitle>{{ selectedAnomaly.metadata.buyerName }}</v-list-item-subtitle>
              </v-list-item>
              <v-list-item
                v-if="selectedAnomaly.metadata.itemDescription"
                prepend-icon="mdi-package-variant"
              >
                <v-list-item-title>Item</v-list-item-title>
                <v-list-item-subtitle>{{ selectedAnomaly.metadata.itemDescription }}</v-list-item-subtitle>
              </v-list-item>
              <v-list-item
                v-if="selectedAnomaly.metadata.amount"
                prepend-icon="mdi-currency-usd"
              >
                <v-list-item-title>Amount</v-list-item-title>
                <v-list-item-subtitle>{{ formatCurrency(selectedAnomaly.metadata.amount) }}</v-list-item-subtitle>
              </v-list-item>
            </v-list>
          </div>

          <div class="text-caption text-medium-emphasis">
            Detected on {{ formatDate(selectedAnomaly.createdAt) }}
          </div>
        </v-card-text>

        <v-card-actions>
          <v-spacer />
          <v-btn
            color="primary"
            variant="outlined"
            @click="viewContract(selectedAnomaly.releaseId)"
          >
            View Contract
          </v-btn>
          <v-btn
            color="primary"
            @click="detailsDialog = false"
          >
            Close
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import type { IAnomaly } from '../../../shared/types/database'

// Page metadata
definePageMeta({
  title: 'Anomaly Detection',
  description: 'View and analyze detected anomalies in government contracts',
})

// Use the anomalies composable for data management
const {
  anomalies,
  stats,
  pagination,
  isLoading,
  error,
  fetchAnomalies,
  fetchStats,
  updatePagination,
  getSeverityColor,
  getTypeColor,
  getTypeIcon,
  formatType,
  getConfidenceColor,
  formatValue,
} = useAnomalies()

// Local reactive state for UI
const detailsDialog = ref(false)
const selectedAnomaly = ref<IAnomaly | null>(null)

// Filters
const filters = ref({
  severity: null,
  type: null,
  dateRange: '30d',
})

// Sorting
const sortBy = ref([{ key: 'createdAt', order: 'desc' }])

// Options
const severityOptions = [
  { title: 'Critical', value: 'critical' },
  { title: 'High', value: 'high' },
  { title: 'Medium', value: 'medium' },
  { title: 'Low', value: 'low' },
]

const typeOptions = [
  { title: 'Price Spike', value: 'price_spike' },
  { title: 'Unusual Supplier', value: 'unusual_supplier' },
  { title: 'High Frequency', value: 'high_frequency' },
  { title: 'Suspicious Amount', value: 'suspicious_amount' },
  { title: 'Outlier Quantity', value: 'outlier_quantity' },
]

const dateRangeOptions = [
  { title: 'Last 7 days', value: '7d' },
  { title: 'Last 30 days', value: '30d' },
  { title: 'Last 90 days', value: '90d' },
  { title: 'Last year', value: '1y' },
  { title: 'All time', value: 'all' },
]

// Table headers
const headers = [
  { title: 'Severity', key: 'severity', sortable: true, width: 120 },
  { title: 'Type', key: 'type', sortable: true, width: 150 },
  { title: 'Description', key: 'description', sortable: false, width: 300 },
  { title: 'Detected Value', key: 'detectedValue', sortable: true, width: 180 },
  { title: 'Confidence', key: 'confidence', sortable: true, width: 120 },
  { title: 'Detected', key: 'createdAt', sortable: true, width: 120 },
  { title: 'Actions', key: 'actions', sortable: false, width: 100 },
]

// Computed properties
const totalCount = computed(() => pagination.value.total)

const summaryStats = computed(() => {
  if (!stats.value) {
    return [
      { title: 'Total Anomalies', value: 0, color: 'primary' },
      { title: 'Critical', value: 0, color: 'error' },
      { title: 'High Severity', value: 0, color: 'warning' },
      { title: 'Last 24h', value: 0, color: 'info' },
    ]
  }

  return [
    { title: 'Total Anomalies', value: stats.value.total, color: 'primary' },
    { title: 'Critical', value: stats.value.critical, color: 'error' },
    { title: 'High Severity', value: stats.value.high, color: 'warning' },
    { title: 'Last 24h', value: stats.value.recent, color: 'info' },
  ]
})

// Methods
const loadData = async () => {
  const filters_params = {
    page: pagination.value.page,
    limit: pagination.value.limit,
    severity: filters.value.severity,
    type: filters.value.type,
    sortBy: sortBy.value.length > 0 ? sortBy.value[0].key : 'createdAt',
    sortOrder: sortBy.value.length > 0 ? sortBy.value[0].order : 'desc',
  }
  
  await fetchAnomalies(filters_params)
}

const refreshData = async () => {
  await Promise.all([
    loadData(),
    fetchStats(),
  ])
}

const applyFilters = () => {
  updatePagination({ page: 1 })
  loadData()
}

const updateTableOptions = () => {
  loadData()
}

const viewDetails = (anomaly: IAnomaly) => {
  selectedAnomaly.value = anomaly
  detailsDialog.value = true
}

const viewContract = (releaseId: string) => {
  navigateTo(`/contracts/${releaseId}`)
}

const exportAnomalies = async () => {
  // TODO: Implement export functionality
  console.log('Export anomalies')
}

// Utility functions
const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('es-UY', {
    style: 'currency',
    currency: 'UYU',
    minimumFractionDigits: 0,
  }).format(amount)
}

const formatDate = (dateString: string): string => {
  return new Intl.DateTimeFormat('es-UY', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(dateString))
}

// Watchers
watch(() => sortBy.value, () => {
  loadData()
}, { deep: true })

watch(() => pagination.value.page, () => {
  loadData()
})

watch(() => pagination.value.limit, () => {
  updatePagination({ page: 1 })
  loadData()
})

// Initialize
onMounted(async () => {
  await refreshData()
})
</script>

<style scoped>
.metric-card {
  transition: all 0.3s ease;
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
</style>
