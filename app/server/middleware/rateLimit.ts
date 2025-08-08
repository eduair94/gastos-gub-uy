import { createError, defineEventHandler } from 'h3'

// Simple in-memory rate limiter
// In production, consider using Redis or a more sophisticated solution
interface ClientData {
  count: number
  resetTime: number
}

class RateLimiter {
  private requests: Map<string, ClientData> = new Map()
  private maxRequests: number
  private windowMs: number

  constructor(maxRequests = 100, windowMs = 60000) { // 100 requests per minute by default
    this.maxRequests = maxRequests
    this.windowMs = windowMs
  }

  isAllowed(clientId: string): boolean {
    const now = Date.now()
    const clientData = this.requests.get(clientId)

    if (!clientData || now > clientData.resetTime) {
      // Reset window for this client
      this.requests.set(clientId, {
        count: 1,
        resetTime: now + this.windowMs,
      })
      return true
    }

    if (clientData.count >= this.maxRequests) {
      return false
    }

    clientData.count++
    return true
  }

  cleanup(): void {
    const now = Date.now()
    for (const [clientId, data] of this.requests) {
      if (now > data.resetTime) {
        this.requests.delete(clientId)
      }
    }
  }
}

// Create different rate limiters for different types of endpoints
const apiLimiter = new RateLimiter(60, 60000) // 60 requests per minute for API endpoints
const searchLimiter = new RateLimiter(30, 60000) // 30 requests per minute for search endpoints
const exportLimiter = new RateLimiter(5, 60000) // 5 requests per minute for export endpoints

// Cleanup old entries periodically - only on server where this middleware runs
let cleanupInterval: NodeJS.Timeout | null = null

function startCleanup() {
  if (cleanupInterval) return // Already started

  cleanupInterval = setInterval(() => {
    apiLimiter.cleanup()
    searchLimiter.cleanup()
    exportLimiter.cleanup()
  }, 5 * 60 * 1000) // Every 5 minutes
}

// Start cleanup when this module is loaded (server-side only)
if (typeof window === 'undefined') {
  startCleanup()
}

function getClientId(event: any): string {
  // Use IP address as client identifier
  // In production, consider using user ID if authenticated
  return event.node.req.socket.remoteAddress || 'unknown'
}

function getRateLimiter(path: string): RateLimiter {
  if (path.includes('/search/')) {
    return searchLimiter
  }
  if (path.includes('/export/')) {
    return exportLimiter
  }
  return apiLimiter
}

export default defineEventHandler(async (event) => {
  // Only apply rate limiting to API routes
  if (!event.node.req.url?.startsWith('/api/')) {
    return
  }

  const clientId = getClientId(event)
  const limiter = getRateLimiter(event.node.req.url)

  if (!limiter.isAllowed(clientId)) {
    throw createError({
      statusCode: 429,
      statusMessage: 'Too Many Requests - Please slow down',
      data: {
        error: 'Rate limit exceeded',
        retryAfter: 60, // seconds
      },
    })
  }
})
