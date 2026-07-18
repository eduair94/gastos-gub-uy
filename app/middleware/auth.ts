// Gates /app/** — redirects guests to /login with a return path. When Firebase isn't
// configured the whole auth area is disabled, so send visitors to the home page instead
// of a login form that can't work.
export default defineNuxtRouteMiddleware((to) => {
  const localePath = useLocalePath()
  if (!useAuthEnabled()) return navigateTo(localePath('/'))

  const user = useState<Record<string, unknown> | null>('auth:user', () => null)
  if (!user.value) {
    return navigateTo(`${localePath('/login')}?redirect=${encodeURIComponent(to.fullPath)}`)
  }
})
