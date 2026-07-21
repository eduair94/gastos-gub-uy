import { createError } from 'h3'
import { getClientId } from '../middleware/rateLimit'

/**
 * A tight per-IP limiter for the on-demand pliego summary endpoint. Generating a
 * summary spends a shared FREE Gemini/Groq quota (per-model daily caps), so this
 * is much stricter than the global 60/min API bucket: a handful per minute and a
 * couple dozen per day per client, on top of the global limiter.
 *
 * In-memory, per-process — matches the existing rateLimit middleware. Good enough
 * to stop a single client draining the daily budget; not a distributed guarantee.
 */
interface Bucket { count: number, resetTime: number }

class Limiter {
  private hits = new Map<string, Bucket>()
  constructor(private max: number, private windowMs: number) {}
  allow(id: string): boolean {
    const now = Date.now()
    const b = this.hits.get(id)
    if (!b || now > b.resetTime) {
      this.hits.set(id, { count: 1, resetTime: now + this.windowMs })
      return true
    }
    if (b.count >= this.max) return false
    b.count++
    return true
  }

  cleanup(): void {
    const now = Date.now()
    for (const [id, b] of this.hits) {
      if (now > b.resetTime) this.hits.delete(id)
    }
  }
}

const perMinute = new Limiter(4, 60_000)
const perDay = new Limiter(30, 24 * 60 * 60_000)

if (typeof window === 'undefined') {
  const timer = setInterval(() => {
    perMinute.cleanup()
    perDay.cleanup()
  }, 10 * 60_000)
  timer.unref?.()
}

/**
 * Throws 429 when the caller has exceeded the per-minute or per-day generation
 * budget. Internal SSR/loopback traffic (clientId null) is never limited — but
 * the summary POST is only ever fired by a user click, not SSR.
 */
export function enforcePliegoSummaryLimit(event: any): void {
  const id = getClientId(event)
  if (id === null) return
  if (!perMinute.allow(id)) {
    throw createError({ statusCode: 429, statusMessage: 'Demasiadas solicitudes. Probá de nuevo en un minuto.', data: { retryAfter: 60 } })
  }
  if (!perDay.allow(id)) {
    throw createError({ statusCode: 429, statusMessage: 'Alcanzaste el límite diario de resúmenes. Probá mañana.', data: { retryAfter: 3600 } })
  }
}
