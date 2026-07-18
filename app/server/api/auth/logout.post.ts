import { defineEventHandler, deleteCookie, getCookie } from 'h3'
import { adminAuth, isFirebaseAdminConfigured, SESSION_COOKIE } from '../../utils/firebase-admin'
import { assertSameOrigin } from '../../utils/auth'

// Clears the session cookie and revokes the user's refresh tokens so the session
// cannot be resurrected from a stolen cookie.
export default defineEventHandler(async (event) => {
  assertSameOrigin(event)

  const cookie = getCookie(event, SESSION_COOKIE)
  if (cookie && isFirebaseAdminConfigured()) {
    try {
      const decoded = await adminAuth().verifySessionCookie(cookie, false)
      await adminAuth().revokeRefreshTokens(decoded.sub)
    }
    catch {
      // Already invalid — nothing to revoke.
    }
  }

  deleteCookie(event, SESSION_COOKIE, { path: '/' })
  return { success: true }
})
