import type { IncomingMessage, ServerResponse } from 'node:http'

/**
 * Devuelve al semáforo el lugar de un render, se corte el pedido como se corte.
 *
 * ATENCIÓN: no pongas `res.once('close', ...)` a mano después de esperar en la cola. Ese es el
 * defecto que este módulo existe para tapar, y no se ve en ninguna prueba de carga corta.
 *
 * POR QUÉ EXISTE. El 10-09-2026 toda página del sitio contestaba 503 con la caja libre. Los dos
 * workers estaban sanos: 700 MB de RSS, 2,6 GB de memoria disponible y 13 sockets abiertos. No
 * había congestión. El semáforo creía estar lleno porque perdía lugares de a uno.
 *
 * LA CADENA, MEDIDA. Un pedido espera hasta 8 segundos en la cola del semáforo. El cliente se
 * cansa antes y corta. Node emite ahí mismo el evento 'close' de la respuesta. Cuando por fin le
 * toca el turno, el middleware recién ahí registra `res.once('close', ...)`, y ese evento ya
 * pasó: el oyente no se dispara nunca. El lugar queda tomado para siempre. Con seis pedidos así,
 * el worker no renderiza una página más hasta que alguien lo reinicia. Nunca se recupera solo.
 *
 * Eso explica lo que se veía en el 167: workers con tres días de vida, memoria baja y 503 en
 * todo. Reiniciar el worker lo arreglaba unas horas. La avalancha volvía a matarlo enseguida.
 *
 * QUÉ HACE. Primero mira si el pedido ya está muerto y devuelve el lugar en el acto. Si vive,
 * escucha el final por los cuatro caminos posibles. Además arma un perro guardián: un render
 * trabado suelta el lugar a los `maxHoldMs`, así ningún pedido solo baja la capacidad para
 * siempre.
 *
 * @returns `false` si el pedido ya estaba muerto. El llamador no debe renderizar nada.
 */
export function releaseSlotWhenDone(
  req: IncomingMessage,
  res: ServerResponse,
  release: () => void,
  maxHoldMs = 30000,
): boolean {
  // El pedido murió mientras esperaba su turno. Sus eventos 'close' ya se emitieron, así que
  // registrar oyentes acá no sirve de nada. Devolvé el lugar ahora.
  if (isDead(req, res)) {
    release()
    return false
  }

  let released = false
  const done = () => {
    if (released) return
    released = true
    clearTimeout(timer)
    release()
  }

  // El perro guardián. Un render que se cuelga contra Mongo no puede quedarse con el lugar.
  // `unref` deja que el proceso termine igual si no queda nada más pendiente.
  const timer = setTimeout(done, maxHoldMs)
  timer.unref?.()

  // Los cuatro caminos. 'finish' es la respuesta completa. 'close' de la respuesta y del pedido
  // cubren el corte del cliente y el del proxy. Sobran entre sí a propósito: `done` es idempotente.
  res.once('close', done)
  res.once('finish', done)
  req.once('close', done)

  return true
}

/** True si ya no hay a quién contestarle. */
function isDead(req: IncomingMessage, res: ServerResponse): boolean {
  return res.destroyed || res.writableEnded || req.destroyed
}
