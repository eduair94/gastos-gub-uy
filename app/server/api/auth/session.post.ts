import { randomUUID } from 'node:crypto'
import { createError, defineEventHandler, readBody, setCookie } from 'h3'
import { connectToDatabase } from '../../utils/database'
import { UserModel } from '../../../../shared/models/user'
import { adminAuth, SESSION_COOKIE, SESSION_MAX_AGE_MS } from '../../utils/firebase-admin'
import { assertSameOrigin, toPublicUser } from '../../utils/auth'

// Exchanges a freshly-obtained Firebase ID token for an httpOnly SSR session
// cookie, and upserts the Mongo user (the system of record). Called by the client
// right after any sign-in (email/password, Google, magic link).
export default defineEventHandler(async (event) => {
  assertSameOrigin(event)

  const body = await readBody<{ idToken?: string }>(event)
  const idToken = body?.idToken
  if (!idToken) {
    throw createError({ statusCode: 400, statusMessage: 'Falta idToken' })
  }

  const auth = adminAuth()
  const decoded = await auth.verifyIdToken(idToken).catch(() => null)
  if (!decoded) {
    throw createError({ statusCode: 401, statusMessage: 'Token inválido' })
  }

  const sessionCookie = await auth.createSessionCookie(idToken, { expiresIn: SESSION_MAX_AGE_MS })

  await connectToDatabase()

  const provider = decoded.firebase?.sign_in_provider
  const set: Record<string, unknown> = {
    email: (decoded.email || '').toLowerCase(),
    emailVerified: Boolean(decoded.email_verified),
    lastLoginAt: new Date(),
  }
  if (decoded.name) set.displayName = decoded.name
  if (decoded.picture) set.photoURL = decoded.picture

  const user = await UserModel.findOneAndUpdate(
    { uid: decoded.uid },
    {
      $set: set,
      ...(provider ? { $addToSet: { providers: provider } } : {}),
      $setOnInsert: {
        role: 'user',
        locale: 'es',
        status: 'active',
        notificationPrefs: { enabled: true, frequency: 'instant' },
        unsubscribeToken: randomUUID(),
        watchCount: 0,
      },
    },
    { upsert: true, new: true },
  ).lean()

  setCookie(event, SESSION_COOKIE, sessionCookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: Math.floor(SESSION_MAX_AGE_MS / 1000),
  })

  return { success: true, data: toPublicUser(user as Record<string, unknown>) }
})
