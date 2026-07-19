/// <reference lib="webworker" />
/**
 * Custom service worker (injectManifest strategy). Two jobs:
 *   1. Precache the hashed build assets so the app shell loads fast/offline.
 *      NO runtime caching is registered for `/api/**` or navigations — those
 *      always hit the network, so SSR pages and API data are never served stale
 *      (the dev-watcher stale-200 trap is a real hazard here).
 *   2. Handle Web Push: show the notification and focus/open the llamado on click.
 */
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'
import { clientsClaim } from 'workbox-core'

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string, revision: string | null }> }

cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

self.skipWaiting()
clientsClaim()

interface PushData {
  title?: string
  body?: string
  url?: string
  compraId?: string
}

self.addEventListener('push', (event: PushEvent) => {
  let data: PushData = {}
  try {
    data = (event.data?.json() as PushData) ?? {}
  }
  catch {
    data = { title: event.data?.text() ?? '' }
  }

  const title = data.title || 'Nuevo llamado'
  const url = data.url || '/app/notificaciones'
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/pwa-192x192.png',
      badge: '/pwa-64x64.png',
      lang: 'es-UY',
      tag: data.compraId ? `llamado-${data.compraId}` : undefined,
      data: { url },
    }),
  )
})

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close()
  const url = (event.notification.data as { url?: string } | undefined)?.url || '/'
  event.waitUntil((async () => {
    const clientsArr = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of clientsArr) {
      // Reuse an existing tab if one is open, navigating it to the target.
      if ('focus' in client) {
        try {
          await (client as WindowClient).navigate(url)
        }
        catch {
          // cross-origin or navigation blocked — fall back to focus only
        }
        return (client as WindowClient).focus()
      }
    }
    return self.clients.openWindow(url)
  })())
})
