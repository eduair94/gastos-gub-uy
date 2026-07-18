import type { H3Event } from 'h3'
import { createError, defineEventHandler, getRequestHeader } from 'h3'
import { connectToDatabase } from '../utils/database'
import { ApiKeyModel } from '../../../shared/models/api_key'
import { UserModel } from '../../../shared/models/user'
import { parsePrefix, verifyToken } from '../utils/api-key'

/**
 * Resolves an API key (`Authorization: Bearer gk_live_…` or `x-api-key`) into
 * `event.context.apiKey` and the owner into `event.context.user`, so downstream
 * handlers authenticate identically whether the caller used a key or the web
 * session cookie.
 *
 * Runs before auth.ts (name sorts first) on every /api/* request. Absent a key
 * header it does nothing and cookie auth takes over. A malformed/invalid/revoked
 * key is a hard 401 — a bad credential should never silently downgrade to
 * anonymous public access.
 */

// Throttle lastUsedAt/requestCount writes to at most once per key per minute to
// avoid a DB write on every single API call.
const lastTouch = new Map<string, number>()

function extractToken(event: H3Event): string | null {
  const auth = getRequestHeader(event, 'authorization')
  if (auth && auth.startsWith('Bearer ')) return auth.slice(7).trim()
  const x = getRequestHeader(event, 'x-api-key')
  return x ? x.trim() : null
}

export default defineEventHandler(async (event) => {
  const url = event.node.req.url || ''
  if (!url.startsWith('/api/')) return
  event.context.apiKey = null

  const token = extractToken(event)
  if (!token) return // no key — fall through to cookie auth in auth.ts

  const prefix = parsePrefix(token)
  if (!prefix) throw createError({ statusCode: 401, statusMessage: 'API key inválida' })

  await connectToDatabase()
  const key = await ApiKeyModel.findOne({ prefix }).lean()
  if (!key || key.revokedAt || !verifyToken(token, key.hash)) {
    throw createError({ statusCode: 401, statusMessage: 'API key inválida o revocada' })
  }

  event.context.apiKey = { id: String(key._id), userId: key.userId, scopes: key.scopes }
  const user = await UserModel.findOne({ uid: key.userId }).lean()
  event.context.user = user || null

  const now = Date.now()
  const last = lastTouch.get(prefix) || 0
  if (now - last > 60_000) {
    lastTouch.set(prefix, now)
    void ApiKeyModel.updateOne(
      { _id: key._id },
      { $set: { lastUsedAt: new Date() }, $inc: { requestCount: 1 } },
    ).catch(() => {})
  }
})
