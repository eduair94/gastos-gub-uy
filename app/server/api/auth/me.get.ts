import { defineEventHandler } from 'h3'
import { getUser, toPublicUser } from '../../utils/auth'

// Returns the current user (or null). Public: the client calls it to hydrate auth
// state; middleware/auth.ts has already resolved the session cookie.
export default defineEventHandler((event) => {
  const user = getUser(event)
  return { success: true, data: user ? toPublicUser(user as unknown as Record<string, unknown>) : null }
})
