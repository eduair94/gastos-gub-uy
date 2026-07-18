// Gates /app/** — redirects guests to /login with a return path.
export default defineNuxtRouteMiddleware((to) => {
  const user = useState<Record<string, unknown> | null>('auth:user', () => null)
  if (!user.value) {
    const localePath = useLocalePath()
    return navigateTo(`${localePath('/login')}?redirect=${encodeURIComponent(to.fullPath)}`)
  }
})
