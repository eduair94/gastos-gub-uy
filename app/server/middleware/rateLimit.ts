import { createError, defineEventHandler, getHeader } from 'h3'

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
// Authenticated API-key callers get a much higher ceiling, keyed on the key id
// (not IP) so one integration can't exhaust another's budget. Reads are cheap;
// writes are throttled harder.
const keyedReadLimiter = new RateLimiter(600, 60000)
const keyedWriteLimiter = new RateLimiter(120, 60000)

// Cleanup old entries periodically - only on server where this middleware runs
let cleanupInterval: NodeJS.Timeout | null = null

function startCleanup() {
  if (cleanupInterval) return // Already started

  cleanupInterval = setInterval(() => {
    apiLimiter.cleanup()
    searchLimiter.cleanup()
    exportLimiter.cleanup()
    keyedReadLimiter.cleanup()
    keyedWriteLimiter.cleanup()
  }, 5 * 60 * 1000) // Every 5 minutes
}

// Start cleanup when this module is loaded (server-side only)
if (typeof window === 'undefined') {
  startCleanup()
}

/**
 * The real caller's IP — or `null` for our own internal traffic.
 *
 * This box sits behind Cloudflare + a reverse proxy, so `socket.remoteAddress`
 * is the PROXY's address: one value shared by every visitor. Keying the limiter
 * on it throttled the entire site as a single client — 60 requests total per
 * minute across all of Uruguay — and, worse, every SSR page render issues its
 * OWN internal `$fetch` to `/api/...` from loopback, which fell into the same
 * shared bucket. Under any real traffic the bucket emptied, those SSR fetches
 * got 429'd, and the page rendered its not-found state (a real contract showing
 * "No encontramos ese contrato"). So: prefer the IP the edge actually forwards,
 * and never rate-limit our own internal render traffic.
 */
function getClientId(event: any): string | null {
  const cf = getHeader(event, 'cf-connecting-ip')
  if (cf) return cf.trim()
  const xff = getHeader(event, 'x-forwarded-for')
  if (xff) return xff.split(',')[0]!.trim()
  const xr = getHeader(event, 'x-real-ip')
  if (xr) return xr.trim()

  // No forwarded header means the request did not arrive through the edge:
  // it is either an SSR-internal $fetch (loopback) — which MUST NOT be limited
  // or the server throttles itself — or a direct-to-origin hit. Only the latter
  // (a real, non-loopback socket) is limited; loopback/unknown is trusted.
  const ip = event.node.req.socket?.remoteAddress
  if (!ip || ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1') return null
  return ip
}

function getRateLimiter(path: string): RateLimiter {
  // Match on the path only — a query string must not decide the limit,
  // and the route is `/api/search?q=…` with no trailing slash, so the
  // old `includes('/search/')` test never once matched and every search
  // silently got the loose 60/min bucket instead of 30/min.
  const route = path.split('?')[0].replace(/\/+$/, '')

  if (route === '/api/search' || route.startsWith('/api/search/')) {
    return searchLimiter
  }
  if (route === '/api/export' || route.startsWith('/api/export/')) {
    return exportLimiter
  }
  return apiLimiter
}

export default defineEventHandler(async (event) => {
  // Only apply rate limiting to API routes
  if (!event.node.req.url?.startsWith('/api/')) {
    return
  }

  // Authenticated API-key callers are limited on their key id, not their IP, at
  // a much higher ceiling. apiAuth.ts already validated the key and set context.
  const apiKey = event.context.apiKey as { id: string } | null
  if (apiKey) {
    const isWrite = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(event.node.req.method || 'GET')
    const limiter = isWrite ? keyedWriteLimiter : keyedReadLimiter
    if (!limiter.isAllowed(`key:${apiKey.id}`)) {
      throw createError({
        statusCode: 429,
        statusMessage: 'Too Many Requests - Please slow down',
        data: { error: 'Rate limit exceeded', retryAfter: 60 },
      })
    }
    return
  }

  const clientId = getClientId(event)
  // Internal SSR render traffic (loopback / no forwarded IP): never limit — see getClientId.
  if (clientId === null) {
    return
  }

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
