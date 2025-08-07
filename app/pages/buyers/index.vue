<template>
  <div class="buyers-explorer">
    <!-- Page Header -->
    <div class="d-flex align-center justify-space-between mb-6">
      <div>
        <h1 class="text-h4 font-weight-bold mb-2">
          Government Buyers Directory
        </h1>
        <p class="text-subtitle-1 text-medium-emphasis">
          Explore government agencies and entities, analyze their procurement activities and spending patterns
        </p>
      </div>
      <div class="d-flex gap-2">
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
          :disabled="buyers.length === 0"
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
              label="Search government buyers..."
              prepend-inner-icon="mdi-magnify"
              clearable
              variant="outlined"
              density="compact"
              @keyup.enter="searchBuyers"
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

          <!-- Total Spending Range -->
          <v-col
            cols="12"
            md="2"
          >
            <v-text-field
              v-model.number="filters.minSpending"
              label="Min Spending (UYU)"
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
              v-model.number="filters.maxSpending"
              label="Max Spending (UYU)"
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
          Showing {{ buyers.length }} of {{ pagination.total }} buyers
          <span v-if="pagination.totalPages > 1">
            (Page {{ pagination.page }} of {{ pagination.totalPages }})
          </span>
        </span>
        <span v-else>
          No buyers found
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
        :items="buyers"
        :loading="loading"
        :items-length="pagination.total"
        class="elevation-1"
        @update:options="handleTableUpdate"
      >
        <!-- Buyer Name -->
        <template #[`item.name`]="{ item }">
          <div class="d-flex flex-column">
            <router-link
              :to="`/buyers/${encodeURIComponent(item.buyerId)}`"
              class="text-decoration-none font-weight-medium text-primary"
            >
              {{ item.name }}
            </router-link>
            <div class="text-caption text-medium-emphasis">
              ID: {{ item.buyerId }}
            </div>
          </div>
        </template>

        <!-- Total Contracts -->
        <template #[`item.totalContracts`]="{ item }">
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

        <!-- Total Spending -->
        <template #[`item.totalSpending`]="{ item }">
          <div class="text-right">
            <div class="font-weight-bold text-success">
              {{ formatCurrency(item.totalSpending) }}
            </div>
            <div class="text-caption text-medium-emphasis">
              Avg: {{ formatCurrency(item.avgContractValue) }}
            </div>
          </div>
        </template>

        <!-- Years Active -->
        <template #[`item.yearsActive`]="{ item }">
          <div class="text-center">
            <div class="font-weight-medium">
              {{ item.yearCount }} years
            </div>
            <div class="text-caption text-medium-emphasis">
              {{ Math.min(...item.years) }} - {{ Math.max(...item.years) }}
            </div>
          </div>
        </template>

        <!-- Suppliers Count -->
        <template #[`item.supplierCount`]="{ item }">
          <div class="text-center">
            <v-chip
              color="info"
              size="small"
              variant="tonal"
            >
              {{ item.supplierCount }}
            </v-chip>
          </div>
        </template>

        <!-- Top Categories -->
        <template #[`item.topCategories`]="{ item }">
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
        <template #[`item.lastUpdated`]="{ item }">
          <div class="text-caption">
            {{ formatDate(item.lastUpdated) }}
          </div>
        </template>

        <!-- Actions -->
        <template #[`item.actions`]="{ item }">
          <div class="d-flex gap-1">
            <v-tooltip text="View Details">
              <template #activator="{ props }">
                <v-btn
                  :to="`/buyers/${encodeURIComponent(item.buyerId)}`"
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
              mdi-account-tie-outline
            </v-icon>
            <div class="text-h6 mb-2">
              No buyers found
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
          <span>Buyer Raw Data</span>
          <v-btn
            icon="mdi-close"
            variant="text"
            @click="rawDataDialog = false"
          />
        </v-card-title>
        <v-card-text>
          <pre class="text-body-2">{{ JSON.stringify(selectedBuyer, null, 2) }}</pre>
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
            <span>Buyer Analytics</span>
            <div class="text-subtitle-2 text-medium-emphasis">
              {{ selectedBuyerForAnalytics?.name }}
            </div>
          </div>
          <v-btn
            icon="mdi-close"
            variant="text"
            @click="analyticsDialog = false"
          />
        </v-card-title>
        <v-card-text>
          <div v-if="selectedBuyerForAnalytics">
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
              v-if="selectedBuyerForAnalytics.topCategories && selectedBuyerForAnalytics.topCategories.length > 0"
              class="mb-4"
            >
              <v-card-title>Top Procurement Categories</v-card-title>
              <v-card-text>
                <v-row>
                  <v-col
                    v-for="category in selectedBuyerForAnalytics.topCategories"
                    :key="category.category"
                    cols="12"
                    md="6"
                  >
                    <div class="d-flex justify-space-between align-center mb-2">
                      <span class="font-weight-medium">{{ category.category }}</span>
                      <span class="text-success">{{ formatCurrency(category.totalAmount) }}</span>
                    </div>
                    <v-progress-linear
                      :model-value="(category.totalAmount / selectedBuyerForAnalytics.totalSpending) * 100"
                      color="success"
                      height="4"
                    />
                  </v-col>
                </v-row>
              </v-card-text>
            </v-card>

            <!-- Recent Items -->
            <v-card v-if="selectedBuyerForAnalytics.items && selectedBuyerForAnalytics.items.length > 0">
              <v-card-title>Recent Procurement Items</v-card-title>
              <v-card-text>
                <v-list>
                  <v-list-item
                    v-for="(item, index) in selectedBuyerForAnalytics.items.slice(0, 10)"
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
interface IBuyer {
  buyerId: string
  name: string
  totalContracts: number
  years: number[]
  yearCount: number
  suppliers: string[]
  supplierCount: number
  totalSpending: number
  avgContractValue: number
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
  title: 'Government Buyers Directory',
  description: 'Explore government agencies and analyze their procurement activities',
})

// Reactive state
const loading = ref(false)
const buyers = ref<IBuyer[]>([])
const pagination = ref({
  page: 1,
  limit: 25,
  total: 0,
  totalPages: 1,
})
const meta = ref({
  searchPerformed: false,
  filtersApplied: false,
  sortBy: 'totalSpending',
  sortOrder: 'desc',
})

// Filters
const filters = ref({
  search: '',
  minContracts: null as number | null,
  maxContracts: null as number | null,
  minSpending: null as number | null,
  maxSpending: null as number | null,
})

// Table configuration
const currentPage = ref(1)
const itemsPerPage = ref(25)
const sortBy = ref([{ key: 'totalSpending', order: 'desc' }])

// Dialogs
const rawDataDialog = ref(false)
const selectedBuyer = ref<IBuyer | null>(null)
const analyticsDialog = ref(false)
const selectedBuyerForAnalytics = ref<IBuyer | null>(null)

// Computed
const quickStats = computed(() => {
  if (!selectedBuyerForAnalytics.value) return []
  
  const buyer = selectedBuyerForAnalytics.value
  return [
    {
      title: 'Total Spending',
      value: formatCurrency(buyer.totalSpending),
      color: 'success',
    },
    {
      title: 'Contracts',
      value: buyer.totalContracts.toString(),
      color: 'primary',
    },
    {
      title: 'Years Active',
      value: buyer.yearCount.toString(),
      color: 'info',
    },
    {
      title: 'Suppliers',
      value: buyer.supplierCount.toString(),
      color: 'warning',
    },
  ]
})

// Table headers
const headers = [
  {
    title: 'Government Buyer',
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
    title: 'Total Spending',
    key: 'totalSpending',
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
    title: 'Suppliers',
    key: 'supplierCount',
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
const loadBuyers = async () => {
  loading.value = true
  try {
    const params = {
      page: currentPage.value,
      limit: itemsPerPage.value,
      sortBy: sortBy.value[0]?.key || 'totalSpending',
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

    const response = await fetch('/api/buyers?' + new URLSearchParams(cleanParams))
    const result = await response.json()

    if (result.success) {
      buyers.value = result.data.buyers
      pagination.value = result.data.pagination
      meta.value = {
        searchPerformed: !!filters.value.search,
        filtersApplied: !!(filters.value.minContracts || filters.value.maxContracts || filters.value.minSpending || filters.value.maxSpending),
        sortBy: String(cleanParams.sortBy || 'totalSpending'),
        sortOrder: String(cleanParams.sortOrder || 'desc'),
      }
    }
  }
  catch (error) {
    console.error('Error loading buyers:', error)
    buyers.value = []
  }
  finally {
    loading.value = false
  }
}

const handleTableUpdate = (options) => {
  currentPage.value = options.page
  itemsPerPage.value = options.itemsPerPage
  sortBy.value = options.sortBy || [{ key: 'totalSpending', order: 'desc' }]
  loadBuyers()
}

const applyFilters = () => {
  currentPage.value = 1
  loadBuyers()
}

const clearAllFilters = () => {
  filters.value = {
    search: '',
    minContracts: null,
    maxContracts: null,
    minSpending: null,
    maxSpending: null,
  }
  currentPage.value = 1
  loadBuyers()
}

const clearSearch = () => {
  filters.value.search = ''
  applyFilters()
}

const searchBuyers = () => {
  applyFilters()
}

const refreshData = () => {
  loadBuyers()
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

const viewRawData = (buyer) => {
  selectedBuyer.value = buyer
  rawDataDialog.value = true
}

const viewAnalytics = (buyer) => {
  selectedBuyerForAnalytics.value = buyer
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
  loadBuyers()
})

// Watch for filter changes
watch(() => itemsPerPage.value, () => {
  currentPage.value = 1
  loadBuyers()
})
</script>

<style scoped>
.buyers-explorer {
  padding: 24px;
}

.gap-2 {
  gap: 8px;
}

pre {
  background-color: rgb(var(--v-theme-surface-variant));
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
