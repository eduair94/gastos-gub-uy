// Bounces already-authenticated users away from the auth pages.
export default defineNuxtRouteMiddleware(() => {
  const user = useState<Record<string, unknown> | null>('auth:user', () => null)
  if (user.value) {
    const localePath = useLocalePath()
    return navigateTo(localePath('/app'))
  }
})
