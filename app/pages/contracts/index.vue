<template>
  <div class="contracts-explorer">
    <!-- Page Header -->
    <div class="d-flex align-center justify-space-between mb-6">
      <div>
        <h1 class="text-h4 font-weight-bold mb-2">
          Contract Explorer
        </h1>
        <p class="text-subtitle-1 text-medium-emphasis">
          Browse and analyze government contracts with advanced filtering and search capabilities
        </p>
      </div>
      <div class="d-flex ga-2">
        <v-btn
          color="primary"
          prepend-icon="mdi-refresh"
          :loading="isHydrated && loading"
          @click="refreshData"
        >
          Refresh
        </v-btn>
        <v-btn
          color="success"
          prepend-icon="mdi-download"
          :disabled="contracts.length === 0"
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
              label="Search contracts, suppliers, buyers..."
              prepend-inner-icon="mdi-magnify"
              clearable
              variant="outlined"
              density="compact"
              @click:clear="clearSearch"
            />
          </v-col>

          <!-- Year Range -->
          <v-col
            cols="12"
            md="2"
          >
            <v-select
              v-model="filters.yearFrom"
              label="From Year"
              item-title="label"
              item-value="value"
              :items="availableYears"
              variant="outlined"
              density="compact"
              clearable
            />
          </v-col>
          <v-col
            cols="12"
            md="2"
          >
            <v-select
              v-model="filters.yearTo"
              label="To Year"
              item-title="label"
              item-value="value"
              :items="availableYears"
              variant="outlined"
              density="compact"
              clearable
            />
          </v-col>

          <!-- Amount Range -->
          <v-col
            cols="12"
            md="2"
          >
            <v-text-field
              v-model.number="filters.amountFrom"
              label="Min Amount (UYU)"
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
              v-model.number="filters.amountTo"
              label="Max Amount (UYU)"
              type="number"
              variant="outlined"
              density="compact"
              clearable
            />
          </v-col>
        </v-row>

        <v-row>
          <!-- Status Filter -->
          <v-col
            cols="12"
            md="3"
          >
            <v-select
              v-model="filters.status"
              label="Contract Status"
              :items="filterOptions.statuses as any[]"
              item-title="label"
              item-value="value"
              variant="outlined"
              density="compact"
              multiple
              clearable
              chips
            />
          </v-col>

          <!-- Procurement Method -->
          <v-col
            cols="12"
            md="3"
          >
            <v-select
              v-model="filters.procurementMethod"
              label="Procurement Method"
              :items="filterOptions.procurementMethods as any[]"
              item-title="label"
              item-value="value"
              variant="outlined"
              density="compact"
              multiple
              clearable
              chips
            />
          </v-col>

          <!-- Suppliers -->
          <v-col
            cols="12"
            md="3"
          >
            <v-autocomplete
              v-model="filters.suppliers"
              label="Suppliers"
              :items="filterOptions.suppliers as any[]"
              item-title="label"
              item-value="value"
              variant="outlined"
              density="compact"
              multiple
              clearable
              chips
              :loading="isHydrated && loadingFilters"
            />
          </v-col>

          <!-- Buyers -->
          <v-col
            cols="12"
            md="3"
          >
            <v-autocomplete
              v-model="filters.buyers"
              label="Buyers"
              :items="filterOptions.buyers as any[]"
              item-title="label"
              item-value="value"
              variant="outlined"
              density="compact"
              multiple
              clearable
              chips
              :loading="isHydrated && loadingFilters"
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
              :items="[10, 25, 50]"
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
              :loading="isHydrated && loading"
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
        <span v-if="pagination.currentCount > 0">
          Showing {{ pagination.currentCount }} contracts
          <span v-if="pagination.hasMore">
            (Page {{ pagination.page }} of {{ pagination.estimatedTotalPages }}+)
          </span>
        </span>
        <span v-else>
          No contracts found
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
        :items="contracts"
        :loading="isHydrated && loading"
        :items-length="estimatedTotal"
        class="elevation-1"
        @update:options="handleTableUpdate"
      >
        <!-- Contract Title -->
        <template #item.title="{ item }">
          <div class="d-flex flex-column">
            <router-link
              :to="`/contracts/${item.id}`"
              class="text-decoration-none font-weight-medium text-primary"
            >
              {{ item.tender?.title || 'Untitled Contract' }}
            </router-link>
            <div class="text-caption text-medium-emphasis">
              {{ item.ocid }}
            </div>
          </div>
        </template>

        <!-- Date -->
        <template #item.date="{ item }">
          <div class="d-flex flex-column">
            <span>{{ formatDate(item.date) }}</span>
            <div class="text-caption text-medium-emphasis">
              {{ item.sourceYear }}
            </div>
          </div>
        </template>

        <!-- Buyer -->
        <template #item.buyer="{ item }">
          <div class="d-flex flex-column">
            <span class="font-weight-medium">
              {{ item.buyer?.name || item.tender?.procuringEntity?.name || 'Unknown' }}
            </span>
            <div
              v-if="item.tender?.procurementMethod"
              class="text-caption text-medium-emphasis"
            >
              {{ item.tender.procurementMethod }}
            </div>
          </div>
        </template>

        <!-- Suppliers -->
        <template #item.suppliers="{ item }">
          <div v-if="item.awards && item.awards.length > 0 && item.awards[0].suppliers">
            <v-chip
              v-for="(supplier, index) in item.awards[0].suppliers.slice(0, 2)"
              :key="index"
              size="x-small"
              color="success"
              variant="tonal"
              class="mr-1 mb-1"
            >
              {{ supplier.name }}
            </v-chip>
            <div
              v-if="item.awards[0].suppliers.length > 2"
              class="text-caption text-medium-emphasis"
            >
              +{{ item.awards[0].suppliers.length - 2 }} more
            </div>
          </div>
          <span
            v-else
            class="text-medium-emphasis"
          >No suppliers</span>
        </template>

        <!-- Item Descriptions -->
        <template #item.descriptions="{ item }">
          <div v-if="item.awards && item.awards.length > 0 && item.awards[0].items && item.awards[0].items.length > 0">
            <div class="d-flex flex-column ga-1">
              <div
                v-for="(awardItem, index) in item.awards[0].items.slice(0, 2)"
                :key="index"
                class="text-caption"
              >
                <v-chip
                  size="x-small"
                  color="primary"
                  variant="outlined"
                  class="mr-1"
                >
                  {{ index + 1 }}
                </v-chip>
                <span class="font-weight-medium">
                  {{ getItemDescription(awardItem, index) }}
                </span>
              </div>
              <div
                v-if="item.awards[0].items.length > 2"
                class="text-caption text-medium-emphasis mt-1"
              >
                +{{ item.awards[0].items.length - 2 }} more items
              </div>
            </div>
          </div>
          <div v-else-if="item.tender && item.tender.items && item.tender.items.length > 0">
            <div class="d-flex flex-column ga-1">
              <div
                v-for="(tenderItem, index) in item.tender.items.slice(0, 2)"
                :key="index"
                class="text-caption"
              >
                <v-chip
                  size="x-small"
                  color="warning"
                  variant="outlined"
                  class="mr-1"
                >
                  {{ index + 1 }}
                </v-chip>
                <span class="font-weight-medium">
                  {{ getItemDescription(tenderItem, index) }}
                </span>
              </div>
              <div
                v-if="item.tender.items.length > 2"
                class="text-caption text-medium-emphasis mt-1"
              >
                +{{ item.tender.items.length - 2 }} more tender items
              </div>
            </div>
          </div>
          <div v-else-if="item.tender && item.tender.description">
            <div
              class="text-caption"
            >
              <v-chip
                size="x-small"
                color="warning"
                variant="outlined"
                class="mr-1"
              >
                1
              </v-chip>
              <span class="font-weight-medium">
                {{ item.tender.description }}
              </span>
            </div>
          </div>
          <span
            v-else
            class="text-medium-emphasis text-caption"
          >No item descriptions</span>
        </template>

        <!-- Amount -->
        <template #item.amount="{ item }">
          <div class="text-no-wrap">
            <v-chip
              size="small"
              color="success"
              variant="outlined"
            >
              {{ formatTotalAmount(item) }}
            </v-chip>
          </div>
        </template>        <!-- Status -->
        <template #item.status="{ item }">
          <v-chip
            :color="getStatusColor(item.tender?.status || '')"
            size="small"
            variant="tonal"
          >
            {{ item.tender?.status || 'Unknown' }}
          </v-chip>
        </template>

        <!-- Actions -->
        <template #item.actions="{ item }">
          <div class="d-flex ga-1">
            <v-tooltip text="View Awards">
              <template #activator="{ props }">
                <v-btn
                  icon="mdi-trophy"
                  size="small"
                  variant="text"
                  color="success"
                  v-bind="props"
                  @click="viewAwards(item)"
                />
              </template>
            </v-tooltip>

            <v-tooltip text="View Details">
              <template #activator="{ props }">
                <v-btn
                  :to="`/contracts/${item.id}`"
                  icon="mdi-eye"
                  size="small"
                  variant="text"
                  v-bind="props"
                />
              </template>
            </v-tooltip>

            <v-tooltip text="View JSON">
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
              mdi-file-document-outline
            </v-icon>
            <div class="text-h6 mb-2">
              No contracts found
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
          <span>Contract Raw Data</span>
          <v-btn
            icon="mdi-close"
            variant="text"
            @click="rawDataDialog = false"
          />
        </v-card-title>
        <v-card-text>
          <pre class="text-body-2">{{ JSON.stringify(selectedContract, null, 2) }}</pre>
        </v-card-text>
      </v-card>
    </v-dialog>

    <!-- Awards Dialog -->
    <v-dialog
      v-model="awardsDialog"
      max-width="1000px"
      scrollable
    >
      <v-card>
        <v-card-title class="d-flex align-center justify-space-between">
          <div>
            <span>Contract Awards</span>
            <div class="text-subtitle-2 text-medium-emphasis">
              {{ selectedContractForAwards?.tender?.title || 'Contract Details' }}
            </div>
          </div>
          <v-btn
            icon="mdi-close"
            variant="text"
            @click="awardsDialog = false"
          />
        </v-card-title>
        <v-card-text>
          <div v-if="selectedContractForAwards?.awards && selectedContractForAwards.awards.length > 0">
            <v-expansion-panels
              v-model="expandedAward"
              multiple
            >
              <v-expansion-panel
                v-for="(award, awardIndex) in selectedContractForAwards.awards"
                :key="awardIndex"
                :value="awardIndex"
              >
                <v-expansion-panel-title>
                  <div class="d-flex align-center justify-space-between w-100">
                    <div class="d-flex flex-column">
                      <span class="font-weight-medium">{{ award.title || `Award ${awardIndex + 1}` }}</span>
                      <div class="text-caption text-medium-emphasis">
                        Status: {{ award.status || 'Unknown' }} • Date: {{ formatDate(award.date) }}
                      </div>
                    </div>
                    <v-chip
                      :color="getStatusColor(award.status)"
                      size="small"
                      variant="tonal"
                    >
                      {{ award.status || 'Unknown' }}
                    </v-chip>
                  </div>
                </v-expansion-panel-title>
                <v-expansion-panel-text>
                  <v-row>
                    <!-- Suppliers -->
                    <v-col
                      cols="12"
                      md="6"
                    >
                      <v-card
                        variant="outlined"
                        class="mb-4"
                      >
                        <v-card-title class="text-h6">
                          <v-icon
                            class="mr-2"
                            color="success"
                          >
                            mdi-factory
                          </v-icon>
                          Suppliers
                        </v-card-title>
                        <v-card-text>
                          <div v-if="award.suppliers && award.suppliers.length > 0">
                            <v-chip
                              v-for="(supplier, supplierIndex) in award.suppliers"
                              :key="supplierIndex"
                              class="ma-1"
                              color="success"
                              variant="tonal"
                            >
                              <v-icon start>
                                mdi-domain
                              </v-icon>
                              {{ supplier.name }}
                            </v-chip>
                          </div>
                          <div
                            v-else
                            class="text-medium-emphasis"
                          >
                            No suppliers listed
                          </div>
                        </v-card-text>
                      </v-card>
                    </v-col>

                    <!-- Award Items -->
                    <v-col
                      cols="12"
                      md="6"
                    >
                      <v-card
                        variant="outlined"
                        class="mb-4"
                      >
                        <v-card-title class="text-h6">
                          <v-icon
                            class="mr-2"
                            color="primary"
                          >
                            mdi-package-variant
                          </v-icon>
                          Items ({{ award.items?.length || 0 }})
                        </v-card-title>
                        <v-card-text>
                          <div v-if="award.items && award.items.length > 0">
                            <v-list dense>
                              <v-list-item
                                v-for="(item, itemIndex) in award.items"
                                :key="itemIndex"
                                class="px-0"
                              >
                                <template #default>
                                  <v-list-item-title class="font-weight-medium">
                                    {{ getItemDescription(item, itemIndex) }}
                                  </v-list-item-title>
                                  <v-list-item-subtitle>
                                    <div class="d-flex flex-wrap ga-2 mt-1">
                                      <v-chip
                                        size="x-small"
                                        variant="outlined"
                                      >
                                        Qty: {{ item.quantity || 'N/A' }}
                                      </v-chip>
                                      <v-chip
                                        v-if="item.unit?.value?.amount"
                                        size="x-small"
                                        variant="outlined"
                                        color="success"
                                      >
                                        {{ formatCurrency(item.unit.value.amount, item.unit.value.currency) }}
                                      </v-chip>
                                      <v-chip
                                        v-if="item.unit?.name"
                                        size="x-small"
                                        variant="outlined"
                                      >
                                        {{ item.unit.name }}
                                      </v-chip>
                                      <v-chip
                                        v-if="item.classification?.description"
                                        size="x-small"
                                        variant="outlined"
                                        color="info"
                                      >
                                        {{ item.classification.description }}
                                      </v-chip>
                                    </div>
                                  </v-list-item-subtitle>
                                </template>
                              </v-list-item>
                            </v-list>
                          </div>
                          <div
                            v-else
                            class="text-medium-emphasis"
                          >
                            No items listed
                          </div>
                        </v-card-text>
                      </v-card>
                    </v-col>
                  </v-row>

                  <!-- Award Summary -->
                  <v-row>
                    <v-col cols="12">
                      <v-card variant="outlined">
                        <v-card-title class="text-h6">
                          <v-icon
                            class="mr-2"
                            color="info"
                          >
                            mdi-calculator
                          </v-icon>
                          Award Summary
                        </v-card-title>
                        <v-card-text>
                          <v-row>
                            <v-col
                              cols="6"
                              md="3"
                            >
                              <div class="text-center">
                                <div class="text-h6 font-weight-bold text-success">
                                  {{ formatAwardAmount(award) }}
                                </div>
                                <div class="text-caption text-medium-emphasis">
                                  Total Amount
                                </div>
                              </div>
                            </v-col>
                            <v-col
                              cols="6"
                              md="3"
                            >
                              <div class="text-center">
                                <div class="text-h6 font-weight-bold text-primary">
                                  {{ award.items?.length || 0 }}
                                </div>
                                <div class="text-caption text-medium-emphasis">
                                  Items
                                </div>
                              </div>
                            </v-col>
                            <v-col
                              cols="6"
                              md="3"
                            >
                              <div class="text-center">
                                <div class="text-h6 font-weight-bold text-info">
                                  {{ award.suppliers?.length || 0 }}
                                </div>
                                <div class="text-caption text-medium-emphasis">
                                  Suppliers
                                </div>
                              </div>
                            </v-col>
                            <v-col
                              cols="6"
                              md="3"
                            >
                              <div class="text-center">
                                <div class="text-h6 font-weight-bold text-warning">
                                  {{ award.documents?.length || 0 }}
                                </div>
                                <div class="text-caption text-medium-emphasis">
                                  Documents
                                </div>
                              </div>
                            </v-col>
                          </v-row>
                        </v-card-text>
                      </v-card>
                    </v-col>
                  </v-row>

                  <!-- Documents -->
                  <v-row v-if="award.documents && award.documents.length > 0">
                    <v-col cols="12">
                      <v-card variant="outlined">
                        <v-card-title class="text-h6">
                          <v-icon
                            class="mr-2"
                            color="warning"
                          >
                            mdi-file-document
                          </v-icon>
                          Documents ({{ award.documents.length }})
                        </v-card-title>
                        <v-card-text>
                          <v-list dense>
                            <v-list-item
                              v-for="(document, docIndex) in award.documents"
                              :key="docIndex"
                              :href="document.url"
                              target="_blank"
                              class="px-0"
                            >
                              <template #prepend>
                                <v-icon color="warning">
                                  mdi-file-document-outline
                                </v-icon>
                              </template>
                              <v-list-item-title>
                                {{ document.description || `Document ${docIndex + 1}` }}
                              </v-list-item-title>
                              <v-list-item-subtitle>
                                Type: {{ document.documentType || 'Unknown' }} •
                                Format: {{ document.format || 'Unknown' }} •
                                Published: {{ formatDate(document.datePublished) }}
                              </v-list-item-subtitle>
                              <template #append>
                                <v-icon>mdi-open-in-new</v-icon>
                              </template>
                            </v-list-item>
                          </v-list>
                        </v-card-text>
                      </v-card>
                    </v-col>
                  </v-row>
                </v-expansion-panel-text>
              </v-expansion-panel>
            </v-expansion-panels>
          </div>
          <div
            v-else
            class="text-center py-8"
          >
            <v-icon
              size="64"
              color="grey-lighten-2"
              class="mb-4"
            >
              mdi-trophy-outline
            </v-icon>
            <div class="text-h6 mb-2">
              No Awards Found
            </div>
            <div class="text-body-2 text-medium-emphasis">
              This contract doesn't have any awards listed.
            </div>
          </div>
        </v-card-text>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useOptimizedApi } from '~/composables/useOptimizedApi'
import type { IRelease } from '~/types/database'
import { formatCurrency } from '~/utils'
// Meta
definePageMeta({
  title: 'Contract Explorer',
  description: 'Browse and analyze government contracts with advanced filtering capabilities',
})

// Composables
const api = useOptimizedApi()
const route = useRoute()
const router = useRouter()

// Reactive state
const loading = ref(false)
const loadingFilters = ref(false)
const contracts = ref<IRelease[]>([])
const pagination = ref({
  page: 1,
  limit: 25,
  hasMore: false,
  estimatedTotalPages: 1,
  currentCount: 0,
})
const meta = ref({
  searchPerformed: false,
  filtersApplied: false,
  sortBy: 'date',
  sortOrder: 'desc',
  initialLoad: true, // Flag to prevent query param clearing during initial load
})

// Hydration-safe state management
const isHydrated = ref(false)

// Filter options
const filterOptions = ref({
  years: [],
  statuses: [],
  procurementMethods: [],
  suppliers: [],
  buyers: [],
})

// Filters
interface FilterState {
  search: string
  yearFrom: string | null
  yearTo: string | null
  amountFrom: number | null
  amountTo: number | null
  status: string[]
  procurementMethod: string[]
  suppliers: string[]
  buyers: string[]
}

const filters = ref<FilterState>({
  search: '',
  yearFrom: null,
  yearTo: null,
  amountFrom: null,
  amountTo: null,
  status: [],
  procurementMethod: [],
  suppliers: [],
  buyers: [],
})

// Table configuration
const currentPage = ref(1)
const itemsPerPage = ref(25)
const sortBy = ref([{ key: 'date', order: 'desc' as 'asc' | 'desc' }])

// Add request tracking to prevent rapid requests
const lastRequestTime = ref(0)
const minRequestInterval = 500 // Minimum 500ms between requests

// Throttle function to prevent rapid requests
const throttledLoadContracts = () => {
  const now = Date.now()
  if (now - lastRequestTime.value < minRequestInterval) {
    // Skip this request if it's too soon
    return
  }
  lastRequestTime.value = now
  loadContracts()
}// Raw data dialog
const rawDataDialog = ref(false)
const selectedContract = ref(null)

// Awards dialog
const awardsDialog = ref(false)
const selectedContractForAwards = ref<IRelease | null>(null)
const expandedAward = ref([0]) // Expand first award by default

// Computed
const availableYears = computed(() => {
  return [...filterOptions.value.years].sort((a: any, b: any) => b.year - a.year).map((year: any) => ({
    label: year.label || year.year?.toString() || year,
    value: year.value || year.year?.toString() || year,
  }))
})

const estimatedTotal = computed(() => {
  // Return a high number to enable server-side pagination
  // without counting total documents for performance
  return pagination.value.hasMore ? pagination.value.page * itemsPerPage.value + 100 : pagination.value.currentCount
})

// Table headers
const headers = [
  {
    title: 'Contract',
    key: 'title',
    sortable: true,
    width: '20%',
  },
  {
    title: 'Date',
    key: 'date',
    sortable: true,
    width: '10%',
  },
  {
    title: 'Buyer',
    key: 'buyer',
    sortable: true,
    width: '15%',
  },
  {
    title: 'Suppliers',
    key: 'suppliers',
    sortable: false,
    width: '15%',
  },
  {
    title: 'Item Descriptions',
    key: 'descriptions',
    sortable: false,
    width: '20%',
  },
  {
    title: 'Amount',
    key: 'amount',
    sortable: true,
    align: 'end' as const,
    width: '10%',
  },
  {
    title: 'Status',
    key: 'status',
    sortable: true,
    width: '8%',
  },
  {
    title: 'Actions',
    key: 'actions',
    sortable: false,
    width: '7%',
  },
]

// Methods
const loadContracts = async () => {
  loading.value = true
  try {
    const params = {
      page: currentPage.value,
      limit: itemsPerPage.value,
      sortBy: sortBy.value[0]?.key || 'date',
      sortOrder: sortBy.value[0]?.order || 'desc',
      ...filters.value,
    }

    // Clean empty filters
    const cleanParams: any = {}
    Object.entries(params).forEach(([key, value]) => {
      if (value !== '' && value !== null && !(Array.isArray(value) && value.length === 0)) {
        cleanParams[key] = value
      }
    })

    const response = await api.searchContracts(cleanParams)

    if (response.success) {
      contracts.value = response.data.contracts
      pagination.value = response.data.pagination
      meta.value = response.data.meta
    }
  }
  catch (error) {
    console.error('Error loading contracts:', error)
    contracts.value = []
  }
  finally {
    loading.value = false
  }
}

const loadFilterOptions = async () => {
  loadingFilters.value = true
  try {
    const response = await api.getContractFilters()

    if (response.success) {
      filterOptions.value = response.data
    }
  }
  catch (error) {
    console.error('Error loading filter options:', error)
  }
  finally {
    loadingFilters.value = false
  }
}

const handleTableUpdate = (options: any) => {
  currentPage.value = options.page
  itemsPerPage.value = options.itemsPerPage
  sortBy.value = options.sortBy || [{ key: 'date', order: 'desc' }]

  // Only update query params if this is not the initial load
  if (!meta.value.initialLoad) {
    updateQueryParams()
  }
  throttledLoadContracts()
}

const applyFilters = () => {
  currentPage.value = 1
  meta.value.searchPerformed = true
  meta.value.initialLoad = false
  updateQueryParams()
  throttledLoadContracts()
}

const clearAllFilters = () => {
  filters.value = {
    search: '',
    yearFrom: null,
    yearTo: null,
    amountFrom: null,
    amountTo: null,
    status: [],
    procurementMethod: [],
    suppliers: [],
    buyers: [],
  }
  currentPage.value = 1
  meta.value.searchPerformed = true
  meta.value.initialLoad = false
  updateQueryParams()
  loadContracts()
}

const clearSearch = () => {
  filters.value.search = ''
  meta.value.searchPerformed = true
  meta.value.initialLoad = false
  applyFilters()
}

const refreshData = () => {
  throttledLoadContracts()
  loadFilterOptions()
}

const exportData = async () => {
  try {
    // Prevent export of too much data to avoid MongoDB overload
    if (pagination.value.currentCount === 0) {
      console.log('No data to export')
      return
    }

    // Show warning for large exports
    if (pagination.value.hasMore) {
      const confirmed = confirm('This will export only the currently visible contracts. Do you want to continue?')
      if (!confirmed) {
        return
      }
    }

    // Use current filters but limit the export size
    const exportFilters = {
      ...filters.value,
      limit: 1000, // Maximum 1000 records to prevent overload
    }

    // TODO: Implement actual export functionality
    console.log('Export functionality to be implemented with filters:', exportFilters)

    // For now, just show the data that would be exported
    console.log('Current contracts to export:', contracts.value.length)
  }
  catch (error) {
    console.error('Export failed:', error)
  }
}

const viewRawData = (contract: any) => {
  selectedContract.value = contract
  rawDataDialog.value = true
}

const viewAwards = (contract: any) => {
  selectedContractForAwards.value = contract
  expandedAward.value = [0] // Expand first award by default
  awardsDialog.value = true
}

// Utility methods
const formatDate = (dateString: string | Date): string => {
  return new Intl.DateTimeFormat('es-UY', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(dateString))
}

const getStatusColor = (status?: string): string => {
  const statusColors: Record<string, string> = {
    active: 'success',
    complete: 'info',
    cancelled: 'error',
    planning: 'warning',
    tender: 'primary',
  }
  return statusColors[status?.toLowerCase() || ''] || 'grey'
}

const getItemDescription = (item: Record<string, unknown>, index: number): string => {
  // Try multiple possible description fields, checking for non-empty values
  const description = item.description?.toString()?.trim()
    || item.title?.toString()?.trim()
    || item.name?.toString()?.trim()
    || (item.classification as Record<string, unknown>)?.description?.toString()?.trim()

  return description || `Item ${index + 1}`
}

const formatAwardAmount = (award: any): string => {
  if (award.value?.amount) {
    return formatCurrency(award.value.amount, award.value.currency)
  }
  return 'N/A'
}

// Query parameter synchronization
const updateQueryParams = () => {
  const query: Record<string, any> = {}

  // Add non-empty filter values to query
  if (filters.value.search) query.search = filters.value.search
  if (filters.value.yearFrom) query.yearFrom = filters.value.yearFrom
  if (filters.value.yearTo) query.yearTo = filters.value.yearTo
  if (filters.value.amountFrom) query.amountFrom = filters.value.amountFrom.toString()
  if (filters.value.amountTo) query.amountTo = filters.value.amountTo.toString()
  if (filters.value.status.length > 0) query.status = filters.value.status.join(',')
  if (filters.value.procurementMethod.length > 0) query.procurementMethod = filters.value.procurementMethod.join(',')
  if (filters.value.suppliers.length > 0) query.suppliers = filters.value.suppliers.join(',')
  if (filters.value.buyers.length > 0) query.buyers = filters.value.buyers.join(',')

  // Add pagination and sorting
  if (currentPage.value > 1) query.page = currentPage.value.toString()
  if (itemsPerPage.value !== 25) query.limit = itemsPerPage.value.toString()
  if (sortBy.value[0]?.key !== 'date') query.sortBy = sortBy.value[0]?.key
  if (sortBy.value[0]?.order !== 'desc') query.sortOrder = sortBy.value[0]?.order

  // Update URL without navigation
  router.replace({ query })
}

const loadFiltersFromQuery = () => {
  const query = route.query

  // Load filter values from query parameters
  if (query.search) filters.value.search = query.search as string
  if (query.yearFrom) filters.value.yearFrom = query.yearFrom as string
  if (query.yearTo) filters.value.yearTo = query.yearTo as string
  if (query.amountFrom) filters.value.amountFrom = Number(query.amountFrom)
  if (query.amountTo) filters.value.amountTo = Number(query.amountTo)
  if (query.status) filters.value.status = (query.status as string).split(',').filter(s => s)
  if (query.procurementMethod) filters.value.procurementMethod = (query.procurementMethod as string).split(',').filter(s => s)
  if (query.suppliers) filters.value.suppliers = (query.suppliers as string).split(',').filter(s => s)
  if (query.buyers) filters.value.buyers = (query.buyers as string).split(',').filter(s => s)

  // Load pagination and sorting
  if (query.page) currentPage.value = Number(query.page)
  if (query.limit) itemsPerPage.value = Number(query.limit)
  if (query.sortBy || query.sortOrder) {
    sortBy.value = [{
      key: (query.sortBy as string) || 'date',
      order: (query.sortOrder as 'asc' | 'desc') || 'desc',
    }]
  }
}

// Lifecycle
onMounted(() => {
  // Set hydration flag
  isHydrated.value = true

  loadFilterOptions()
  loadFiltersFromQuery()
  loadContracts()

  // Set initial load to false after first load and hydration
  nextTick(() => {
    meta.value.initialLoad = false
  })
})

// Watch for filter changes
watch(() => itemsPerPage.value, () => {
  currentPage.value = 1
  if (!meta.value.initialLoad && isHydrated.value) {
    updateQueryParams()
    loadContracts()
  }
})

// Watch for navigation changes (back/forward buttons)
watch(() => route.query, (newQuery, oldQuery) => {
  // Only reload if query actually changed and it's not the initial load
  if (!meta.value.initialLoad && isHydrated.value && JSON.stringify(newQuery) !== JSON.stringify(oldQuery)) {
    loadFiltersFromQuery()
    loadContracts()
  }
}, { deep: true })
</script>

<style scoped>
.contracts-explorer {
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
