import { createHash } from 'node:crypto'
import { defineEventHandler } from 'h3'

interface CacheEntry {
  data: any
  timestamp: number
  expiresAt: number
}

class SimpleCache {
  private cache: Map<string, CacheEntry> = new Map()
  private defaultTtl: number

  constructor(defaultTtl = 300000) { // 5 minutes default TTL
    this.defaultTtl = defaultTtl
  }

  get(key: string): any | null {
    const entry = this.cache.get(key)
    if (!entry) {
      return null
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key)
      return null
    }

    return entry.data
  }

  set(key: string, data: any, ttl?: number): void {
    const now = Date.now()
    const expiresAt = now + (ttl || this.defaultTtl)

    this.cache.set(key, {
      data,
      timestamp: now,
      expiresAt,
    })
  }

  delete(key: string): void {
    this.cache.delete(key)
  }

  clear(): void {
    this.cache.clear()
  }

  cleanup(): void {
    const now = Date.now()
    for (const [key, entry] of this.cache) {
      if (now > entry.expiresAt) {
        this.cache.delete(key)
      }
    }
  }

  getStats(): { size: number, hitRate?: number } {
    return {
      size: this.cache.size,
    }
  }
}

// Create cache instances for different types of data
const queryCache = new SimpleCache(300000) // 5 minutes for query results
const filterCache = new SimpleCache(1800000) // 30 minutes for filter options
const staticCache = new SimpleCache(3600000) // 1 hour for relatively static data

// Cleanup expired entries periodically - only on server where this middleware runs
let cleanupInterval: NodeJS.Timeout | null = null

function startCleanup() {
  if (cleanupInterval) return // Already started

  cleanupInterval = setInterval(() => {
    queryCache.cleanup()
    filterCache.cleanup()
    staticCache.cleanup()
  }, 10 * 60 * 1000) // Every 10 minutes
}

// Start cleanup when this module is loaded (server-side only)
if (typeof window === 'undefined') {
  startCleanup()
}

function getCacheKey(url: string, query: any): string {
  // Create a deterministic cache key from URL and query parameters
  const normalizedQuery = Object.keys(query)
    .sort()
    .reduce((acc, key) => {
      acc[key] = query[key]
      return acc
    }, {} as any)

  const keyString = `${url}:${JSON.stringify(normalizedQuery)}`
  return createHash('md5').update(keyString).digest('hex')
}

function getCacheInstance(url: string): SimpleCache {
  if (url.includes('/filters')) {
    return filterCache
  }
  if (url.includes('/dashboard/') || url.includes('/analytics/')) {
    return staticCache
  }
  return queryCache
}

function shouldCache(url: string, method: string): boolean {
  // Only cache GET requests
  if (method !== 'GET') {
    return false
  }

  // Cache these endpoints
  const cacheableEndpoints = [
    '/api/contracts',
    '/api/suppliers',
    '/api/buyers',
    '/api/contracts/filters',
    '/api/dashboard/',
    '/api/analytics/',
    '/api/search/',
  ]

  return cacheableEndpoints.some(endpoint => url.startsWith(endpoint))
}

export default defineEventHandler(async (event) => {
  const url = event.node.req.url || ''
  const method = event.node.req.method || 'GET'

  // Skip caching for non-cacheable requests
  if (!shouldCache(url, method)) {
    return
  }

  const query = getQuery(event)
  const cacheKey = getCacheKey(url, query)
  const cache = getCacheInstance(url)

  // Try to get from cache first
  const cachedResult = cache.get(cacheKey)
  if (cachedResult) {
    // Add cache hit header for debugging
    setHeader(event, 'X-Cache', 'HIT')
    return cachedResult
  }

  // Let the request continue to the actual handler
  // We'll cache the result in a response middleware
  event.context.cacheKey = cacheKey
  event.context.cache = cache
})

// Response middleware to cache successful responses
export const cacheResponse = defineEventHandler(async (event) => {
  // Only process responses that have cache context
  if (!event.context.cacheKey || !event.context.cache) {
    return
  }

  // We need to intercept the response after it's been processed
  // This will be handled in the individual API endpoints
})
