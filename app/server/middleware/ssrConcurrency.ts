import { defineEventHandler, setResponseHeader } from 'h3'
import { createSemaphore } from '../utils/ssr-semaphore'

/**
 * Limita cuántas páginas se renderizan a la vez, y descarta el resto.
 *
 * POR QUÉ EXISTE. El 06-09-2026 el sitio se cayó dos veces sin que fallara el código. Medido en
 * el 167: 1.553 pedidos simultáneos contra dos workers de SSR. Un render reserva unos 21 MB, así
 * que mil a la vez piden 20 GB sobre una caja de 11,9. Los workers llegaban a 2 GB en 45
 * segundos, entraban en espiral de recolección de basura y dejaban de contestar. Ahí la cola
 * crece sola: el cliente reintenta, entran más pedidos, y ninguno termina nunca. Eso es colapso
 * por congestión, no una fuga.
 *
 * Subir el techo de heap NO lo arregla. Se probó con 1024, 1792 y 2560 MB: en los tres casos el
 * worker llega a la pared y se traba. La única salida es aceptar menos trabajo del que la caja
 * aguanta y rechazar el sobrante rápido.
 *
 * QUÉ HACE. Deja pasar `SSR_MAX_INFLIGHT` renders a la vez por worker. El resto espera en una
 * cola de `SSR_MAX_QUEUE` lugares. Si la cola está llena, contesta 503 con `Retry-After`. Si un
 * pedido espera más de `SSR_QUEUE_TIMEOUT_MS`, también contesta 503: un cliente que ya se cansó
 * ocupa memoria para nada.
 *
 * QUÉ NO TOCA, y es deliberado:
 *   - `/api/**` y los assets. Son baratos y ya tienen caché en Redis. Además el health-check del
 *     deploy pega a `/api/contracts?limit=1`: si lo estrangulamos, todo deploy falla y hace
 *     rollback. Ver scripts/deploy-dashboard.mjs.
 *   - Los pedidos internos. El SSR de una página llama a `/api/*` por `$fetch` interno, que no
 *     pasa por la red y no tiene `remoteAddress`. Estrangular eso trabaría el render que ya tiene
 *     el lugar, contra sí mismo.
 *
 * CÓMO SE AJUSTA. Las tres variables se leen del entorno al arrancar. El valor por defecto de
 * `SSR_MAX_INFLIGHT` es 6: con dos workers son 12 renders simultáneos, unos 250 MB de pico, que
 * entra cómodo en el techo de 2560 MB por worker.
 */

const MAX_INFLIGHT = Number(process.env.SSR_MAX_INFLIGHT || 6)
const MAX_QUEUE = Number(process.env.SSR_MAX_QUEUE || 48)
const QUEUE_TIMEOUT_MS = Number(process.env.SSR_QUEUE_TIMEOUT_MS || 8000)

/** Extensiones que sirve Nitro sin renderizar nada. */
const ASSET_RE = /\.(?:js|mjs|css|map|png|jpe?g|gif|svg|webp|avif|ico|woff2?|ttf|txt|xml|json|webmanifest|pdf)$/i

const sem = createSemaphore(MAX_INFLIGHT, MAX_QUEUE, QUEUE_TIMEOUT_MS)

export default defineEventHandler(async (event) => {
  const path = event.path || ''

  // Barato primero: casi todo el tráfico se va por acá sin tocar el semáforo.
  if (path.startsWith('/api/') || path.startsWith('/_nuxt/') || path.startsWith('/_ipx/')) return
  if (ASSET_RE.test(path.split('?')[0] || '')) return

  // NO se filtra por `Accept: text/html`. Los rastreadores mandan `*/*` y son justo el tráfico
  // que hay que frenar: filtrar por ese encabezado dejaba pasar libre a la avalancha. Todo lo
  // que no sea `/api/**` ni un asset es una página, y una página es un render.

  // Los `$fetch` internos del propio render no tienen socket de red. Frenarlos
  // sería trabar el render contra sí mismo.
  if (!event.node.req.socket?.remoteAddress) return

  const ok = await sem.acquire()
  if (!ok) {
    setResponseHeader(event, 'Retry-After', '5')
    setResponseHeader(event, 'Cache-Control', 'no-store')
    event.node.res.statusCode = 503
    event.node.res.end('El sitio está con mucha demanda. Probá de nuevo en unos segundos.')
    return
  }

  // El lugar se libera cuando la respuesta termina, se corte como se corte.
  let released = false
  const done = () => {
    if (released) return
    released = true
    sem.release()
  }
  event.node.res.once('close', done)
  event.node.res.once('finish', done)
})
