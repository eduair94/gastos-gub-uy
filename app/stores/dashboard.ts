import { defineStore } from 'pinia'
import { useApi } from '~/composables/useApi'
import type {
  DashboardMetrics,
  IAnomaly,
  ITopCategory,
  ITopEntity,
  TimeSeriesData,
} from '~/types'

interface DashboardState {
  metrics: DashboardMetrics | null
  spendingTrends: TimeSeriesData[]
  topSuppliers: ITopEntity[]
  topBuyers: ITopEntity[]
  topCategories: ITopCategory[]
  recentAnomalies: IAnomaly[]
  loading: {
    metrics: boolean
    trends: boolean
    suppliers: boolean
    buyers: boolean
    categories: boolean
    anomalies: boolean
  }
  error: string | null
}

export const useDashboardStore = defineStore('dashboard', {
  state: (): DashboardState => ({
    metrics: null,
    spendingTrends: [],
    topSuppliers: [],
    topBuyers: [],
    topCategories: [],
    recentAnomalies: [],
    loading: {
      metrics: false,
      trends: false,
      suppliers: false,
      buyers: false,
      categories: false,
      anomalies: false,
    },
    error: null,
  }),

  getters: {
    isLoading: state => Object.values(state.loading).some(loading => loading),

    currentYearSpending: (state) => {
      const currentYear = new Date().getFullYear()
      const currentYearData = state.spendingTrends.find(
        trend => new Date(trend.date).getFullYear() === currentYear,
      )
      return currentYearData?.value || 0
    },

    spendingGrowth: (state) => {
      if (state.spendingTrends.length < 2) return 0

      const currentYear = new Date().getFullYear()
      const currentYearData = state.spendingTrends.find(
        trend => new Date(trend.date).getFullYear() === currentYear,
      )
      const previousYearData = state.spendingTrends.find(
        trend => new Date(trend.date).getFullYear() === currentYear - 1,
      )

      if (!currentYearData || !previousYearData) return 0

      return ((currentYearData.value - previousYearData.value) / previousYearData.value) * 100
    },

    criticalAnomalies: state =>
      state.recentAnomalies.filter(anomaly => anomaly.severity === 'critical'),

    highValueContracts: (state) => {
      if (!state.metrics) return 0
      return Math.floor(state.metrics.totalSpending / 1000000) // Contracts in millions
    },
  },

  actions: {
    async fetchDashboardMetrics() {
      this.loading.metrics = true
      this.error = null

      try {
        const api = useApi()
        const response = await api.getDashboardMetrics()
        if (response.success && response.data) {
          this.metrics = response.data
        }
      }
      catch (error) {
        this.error = error instanceof Error ? error.message : 'Failed to fetch dashboard metrics'
        console.error('Error fetching dashboard metrics:', error)
      }
      finally {
        this.loading.metrics = false
      }
    },

    async fetchSpendingTrends(params?: { years?: number[], groupBy?: 'month' | 'year' }) {
      this.loading.trends = true
      this.error = null

      try {
        const api = useApi()
        const response = await api.getSpendingTrends(params)
        if (response.success && response.data) {
          this.spendingTrends = response.data
        }
      }
      catch (error) {
        this.error = error instanceof Error ? error.message : 'Failed to fetch spending trends'
        console.error('Error fetching spending trends:', error)
      }
      finally {
        this.loading.trends = false
      }
    },

    async fetchTopSuppliers(limit = 10, year?: number) {
      this.loading.suppliers = true
      this.error = null

      try {
        const api = useApi()
        const response = await api.getTopSuppliers({ limit, year })
        if (response.success && response.data) {
          this.topSuppliers = response.data
        }
      }
      catch (error) {
        this.error = error instanceof Error ? error.message : 'Failed to fetch top suppliers'
        console.error('Error fetching top suppliers:', error)
      }
      finally {
        this.loading.suppliers = false
      }
    },

    async fetchTopBuyers(limit = 10, year?: number) {
      this.loading.buyers = true
      this.error = null

      try {
        const api = useApi()
        const response = await api.getTopBuyers({ limit, year })
        if (response.success && response.data) {
          this.topBuyers = response.data
        }
      }
      catch (error) {
        this.error = error instanceof Error ? error.message : 'Failed to fetch top buyers'
        console.error('Error fetching top buyers:', error)
      }
      finally {
        this.loading.buyers = false
      }
    },

    async fetchCategoryDistribution(year?: number) {
      this.loading.categories = true
      this.error = null

      try {
        const api = useApi()
        const response = await api.getCategoryDistribution({ year })
        if (response.success && response.data) {
          this.topCategories = response.data.slice(0, 10) // Top 10 categories
        }
      }
      catch (error) {
        this.error = error instanceof Error ? error.message : 'Failed to fetch category distribution'
        console.error('Error fetching category distribution:', error)
      }
      finally {
        this.loading.categories = false
      }
    },

    async fetchRecentAnomalies(limit = 5) {
      this.loading.anomalies = true
      this.error = null

      try {
        const api = useApi()
        const response = await api.getAnomalies({
          limit,
          page: 1,
        })
        if (response.success && response.data) {
          // Handle the nested data structure from anomalies API
          this.recentAnomalies = Array.isArray(response.data)
            ? response.data
            : response.data.anomalies || []
        }
      }
      catch (error) {
        this.error = error instanceof Error ? error.message : 'Failed to fetch recent anomalies'
        console.error('Error fetching recent anomalies:', error)
      }
      finally {
        this.loading.anomalies = false
      }
    },

    async initializeDashboard() {
      // Fetch all dashboard data in parallel
      await Promise.allSettled([
        this.fetchDashboardMetrics(),
        this.fetchSpendingTrends({ groupBy: 'year' }),
        this.fetchTopSuppliers(10),
        this.fetchTopBuyers(10),
        this.fetchCategoryDistribution(),
        this.fetchRecentAnomalies(5),
      ])
    },

    clearError() {
      this.error = null
    },

    refreshData() {
      return this.initializeDashboard()
    },
  },
})
