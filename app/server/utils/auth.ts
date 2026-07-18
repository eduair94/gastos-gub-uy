import type { H3Event } from 'h3'
import { createError, getRequestHeader } from 'h3'
import type { ApiKeyScope } from '../../../shared/types/monitor'

// The request-scoped user is attached by server/middleware/auth.ts. It is a lean
// Mongo `users` doc (or null). Kept as a loose shape here so route handlers do not
// depend on the mongoose Document type.
export interface SessionUser {
  uid: string
  email: string
  emailVerified: boolean
  displayName?: string
  photoURL?: string
  providers: string[]
  role: 'user' | 'admin'
  locale: 'es' | 'en'
  status: 'active' | 'disabled'
  notificationPrefs: { enabled: boolean, frequency: 'instant' | 'daily' }
  unsubscribeToken: string
  watchCount: number
  createdAt?: Date
}

// The request-scoped API key, attached by server/middleware/apiAuth.ts when a
// valid `Authorization: Bearer`/`x-api-key` header is present (else null).
export interface ApiKeyContext { id: string, userId: string, scopes: ApiKeyScope[] }

export function getUser(event: H3Event): SessionUser | null {
  return (event.context.user as SessionUser | null) ?? null
}

export function getApiKey(event: H3Event): ApiKeyContext | null {
  return (event.context.apiKey as ApiKeyContext | null) ?? null
}

export function requireUser(event: H3Event): SessionUser {
  const user = getUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'No autenticado' })
  }
  if (user.status !== 'active') {
    throw createError({ statusCode: 403, statusMessage: 'Cuenta deshabilitada' })
  }
  return user
}

/**
 * Authorize a mutating request. An API key IS the credential, so key-authed
 * writes skip the same-origin (CSRF) check but must carry the `write` scope.
 * Cookie-authed writes keep the existing same-origin defence. Always returns the
 * active user (403 on a disabled account, 401 when unauthenticated).
 */
export function requireWrite(event: H3Event): SessionUser {
  const apiKey = getApiKey(event)
  if (apiKey) {
    if (!apiKey.scopes.includes('write')) {
      throw createError({ statusCode: 403, statusMessage: 'API key sin permiso de escritura (scope write requerido)' })
    }
    return requireUser(event)
  }
  assertSameOrigin(event)
  return requireUser(event)
}

/**
 * CSRF guard for mutating requests. The session cookie is SameSite=Lax, which
 * already blocks cross-site form/XHR POSTs from carrying it; this rejects any
 * request whose Origin is present and not same-site as a defence in depth.
 */
export function assertSameOrigin(event: H3Event): void {
  const origin = getRequestHeader(event, 'origin')
  if (!origin) return // same-origin navigations and non-browser clients omit it
  const host = getRequestHeader(event, 'host')
  let originHost: string
  try {
    originHost = new URL(origin).host
  }
  catch {
    throw createError({ statusCode: 403, statusMessage: 'Origen inválido' })
  }
  if (originHost !== host) {
    throw createError({ statusCode: 403, statusMessage: 'Origen no permitido' })
  }
}

/** The client-safe projection of a user doc (drops the unsubscribe token). */
export function toPublicUser(user: Record<string, unknown>): Record<string, unknown> {
  return {
    uid: user.uid,
    email: user.email,
    emailVerified: user.emailVerified,
    displayName: user.displayName ?? null,
    photoURL: user.photoURL ?? null,
    role: user.role,
    locale: user.locale,
    status: user.status,
    notificationPrefs: user.notificationPrefs,
    watchCount: user.watchCount ?? 0,
    createdAt: user.createdAt ?? null,
  }
}
