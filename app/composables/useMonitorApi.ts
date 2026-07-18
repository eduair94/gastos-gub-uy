// Client-side typed helpers for the Monitor de Llamados endpoints. SSR pages use
// useFetch directly for initial data; this is for interactive mutations/queries.
export interface WatchPayload {
  name: string
  active?: boolean
  categories: string[]
  keywords: string[]
  keywordMode: 'any' | 'all'
  buyers: string[]
  minValue?: number
  maxValue?: number
  procurementMethods?: string[]
}

export function useMonitorApi() {
  const watches = {
    list: () => $fetch<{ data: unknown[] }>('/api/watches'),
    create: (body: WatchPayload) => $fetch<{ data: unknown }>('/api/watches', { method: 'POST', body }),
    get: (id: string) => $fetch<{ data: unknown }>(`/api/watches/${id}`),
    update: (id: string, body: WatchPayload) => $fetch<{ data: unknown }>(`/api/watches/${id}`, { method: 'PUT', body }),
    remove: (id: string) => $fetch<{ success: boolean }>(`/api/watches/${id}`, { method: 'DELETE' }),
    test: (body: Partial<WatchPayload>) => $fetch<{ data: { total: number, sample: Array<{ compraId: string, title: string, endDate: string | null }> } }>('/api/watches/test', { method: 'POST', body }),
  }

  const openCalls = {
    list: (params?: Record<string, unknown>) => $fetch<{ data: { calls: unknown[], pagination: Record<string, unknown> } }>('/api/open-calls', { params }),
    get: (compraId: string) => $fetch<{ data: unknown }>(`/api/open-calls/${compraId}`),
    summary: (compraId: string) => $fetch<{ data: { available: boolean, summary?: unknown, hasPliego?: boolean } }>(`/api/open-calls/${compraId}/summary`),
    benchmarks: (compraId: string) => $fetch<{ data: { benchmarks: unknown[] } }>(`/api/open-calls/${compraId}/benchmarks`),
  }

  const savedCalls = {
    list: () => $fetch<{ data: unknown[] }>('/api/saved-calls'),
    save: (body: { compraId: string, note?: string, reminderDaysBefore?: number }) => $fetch<{ data: unknown }>('/api/saved-calls', { method: 'POST', body }),
    remove: (compraId: string) => $fetch<{ success: boolean }>(`/api/saved-calls/${compraId}`, { method: 'DELETE' }),
  }

  const calendar = {
    list: () => $fetch<{ data: { items: unknown[] } }>('/api/calendar'),
  }

  const account = {
    getPrefs: () => $fetch<{ data: unknown }>('/api/account/preferences'),
    updatePrefs: (body: { enabled?: boolean, frequency?: string, locale?: string }) => $fetch<{ data: unknown }>('/api/account/preferences', { method: 'PUT', body }),
  }

  const categories = {
    search: (q: string, limit = 30) => $fetch<{ data: Array<{ code: string, description: string, lineCount: number, contractCount: number }> }>('/api/categories', { params: { q, limit } }),
  }

  return { watches, openCalls, savedCalls, calendar, account, categories }
}
