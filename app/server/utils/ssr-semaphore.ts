/**
 * Semáforo con cola acotada y espera con vencimiento.
 *
 * Vive aparte del middleware para que se pueda probar sin levantar un servidor. La prueba está
 * en tests/unit/test-ssr-semaphore.ts.
 *
 * Reglas, y las tres importan:
 *   1. Un lugar liberado se PASA al primero de la cola, no se devuelve al contador. Si se
 *      devolviera, dos pedidos podrían tomarlo a la vez.
 *   2. Si la cola está llena, `acquire` responde false enseguida. Rechazar rápido es el punto:
 *      un pedido que espera ocupa memoria.
 *   3. Si a un pedido se le vence la espera y justo después le toca su turno, el lugar sigue
 *      viaje al siguiente. Perderlo ahí dejaría al semáforo con menos capacidad para siempre.
 */

export interface Semaphore {
  /** Toma un lugar. false = cola llena o espera vencida. */
  acquire: () => Promise<boolean>
  /** Devuelve el lugar. Llamarlo dos veces por el mismo pedido no rompe el contador. */
  release: () => void
  /** Para observar en pruebas y en diagnóstico. */
  stats: () => { inflight: number, queued: number }
}

export function createSemaphore(maxInflight: number, maxQueue: number, queueTimeoutMs: number): Semaphore {
  let inflight = 0
  const queue: (() => void)[] = []

  function release() {
    const next = queue.shift()
    if (next) {
      next()
      return
    }
    inflight = Math.max(0, inflight - 1)
  }

  function acquire(): Promise<boolean> {
    if (inflight < maxInflight) {
      inflight++
      return Promise.resolve(true)
    }
    if (queue.length >= maxQueue) return Promise.resolve(false)

    return new Promise<boolean>((resolve) => {
      let settled = false

      const grant = () => {
        if (settled) {
          release()
          return
        }
        settled = true
        clearTimeout(timer)
        resolve(true)
      }

      const timer = setTimeout(() => {
        if (settled) return
        settled = true
        const i = queue.indexOf(grant)
        if (i >= 0) queue.splice(i, 1)
        resolve(false)
      }, queueTimeoutMs)

      queue.push(grant)
    })
  }

  return { acquire, release, stats: () => ({ inflight, queued: queue.length }) }
}
