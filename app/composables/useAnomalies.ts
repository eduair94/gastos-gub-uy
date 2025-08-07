import type { IAnomaly } from '../../shared/types/database'

interface AnomalyFilters {
  severity?: string
  type?: string
  dateRange?: string
  page?: number
  limit?: number
  sortBy?: string
  sortOrder?: string
}

interface AnomalyStats {
  total: number
  critical: number
  high: number
  recent: number
  weeklyChange: number
  monthlyChange: number
}

interface PaginationInfo {
  page: number
  limit: number
  total: number
  totalPages: number
}

export const useAnomalies = () => {
  const anomalies = ref<IAnomaly[]>([])
  const stats = ref<AnomalyStats | null>(null)
  const pagination = ref<PaginationInfo>({
    page: 1,
    limit: 25,
    total: 0,
    totalPages: 0,
  })
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  // Fetch anomalies with filters
  const fetchAnomalies = async (filters: AnomalyFilters = {}) => {
    isLoading.value = true
    error.value = null

    try {
      const params = new URLSearchParams()

      // Add pagination params
      params.append('page', (filters.page || pagination.value.page).toString())
      params.append('limit', (filters.limit || pagination.value.limit).toString())

      // Add filter params
      if (filters.severity) params.append('severity', filters.severity)
      if (filters.type) params.append('type', filters.type)
      if (filters.sortBy) params.append('sortBy', filters.sortBy)
      if (filters.sortOrder) params.append('sortOrder', filters.sortOrder)

      const { data } = await $fetch(`/api/analytics/anomalies?${params}`)

      anomalies.value = data.anomalies
      pagination.value = data.pagination

      return data
    }
    catch (err: any) {
      error.value = err.message || 'Failed to fetch anomalies'
      console.error('Error fetching anomalies:', err)
      throw err
    }
    finally {
      isLoading.value = false
    }
  }

  // Fetch anomaly statistics
  const fetchStats = async () => {
    try {
      const { data } = await $fetch('/api/analytics/anomalies/stats')
      stats.value = data.summary
      return data
    }
    catch (err: any) {
      error.value = err.message || 'Failed to fetch anomaly statistics'
      console.error('Error fetching anomaly stats:', err)
      throw err
    }
  }

  // Fetch single anomaly details
  const fetchAnomalyDetails = async (id: string) => {
    isLoading.value = true
    error.value = null

    try {
      const { data } = await $fetch(`/api/analytics/anomalies/${id}`)
      return data
    }
    catch (err: any) {
      error.value = err.message || 'Failed to fetch anomaly details'
      console.error('Error fetching anomaly details:', err)
      throw err
    }
    finally {
      isLoading.value = false
    }
  }

  // Update pagination
  const updatePagination = (newPagination: Partial<PaginationInfo>) => {
    pagination.value = { ...pagination.value, ...newPagination }
  }

  // Reset filters and data
  const reset = () => {
    anomalies.value = []
    stats.value = null
    pagination.value = {
      page: 1,
      limit: 25,
      total: 0,
      totalPages: 0,
    }
    error.value = null
  }

  // Utility functions for formatting
  const getSeverityColor = (severity: string): string => {
    const colors = {
      critical: 'error',
      high: 'warning',
      medium: 'info',
      low: 'success',
    }
    return colors[severity as keyof typeof colors] || 'grey'
  }

  const getTypeColor = (type: string): string => {
    const colors = {
      price_spike: 'error',
      suspicious_amount: 'warning',
      unusual_supplier: 'info',
      high_frequency: 'primary',
      outlier_quantity: 'secondary',
    }
    return colors[type as keyof typeof colors] || 'grey'
  }

  const getTypeIcon = (type: string): string => {
    const icons = {
      price_spike: 'mdi-trending-up',
      suspicious_amount: 'mdi-currency-usd',
      unusual_supplier: 'mdi-domain',
      high_frequency: 'mdi-clock-fast',
      outlier_quantity: 'mdi-package-variant',
    }
    return icons[type as keyof typeof icons] || 'mdi-alert'
  }

  const formatType = (type: string): string => {
    const labels = {
      price_spike: 'Price Spike',
      suspicious_amount: 'Suspicious Amount',
      unusual_supplier: 'Unusual Supplier',
      high_frequency: 'High Frequency',
      outlier_quantity: 'Outlier Quantity',
    }
    return labels[type as keyof typeof labels] || type
  }

  const getConfidenceColor = (confidence: number): string => {
    if (confidence >= 0.8) return 'success'
    if (confidence >= 0.6) return 'warning'
    return 'error'
  }

  const formatValue = (value: number, type: string): string => {
    if (type === 'suspicious_amount' || type === 'price_spike') {
      return new Intl.NumberFormat('es-UY', {
        style: 'currency',
        currency: 'UYU',
        minimumFractionDigits: 0,
      }).format(value)
    }
    if (type === 'outlier_quantity') {
      return value.toLocaleString()
    }
    return value.toString()
  }

  return {
    // State
    anomalies: readonly(anomalies),
    stats: readonly(stats),
    pagination: readonly(pagination),
    isLoading: readonly(isLoading),
    error: readonly(error),

    // Actions
    fetchAnomalies,
    fetchStats,
    fetchAnomalyDetails,
    updatePagination,
    reset,

    // Utility functions
    getSeverityColor,
    getTypeColor,
    getTypeIcon,
    formatType,
    getConfidenceColor,
    formatValue,
  }
}
