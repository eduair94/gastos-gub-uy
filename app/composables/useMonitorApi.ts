// Client-side typed helpers for the Monitor de Llamados endpoints. SSR pages use
// useFetch directly for initial data; this is for interactive mutations/queries.

// A SICE catalog node the watch builder can subscribe to: a rubro node (F/SF/C/SC
// token) or a bare article code. `token` is what the watch stores in `categories`.
export interface CatItem {
  token: string
  label: string
  level: 'familia' | 'subfamilia' | 'clase' | 'subclase' | 'articulo'
  path?: string
  articleCount?: number
  breadcrumb?: string[]
}

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

  // Community feedback on anomaly flags: up (1) / down (-1) vote + optional comment.
  const feedback = {
    save: (anomalyId: string, body: { vote: 1 | -1, comment?: string }) =>
      $fetch<{ data: { feedback: unknown, counts: { up: number, down: number } } }>(
        `/api/analytics/anomalies/${anomalyId}/feedback`, { method: 'POST', body },
      ),
    remove: (anomalyId: string) =>
      $fetch<{ data: { counts: { up: number, down: number } } }>(
        `/api/analytics/anomalies/${anomalyId}/feedback`, { method: 'DELETE' },
      ),
  }

  const account = {
    getPrefs: () => $fetch<{ data: unknown }>('/api/account/preferences'),
    updatePrefs: (body: {
      enabled?: boolean
      frequency?: string
      locale?: string
      channels?: Partial<Record<'email' | 'push' | 'telegram' | 'inapp', boolean>>
    }) => $fetch<{ data: unknown }>('/api/account/preferences', { method: 'PUT', body }),
  }

  interface InboxItem {
    id: string
    compraId: string
    matchedOn: { categories?: string[], keywords?: string[] } | null
    readAt: string | null
    createdAt: string
    call: {
      compraId: string
      ocid: string
      title: string
      buyer?: { id?: string, name?: string }
      status: string
      tenderPeriod?: { endDate?: string }
      procurementMethodDetails?: string
      estimatedValue?: number
      currency?: string
      sourceUrl?: string
    } | null
  }

  const notifications = {
    list: (params?: { limit?: number, skip?: number }) =>
      $fetch<{ data: { items: InboxItem[], unread: number, total: number, hasMore: boolean } }>('/api/notifications', { params }),
    read: (id: string) => $fetch<{ data: { updated: number } }>(`/api/notifications/${id}/read`, { method: 'POST' }),
    readAll: () => $fetch<{ data: { updated: number } }>('/api/notifications/read-all', { method: 'POST' }),
  }

  const telegram = {
    link: () => $fetch<{ data: { url: string, botUsername: string } }>('/api/telegram/link', { method: 'POST' }),
    unlink: () => $fetch<{ success: boolean }>('/api/telegram/unlink', { method: 'POST' }),
  }

  const categories = {
    browse: (parent?: string) => $fetch<{ data: CatItem[] }>('/api/categories', { params: parent ? { parent } : {} }),
    search: (q: string, limit = 30) => $fetch<{ data: CatItem[] }>('/api/categories', { params: { q, limit } }),
    resolve: (tokens: string[]) => $fetch<{ data: CatItem[] }>('/api/categories', { params: { resolve: tokens.join(',') } }),
  }

  const apiKeys = {
    list: () => $fetch<{ data: Array<{ _id: string, label: string, prefix: string, scopes: string[], lastUsedAt: string | null, createdAt: string }> }>('/api/account/api-keys'),
    create: (body: { label: string, scopes?: string[] }) => $fetch<{ data: { id: string, label: string, prefix: string, scopes: string[], token: string } }>('/api/account/api-keys', { method: 'POST', body }),
    revoke: (id: string) => $fetch<{ success: boolean }>(`/api/account/api-keys/${id}`, { method: 'DELETE' }),
  }

  const webhooks = {
    list: () => $fetch<{ data: Array<{ _id: string, url: string, events: string[], active: boolean, failureCount: number, lastDeliveryAt: string | null, createdAt: string }> }>('/api/v1/webhooks'),
    create: (body: { url: string, events: string[], filters?: Record<string, unknown> }) => $fetch<{ data: { id: string, url: string, events: string[], active: boolean, secret: string } }>('/api/v1/webhooks', { method: 'POST', body }),
    remove: (id: string) => $fetch<{ success: boolean }>(`/api/v1/webhooks/${id}`, { method: 'DELETE' }),
    test: (id: string) => $fetch<{ success: boolean, data: { ok: boolean, status?: number, error?: string } }>(`/api/v1/webhooks/${id}/test`, { method: 'POST' }),
  }

  return { watches, openCalls, savedCalls, calendar, feedback, account, notifications, telegram, categories, apiKeys, webhooks }
}
