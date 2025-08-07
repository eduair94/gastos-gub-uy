<template>
  <div class="pa-6">
    <h1 class="text-h4 mb-6">
      Dashboard Metrics Test
    </h1>

    <DashboardMetricsDebug />

    <v-alert
      class="mt-4"
      type="info"
      variant="outlined"
    >
      <strong>Testing Auto-refresh Implementation:</strong><br>
      • QuickStats in the sidebar should update automatically every 5 minutes<br>
      • Manual refresh button should work instantly<br>
      • Auto-refresh toggle should enable/disable periodic updates<br>
      • Notifications should appear on refresh events<br>
      • Loading states should be visible during data fetching
    </v-alert>
  </div>
</template>

<script setup lang="ts">
// Set page title
useHead({
  title: 'Dashboard Metrics Test',
})
</script>
