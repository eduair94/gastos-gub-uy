import { initializeApp, getApps } from 'firebase/app'
import { browserLocalPersistence, getAuth, setPersistence } from 'firebase/auth'
import type { Auth } from 'firebase/auth'

// Initializes the Firebase Web SDK (client only) for the sign-in flows. Provides
// `$firebaseAuth` (or null when not configured, so the auth UI can degrade). The
// SSR session cookie — not this client state — is the source of truth for the
// server; this only drives obtaining ID tokens to exchange for that cookie.
export default defineNuxtPlugin(() => {
  const fb = useRuntimeConfig().public.firebase as { apiKey?: string, authDomain?: string, projectId?: string, appId?: string }

  if (!fb?.apiKey) {
    return { provide: { firebaseAuth: null as Auth | null } }
  }

  const app = getApps().length
    ? getApps()[0]!
    : initializeApp({
        apiKey: fb.apiKey,
        authDomain: fb.authDomain,
        projectId: fb.projectId,
        appId: fb.appId,
      })

  const auth = getAuth(app)
  setPersistence(auth, browserLocalPersistence).catch(() => {})

  return { provide: { firebaseAuth: auth as Auth | null } }
})
