/**
 * Prueba del devolvedor de lugares del semáforo SSR (app/server/utils/ssr-slot.ts).
 *
 * Corré: npx tsx tests/unit/test-ssr-slot.ts
 *
 * POR QUÉ EXISTE. El 10-09-2026 el sitio contestaba 503 en toda página con la caja libre: dos
 * workers sanos, 700 MB de RSS y 13 sockets abiertos. El semáforo creía estar lleno porque
 * perdía lugares. Un pedido que se cansa mientras espera en la cola ya emitió su evento
 * 'close', así que un `once('close')` puesto después nunca se dispara. Cada pedido así se
 * llevaba un lugar para siempre. Con seis, el worker no renderiza una sola página más.
 *
 * Si alguna de estas afirmaciones cae, el limitador vuelve a matar al sitio con la caja vacía.
 */
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { createSemaphore } from '../../app/server/utils/ssr-semaphore'
import { releaseSlotWhenDone } from '../../app/server/utils/ssr-slot'

let fallos = 0
function ok(cond: boolean, msg: string) {
  if (cond) {
    console.log(`  ✓ ${msg}`)
    return
  }
  fallos++
  console.error(`  ✗ ${msg}`)
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

/**
 * Levanta un servidor con el mismo cableado que el middleware.
 *
 * `renderMs` es lo que tarda el render. `maxHoldMs` es el tope del perro guardián.
 */
function levantarServidor(maxInflight: number, maxQueue: number, queueTimeoutMs: number, maxHoldMs: number) {
  const sem = createSemaphore(maxInflight, maxQueue, queueTimeoutMs)
  let renderMs = 300

  const server = http.createServer(async (req, res) => {
    const tieneLugar = await sem.acquire()
    if (!tieneLugar) {
      res.statusCode = 503
      res.end('busy')
      return
    }
    if (!releaseSlotWhenDone(req, res, () => sem.release(), maxHoldMs)) return
    setTimeout(() => {
      if (res.writableEnded || res.destroyed) return
      res.statusCode = 200
      res.end('ok')
    }, renderMs)
  })

  return {
    sem,
    server,
    setRenderMs: (ms: number) => { renderMs = ms },
    escuchar: () => new Promise<number>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve((server.address() as AddressInfo).port))
    }),
    cerrar: () => new Promise<void>(resolve => server.close(() => resolve())),
  }
}

/** Pide una página. `abortarMs` corta el pedido como lo corta un cliente que se cansa. */
function pedir(port: number, path: string, abortarMs?: number): Promise<string> {
  return new Promise((resolve) => {
    const r = http.get({ host: '127.0.0.1', port, path }, (res) => {
      res.resume()
      res.on('end', () => resolve(String(res.statusCode)))
    })
    r.on('error', () => resolve('ABORTADO'))
    if (abortarMs !== undefined) setTimeout(() => r.destroy(), abortarMs)
  })
}

async function main() {
  console.log('1. El pedido que se cansa en la cola devuelve su lugar')
  {
    const s = levantarServidor(2, 10, 3000, 30000)
    const port = await s.escuchar()

    // Dos renders lentos ocupan los dos lugares.
    const a = pedir(port, '/p1')
    const b = pedir(port, '/p2')
    await sleep(60)
    ok(s.sem.stats().inflight === 2, 'los dos lugares están ocupados')

    // Dos pedidos esperan en la cola y el cliente los corta antes de que se libere un lugar.
    const c = pedir(port, '/p3', 80)
    const d = pedir(port, '/p4', 80)
    await sleep(140)
    ok(s.sem.stats().queued === 2, 'los dos cortados esperan en la cola')

    await Promise.all([a, b, c, d])
    await sleep(200)
    ok(s.sem.stats().inflight === 0, 'no queda ningún lugar tomado')
    ok(s.sem.stats().queued === 0, 'no queda nadie en la cola')

    // La prueba que importa: el servidor sigue sirviendo.
    s.setRenderMs(10)
    const frescos = [await pedir(port, '/x1'), await pedir(port, '/x2'), await pedir(port, '/x3')]
    ok(frescos.every(c => c === '200'), `el servidor sigue vivo después del corte (${frescos.join(',')})`)
    await s.cerrar()
  }

  console.log('2. El pedido normal devuelve su lugar al terminar')
  {
    const s = levantarServidor(1, 10, 3000, 30000)
    const port = await s.escuchar()
    s.setRenderMs(20)
    ok(await pedir(port, '/uno') === '200', 'contesta 200')
    await sleep(60)
    ok(s.sem.stats().inflight === 0, 'el lugar volvió')
    await s.cerrar()
  }

  console.log('3. El perro guardián corta un render trabado')
  {
    const sem = createSemaphore(1, 10, 3000)
    await sem.acquire()
    ok(sem.stats().inflight === 1, 'el lugar está tomado')

    // Una respuesta que nunca termina ni se cierra.
    const res = { destroyed: false, writableEnded: false, once: () => res } as any
    const req = { destroyed: false, once: () => req } as any
    releaseSlotWhenDone(req, res, () => sem.release(), 80)
    await sleep(160)
    ok(sem.stats().inflight === 0, 'el guardián devolvió el lugar del render trabado')
  }

  console.log('4. Un pedido devuelve su lugar una sola vez')
  {
    let devoluciones = 0
    const oyentes: Record<string, (() => void)[]> = { close: [], finish: [] }
    const res = {
      destroyed: false,
      writableEnded: false,
      once: (ev: string, fn: () => void) => { (oyentes[ev] ||= []).push(fn); return res },
    } as any
    const req = { destroyed: false, once: (ev: string, fn: () => void) => { (oyentes[ev] ||= []).push(fn); return req } } as any

    releaseSlotWhenDone(req, res, () => { devoluciones++ }, 30000)
    for (const fn of oyentes.close || []) fn()
    for (const fn of oyentes.finish || []) fn()
    ok(devoluciones === 1, `devolvió el lugar una sola vez (fueron ${devoluciones})`)
  }

  console.log('5. El pedido ya muerto no sigue viaje')
  {
    let devoluciones = 0
    const res = { destroyed: true, writableEnded: false, once: () => res } as any
    const req = { destroyed: true, once: () => req } as any
    const sigue = releaseSlotWhenDone(req, res, () => { devoluciones++ }, 30000)
    ok(sigue === false, 'avisa al llamador que no renderice')
    ok(devoluciones === 1, 'devuelve el lugar enseguida')
  }

  if (fallos > 0) {
    console.error(`\n${fallos} afirmación(es) fallaron`)
    process.exit(1)
  }
  console.log('\nTodo en orden')
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
