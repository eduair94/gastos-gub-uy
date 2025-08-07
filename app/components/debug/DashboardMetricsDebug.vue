<template>
  <v-card class="ma-4">
    <v-card-title>
      Dashboard Metrics Debug Panel
    </v-card-title>

    <v-card-text>
      <v-row>
        <v-col
          cols="12"
          md="6"
        >
          <h4>Metrics State</h4>
          <pre>{{ JSON.stringify(metrics, null, 2) }}</pre>
        </v-col>

        <v-col
          cols="12"
          md="6"
        >
          <h4>Quick Stats</h4>
          <pre>{{ JSON.stringify(quickStats, null, 2) }}</pre>
        </v-col>
      </v-row>

      <v-row class="mt-4">
        <v-col cols="12">
          <h4>Loading & Error States</h4>
          <p>Loading: {{ isLoading }}</p>
          <p>Error: {{ error }}</p>
          <p>Auto-refresh enabled: {{ isAutoRefreshEnabled }}</p>
          <p>Auto-refresh interval: {{ autoRefreshInterval }}ms</p>
        </v-col>
      </v-row>

      <v-row class="mt-4">
        <v-col cols="12">
          <h4>Actions</h4>
          <v-btn
            class="mr-2 mb-2"
            color="primary"
            :loading="isLoading"
            @click="refreshMetrics"
          >
            Manual Refresh
          </v-btn>

          <v-btn
            class="mr-2 mb-2"
            :color="isAutoRefreshEnabled ? 'error' : 'success'"
            @click="toggleAutoRefresh"
          >
            {{ isAutoRefreshEnabled ? 'Stop' : 'Start' }} Auto-refresh
          </v-btn>

          <v-btn
            class="mr-2 mb-2"
            color="info"
            @click="initializeDashboard"
          >
            Re-initialize
          </v-btn>
        </v-col>
      </v-row>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
const {
  metrics,
  quickStats,
  isLoading,
  error,
  refreshMetrics,
  initializeDashboard,
  isAutoRefreshEnabled,
  autoRefreshInterval,
  startAutoRefresh,
  stopAutoRefresh,
} = useDashboardMetrics()

const toggleAutoRefresh = () => {
  if (isAutoRefreshEnabled.value) {
    stopAutoRefresh()
  }
  else {
    startAutoRefresh()
  }
}
</script>
