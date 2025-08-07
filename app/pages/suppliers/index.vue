<template>
  <div class="suppliers-explorer">
    <!-- Page Header -->
    <div class="d-flex align-center justify-space-between mb-6">
      <div>
        <h1 class="text-h4 font-weight-bold mb-2">
          Supplier Directory
        </h1>
        <p class="text-subtitle-1 text-medium-emphasis">
          Explore government suppliers, analyze their contract performance and spending patterns
        </p>
      </div>
      <div class="d-flex ga-2">
        <v-btn
          color="primary"
          prepend-icon="mdi-refresh"
          :loading="loading"
          @click="refreshData"
        >
          Refresh
        </v-btn>
        <v-btn
          color="success"
          prepend-icon="mdi-download"
          :disabled="suppliers.length === 0"
          @click="exportData"
        >
          Export
        </v-btn>
      </div>
    </div>

    <!-- Filters Section -->
    <v-card class="mb-6">
      <v-card-title class="d-flex align-center justify-space-between">
        <span>Filters & Search</span>
        <v-btn
          variant="text"
          size="small"
          @click="clearAllFilters"
        >
          Clear All
        </v-btn>
      </v-card-title>
      <v-card-text>
        <v-row>
          <!-- Search -->
          <v-col
            cols="12"
            md="4"
          >
            <v-text-field
              v-model="filters.search"
              label="Search suppliers..."
              prepend-inner-icon="mdi-magnify"
              clearable
              variant="outlined"
              density="compact"
              @keyup.enter="searchSuppliers"
              @click:clear="clearSearch"
            />
          </v-col>

          <!-- Contract Count Range -->
          <v-col
            cols="12"
            md="2"
          >
            <v-text-field
              v-model.number="filters.minContracts"
              label="Min Contracts"
              type="number"
              variant="outlined"
              density="compact"
              clearable
            />
          </v-col>
          <v-col
            cols="12"
            md="2"
          >
            <v-text-field
              v-model.number="filters.maxContracts"
              label="Max Contracts"
              type="number"
              variant="outlined"
              density="compact"
              clearable
            />
          </v-col>

          <!-- Total Value Range -->
          <v-col
            cols="12"
            md="2"
          >
            <v-text-field
              v-model.number="filters.minValue"
              label="Min Value (UYU)"
              type="number"
              variant="outlined"
              density="compact"
              clearable
            />
          </v-col>
          <v-col
            cols="12"
            md="2"
          >
            <v-text-field
              v-model.number="filters.maxValue"
              label="Max Value (UYU)"
              type="number"
              variant="outlined"
              density="compact"
              clearable
            />
          </v-col>
        </v-row>

        <v-row>
          <!-- Items per page -->
          <v-col
            cols="12"
            md="3"
          >
            <v-select
              v-model="itemsPerPage"
              label="Items per page"
              :items="[10, 25, 50, 100]"
              variant="outlined"
              density="compact"
            />
          </v-col>

          <!-- Apply Filters Button -->
          <v-col
            cols="12"
            md="3"
            class="d-flex align-top"
          >
            <v-btn
              color="primary"
              block
              :loading="loading"
              @click="applyFilters"
            >
              Apply Filters
            </v-btn>
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>

    <!-- Results Summary -->
    <div class="d-flex align-center justify-space-between mb-4">
      <div class="text-subtitle-1">
        <span v-if="pagination.total > 0">
          Showing {{ suppliers.length }} of {{ pagination.total }} suppliers
          <span v-if="pagination.totalPages > 1">
            (Page {{ pagination.page }} of {{ pagination.totalPages }})
          </span>
        </span>
        <span v-else>
          No suppliers found
        </span>
      </div>

      <v-chip
        v-if="meta.filtersApplied"
        color="primary"
        variant="tonal"
        size="small"
      >
        Filters Active
      </v-chip>
    </div>

    <!-- Data Table -->
    <v-card>
      <v-data-table-server
        v-model:items-per-page="itemsPerPage"
        v-model:page="currentPage"
        v-model:sort-by="sortBy"
        :headers="headers"
        :items="suppliers"
        :loading="loading"
        :items-length="pagination.total"
        class="elevation-1"
        @update:options="handleTableUpdate"
      >
        <!-- Supplier Name -->
        <template #item.name="{ item }">
          <div class="d-flex flex-column">
            <router-link
              :to="`/suppliers/${encodeURIComponent(item.supplierId)}`"
              class="text-decoration-none font-weight-medium text-primary"
            >
              {{ item.name }}
            </router-link>
            <div class="text-caption text-medium-emphasis">
              ID: {{ item.supplierId }}
            </div>
          </div>
        </template>

        <!-- Total Contracts -->
        <template #item.totalContracts="{ item }">
          <div class="text-center">
            <v-chip
              color="primary"
              size="small"
              variant="tonal"
            >
              {{ item.totalContracts }}
            </v-chip>
          </div>
        </template>

        <!-- Total Value -->
        <template #item.totalValue="{ item }">
          <div class="text-right">
            <div class="font-weight-bold text-success">
              {{ formatCurrency(item.totalValue) }}
            </div>
            <div class="text-caption text-medium-emphasis">
              Avg: {{ formatCurrency(item.avgContractValue) }}
            </div>
          </div>
        </template>

        <!-- Years Active -->
        <template #item.yearsActive="{ item }">
          <div class="text-center">
            <div class="font-weight-medium">
              {{ item.yearCount }} years
            </div>
            <div class="text-caption text-medium-emphasis">
              {{ Math.min(...item.years) }} - {{ Math.max(...item.years) }}
            </div>
          </div>
        </template>

        <!-- Buyers Count -->
        <template #item.buyerCount="{ item }">
          <div class="text-center">
            <v-chip
              color="info"
              size="small"
              variant="tonal"
            >
              {{ item.buyerCount }}
            </v-chip>
          </div>
        </template>

        <!-- Top Categories -->
        <template #item.topCategories="{ item }">
          <div v-if="item.topCategories && item.topCategories.length > 0">
            <v-chip
              v-for="(category, index) in item.topCategories.slice(0, 2)"
              :key="index"
              size="x-small"
              color="secondary"
              variant="tonal"
              class="mr-1 mb-1"
            >
              {{ category.category }}
            </v-chip>
            <div
              v-if="item.topCategories.length > 2"
              class="text-caption text-medium-emphasis"
            >
              +{{ item.topCategories.length - 2 }} more
            </div>
          </div>
          <span
            v-else
            class="text-medium-emphasis"
          >No categories</span>
        </template>

        <!-- Last Updated -->
        <template #item.lastUpdated="{ item }">
          <div class="text-caption">
            {{ formatDate(item.lastUpdated) }}
          </div>
        </template>

        <!-- Actions -->
        <template #item.actions="{ item }">
          <div class="d-flex ga-1">
            <v-tooltip text="View Details">
              <template #activator="{ props }">
                <v-btn
                  :to="`/suppliers/${encodeURIComponent(item.supplierId)}`"
                  icon="mdi-eye"
                  size="small"
                  variant="text"
                  v-bind="props"
                />
              </template>
            </v-tooltip>

            <v-tooltip text="View Analytics">
              <template #activator="{ props }">
                <v-btn
                  icon="mdi-chart-line"
                  size="small"
                  variant="text"
                  color="info"
                  v-bind="props"
                  @click="viewAnalytics(item)"
                />
              </template>
            </v-tooltip>

            <v-tooltip text="View Raw Data">
              <template #activator="{ props }">
                <v-btn
                  icon="mdi-code-json"
                  size="small"
                  variant="text"
                  v-bind="props"
                  @click="viewRawData(item)"
                />
              </template>
            </v-tooltip>
          </div>
        </template>

        <!-- Loading -->
        <template #loading>
          <v-skeleton-loader type="table-row@10" />
        </template>

        <!-- No data -->
        <template #no-data>
          <div class="text-center py-8">
            <v-icon
              size="64"
              color="grey-lighten-2"
              class="mb-4"
            >
              mdi-domain-outline
            </v-icon>
            <div class="text-h6 mb-2">
              No suppliers found
            </div>
            <div class="text-body-2 text-medium-emphasis">
              Try adjusting your search criteria or filters
            </div>
          </div>
        </template>
      </v-data-table-server>
    </v-card>

    <!-- Raw Data Dialog -->
    <v-dialog
      v-model="rawDataDialog"
      max-width="800px"
      scrollable
    >
      <v-card>
        <v-card-title class="d-flex align-center justify-space-between">
          <span>Supplier Raw Data</span>
          <v-btn
            icon="mdi-close"
            variant="text"
            @click="rawDataDialog = false"
          />
        </v-card-title>
        <v-card-text>
          <pre class="text-body-2">{{ JSON.stringify(selectedSupplier, null, 2) }}</pre>
        </v-card-text>
      </v-card>
    </v-dialog>

    <!-- Analytics Dialog -->
    <v-dialog
      v-model="analyticsDialog"
      max-width="1000px"
      scrollable
    >
      <v-card>
        <v-card-title class="d-flex align-center justify-space-between">
          <div>
            <span>Supplier Analytics</span>
            <div class="text-subtitle-2 text-medium-emphasis">
              {{ selectedSupplierForAnalytics?.name }}
            </div>
          </div>
          <v-btn
            icon="mdi-close"
            variant="text"
            @click="analyticsDialog = false"
          />
        </v-card-title>
        <v-card-text>
          <div v-if="selectedSupplierForAnalytics">
            <!-- Quick Stats -->
            <v-row class="mb-4">
              <v-col
                v-for="stat in quickStats"
                :key="stat.title"
                cols="6"
                md="3"
              >
                <v-card
                  :color="stat.color"
                  variant="tonal"
                  class="text-center"
                >
                  <v-card-text>
                    <div class="text-h6 font-weight-bold">
                      {{ stat.value }}
                    </div>
                    <div class="text-caption">
                      {{ stat.title }}
                    </div>
                  </v-card-text>
                </v-card>
              </v-col>
            </v-row>

            <!-- Top Categories -->
            <v-card
              v-if="selectedSupplierForAnalytics.topCategories && selectedSupplierForAnalytics.topCategories.length > 0"
              class="mb-4"
            >
              <v-card-title>Top Categories</v-card-title>
              <v-card-text>
                <v-row>
                  <v-col
                    v-for="category in selectedSupplierForAnalytics.topCategories"
                    :key="category.category"
                    cols="12"
                    md="6"
                  >
                    <div class="d-flex justify-space-between align-center mb-2">
                      <span class="font-weight-medium">{{ category.category }}</span>
                      <span class="text-success">{{ formatCurrency(category.totalAmount) }}</span>
                    </div>
                    <v-progress-linear
                      :model-value="(category.totalAmount / selectedSupplierForAnalytics.totalValue) * 100"
                      color="success"
                      height="4"
                    />
                  </v-col>
                </v-row>
              </v-card-text>
            </v-card>

            <!-- Recent Items -->
            <v-card v-if="selectedSupplierForAnalytics.items && selectedSupplierForAnalytics.items.length > 0">
              <v-card-title>Recent Contract Items</v-card-title>
              <v-card-text>
                <v-list>
                  <v-list-item
                    v-for="(item, index) in selectedSupplierForAnalytics.items.slice(0, 10)"
                    :key="index"
                  >
                    <v-list-item-title>{{ item.description }}</v-list-item-title>
                    <v-list-item-subtitle>
                      {{ item.category }} • {{ formatCurrency(item.totalAmount) }} • {{ item.contractCount }} contracts
                    </v-list-item-subtitle>
                  </v-list-item>
                </v-list>
              </v-card-text>
            </v-card>
          </div>
        </v-card-text>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'

// Types
interface ISupplier {
  supplierId: string
  name: string
  totalContracts: number
  years: number[]
  yearCount: number
  buyers: string[]
  buyerCount: number
  avgContractValue: number
  totalValue: number
  items?: Array<{
    description: string
    category: string
    totalAmount: number
    totalQuantity: number
    contractCount: number
    avgPrice: number
    currency: string
    unitName: string
    date: string
    sourceFile: string
    year: number
  }>
  topCategories?: Array<{
    category: string
    totalAmount: number
    contractCount: number
  }>
  lastUpdated: string
}

// Meta
definePageMeta({
  title: 'Supplier Directory',
  description: 'Explore government suppliers and analyze their contract performance',
})

// Reactive state
const loading = ref(false)
const suppliers = ref<ISupplier[]>([])
const pagination = ref({
  page: 1,
  limit: 25,
  total: 0,
  totalPages: 1,
})
const meta = ref({
  searchPerformed: false,
  filtersApplied: false,
  sortBy: 'totalValue',
  sortOrder: 'desc',
})

// Filters
const filters = ref({
  search: '',
  minContracts: null as number | null,
  maxContracts: null as number | null,
  minValue: null as number | null,
  maxValue: null as number | null,
})

// Table configuration
const currentPage = ref(1)
const itemsPerPage = ref(25)
const sortBy = ref([{ key: 'totalValue', order: 'desc' }])

// Dialogs
const rawDataDialog = ref(false)
const selectedSupplier = ref<ISupplier | null>(null)
const analyticsDialog = ref(false)
const selectedSupplierForAnalytics = ref<ISupplier | null>(null)

// Computed
const quickStats = computed(() => {
  if (!selectedSupplierForAnalytics.value) return []

  const supplier = selectedSupplierForAnalytics.value
  return [
    {
      title: 'Total Value',
      value: formatCurrency(supplier.totalValue),
      color: 'success',
    },
    {
      title: 'Contracts',
      value: supplier.totalContracts.toString(),
      color: 'primary',
    },
    {
      title: 'Years Active',
      value: supplier.yearCount.toString(),
      color: 'info',
    },
    {
      title: 'Buyers',
      value: supplier.buyerCount.toString(),
      color: 'warning',
    },
  ]
})

// Table headers
const headers = [
  {
    title: 'Supplier',
    key: 'name',
    sortable: true,
    width: '25%',
  },
  {
    title: 'Contracts',
    key: 'totalContracts',
    sortable: true,
    align: 'center',
    width: '10%',
  },
  {
    title: 'Total Value',
    key: 'totalValue',
    sortable: true,
    align: 'end',
    width: '15%',
  },
  {
    title: 'Years Active',
    key: 'yearsActive',
    sortable: false,
    align: 'center',
    width: '12%',
  },
  {
    title: 'Buyers',
    key: 'buyerCount',
    sortable: true,
    align: 'center',
    width: '8%',
  },
  {
    title: 'Top Categories',
    key: 'topCategories',
    sortable: false,
    width: '20%',
  },
  {
    title: 'Last Updated',
    key: 'lastUpdated',
    sortable: true,
    width: '10%',
  },
  {
    title: 'Actions',
    key: 'actions',
    sortable: false,
    width: '8%',
  },
]

// Methods
const loadSuppliers = async () => {
  loading.value = true
  try {
    const params = {
      page: currentPage.value,
      limit: itemsPerPage.value,
      sortBy: sortBy.value[0]?.key || 'totalValue',
      sortOrder: sortBy.value[0]?.order || 'desc',
      ...filters.value,
    }

    // Clean empty filters
    const cleanParams: Record<string, string> = {}
    Object.entries(params).forEach(([key, value]) => {
      if (value !== '' && value !== null && !(Array.isArray(value) && value.length === 0)) {
        cleanParams[key] = String(value)
      }
    })

    const response = await fetch('/api/suppliers?' + new URLSearchParams(cleanParams))
    const result = await response.json()

    if (result.success) {
      suppliers.value = result.data.suppliers
      pagination.value = result.data.pagination
      meta.value = {
        searchPerformed: !!filters.value.search,
        filtersApplied: !!(filters.value.minContracts || filters.value.maxContracts || filters.value.minValue || filters.value.maxValue),
        sortBy: String(cleanParams.sortBy || 'totalValue'),
        sortOrder: String(cleanParams.sortOrder || 'desc'),
      }
    }
  }
  catch (error) {
    console.error('Error loading suppliers:', error)
    suppliers.value = []
  }
  finally {
    loading.value = false
  }
}

const handleTableUpdate = (options) => {
  currentPage.value = options.page
  itemsPerPage.value = options.itemsPerPage
  sortBy.value = options.sortBy || [{ key: 'totalValue', order: 'desc' }]
  loadSuppliers()
}

const applyFilters = () => {
  currentPage.value = 1
  loadSuppliers()
}

const clearAllFilters = () => {
  filters.value = {
    search: '',
    minContracts: null,
    maxContracts: null,
    minValue: null,
    maxValue: null,
  }
  currentPage.value = 1
  loadSuppliers()
}

const clearSearch = () => {
  filters.value.search = ''
  applyFilters()
}

const searchSuppliers = () => {
  applyFilters()
}

const refreshData = () => {
  loadSuppliers()
}

const exportData = async () => {
  try {
    // TODO: Implement export functionality
    console.log('Export functionality to be implemented')
  }
  catch (error) {
    console.error('Export failed:', error)
  }
}

const viewRawData = (supplier) => {
  selectedSupplier.value = supplier
  rawDataDialog.value = true
}

const viewAnalytics = (supplier) => {
  selectedSupplierForAnalytics.value = supplier
  analyticsDialog.value = true
}

// Utility methods
const formatDate = (dateString: string): string => {
  return new Intl.DateTimeFormat('es-UY', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(dateString))
}

const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('es-UY', {
    style: 'currency',
    currency: 'UYU',
    minimumFractionDigits: 0,
  }).format(amount)
}

// Lifecycle
onMounted(() => {
  loadSuppliers()
})

// Watch for filter changes
watch(() => itemsPerPage.value, () => {
  currentPage.value = 1
  loadSuppliers()
})
</script>

<style scoped>
.suppliers-explorer {
  padding: 24px;
}

.ga-2 {
  gap: 8px;
}

pre {
  padding: 16px;
  border-radius: 4px;
  overflow-x: auto;
  white-space: pre-wrap;
  word-wrap: break-word;
}

:deep(.v-data-table-server) {
  .v-data-table__td {
    padding: 8px 16px;
  }
}

:deep(.v-chip) {
  font-size: 0.75rem;
}
</style>
