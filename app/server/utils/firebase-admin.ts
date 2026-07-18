import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cert, getApps, initializeApp } from 'firebase-admin/app'
import type { App } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import type { Auth } from 'firebase-admin/auth'
import { createError } from 'h3'

// Firebase is used for AUTHENTICATION ONLY. The Admin SDK verifies ID tokens and
// mints/verifies the SSR session cookie; MongoDB `users` is the system of record.
//
// Credentials are loaded (in order):
//   1. env: FIREBASE_PROJECT_ID / _CLIENT_EMAIL / _PRIVATE_KEY
//   2. a service-account JSON file — FIREBASE_CREDENTIALS_FILE, else `firebase.json`
//      searched from the process cwd upward (the repo root holds it; gitignored).
// Never exposed to the client.

interface ServiceAccount {
  projectId: string
  clientEmail: string
  privateKey: string
}

let saCache: ServiceAccount | null | undefined

function loadServiceAccount(): ServiceAccount | null {
  if (saCache !== undefined) return saCache

  // 1. Explicit env vars win.
  const pid = process.env.FIREBASE_PROJECT_ID
  const email = process.env.FIREBASE_CLIENT_EMAIL
  const key = process.env.FIREBASE_PRIVATE_KEY
  if (pid && email && key) {
    saCache = { projectId: pid, clientEmail: email, privateKey: key.replace(/\\n/g, '\n') }
    return saCache
  }

  // 2. A service-account JSON file. app/firebase.json (the web config) is correctly
  //    skipped because it has no `private_key`.
  const candidates = [
    process.env.FIREBASE_CREDENTIALS_FILE,
    resolve(process.cwd(), 'firebase.json'),
    resolve(process.cwd(), '..', 'firebase.json'),
    resolve(process.cwd(), '..', '..', 'firebase.json'),
  ].filter((p): p is string => Boolean(p))

  for (const path of candidates) {
    try {
      if (!existsSync(path)) continue
      const json = JSON.parse(readFileSync(path, 'utf8'))
      if (json.private_key && json.client_email && json.project_id) {
        saCache = {
          projectId: json.project_id,
          clientEmail: json.client_email,
          // JSON.parse already turned \n into real newlines; the replace is a
          // harmless no-op here and the fix for the env-var case.
          privateKey: String(json.private_key).replace(/\\n/g, '\n'),
        }
        return saCache
      }
    }
    catch {
      // Unreadable/invalid candidate — try the next.
    }
  }

  saCache = null
  return saCache
}

let app: App | null = null

function getAdminApp(): App {
  if (app) return app
  const existing = getApps()
  if (existing.length) {
    app = existing[0]!
    return app
  }

  const sa = loadServiceAccount()
  if (!sa) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Firebase Admin no está configurado (falta firebase.json o las variables FIREBASE_*).',
    })
  }

  app = initializeApp({ credential: cert({ projectId: sa.projectId, clientEmail: sa.clientEmail, privateKey: sa.privateKey }) })
  return app
}

export function adminAuth(): Auth {
  return getAuth(getAdminApp())
}

/** True when admin credentials are available (env or firebase.json), without initializing. */
export function isFirebaseAdminConfigured(): boolean {
  return loadServiceAccount() !== null
}

export const SESSION_COOKIE = '__session'
// 14 days, in milliseconds (Firebase createSessionCookie expects ms).
export const SESSION_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000
