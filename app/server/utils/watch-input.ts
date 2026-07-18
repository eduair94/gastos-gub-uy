import { createError } from 'h3'
import { normalizeKeyword } from '../../../shared/utils/text'

// Free-tier cap on watches per user — bounds the matcher's per-call work.
export const WATCH_CAP = Number(process.env.WATCH_CAP_FREE ?? 10)

const MAX_KEYWORDS = 25
const MAX_CATEGORIES = 50
const MAX_BUYERS = 50
const MAX_METHODS = 20

export interface WatchPayload {
  name: string
  active: boolean
  categories: string[]
  keywords: string[]
  keywordMode: 'any' | 'all'
  buyers: string[]
  minValue?: number
  maxValue?: number
  procurementMethods?: string[]
}

function toStrArray(v: unknown): string[] {
  if (v === undefined || v === null || v === '') return []
  const arr = Array.isArray(v) ? v : [v]
  return arr.map(x => String(x).trim()).filter(Boolean)
}

function numOrUndef(v: unknown): number | undefined {
  if (v === undefined || v === null || v === '') return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

/** Validates + normalizes a watch payload from a request body. */
export function parseWatchPayload(body: Record<string, unknown> | null): WatchPayload {
  const name = String(body?.name ?? '').trim().slice(0, 120)
  if (!name) {
    throw createError({ statusCode: 400, statusMessage: 'El nombre de la alerta es obligatorio' })
  }

  const categories = Array.from(new Set(toStrArray(body?.categories))).slice(0, MAX_CATEGORIES)
  // Keywords are normalized on the way in so they compare identically to a call's
  // searchText (shared/utils/text) — the whole matcher depends on this parity.
  const keywords = Array.from(new Set(toStrArray(body?.keywords).map(normalizeKeyword).filter(Boolean))).slice(0, MAX_KEYWORDS)
  const buyers = Array.from(new Set(toStrArray(body?.buyers))).slice(0, MAX_BUYERS)
  const procurementMethods = Array.from(new Set(toStrArray(body?.procurementMethods))).slice(0, MAX_METHODS)

  if (!categories.length && !keywords.length && !buyers.length) {
    throw createError({ statusCode: 400, statusMessage: 'Definí al menos una categoría, palabra clave u organismo' })
  }

  const keywordMode: 'any' | 'all' = body?.keywordMode === 'all' ? 'all' : 'any'
  const active = body?.active === undefined ? true : Boolean(body.active)
  const minValue = numOrUndef(body?.minValue)
  const maxValue = numOrUndef(body?.maxValue)

  const payload: WatchPayload = { name, active, categories, keywords, keywordMode, buyers }
  if (minValue !== undefined) payload.minValue = minValue
  if (maxValue !== undefined) payload.maxValue = maxValue
  if (procurementMethods.length) payload.procurementMethods = procurementMethods
  return payload
}
