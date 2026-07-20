// Client-side Web Push: feature detection, permission, subscribe/unsubscribe, and
// syncing the subscription with the server. The service worker itself is
// registered by @vite-pwa/nuxt; here we only manage the PushSubscription.

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

export function useWebPush() {
  const config = useRuntimeConfig()
  const { track } = useAnalytics()
  const isSupported = ref(false)
  const permission = ref<NotificationPermission>('default')
  const isSubscribed = ref(false)
  const loading = ref(false)
  const error = ref<string | null>(null)

  // Server must have a VAPID key AND the browser must support the APIs.
  const publicKey = ref<string>((config.public.vapidPublicKey as string) || '')

  async function readState(): Promise<void> {
    if (!import.meta.client) return
    isSupported.value = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
    if (!isSupported.value) return
    permission.value = Notification.permission
    // Fall back to the API if the key wasn't inlined at build time.
    if (!publicKey.value) {
      try {
        const res = await $fetch<{ data: { publicKey: string | null } }>('/api/push/vapid-key')
        publicKey.value = res.data.publicKey || ''
      }
      catch {
        // leave empty → push stays unavailable
      }
    }
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      isSubscribed.value = !!sub
    }
    catch {
      isSubscribed.value = false
    }
  }

  // Push is offerable only when supported AND the server is configured.
  const isAvailable = computed(() => isSupported.value && !!publicKey.value)

  async function subscribe(): Promise<boolean> {
    if (!import.meta.client || !isAvailable.value) return false
    loading.value = true
    error.value = null
    try {
      const perm = await Notification.requestPermission()
      permission.value = perm
      if (perm !== 'granted') {
        error.value = 'Permiso de notificaciones denegado'
        track('push_permission_denied')
        return false
      }
      const reg = await navigator.serviceWorker.ready
      let sub = await reg.pushManager.getSubscription()
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey.value),
        })
      }
      const json = sub.toJSON() as { endpoint?: string, keys?: { p256dh?: string, auth?: string } }
      await $fetch('/api/push/subscribe', {
        method: 'POST',
        body: { endpoint: json.endpoint, keys: json.keys },
      })
      isSubscribed.value = true
      track('push_subscribe')
      return true
    }
    catch (e) {
      error.value = e instanceof Error ? e.message : 'No se pudo activar el push'
      track('push_error', { reason: 'subscribe' })
      return false
    }
    finally {
      loading.value = false
    }
  }

  async function unsubscribe(): Promise<boolean> {
    if (!import.meta.client) return false
    loading.value = true
    error.value = null
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      const endpoint = sub?.endpoint
      if (sub) await sub.unsubscribe()
      await $fetch('/api/push/unsubscribe', { method: 'POST', body: { endpoint } })
      isSubscribed.value = false
      track('push_unsubscribe')
      return true
    }
    catch (e) {
      error.value = e instanceof Error ? e.message : 'No se pudo desactivar el push'
      track('push_error', { reason: 'unsubscribe' })
      return false
    }
    finally {
      loading.value = false
    }
  }

  return { isSupported, isAvailable, permission, isSubscribed, loading, error, readState, subscribe, unsubscribe }
}
