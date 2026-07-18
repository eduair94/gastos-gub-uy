// Seeds the shared auth state from the SSR-resolved session (server/middleware/
// auth.ts already put the user on event.context.user), so the first render shows
// the correct authed/guest chrome with no flash. The client reconfirms via /api/auth/me.
export default defineNuxtPlugin((nuxtApp) => {
  const user = useState<Record<string, unknown> | null>('auth:user', () => null)
  const ctxUser = nuxtApp.ssrContext?.event?.context?.user as Record<string, unknown> | null | undefined

  if (ctxUser) {
    user.value = {
      uid: ctxUser.uid,
      email: ctxUser.email,
      emailVerified: ctxUser.emailVerified,
      displayName: ctxUser.displayName ?? null,
      photoURL: ctxUser.photoURL ?? null,
      role: ctxUser.role,
      locale: ctxUser.locale,
      status: ctxUser.status,
      notificationPrefs: ctxUser.notificationPrefs,
      watchCount: ctxUser.watchCount ?? 0,
    }
  }
})
