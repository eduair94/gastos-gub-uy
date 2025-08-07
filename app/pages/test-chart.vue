<template>
  <div class="pa-6">
    <h1 class="text-h4 mb-6">
      Chart Component Test
    </h1>

    <v-card class="mb-6">
      <v-card-title>Spending Trends Chart Test</v-card-title>
      <v-card-text>
        <div style="height: 400px;">
          <ChartsSpendingChart
            :trends="mockTrends"
            timeframe="10y"
          />
        </div>
      </v-card-text>
    </v-card>

    <v-card>
      <v-card-title>Mock Data</v-card-title>
      <v-card-text>
        <pre>{{ JSON.stringify(mockTrends, null, 2) }}</pre>
      </v-card-text>
    </v-card>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

// Mock data for testing the chart
const mockTrends = ref([
  { date: '2020-01-01', value: 5000000000, count: 1200 },
  { date: '2021-01-01', value: 5500000000, count: 1350 },
  { date: '2022-01-01', value: 6200000000, count: 1450 },
  { date: '2023-01-01', value: 6800000000, count: 1600 },
  { date: '2024-01-01', value: 7200000000, count: 1750 },
])
</script>
