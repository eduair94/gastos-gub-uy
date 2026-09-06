/**
 * Prueba del semáforo que limita renders SSR (app/server/utils/ssr-semaphore.ts).
 *
 * Corré: npx tsx tests/unit/test-ssr-semaphore.ts
 *
 * Las cuatro afirmaciones son las que sostienen el arreglo del colapso del 06-09-2026. Si alguna
 * cae, el limitador deja de proteger: o admite más renders de los que la caja aguanta, o pierde
 * lugares y termina admitiendo cero.
 */
import { createSemaphore } from '../../app/server/utils/ssr-semaphore'

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

async function main() {
  console.log('1. Admite hasta el tope y encola el resto')
  {
    const s = createSemaphore(2, 10, 1000)
    ok(await s.acquire(), 'el primero entra')
    ok(await s.acquire(), 'el segundo entra')
    const tercero = s.acquire()
    await sleep(10)
    ok(s.stats().inflight === 2, 'nunca hay más de 2 adentro')
    ok(s.stats().queued === 1, 'el tercero espera en la cola')
    s.release()
    ok(await tercero, 'el tercero entra cuando se libera un lugar')
    ok(s.stats().inflight === 2 && s.stats().queued === 0, 'el lugar se pasó, no se duplicó')
  }

  console.log('2. Con la cola llena rechaza enseguida')
  {
    const s = createSemaphore(1, 2, 5000)
    await s.acquire()
    const a = s.acquire()
    const b = s.acquire()
    await sleep(10)
    const t0 = Date.now()
    const rechazado = await s.acquire()
    ok(rechazado === false, 'el cuarto se rechaza')
    ok(Date.now() - t0 < 100, 'rechaza sin esperar el vencimiento')
    s.release(); s.release(); s.release()
    await Promise.all([a, b])
  }

  console.log('3. La espera vence y devuelve false')
  {
    const s = createSemaphore(1, 10, 60)
    await s.acquire()
    const t0 = Date.now()
    const vencido = await s.acquire()
    ok(vencido === false, 'el que espera de más se rechaza')
    ok(Date.now() - t0 >= 55, 'esperó su ventana antes de rechazar')
    ok(s.stats().queued === 0, 'sale de la cola al vencer')
  }

  console.log('4. Un lugar que llega tarde sigue viaje, no se pierde')
  {
    const s = createSemaphore(1, 10, 40)
    await s.acquire()
    const vencido = s.acquire()        // se va a vencer a los 40 ms
    await sleep(70)
    ok(await vencido === false, 'el primero de la cola venció')
    const tardio = s.acquire()         // entra a la cola después
    await sleep(10)
    s.release()                        // libera el lugar del primero
    ok(await tardio, 'el siguiente recibe el lugar')
    ok(s.stats().inflight === 1, 'la capacidad quedó intacta')
  }

  console.log(fallos === 0 ? '\nTODO OK' : `\n${fallos} FALLO(S)`)
  process.exit(fallos === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
