<template>
  <div class="supplier-detail">
    <!-- Loading State -->
    <div
      v-if="loading"
      class="d-flex justify-center align-center"
      style="min-height: 400px;"
    >
      <v-progress-circular
        indeterminate
        size="64"
      />
    </div>

    <!-- Error State -->
    <div
      v-else-if="error"
      class="text-center py-8"
    >
      <v-icon
        size="64"
        color="error"
        class="mb-4"
      >
        mdi-alert-circle
      </v-icon>
      <h2 class="text-h5 mb-2">
        Supplier Not Found
      </h2>
      <p class="text-body-1 text-medium-emphasis mb-4">
        The supplier you're looking for doesn't exist or has been removed.
      </p>
      <v-btn
        to="/suppliers"
        color="primary"
      >
        Back to Suppliers
      </v-btn>
    </div>

    <!-- Supplier Details -->
    <div v-else-if="supplier">
      <!-- Header -->
      <div class="d-flex align-center justify-space-between mb-6">
        <div>
          <v-btn
            to="/suppliers"
            variant="text"
            prepend-icon="mdi-arrow-left"
            class="mb-2"
          >
            Back to Suppliers
          </v-btn>
          <h1 class="text-h4 font-weight-bold mb-2">
            {{ supplier.name }}
          </h1>
          <div class="d-flex align-center ga-2">
            <v-chip
              color="primary"
              size="small"
            >
              ID: {{ supplier.supplierId }}
            </v-chip>
            <v-chip
              color="success"
              size="small"
              variant="tonal"
            >
              {{ supplier.totalContracts }} contracts
            </v-chip>
          </div>
        </div>

        <div class="d-flex ga-2">
          <v-btn
            color="success"
            prepend-icon="mdi-download"
            @click="exportSupplierData"
          >
            Export
          </v-btn>
        </div>
      </div>

      <!-- Key Metrics -->
      <v-row class="mb-6">
        <v-col
          cols="12"
          sm="6"
          md="3"
        >
          <v-card
            class="text-center"
            color="success"
            variant="tonal"
          >
            <v-card-text>
              <div class="text-h4 font-weight-bold">
                {{ formatCurrency(supplier.totalValue) }}
              </div>
              <div class="text-subtitle-2">
                Total Contract Value
              </div>
            </v-card-text>
          </v-card>
        </v-col>

        <v-col
          cols="12"
          sm="6"
          md="3"
        >
          <v-card
            class="text-center"
            color="primary"
            variant="tonal"
          >
            <v-card-text>
              <div class="text-h4 font-weight-bold">
                {{ supplier.totalContracts }}
              </div>
              <div class="text-subtitle-2">
                Total Contracts
              </div>
            </v-card-text>
          </v-card>
        </v-col>

        <v-col
          cols="12"
          sm="6"
          md="3"
        >
          <v-card
            class="text-center"
            color="info"
            variant="tonal"
          >
            <v-card-text>
              <div class="text-h4 font-weight-bold">
                {{ supplier.yearCount }}
              </div>
              <div class="text-subtitle-2">
                Years Active
              </div>
            </v-card-text>
          </v-card>
        </v-col>

        <v-col
          cols="12"
          sm="6"
          md="3"
        >
          <v-card
            class="text-center"
            color="warning"
            variant="tonal"
          >
            <v-card-text>
              <div class="text-h4 font-weight-bold">
                {{ supplier.buyerCount }}
              </div>
              <div class="text-subtitle-2">
                Government Buyers
              </div>
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>

      <!-- Summary Information -->
      <v-card class="mb-6">
        <v-card-title>Supplier Summary</v-card-title>
        <v-card-text>
          <v-row>
            <v-col
              cols="12"
              md="6"
            >
              <div class="mb-4">
                <div class="text-subtitle-2 text-medium-emphasis">
                  Average Contract Value
                </div>
                <div class="text-h6 text-success">
                  {{ formatCurrency(supplier.avgContractValue) }}
                </div>
              </div>

              <div class="mb-4">
                <div class="text-subtitle-2 text-medium-emphasis">
                  Active Years
                </div>
                <div class="text-body-1">
                  {{ Math.min(...supplier.years) }} - {{ Math.max(...supplier.years) }}
                  <span class="text-medium-emphasis">({{ supplier.yearCount }} years)</span>
                </div>
              </div>

              <div class="mb-4">
                <div class="text-subtitle-2 text-medium-emphasis">
                  Data Last Updated
                </div>
                <div class="text-body-1">
                  {{ formatDate(supplier.lastUpdated) }}
                </div>
              </div>
            </v-col>

            <v-col
              cols="12"
              md="6"
            >
              <div class="mb-4">
                <div class="text-subtitle-2 text-medium-emphasis">
                  Top Contract Categories
                </div>
                <div
                  v-if="supplier.topCategories && supplier.topCategories.length > 0"
                  class="d-flex flex-wrap ga-1 mt-2"
                >
                  <v-chip
                    v-for="category in supplier.topCategories.slice(0, 5)"
                    :key="category.category"
                    size="small"
                    color="secondary"
                    variant="tonal"
                  >
                    {{ category.category }}
                  </v-chip>
                </div>
                <div
                  v-else
                  class="text-medium-emphasis"
                >
                  No categories available
                </div>
              </div>

              <div class="mb-4">
                <div class="text-subtitle-2 text-medium-emphasis">
                  Contract Items
                </div>
                <div class="text-body-1">
                  {{ supplier.items?.length || 0 }} different items supplied
                </div>
              </div>
            </v-col>
          </v-row>
        </v-card-text>
      </v-card>

      <!-- Top Categories Chart -->
      <v-card
        v-if="supplier.topCategories && supplier.topCategories.length > 0"
        class="mb-6"
      >
        <v-card-title>Contract Value by Category</v-card-title>
        <v-card-text>
          <v-row>
            <v-col
              v-for="category in supplier.topCategories"
              :key="category.category"
              cols="12"
              md="6"
            >
              <div class="mb-3">
                <div class="d-flex justify-space-between align-center mb-2">
                  <span class="font-weight-medium">{{ category.category }}</span>
                  <div class="text-right">
                    <div class="text-success font-weight-bold">
                      {{ formatCurrency(category.totalAmount) }}
                    </div>
                    <div class="text-caption text-medium-emphasis">
                      {{ category.contractCount }} contracts
                    </div>
                  </div>
                </div>
                <v-progress-linear
                  :model-value="(category.totalAmount / supplier.totalValue) * 100"
                  color="success"
                  height="8"
                  rounded
                />
                <div class="text-caption text-medium-emphasis mt-1">
                  {{ ((category.totalAmount / supplier.totalValue) * 100).toFixed(1) }}% of total value
                </div>
              </div>
            </v-col>
          </v-row>
        </v-card-text>
      </v-card>

      <!-- Recent Contracts -->
      <v-card
        v-if="recentContracts && recentContracts.length > 0"
        class="mb-6"
      >
        <v-card-title>Recent Contracts</v-card-title>
        <v-card-text>
          <v-expansion-panels
            v-model="expandedContracts"
            multiple
          >
            <v-expansion-panel
              v-for="(contract, index) in recentContracts"
              :key="contract.id"
              :value="index"
            >
              <v-expansion-panel-title>
                <div class="d-flex align-center justify-space-between w-100 mr-4">
                  <div>
                    <div class="font-weight-medium">
                      {{ contract.tender?.title || 'Untitled Contract' }}
                    </div>
                    <div class="text-caption text-medium-emphasis">
                      {{ contract.ocid }} • {{ formatDate(contract.date) }}
                    </div>
                  </div>
                  <div class="d-flex align-center ga-2">
                    <v-chip
                      color="primary"
                      size="small"
                      variant="tonal"
                    >
                      {{ contract.awards.length }} award{{ contract.awards.length !== 1 ? 's' : '' }}
                    </v-chip>
                    <div
                      v-if="getTotalContractValue(contract) > 0"
                      class="text-subtitle-2 font-weight-bold text-success"
                    >
                      {{ formatCurrency(getTotalContractValue(contract)) }}
                    </div>
                  </div>
                </div>
              </v-expansion-panel-title>

              <v-expansion-panel-text>
                <v-row>
                  <v-col
                    cols="12"
                    md="6"
                  >
                    <div class="mb-4">
                      <div class="text-subtitle-2 text-medium-emphasis mb-2">
                        Contract Information
                      </div>
                      <v-list density="compact">
                        <v-list-item>
                          <v-list-item-title>Contract ID</v-list-item-title>
                          <v-list-item-subtitle>{{ contract.id }}</v-list-item-subtitle>
                        </v-list-item>
                        <v-list-item>
                          <v-list-item-title>OCID</v-list-item-title>
                          <v-list-item-subtitle>{{ contract.ocid }}</v-list-item-subtitle>
                        </v-list-item>
                        <v-list-item>
                          <v-list-item-title>Date</v-list-item-title>
                          <v-list-item-subtitle>{{ formatDate(contract.date) }}</v-list-item-subtitle>
                        </v-list-item>
                        <v-list-item>
                          <v-list-item-title>Year</v-list-item-title>
                          <v-list-item-subtitle>{{ contract.sourceYear }}</v-list-item-subtitle>
                        </v-list-item>
                        <v-list-item v-if="contract.buyer?.name">
                          <v-list-item-title>Buyer</v-list-item-title>
                          <v-list-item-subtitle>{{ contract.buyer.name }}</v-list-item-subtitle>
                        </v-list-item>
                      </v-list>
                    </div>
                  </v-col>

                  <v-col
                    cols="12"
                    md="6"
                  >
                    <div class="mb-4">
                      <div class="text-subtitle-2 text-medium-emphasis mb-2">
                        Awards for This Supplier
                      </div>
                      <div
                        v-for="award in contract.awards"
                        :key="award.id"
                        class="mb-3 pa-3 border rounded"
                      >
                        <div class="d-flex justify-space-between align-center mb-2">
                          <span class="font-weight-medium">{{ award.title || award.id }}</span>
                          <v-chip
                            :color="getStatusColor(award.status)"
                            size="small"
                            variant="tonal"
                          >
                            {{ award.status }}
                          </v-chip>
                        </div>
                        <div class="text-caption text-medium-emphasis mb-2">
                          Date: {{ formatDate(award.date) }}
                        </div>
                        <div
                          v-if="award.value?.amount"
                          class="text-success font-weight-bold"
                        >
                          Value: {{ formatCurrency(award.value.amount) }}
                        </div>
                        <div
                          v-if="award.items && award.items.length > 0"
                          class="mt-2"
                        >
                          <div class="text-caption text-medium-emphasis">
                            Items: {{ award.items.length }}
                          </div>
                          <div class="d-flex flex-wrap ga-1 mt-1">
                            <v-chip
                              v-for="item in award.items.slice(0, 3)"
                              :key="item.id"
                              size="x-small"
                              variant="outlined"
                            >
                              {{ item.description || `Item ${item.id}` }}
                            </v-chip>
                            <v-chip
                              v-if="award.items.length > 3"
                              size="x-small"
                              variant="outlined"
                              color="grey"
                            >
                              +{{ award.items.length - 3 }} more
                            </v-chip>
                          </div>
                        </div>
                      </div>
                    </div>
                  </v-col>
                </v-row>

                <div class="d-flex justify-end">
                  <v-btn
                    :to="`/contracts/${contract.id}`"
                    color="primary"
                    variant="text"
                    prepend-icon="mdi-eye"
                  >
                    View Full Contract
                  </v-btn>
                </div>
              </v-expansion-panel-text>
            </v-expansion-panel>
          </v-expansion-panels>
        </v-card-text>
      </v-card>

      <!-- Contract Items -->
      <v-card
        v-if="supplier.items && supplier.items.length > 0"
        class="mb-6"
      >
        <v-card-title>Contract Items Supplied</v-card-title>
        <v-card-text>
          <v-data-table
            :headers="itemHeaders"
            :items="supplier.items"
            :items-per-page="10"
            density="compact"
          >
            <template #item="{ item }">
              <tr>
                <td>
                  <div>
                    <div class="font-weight-medium">
                      {{ item.description }}
                    </div>
                    <div class="text-caption text-medium-emphasis">
                      {{ item.category || 'Uncategorized' }}
                    </div>
                  </div>
                </td>
                <td class="text-right">
                  <div class="font-weight-bold text-success">
                    {{ formatCurrency(item.totalAmount) }}
                  </div>
                  <div class="text-caption text-medium-emphasis">
                    Avg: {{ formatCurrency(item.avgPrice) }}
                  </div>
                </td>
                <td class="text-center">
                  <v-chip
                    color="primary"
                    size="small"
                    variant="tonal"
                  >
                    {{ item.contractCount }}
                  </v-chip>
                </td>
                <td class="text-center">
                  <div class="font-weight-medium">
                    {{ item.totalQuantity.toLocaleString() }}
                  </div>
                  <div class="text-caption text-medium-emphasis">
                    {{ item.unitName || 'units' }}
                  </div>
                </td>
              </tr>
            </template>
          </v-data-table>
        </v-card-text>
      </v-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'

// Route
const route = useRoute()

// Types
interface ISupplierItem {
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
}

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
  items?: ISupplierItem[]
  topCategories?: Array<{
    category: string
    totalAmount: number
    contractCount: number
  }>
  lastUpdated: string
}

interface IContract {
  id: string
  ocid: string
  date: string
  sourceYear: number
  tender?: {
    title?: string
    status?: string
    procurementMethod?: string
  }
  buyer?: {
    name: string
  }
  awards: Array<{
    id: string
    title?: string
    status: string
    date: string
    value?: {
      amount: number
      currency: string
    }
    items?: Array<{
      id: string | number
      description?: string
    }>
  }>
}

// Reactive state
const loading = ref(false)
const error = ref(false)
const supplier = ref<ISupplier | null>(null)
const recentContracts = ref<IContract[]>([])
const expandedContracts = ref<number[]>([])

// Data table headers for items
const itemHeaders = ref([
  { title: 'Item Description', key: 'description', sortable: false },
  { title: 'Total Value', key: 'totalAmount', align: 'end', sortable: true },
  { title: 'Contracts', key: 'contractCount', align: 'center', sortable: true },
  { title: 'Total Quantity', key: 'totalQuantity', align: 'center', sortable: true },
])

// Methods
const loadSupplierData = async () => {
  loading.value = true
  error.value = false

  try {
    const supplierId = route.params.id as string
    const response = await fetch(`/api/suppliers/${encodeURIComponent(supplierId)}`)
    const result = await response.json()

    if (result.success) {
      supplier.value = result.data.supplier
      recentContracts.value = result.data.recentContracts || []
    }
    else {
      error.value = true
    }
  }
  catch (err) {
    console.error('Error loading supplier:', err)
    error.value = true
  }
  finally {
    loading.value = false
  }
}

const getTotalContractValue = (contract: IContract): number => {
  return contract.awards.reduce((total, award) => {
    return total + (award.value?.amount || 0)
  }, 0)
}

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

const getStatusColor = (status?: string): string => {
  if (!status) return 'grey'

  const statusColors: Record<string, string> = {
    active: 'success',
    complete: 'info',
    cancelled: 'error',
    planning: 'warning',
    tender: 'primary',
  }
  return statusColors[status.toLowerCase()] || 'grey'
}

const exportSupplierData = () => {
  console.log('Export supplier data:', supplier.value?.supplierId)
  // TODO: Implement export functionality
}

// Lifecycle
onMounted(() => {
  loadSupplierData()
})
</script>

<style scoped>
.supplier-detail {
  padding: 24px;
}

.ga-2 {
  gap: 8px;
}

.border {
  border: 1px solid rgb(var(--v-border-color));
}
</style>
