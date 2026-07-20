// The single door to Google Analytics. Nothing in the app calls gtag()
// directly — everything goes through track(), which is the only place that
// knows about GA4's limits, the PII rules and whether measurement is on at all.
//
// It is deliberately context-free: the client plugin hands it the gtag
// function once (registerGtag), so track() can be called from a component
// handler, a composable, a plugin or a plain util without a Nuxt instance.
// On the server, and before the plugin runs, every call is a silent no-op.

import type { AnalyticsEvent } from '~/utils/analytics-events'

type Primitive = string | number | boolean
export type EventParams = Record<string, unknown>

/** GA4 hard limits: 25 params per event, 100 chars per value, 40 per name. */
const MAX_PARAMS = 25
const MAX_VALUE_LEN = 100
const MAX_NAME_LEN = 40

/**
 * Parameter names that must never reach Google. Matched on whole
 * underscore-separated words so `supplier_id` survives but `id_token` does not.
 */
const BLOCKED_KEY = /(^|_)(email|mail|password|passwd|pass|token|secret|credential|apikey|key|uid|userid|phone|tel|cedula|address)(_|$)/i

/** Free-text values (search terms!) can contain an address the reader typed. */
const EMAIL_IN_VALUE = /[\w.+-]+@[\w-]+\.[\w.-]+/g

let _gtag: ((...args: unknown[]) => void) | null = null
let _debug = false

/** Called once by plugins/analytics.client.ts. */
export function registerGtag(fn: (...args: unknown[]) => void, debug = false) {
  _gtag = fn
  _debug = debug
}

export function isAnalyticsReady() {
  return _gtag !== null
}

function sanitizeValue(value: unknown): Primitive | undefined {
  if (value === null || value === undefined) return undefined
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value === 'string') {
    const cleaned = value.replace(EMAIL_IN_VALUE, '[email]').trim()
    if (!cleaned) return undefined
    return cleaned.length > MAX_VALUE_LEN ? cleaned.slice(0, MAX_VALUE_LEN) : cleaned
  }
  if (Array.isArray(value)) {
    // Arrays are not a GA4 param type; join short lists, count long ones.
    const flat = value.filter(v => v !== null && v !== undefined).map(String)
    if (!flat.length) return undefined
    const joined = flat.join(',')
    return joined.length > MAX_VALUE_LEN ? `${flat.length} items` : joined
  }
  return undefined
}

export function sanitizeParams(params: EventParams = {}): Record<string, Primitive> {
  const out: Record<string, Primitive> = {}
  let count = 0
  for (const [rawKey, rawValue] of Object.entries(params)) {
    if (count >= MAX_PARAMS) break
    const key = rawKey.slice(0, MAX_NAME_LEN)
    if (BLOCKED_KEY.test(key)) continue
    const value = sanitizeValue(rawValue)
    if (value === undefined) continue
    out[key] = value
    count++
  }
  return out
}

/**
 * Record an event. Unknown-but-typed names only, so a typo is a build error
 * rather than a metric that silently never appears in GA.
 */
export function trackEvent(name: AnalyticsEvent, params?: EventParams) {
  if (!import.meta.client) return
  const clean = sanitizeParams(params)
  if (_debug) console.debug('[analytics]', name, clean)
  if (!_gtag) return
  _gtag('event', name, clean)
}

export function useAnalytics() {
  return {
    /** @see trackEvent */
    track: trackEvent,
    sanitizeParams,
    isReady: isAnalyticsReady,
  }
}
