import { defineEventHandler, getCookie } from 'h3'
import { connectToDatabase } from '../utils/database'
import { UserModel } from '../../../shared/models/user'
import { adminAuth, isFirebaseAdminConfigured, SESSION_COOKIE } from '../utils/firebase-admin'

/**
 * Resolves the session cookie into `event.context.user` (a lean Mongo user doc)
 * for every /api/* request. Never throws — unauthenticated requests simply get
 * `context.user = null`; route handlers opt into protection via requireUser().
 *
 * Runs before cache.ts and rateLimit.ts (alphabetical middleware order), so the
 * user is available to every handler.
 */
export default defineEventHandler(async (event) => {
  const url = event.node.req.url || ''
  if (!url.startsWith('/api/')) return

  // An API key already resolved the user in apiAuth.ts — don't let cookie auth
  // clobber it (this handler runs second, alphabetically after apiAuth).
  if (event.context.apiKey) return

  event.context.user = null

  const cookie = getCookie(event, SESSION_COOKIE)
  if (!cookie || !isFirebaseAdminConfigured()) return

  try {
    const decoded = await adminAuth().verifySessionCookie(cookie, true)
    await connectToDatabase()
    const user = await UserModel.findOne({ uid: decoded.uid }).lean()
    event.context.user = user || null
  }
  catch {
    // Expired/revoked/invalid cookie, or admin misconfig — treat as anonymous.
    event.context.user = null
  }
})
