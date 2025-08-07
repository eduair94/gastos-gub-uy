<template>
  <div class="buyer-detail-page">
    <!-- Loading State -->
    <div
      v-if="pending"
      class="d-flex justify-center align-center"
      style="min-height: 50vh"
    >
      <v-progress-circular
        indeterminate
        color="primary"
        size="64"
      />
    </div>

    <!-- Error State -->
    <v-alert
      v-else-if="error"
      type="error"
      variant="tonal"
      class="mb-6"
      closable
    >
      <v-alert-title>Error Loading Buyer</v-alert-title>
      {{ error.message || 'Failed to load buyer details' }}
    </v-alert>

    <!-- Content -->
    <div v-else-if="buyer">
      <!-- Header -->
      <div class="d-flex justify-space-between align-start mb-6">
        <div>
          <div class="d-flex align-center ga-3 mb-3">
            <v-btn
              :to="'/buyers'"
              icon="mdi-arrow-left"
              size="small"
              variant="outlined"
            />
            <div>
              <h1 class="text-h4 font-weight-bold">
                {{ buyer.name }}
              </h1>
              <div class="text-subtitle-1 text-medium-emphasis">
                Buyer ID: {{ buyer.buyerId }}
              </div>
            </div>
          </div>
        </div>

        <div class="d-flex ga-2">
          <v-btn
            color="primary"
            variant="tonal"
            prepend-icon="mdi-chart-line"
            @click="analyticsDialog = true"
          >
            View Analytics
          </v-btn>
          <v-btn
            color="info"
            variant="outlined"
            prepend-icon="mdi-code-json"
            @click="rawDataDialog = true"
          >
            Raw Data
          </v-btn>
        </div>
      </div>
    </div>

    <!-- Fallback state for debugging -->
    <div v-else>
      <div class="pa-4 bg-warning-lighten-4">
        <h3>Debug Information:</h3>
        <p>Pending: {{ pending }}</p>
        <p>Error: {{ error }}</p>
        <p>Buyer data: {{ buyer ? 'Available' : 'Not available' }}</p>
        <p>Route buyerId: {{ buyerId }}</p>
        <pre v-if="buyer">{{ JSON.stringify(buyer, null, 2) }}</pre>
      </div>
    </div>

    <!-- Key Metrics Cards -->
    <v-row class="mb-6">
      <v-col
        cols="12"
        sm="6"
        md="3"
      >
        <v-card>
          <v-card-text>
            <div class="d-flex align-center justify-space-between">
              <div>
                <div class="text-h6 font-weight-bold text-primary">
                  {{ buyer.totalContracts }}
                </div>
                <div class="text-caption text-medium-emphasis">
                  Total Contracts
                </div>
              </div>
              <v-icon
                color="primary"
                size="32"
              >
                mdi-file-document-multiple
              </v-icon>
            </div>
          </v-card-text>
        </v-card>
      </v-col>

      <v-col
        cols="12"
        sm="6"
        md="3"
      >
        <v-card>
          <v-card-text>
            <div class="d-flex align-center justify-space-between">
              <div>
                <div class="text-h6 font-weight-bold text-success">
                  {{ formatCurrency(buyer.totalSpending) }}
                </div>
                <div class="text-caption text-medium-emphasis">
                  Total Spending
                </div>
              </div>
              <v-icon
                color="success"
                size="32"
              >
                mdi-currency-usd
              </v-icon>
            </div>
          </v-card-text>
        </v-card>
      </v-col>

      <v-col
        cols="12"
        sm="6"
        md="3"
      >
        <v-card>
          <v-card-text>
            <div class="d-flex align-center justify-space-between">
              <div>
                <div class="text-h6 font-weight-bold text-info">
                  {{ buyer.supplierCount }}
                </div>
                <div class="text-caption text-medium-emphasis">
                  Unique Suppliers
                </div>
              </div>
              <v-icon
                color="info"
                size="32"
              >
                mdi-account-group
              </v-icon>
            </div>
          </v-card-text>
        </v-card>
      </v-col>

      <v-col
        cols="12"
        sm="6"
        md="3"
      >
        <v-card>
          <v-card-text>
            <div class="d-flex align-center justify-space-between">
              <div>
                <div class="text-h6 font-weight-bold text-warning">
                  {{ formatCurrency(buyer.avgContractValue) }}
                </div>
                <div class="text-caption text-medium-emphasis">
                  Avg Contract Value
                </div>
              </div>
              <v-icon
                color="warning"
                size="32"
              >
                mdi-calculator
              </v-icon>
            </div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <!-- Activity Timeline -->
    <v-card class="mb-6">
      <v-card-title>
        <v-icon class="mr-2">
          mdi-timeline-clock
        </v-icon>
        Activity Timeline
      </v-card-title>
      <v-card-text>
        <div class="d-flex align-center ga-4 text-body-2">
          <div>
            <strong>First Contract:</strong> {{ formatDate(buyer.firstContractDate) }}
          </div>
          <v-divider vertical />
          <div>
            <strong>Last Contract:</strong> {{ formatDate(buyer.lastContractDate) }}
          </div>
          <v-divider vertical />
          <div>
            <strong>Years Active:</strong> {{ buyer.yearCount }}
          </div>
        </div>
      </v-card-text>
    </v-card>

    <!-- Analytics Dialog -->
    <v-dialog
      v-model="analyticsDialog"
      max-width="1200"
      scrollable
    >
      <v-card v-if="buyer">
        <v-card-title>
          <v-icon class="mr-2">
            mdi-chart-line
          </v-icon>
          Analytics for {{ buyer.name }}
        </v-card-title>

        <v-card-text>
          <v-row>
            <!-- Spending by Year Chart -->
            <v-col
              cols="12"
              md="6"
            >
              <h3 class="mb-4">
                Spending by Year
              </h3>
              <div class="analytics-chart-container">
                <div
                  v-if="Object.keys(buyer.analytics.spendingByYear).length === 0"
                  class="text-center text-medium-emphasis pa-4"
                >
                  No spending data available
                </div>
                <div
                  v-else
                  class="chart-bars"
                >
                  <div
                    v-for="(amount, year) in buyer.analytics.spendingByYear"
                    :key="year"
                    class="chart-bar-item"
                  >
                    <div class="chart-bar-label">
                      {{ year }}
                    </div>
                    <div class="chart-bar-container">
                      <div
                        class="chart-bar"
                        :style="{
                          width: `${(amount / Math.max(...Object.values(buyer.analytics.spendingByYear).map(v => Number(v)))) * 100}%`,
                        }"
                      />
                    </div>
                    <div class="chart-bar-value">
                      {{ formatCurrency(amount) }}
                    </div>
                  </div>
                </div>
              </div>
            </v-col>

            <!-- Category Distribution -->
            <v-col
              cols="12"
              md="6"
            >
              <h3 class="mb-4">
                Category Distribution
              </h3>
              <div class="analytics-list">
                <div
                  v-if="Object.keys(buyer.analytics.categoryDistribution).length === 0"
                  class="text-center text-medium-emphasis pa-4"
                >
                  No category data available
                </div>
                <div
                  v-for="(count, category) in Object.fromEntries(
                    Object.entries(buyer.analytics.categoryDistribution)
                      .sort(([,a], [,b]) => Number(b) - Number(a))
                      .slice(0, 10),
                  )"
                  v-else
                  :key="category"
                  class="analytics-list-item"
                >
                  <div class="analytics-list-label">
                    {{ category }}
                  </div>
                  <v-chip
                    size="small"
                    color="primary"
                    variant="tonal"
                  >
                    {{ count }}
                  </v-chip>
                </div>
              </div>
            </v-col>

            <!-- Supplier Distribution -->
            <v-col cols="12">
              <h3 class="mb-4">
                Top Suppliers
              </h3>
              <div class="analytics-list">
                <div
                  v-if="Object.keys(buyer.analytics.supplierDistribution).length === 0"
                  class="text-center text-medium-emphasis pa-4"
                >
                  No supplier data available
                </div>
                <div
                  v-for="(count, supplier) in Object.fromEntries(
                    Object.entries(buyer.analytics.supplierDistribution)
                      .sort(([,a], [,b]) => Number(b) - Number(a))
                      .slice(0, 15),
                  )"
                  v-else
                  :key="supplier"
                  class="analytics-list-item"
                >
                  <div class="analytics-list-label">
                    {{ supplier }}
                  </div>
                  <v-chip
                    size="small"
                    color="info"
                    variant="tonal"
                  >
                    {{ count }} contracts
                  </v-chip>
                </div>
              </div>
            </v-col>
          </v-row>
        </v-card-text>

        <v-card-actions>
          <v-spacer />
          <v-btn
            color="primary"
            @click="analyticsDialog = false"
          >
            Close
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Raw Data Dialog -->
    <v-dialog
      v-model="rawDataDialog"
      max-width="800"
      scrollable
    >
      <v-card v-if="buyer">
        <v-card-title>
          <v-icon class="mr-2">
            mdi-code-json
          </v-icon>
          Raw Data
        </v-card-title>

        <v-card-text>
          <pre class="text-caption">{{ JSON.stringify(buyer, null, 2) }}</pre>
        </v-card-text>

        <v-card-actions>
          <v-spacer />
          <v-btn
            color="primary"
            @click="rawDataDialog = false"
          >
            Close
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
// Router params
const route = useRoute()
const buyerId = route.params.id as string

// Page meta
definePageMeta({
  layout: 'default',
})

// API data - Use useLazyFetch for better reactivity
const { data: buyer, pending, error } = await useLazyFetch(`/api/buyers/${encodeURIComponent(buyerId)}`)

// Dialog states
const analyticsDialog = ref(false)
const rawDataDialog = ref(false)

// Methods
const formatCurrency = (amount: number): string => {
  if (!amount) return '$0'
  return new Intl.NumberFormat('es-UY', {
    style: 'currency',
    currency: 'UYU',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

const formatDate = (dateString: string): string => {
  if (!dateString) return 'N/A'
  return new Date(dateString).toLocaleDateString('es-UY', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}
</script>

<style scoped>
.buyer-detail-page {
  padding: 24px;
  max-width: 1400px;
  margin: 0 auto;
}

.analytics-chart-container {
  background: #f5f5f5;
  border-radius: 8px;
  padding: 16px;
  min-height: 300px;
}

.chart-bars {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.chart-bar-item {
  display: flex;
  align-items: center;
  gap: 12px;
}

.chart-bar-label {
  width: 60px;
  font-weight: 500;
  font-size: 0.875rem;
}

.chart-bar-container {
  flex: 1;
  height: 24px;
  background: #e0e0e0;
  border-radius: 4px;
  overflow: hidden;
}

.chart-bar {
  height: 100%;
  background: linear-gradient(45deg, #1976d2, #42a5f5);
  border-radius: 4px;
  min-width: 2px;
  transition: width 0.3s ease;
}

.chart-bar-value {
  width: 120px;
  text-align: right;
  font-weight: 500;
  font-size: 0.875rem;
}

.analytics-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 400px;
  overflow-y: auto;
}

.analytics-list-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: #f5f5f5;
  border-radius: 6px;
}

.analytics-list-label {
  flex: 1;
  font-size: 0.875rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.text-h4 {
  color: #1976d2;
}

pre {
  background: #f5f5f5;
  padding: 16px;
  border-radius: 8px;
  overflow-x: auto;
  white-space: pre-wrap;
}
</style>
