// Bounces already-authenticated users away from the auth pages. When Firebase isn't
// configured these pages are unusable, so redirect to the home page.
export default defineNuxtRouteMiddleware(() => {
  const localePath = useLocalePath()
  if (!useAuthEnabled()) return navigateTo(localePath('/'))

  const user = useState<Record<string, unknown> | null>('auth:user', () => null)
  if (user.value) {
    return navigateTo(localePath('/app'))
  }
})
