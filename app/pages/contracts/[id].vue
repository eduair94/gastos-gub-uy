<template>
  <div class="contract-detail">
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
        Contract Not Found
      </h2>
      <p class="text-body-1 text-medium-emphasis mb-4">
        The contract you're looking for doesn't exist or has been removed.
      </p>
      <v-btn
        to="/contracts"
        color="primary"
      >
        Back to Contracts
      </v-btn>
    </div>

    <!-- Contract Details -->
    <div v-else-if="contract">
      <!-- Header -->
      <div class="d-flex align-center justify-space-between mb-6">
        <div>
          <v-btn
            to="/contracts"
            variant="text"
            prepend-icon="mdi-arrow-left"
            class="mb-2"
          >
            Back to Contracts
          </v-btn>
          <h1 class="text-h4 font-weight-bold mb-2">
            {{ contract.tender?.title || 'Contract Details' }}
          </h1>
          <div class="d-flex align-center gap-2">
            <v-chip
              color="primary"
              size="small"
            >
              {{ contract.ocid }}
            </v-chip>
            <v-chip
              :color="getStatusColor(contract.tender?.status)"
              size="small"
              variant="tonal"
            >
              {{ contract.tender?.status || 'Unknown' }}
            </v-chip>
          </div>
        </div>

        <div class="d-flex gap-2">
          <v-btn
            color="success"
            prepend-icon="mdi-download"
            @click="exportContract"
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
            color="primary"
            variant="tonal"
          >
            <v-card-text>
              <div class="text-h4 font-weight-bold">
                {{ formatTotalAmount(contract) }}
              </div>
              <div class="text-subtitle-2">
                Total Amount
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
            color="success"
            variant="tonal"
          >
            <v-card-text>
              <div class="text-h4 font-weight-bold">
                {{ contract.supplierCount || 0 }}
              </div>
              <div class="text-subtitle-2">
                Suppliers
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
                {{ contract.itemCount || 0 }}
              </div>
              <div class="text-subtitle-2">
                Items
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
                {{ contract.documentCount || 0 }}
              </div>
              <div class="text-subtitle-2">
                Documents
              </div>
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>

      <!-- Basic Information -->
      <v-card class="mb-6">
        <v-card-title>Basic Information</v-card-title>
        <v-card-text>
          <v-row>
            <v-col
              cols="12"
              md="6"
            >
              <div class="mb-4">
                <div class="text-subtitle-2 text-medium-emphasis">
                  Contract ID
                </div>
                <div class="text-body-1">
                  {{ contract.id }}
                </div>
              </div>

              <div class="mb-4">
                <div class="text-subtitle-2 text-medium-emphasis">
                  OCID
                </div>
                <div class="text-body-1">
                  {{ contract.ocid }}
                </div>
              </div>

              <div class="mb-4">
                <div class="text-subtitle-2 text-medium-emphasis">
                  Date
                </div>
                <div class="text-body-1">
                  {{ formatDate(contract.date) }}
                </div>
              </div>
            </v-col>

            <v-col
              cols="12"
              md="6"
            >
              <div class="mb-4">
                <div class="text-subtitle-2 text-medium-emphasis">
                  Source Year
                </div>
                <div class="text-body-1">
                  {{ contract.sourceYear }}
                </div>
              </div>

              <div class="mb-4">
                <div class="text-subtitle-2 text-medium-emphasis">
                  Initiation Type
                </div>
                <div class="text-body-1">
                  {{ contract.initiationType }}
                </div>
              </div>

              <div class="mb-4">
                <div class="text-subtitle-2 text-medium-emphasis">
                  Tags
                </div>
                <div class="d-flex flex-wrap gap-1">
                  <v-chip
                    v-for="tag in contract.tag"
                    :key="tag"
                    size="small"
                    variant="outlined"
                  >
                    {{ tag }}
                  </v-chip>
                </div>
              </div>
            </v-col>
          </v-row>

          <div v-if="contract.tender?.description">
            <div class="text-subtitle-2 text-medium-emphasis mb-2">
              Description
            </div>
            <div class="text-body-1">
              {{ contract.tender.description }}
            </div>
          </div>
        </v-card-text>
      </v-card>

      <!-- Awards Section -->
      <v-card
        v-if="contract.awards && contract.awards.length > 0"
        class="mb-6"
      >
        <v-card-title class="d-flex align-center justify-space-between">
          <span>Awards ({{ contract.awards.length }})</span>
          <v-chip
            color="success"
            size="small"
            variant="tonal"
          >
            {{ contract.awards.length }} award{{ contract.awards.length !== 1 ? 's' : '' }}
          </v-chip>
        </v-card-title>
        <v-card-text>
          <v-expansion-panels
            v-model="expandedAwards"
            multiple
          >
            <v-expansion-panel
              v-for="(award, index) in contract.awards"
              :key="award.id"
              :value="index"
            >
              <v-expansion-panel-title>
                <div class="d-flex align-center justify-space-between w-100 mr-4">
                  <div>
                    <div class="font-weight-medium">
                      {{ award.title || award.id }}
                    </div>
                    <div class="text-caption text-medium-emphasis">
                      {{ formatDate(award.date) }}
                    </div>
                  </div>
                  <div class="d-flex align-center gap-2">
                    <v-chip
                      :color="getStatusColor(award.status)"
                      size="small"
                      variant="tonal"
                    >
                      {{ award.status }}
                    </v-chip>
                    <div
                      v-if="award.value?.amount"
                      class="text-subtitle-2 font-weight-bold"
                    >
                      {{ formatCurrency(award.value.amount, award.value.currency) }}
                    </div>
                  </div>
                </div>
              </v-expansion-panel-title>

              <v-expansion-panel-text>
                <v-row>
                  <!-- Award Basic Info -->
                  <v-col
                    cols="12"
                    md="6"
                  >
                    <div class="mb-4">
                      <div class="text-subtitle-2 text-medium-emphasis mb-2">
                        Award Information
                      </div>
                      <v-list density="compact">
                        <v-list-item>
                          <v-list-item-title>Award ID</v-list-item-title>
                          <v-list-item-subtitle>{{ award.id }}</v-list-item-subtitle>
                        </v-list-item>
                        <v-list-item>
                          <v-list-item-title>Date</v-list-item-title>
                          <v-list-item-subtitle>{{ formatDate(award.date) }}</v-list-item-subtitle>
                        </v-list-item>
                        <v-list-item>
                          <v-list-item-title>Status</v-list-item-title>
                          <v-list-item-subtitle>
                            <v-chip
                              :color="getStatusColor(award.status)"
                              size="small"
                              variant="tonal"
                            >
                              {{ award.status }}
                            </v-chip>
                          </v-list-item-subtitle>
                        </v-list-item>
                        <v-list-item v-if="award.value?.amount">
                          <v-list-item-title>Total Value</v-list-item-title>
                          <v-list-item-subtitle>
                            <span class="font-weight-bold text-success">
                              {{ formatCurrency(award.value.amount, award.value.currency) }}
                            </span>
                            <span class="text-caption ml-1">
                              ({{ award.value.currency || 'UYU' }})
                            </span>
                          </v-list-item-subtitle>
                        </v-list-item>
                      </v-list>
                    </div>
                  </v-col>

                  <!-- Suppliers -->
                  <v-col
                    cols="12"
                    md="6"
                  >
                    <div
                      v-if="award.suppliers && award.suppliers.length > 0"
                      class="mb-4"
                    >
                      <div class="text-subtitle-2 text-medium-emphasis mb-2">
                        Suppliers ({{ award.suppliers.length }})
                      </div>
                      <v-list density="compact">
                        <v-list-item
                          v-for="supplier in award.suppliers"
                          :key="supplier.id"
                        >
                          <template #prepend>
                            <v-avatar
                              color="primary"
                              size="32"
                            >
                              <v-icon>mdi-domain</v-icon>
                            </v-avatar>
                          </template>
                          <v-list-item-title>{{ supplier.name }}</v-list-item-title>
                          <v-list-item-subtitle>ID: {{ supplier.id }}</v-list-item-subtitle>
                        </v-list-item>
                      </v-list>
                    </div>
                  </v-col>
                </v-row>

                <!-- Award Items -->
                <div
                  v-if="award.items && award.items.length > 0"
                  class="mt-4"
                >
                  <div class="text-subtitle-2 text-medium-emphasis mb-3">
                    Items ({{ award.items.length }})
                  </div>
                  <v-data-table
                    :headers="itemHeaders"
                    :items="award.items"
                    density="compact"
                    hide-default-footer
                  >
                    <template #item="{ item }">
                      <tr>
                        <td>{{ item.id }}</td>
                        <td>
                          <div>
                            <div class="font-weight-medium">
                              {{ item.classification?.description || 'N/A' }}
                            </div>
                            <div class="text-caption text-medium-emphasis">
                              {{ item.classification?.id }} ({{ item.classification?.scheme }})
                            </div>
                          </div>
                        </td>
                        <td class="text-center">
                          <div class="font-weight-bold">
                            {{ item.quantity?.toLocaleString() || 0 }}
                          </div>
                          <div class="text-caption">
                            {{ item.unit?.name || 'units' }}
                          </div>
                        </td>
                        <td>
                          <div>
                            <div class="font-weight-medium">
                              {{ item.unit?.name || 'N/A' }}
                            </div>
                            <div
                              v-if="item.unit?.value?.amount"
                              class="text-caption"
                            >
                              {{ formatCurrency(item.unit.value.amount, item.unit.value.currency) }} per unit
                            </div>
                          </div>
                        </td>
                        <td class="text-right">
                          <div
                            v-if="item.unit?.value?.amount && item.quantity"
                          >
                            <div class="font-weight-bold text-primary">
                              {{ formatCurrency(item.unit.value.amount * item.quantity, item.unit.value.currency) }}
                            </div>
                          </div>
                          <span v-else>N/A</span>
                        </td>
                      </tr>
                    </template>
                  </v-data-table>
                </div>

                <!-- Award Documents -->
                <div
                  v-if="award.documents && award.documents.length > 0"
                  class="mt-4"
                >
                  <div class="text-subtitle-2 text-medium-emphasis mb-3">
                    Documents ({{ award.documents.length }})
                  </div>
                  <v-list density="compact">
                    <v-list-item
                      v-for="document in award.documents"
                      :key="document.id"
                      :href="document.url"
                      target="_blank"
                    >
                      <template #prepend>
                        <v-avatar
                          color="info"
                          size="32"
                        >
                          <v-icon>mdi-file-document</v-icon>
                        </v-avatar>
                      </template>
                      <v-list-item-title>{{ document.description || document.id }}</v-list-item-title>
                      <v-list-item-subtitle>
                        {{ document.documentType }} • {{ formatDate(document.datePublished) }}
                      </v-list-item-subtitle>
                      <template #append>
                        <v-icon>mdi-open-in-new</v-icon>
                      </template>
                    </v-list-item>
                  </v-list>
                </div>
              </v-expansion-panel-text>
            </v-expansion-panel>
          </v-expansion-panels>
        </v-card-text>
      </v-card>

      <!-- Tender Items Section (when no awards) -->
      <v-card
        v-else-if="contract.tender && contract.tender.items && contract.tender.items.length > 0"
        class="mb-6"
      >
        <v-card-title class="d-flex align-center justify-space-between">
          <span>Tender Items ({{ contract.tender.items.length }})</span>
          <v-chip
            color="warning"
            size="small"
            variant="tonal"
          >
            No awards - showing tender items
          </v-chip>
        </v-card-title>
        <v-card-text>
          <div class="text-subtitle-2 text-medium-emphasis mb-3">
            Items from the original tender ({{ contract.tender.items.length }})
          </div>
          <v-data-table
            :headers="tenderItemHeaders"
            :items="contract.tender.items"
            density="compact"
            hide-default-footer
          >
            <template #item="{ item }">
              <tr>
                <td>{{ item.id || 'N/A' }}</td>
                <td>
                  <div>
                    <div class="font-weight-medium">
                      {{ item.description || item.classification?.description || 'N/A' }}
                    </div>
                    <div
                      v-if="item.classification"
                      class="text-caption text-medium-emphasis"
                    >
                      {{ item.classification?.id }} ({{ item.classification?.scheme }})
                    </div>
                  </div>
                </td>
                <td class="text-center">
                  <div class="font-weight-bold">
                    {{ item.quantity?.toLocaleString() || 'N/A' }}
                  </div>
                  <div class="text-caption">
                    {{ item.unit?.name || 'units' }}
                  </div>
                </td>
                <td>
                  <div>
                    <div class="font-weight-medium">
                      {{ item.unit?.name || 'N/A' }}
                    </div>
                    <div
                      v-if="item.unit?.value?.amount"
                      class="text-caption"
                    >
                      {{ formatCurrency(item.unit.value.amount, item.unit.value.currency) }} per unit
                    </div>
                  </div>
                </td>
                <td class="text-right">
                  <div
                    v-if="item.unit?.value?.amount && item.quantity"
                  >
                    <div class="font-weight-bold text-warning">
                      {{ formatCurrency(item.unit.value.amount * item.quantity) }}
                    </div>
                  </div>
                  <span v-else>N/A</span>
                </td>
              </tr>
            </template>
          </v-data-table>
        </v-card-text>
      </v-card>      <!-- Tender Details -->
      <v-card
        v-if="contract.tender"
        class="mb-6"
      >
        <v-card-title>Tender Information</v-card-title>
        <v-card-text>
          <v-row>
            <v-col
              cols="12"
              md="6"
            >
              <div
                v-if="contract.tender.procurementMethod"
                class="mb-4"
              >
                <div class="text-subtitle-2 text-medium-emphasis">
                  Procurement Method
                </div>
                <div class="text-body-1">
                  {{ contract.tender.procurementMethod }}
                </div>
              </div>

              <div
                v-if="contract.tender.procurementMethodDetails"
                class="mb-4"
              >
                <div class="text-subtitle-2 text-medium-emphasis">
                  Procurement Method Details
                </div>
                <div class="text-body-1">
                  {{ contract.tender.procurementMethodDetails }}
                </div>
              </div>

              <div
                v-if="contract.tender.procuringEntity?.name"
                class="mb-4"
              >
                <div class="text-subtitle-2 text-medium-emphasis">
                  Procuring Entity
                </div>
                <div class="text-body-1">
                  {{ contract.tender.procuringEntity.name }}
                </div>
              </div>
            </v-col>

            <v-col
              cols="12"
              md="6"
            >
              <div
                v-if="contract.tender.tenderPeriod"
                class="mb-4"
              >
                <div class="text-subtitle-2 text-medium-emphasis">
                  Tender Period
                </div>
                <div class="text-body-1">
                  {{ formatDate(contract.tender.tenderPeriod.startDate) }} -
                  {{ formatDate(contract.tender.tenderPeriod.endDate) }}
                </div>
              </div>

              <div class="mb-4">
                <div class="text-subtitle-2 text-medium-emphasis">
                  Has Enquiries
                </div>
                <div class="text-body-1">
                  <v-chip
                    :color="contract.tender.hasEnquiries ? 'success' : 'grey'"
                    size="small"
                    variant="tonal"
                  >
                    {{ contract.tender.hasEnquiries ? 'Yes' : 'No' }}
                  </v-chip>
                </div>
              </div>
            </v-col>
          </v-row>

          <div
            v-if="contract.tender.submissionMethodDetails"
            class="mt-4"
          >
            <div class="text-subtitle-2 text-medium-emphasis mb-2">
              Submission Method Details
            </div>
            <div class="text-body-1">
              {{ contract.tender.submissionMethodDetails }}
            </div>
          </div>
        </v-card-text>
      </v-card>

      <!-- Buyer Information -->
      <v-card
        v-if="contract.buyer"
        class="mb-6"
      >
        <v-card-title>Buyer Information</v-card-title>
        <v-card-text>
          <v-list>
            <v-list-item>
              <template #prepend>
                <v-avatar
                  color="primary"
                  size="40"
                >
                  <v-icon>mdi-account-tie</v-icon>
                </v-avatar>
              </template>
              <v-list-item-title>{{ contract.buyer.name }}</v-list-item-title>
              <v-list-item-subtitle>Buyer ID: {{ contract.buyer.id }}</v-list-item-subtitle>
            </v-list-item>
          </v-list>
        </v-card-text>
      </v-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'

// Route
const route = useRoute()
interface IAwardItem {
  id: string | number
  quantity: number
  description?: string
  classification: {
    id: string
    description: string
    scheme: string
  }
  unit: {
    id: string
    name: string
    value?: {
      amount: number
      currency: string
    }
  }
}

interface IAward {
  id: string
  title: string
  date: string
  status: string
  value?: {
    amount: number
    currency: string
  }
  items?: IAwardItem[]
  suppliers?: Array<{
    id: string
    name: string
  }>
  documents?: Array<{
    id: string
    documentType: string
    description: string
    url?: string
    datePublished?: string
  }>
}

interface IContract {
  id: string
  ocid: string
  date: string
  sourceYear: number
  initiationType: string
  tag: string[]
  sourceFileName?: string
  totalAmount?: number
  supplierCount?: number
  itemCount?: number
  documentCount?: number
  tender?: {
    title?: string
    status?: string
    description?: string
    procurementMethod?: string
    procurementMethodDetails?: string
    hasEnquiries?: boolean
    submissionMethodDetails?: string
    tenderPeriod?: {
      startDate: string
      endDate: string
    }
    procuringEntity?: {
      name: string
    }
    items?: unknown[]
    documents?: unknown[]
  }
  buyer?: {
    id: string
    name: string
  }
  awards?: IAward[]
  parties?: Array<{
    id: string
    name: string
    roles: string[]
    contactPoint?: {
      name: string
      telephone?: string
      email?: string
    }
  }>
}

// Reactive state
const loading = ref(false)
const error = ref(false)
const contract = ref<IContract | null>(null)
const expandedAwards = ref<number[]>([])

// Data table headers for items
const itemHeaders = ref([
  { title: 'Item ID', key: 'id', width: '100px' },
  { title: 'Classification', key: 'classification', sortable: false },
  { title: 'Quantity', key: 'quantity', align: 'end' },
  { title: 'Unit', key: 'unit', sortable: false },
  { title: 'Total Value', key: 'total', align: 'end', sortable: false },
])

// Data table headers for tender items
const tenderItemHeaders = ref([
  { title: 'Item ID', key: 'id', width: '100px' },
  { title: 'Description/Classification', key: 'description', sortable: false },
  { title: 'Quantity', key: 'quantity', align: 'end' },
  { title: 'Unit', key: 'unit', sortable: false },
  { title: 'Estimated Value', key: 'total', align: 'end', sortable: false },
])

// Methods
const loadContract = async () => {
  loading.value = true
  error.value = false

  try {
    const contractId = route.params.id as string
    const response = await fetch(`/api/contracts/${contractId}`)
    const result = await response.json()

    if (result.success) {
      contract.value = result.data
    }
    else {
      error.value = true
    }
  }
  catch (err) {
    console.error('Error loading contract:', err)
    error.value = true
  }
  finally {
    loading.value = false
  }
}

const formatDate = (dateString?: string): string => {
  if (!dateString) return 'N/A'
  return new Intl.DateTimeFormat('es-UY', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(dateString))
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

const exportContract = () => {
  console.log('Export contract:', contract.value?.id)
}

// Lifecycle
onMounted(() => {
  loadContract()
})
</script>

<style scoped>
.contract-detail {
  padding: 24px;
}

.gap-2 {
  gap: 8px;
}
</style>
