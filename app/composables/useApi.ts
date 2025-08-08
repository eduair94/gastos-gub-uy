import type { ApiResponse, PaginatedResponse } from '~/types'

export class ApiClient {
  private baseURL: string
  private defaultHeaders: Record<string, string>

  constructor(baseURL: string) {
    this.baseURL = baseURL
    this.defaultHeaders = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    }
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<T> {
    let url: string

    // Handle SSR vs client-side rendering
    if (import.meta.server) {
      // On server-side, construct full URL
      url = `http://localhost:3600${this.baseURL}${endpoint}`
    }
    else {
      // On client-side, use relative URLs
      url = `${this.baseURL}${endpoint}`
    }

    try {
      // Use Nuxt's $fetch for better SSR support
      const data = await $fetch(url, {
        method: options.method as any || 'GET',
        headers: {
          ...this.defaultHeaders,
          ...options.headers,
        },
        body: options.body,
      }) as T
      return data
    }
    catch (error) {
      console.error('API request failed:', error)
      throw error
    }
  }

  // GET request
  async get<T>(endpoint: string, params?: Record<string, any>): Promise<T> {
    let url = endpoint

    if (params) {
      const searchParams = new URLSearchParams()
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          if (Array.isArray(value)) {
            value.forEach(v => searchParams.append(key, String(v)))
          }
          else {
            searchParams.append(key, String(value))
          }
        }
      })
      url += `?${searchParams.toString()}`
    }

    return this.request<T>(url, { method: 'GET' })
  }

  // POST request
  async post<T>(endpoint: string, data?: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    })
  }

  // PUT request
  async put<T>(endpoint: string, data?: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    })
  }

  // DELETE request
  async delete<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'DELETE' })
  }

  // Specialized methods for our API

  // Dashboard endpoints
  async getDashboardMetrics(): Promise<ApiResponse<any>> {
    return this.get('/dashboard/metrics')
  }

  async getSpendingTrends(params?: { years?: number[], groupBy?: 'month' | 'year' }): Promise<ApiResponse<any[]>> {
    return this.get('/dashboard/spending-trends', params)
  }

  // Contracts endpoints
  async getContracts(params?: {
    page?: number
    limit?: number
    search?: string
    year?: number
    yearFrom?: number
    yearTo?: number
    amountFrom?: number
    amountTo?: number
    status?: string[]
    suppliers?: string[]
    buyers?: string[]
    categories?: string[]
    procurementMethod?: string[]
    sortBy?: string
    sortOrder?: 'asc' | 'desc'
  }): Promise<ApiResponse<any>> {
    return this.get('/contracts', params)
  }

  async getContract(id: string): Promise<ApiResponse<any>> {
    return this.get(`/contracts/${id}`)
  }

  async getContractFilters(): Promise<ApiResponse<any>> {
    return this.get('/contracts/filters')
  }

  // Suppliers endpoints
  async getSuppliers(params?: {
    page?: number
    limit?: number
    search?: string
    sortBy?: string
    sortOrder?: 'asc' | 'desc'
  }): Promise<PaginatedResponse<any>> {
    return this.get('/suppliers', params)
  }

  async getSupplier(id: string): Promise<ApiResponse<any>> {
    return this.get(`/suppliers/${id}`)
  }

  async getSupplierContracts(id: string, params?: {
    page?: number
    limit?: number
  }): Promise<PaginatedResponse<any>> {
    return this.get(`/suppliers/${id}/contracts`, params)
  }

  async getSupplierAnalytics(id: string): Promise<ApiResponse<any>> {
    return this.get(`/suppliers/${id}/analytics`)
  }

  // Buyers endpoints
  async getBuyers(params?: {
    page?: number
    limit?: number
    search?: string
    sortBy?: string
    sortOrder?: 'asc' | 'desc'
  }): Promise<PaginatedResponse<any>> {
    return this.get('/buyers', params)
  }

  async getBuyer(id: string): Promise<ApiResponse<any>> {
    return this.get(`/buyers/${id}`)
  }

  async getBuyerContracts(id: string, params?: {
    page?: number
    limit?: number
  }): Promise<PaginatedResponse<any>> {
    return this.get(`/buyers/${id}/contracts`, params)
  }

  async getBuyerAnalytics(id: string): Promise<ApiResponse<any>> {
    return this.get(`/buyers/${id}/analytics`)
  }

  // Analytics endpoints
  async getExpenseInsights(params?: {
    year?: number
    month?: number
  }): Promise<ApiResponse<any[]>> {
    return this.get('/analytics/expenses', params)
  }

  async getAnomalies(params?: {
    page?: number
    limit?: number
    type?: string
    severity?: string
  }): Promise<PaginatedResponse<any>> {
    return this.get('/analytics/anomalies', params)
  }

  async getTopSuppliers(params?: {
    limit?: number
    year?: number
    category?: string
  }): Promise<ApiResponse<any[]>> {
    return this.get('/analytics/top-suppliers', params)
  }

  async getTopBuyers(params?: {
    limit?: number
    year?: number
    category?: string
  }): Promise<ApiResponse<any[]>> {
    return this.get('/analytics/top-buyers', params)
  }

  async getCategoryDistribution(params?: {
    year?: number
    entityType?: 'supplier' | 'buyer'
  }): Promise<ApiResponse<any[]>> {
    return this.get('/analytics/category-distribution', params)
  }

  // Search and autocomplete
  async searchSuppliers(query: string, limit = 10): Promise<ApiResponse<any[]>> {
    return this.get('/search/suppliers', { query, limit })
  }

  async searchBuyers(query: string, limit = 10): Promise<ApiResponse<any[]>> {
    return this.get('/search/buyers', { query, limit })
  }

  async searchCategories(query: string, limit = 10): Promise<ApiResponse<string[]>> {
    return this.get('/search/categories', { query, limit })
  }

  // Export endpoints
  async exportContracts(filters?: any, format = 'csv'): Promise<Blob> {
    let url: string
    const endpoint = `/export/contracts?format=${format}`

    if (import.meta.server) {
      const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http'
      const host = process.env.NUXT_HOST || process.env.HOST || 'localhost'
      const port = process.env.NUXT_PORT || process.env.PORT || '3600'
      const fullHost = process.env.NODE_ENV === 'production' && (port === '80' || port === '443')
        ? host
        : `${host}:${port}`
      url = `${protocol}://${fullHost}${this.baseURL}${endpoint}`
    }
    else {
      url = `${this.baseURL}${endpoint}`
    }

    const response = await $fetch<Blob>(url, {
      method: 'POST',
      headers: this.defaultHeaders,
      body: filters ? JSON.stringify(filters) : undefined,
      responseType: 'blob',
    })

    return response
  }

  async exportSuppliers(filters?: any, format = 'csv'): Promise<Blob> {
    let url: string
    const endpoint = `/export/suppliers?format=${format}`

    if (import.meta.server) {
      const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http'
      const host = process.env.NUXT_HOST || process.env.HOST || 'localhost'
      const port = process.env.NUXT_PORT || process.env.PORT || '3600'
      const fullHost = process.env.NODE_ENV === 'production' && (port === '80' || port === '443')
        ? host
        : `${host}:${port}`
      url = `${protocol}://${fullHost}${this.baseURL}${endpoint}`
    }
    else {
      url = `${this.baseURL}${endpoint}`
    }

    const response = await $fetch<Blob>(url, {
      method: 'POST',
      headers: this.defaultHeaders,
      body: filters ? JSON.stringify(filters) : undefined,
      responseType: 'blob',
    })

    return response
  }
}

// Composable to get API client instance
export const useApi = () => {
  const config = useRuntimeConfig()
  return new ApiClient(config.public.apiBase)
}
