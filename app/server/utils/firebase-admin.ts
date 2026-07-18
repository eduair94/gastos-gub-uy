import { cert, getApps, initializeApp } from 'firebase-admin/app'
import type { App } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import type { Auth } from 'firebase-admin/auth'
import { createError } from 'h3'

// Firebase is used for AUTHENTICATION ONLY. The Admin SDK verifies ID tokens and
// mints/verifies the SSR session cookie; MongoDB `users` is the system of record.
// Credentials come from server-only env (never the public runtime config).

let app: App | null = null

function getAdminApp(): App {
  if (app) return app
  const existing = getApps()
  if (existing.length) {
    app = existing[0]!
    return app
  }

  const projectId = process.env.FIREBASE_PROJECT_ID
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
  // Private keys are stored with escaped newlines in .env — restore them.
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')

  if (!projectId || !clientEmail || !privateKey) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Firebase Admin no está configurado (FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY).',
    })
  }

  app = initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) })
  return app
}

export function adminAuth(): Auth {
  return getAuth(getAdminApp())
}

/** True when the three admin env vars are present, without initializing. */
export function isFirebaseAdminConfigured(): boolean {
  return Boolean(process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY)
}

export const SESSION_COOKIE = '__session'
// 14 days, in milliseconds (Firebase createSessionCookie expects ms).
export const SESSION_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000
