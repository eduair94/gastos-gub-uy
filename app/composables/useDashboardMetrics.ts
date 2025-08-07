import { useDashboardStore } from '~/stores/dashboard'
import type { DashboardMetrics } from '~/types'

interface QuickStats {
  contracts: number
  suppliers: number
  buyers: number
  spending: number
}

interface DashboardMetricsComposable {
  // Raw dashboard metrics
  metrics: ComputedRef<DashboardMetrics | null>

  // Formatted quick stats for layout
  quickStats: ComputedRef<QuickStats>

  // Loading and error states
  isLoading: ComputedRef<boolean>
  error: ComputedRef<string | null>

  // Actions
  refreshMetrics: () => Promise<void>
  initializeDashboard: () => Promise<void>

  // Auto-refresh controls
  isAutoRefreshEnabled: Ref<boolean>
  autoRefreshInterval: Ref<number>
  startAutoRefresh: (onRefresh?: () => void) => void
  stopAutoRefresh: () => void
}

/**
 * Composable for accessing dashboard metrics across components
 * Provides both raw metrics and formatted quick stats
 */
export const useDashboardMetrics = (): DashboardMetricsComposable => {
  const dashboardStore = useDashboardStore()

  // Auto-refresh configuration
  const isAutoRefreshEnabled = ref(false)
  const autoRefreshInterval = ref(5 * 60 * 1000) // 5 minutes default
  let refreshTimer: NodeJS.Timeout | null = null
  let onRefreshCallback: (() => void) | undefined

  // Initialize dashboard if not already done
  onMounted(async () => {
    if (!dashboardStore.metrics && !dashboardStore.loading.metrics) {
      await dashboardStore.initializeDashboard()
    }
  })

  // Cleanup on unmount
  onUnmounted(() => {
    if (refreshTimer) {
      clearInterval(refreshTimer)
      refreshTimer = null
    }
  })

  // Raw dashboard metrics
  const metrics = computed(() => dashboardStore.metrics)

  // Formatted quick stats for the layout sidebar
  const quickStats = computed((): QuickStats => {
    if (!dashboardStore.metrics) {
      return {
        contracts: 0,
        suppliers: 0,
        buyers: 0,
        spending: 0,
      }
    }

    return {
      contracts: dashboardStore.metrics.totalContracts || 0,
      suppliers: dashboardStore.metrics.totalSuppliers || 0,
      buyers: dashboardStore.metrics.totalBuyers || 0,
      spending: dashboardStore.metrics.totalSpending || 0,
    }
  })

  // Loading state - combines all relevant loading states
  const isLoading = computed(() => {
    return dashboardStore.loading.metrics
      || dashboardStore.loading.trends
      || dashboardStore.loading.suppliers
      || dashboardStore.loading.buyers
  })

  // Error state
  const error = computed(() => dashboardStore.error)

  // Actions
  const refreshMetrics = async () => {
    try {
      await dashboardStore.refreshData()
    }
    catch (err) {
      console.error('Error refreshing dashboard metrics:', err)
    }
  }

  const initializeDashboard = async () => {
    try {
      await dashboardStore.initializeDashboard()
    }
    catch (err) {
      console.error('Error initializing dashboard:', err)
    }
  }

  // Auto-refresh functions
  const startAutoRefresh = (onRefresh?: () => void) => {
    if (refreshTimer) {
      clearInterval(refreshTimer)
    }

    onRefreshCallback = onRefresh
    isAutoRefreshEnabled.value = true
    refreshTimer = setInterval(async () => {
      if (!dashboardStore.loading.metrics) {
        await refreshMetrics()
        if (onRefreshCallback) {
          onRefreshCallback()
        }
      }
    }, autoRefreshInterval.value)
  }

  const stopAutoRefresh = () => {
    if (refreshTimer) {
      clearInterval(refreshTimer)
      refreshTimer = null
    }
    isAutoRefreshEnabled.value = false
  }

  return {
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
  }
}
