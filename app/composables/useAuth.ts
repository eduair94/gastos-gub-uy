import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  isSignInWithEmailLink,
  sendEmailVerification,
  sendPasswordResetEmail,
  sendSignInLinkToEmail,
  signInWithEmailAndPassword,
  signInWithEmailLink,
  signInWithPopup,
  signOut,
} from 'firebase/auth'
import type { Auth, User as FirebaseUser } from 'firebase/auth'

export interface AuthUser {
  uid: string
  email: string
  emailVerified: boolean
  displayName?: string | null
  photoURL?: string | null
  role: 'user' | 'admin'
  locale: 'es' | 'en'
  status: 'active' | 'disabled'
  notificationPrefs: { enabled: boolean, frequency: 'instant' | 'daily' }
  watchCount: number
}

const MAGIC_EMAIL_KEY = 'monitor:magicEmail'

// Auth facade over the Firebase Web SDK + the SSR session endpoints. Shared state
// lives in useState('auth:user'), seeded on the server (plugins/auth.server.ts).
export function useAuth() {
  const user = useState<AuthUser | null>('auth:user', () => null)
  const isAuthed = computed(() => !!user.value)

  function auth(): Auth {
    const instance = useNuxtApp().$firebaseAuth as Auth | null
    if (!instance) {
      throw createError({ statusCode: 500, statusMessage: 'La autenticación no está configurada (falta la config de Firebase).' })
    }
    return instance
  }

  // Exchange a Firebase ID token for the httpOnly session cookie + Mongo user.
  async function exchange(fbUser: FirebaseUser): Promise<void> {
    const idToken = await fbUser.getIdToken()
    const res = await $fetch<{ data: AuthUser }>('/api/auth/session', { method: 'POST', body: { idToken } })
    user.value = res.data
  }

  async function loginEmail(email: string, password: string): Promise<void> {
    const cred = await signInWithEmailAndPassword(auth(), email, password)
    await exchange(cred.user)
  }

  async function registerEmail(email: string, password: string): Promise<void> {
    const cred = await createUserWithEmailAndPassword(auth(), email, password)
    try {
      await sendEmailVerification(cred.user)
    }
    catch {
      // Non-fatal — the user can request verification again later.
    }
    await exchange(cred.user)
  }

  async function loginGoogle(): Promise<void> {
    const cred = await signInWithPopup(auth(), new GoogleAuthProvider())
    await exchange(cred.user)
  }

  async function sendMagicLink(email: string): Promise<void> {
    const url = `${window.location.origin}/auth/callback`
    await sendSignInLinkToEmail(auth(), email, { url, handleCodeInApp: true })
    window.localStorage.setItem(MAGIC_EMAIL_KEY, email)
  }

  async function completeMagicLink(): Promise<boolean> {
    if (!isSignInWithEmailLink(auth(), window.location.href)) return false
    let email = window.localStorage.getItem(MAGIC_EMAIL_KEY)
    if (!email) email = window.prompt('Confirmá el email al que enviamos el enlace') || ''
    if (!email) return false
    const cred = await signInWithEmailLink(auth(), email, window.location.href)
    window.localStorage.removeItem(MAGIC_EMAIL_KEY)
    await exchange(cred.user)
    return true
  }

  async function sendReset(email: string): Promise<void> {
    await sendPasswordResetEmail(auth(), email)
  }

  async function logout(): Promise<void> {
    try {
      await signOut(auth())
    }
    catch {
      // Ignore — clearing the cookie below is what actually logs out server-side.
    }
    await $fetch('/api/auth/logout', { method: 'POST' })
    user.value = null
  }

  async function refresh(): Promise<void> {
    const res = await $fetch<{ data: AuthUser | null }>('/api/auth/me')
    user.value = res.data
  }

  return {
    user,
    isAuthed,
    loginEmail,
    registerEmail,
    loginGoogle,
    sendMagicLink,
    completeMagicLink,
    sendReset,
    logout,
    refresh,
  }
}
