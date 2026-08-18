/**
 * Vuelve a correr, contra YouTube y contra cada sitio oficial, las pruebas con las
 * que entró cada canal a /canales-youtube.
 *
 * Es `*.verify.ts`, así que `npm test` NO lo corre: sale a la red y depende de que
 * los sitios respondan. Corrélo a mano cuando toques la tabla:
 *
 *   npx tsx tests/unit/canales-youtube.verify.ts
 *   npx tsx tests/unit/canales-youtube.verify.ts --only=UCimPJKAbuM6z6b6DPZz86Mw
 *
 * FALLA sólo con una CONTRADICCIÓN: el canal ya no existe, o YouTube publica un país
 * que no es Uruguay donde la ficha dice que sí. Un sitio que no responde se informa y
 * no falla: `parlamento.gub.uy` devuelve 403 a todo pedido automático, y eso no prueba
 * nada sobre el canal.
 *
 * La deriva de suscriptores y del último video se informa como AVISO. Son cifras del
 * día de la verificación y envejecen; el aviso es el recordatorio de actualizarlas.
 */
import { CHANNELS, VERIFIED_ON, type Channel } from '../../app/data/canales-youtube'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36'
const TIMEOUT_MS = 25_000
const DELAY_MS = 700
/** Los suscriptores se mueven solos; sólo avisamos si se fueron lejos. */
const SUBS_TOLERANCE = 0.15

const only = process.argv.find(a => a.startsWith('--only='))?.slice('--only='.length)
const targets = only ? CHANNELS.filter(c => c.id === only) : CHANNELS
if (targets.length === 0) throw new Error(`no channel matches --only=${only}`)

let failures = 0
let warnings = 0

function fail(msg: string): void {
  failures++
  console.error(`✗ ${msg}`)
}
function warn(msg: string): void {
  warnings++
  console.warn(`! ${msg}`)
}

async function get(url: string): Promise<{ status: number, body: string }> {
  const res = await fetch(url, {
    headers: { 'user-agent': UA, 'accept-language': 'es-419,es' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  return { status: res.status, body: await res.text() }
}

/** País, suscriptores y videos, tal como los publica la pestaña «Más información». */
async function about(id: string): Promise<{ status: number, country: string | null, subs: string | null }> {
  const { status, body } = await get(`https://www.youtube.com/channel/${id}/about`)
  const pick = (re: RegExp) => (body.match(re) ?? [])[1] ?? null
  return {
    status,
    country: pick(/"country":"([^"]+)"/),
    subs: pick(/"subscriberCountText":"([^"]+)"/),
  }
}

/** Fecha del último video del feed público. */
async function lastUpload(id: string): Promise<string | null> {
  const { status, body } = await get(`https://www.youtube.com/feeds/videos.xml?channel_id=${id}`)
  if (status !== 200) return null
  const dates = [...body.matchAll(/<published>([^<]+)<\/published>/g)].map(m => m[1]!)
  if (dates.length === 0) return null
  return dates.sort().at(-1)!.slice(0, 10)
}

/**
 * El sitio oficial enlaza ESE canal.
 *
 * Cuenta el identificador en cualquier parte del HTML, no sólo dentro de un enlace:
 * sarandi690.com.uy no linkea su canal, lo EMBEBE
 * (`youtube.com/embed/live_stream?channel=UC…`), y esa prueba vale igual.
 * También cuenta el handle en las URLs viejas `/user/` y `/c/`.
 */
async function siteLinksChannel(channel: Channel): Promise<'hit' | 'miss' | 'unreachable'> {
  if (!channel.proofUrl) return 'miss'
  let body: string
  try {
    const res = await get(channel.proofUrl)
    if (res.status !== 200) return 'unreachable'
    body = res.body
  }
  catch {
    return 'unreachable'
  }
  if (body.includes(channel.id)) return 'hit'
  const links = body.match(/youtube\.com\/(?:@[A-Za-z0-9._-]+|user\/[A-Za-z0-9._-]+|c\/[A-Za-z0-9._-]+)/gi) ?? []
  const handle = channel.handle.replace(/^@/, '').toLowerCase()
  return links.some(l => l.toLowerCase().includes(handle)) ? 'hit' : 'miss'
}

/**
 * «23.8 k suscriptores» → 23800. YouTube redondea y cambia el separador según el
 * idioma, así que comparar textos daría un aviso por canal todas las veces.
 */
function parseSubs(raw: string | null): number | null {
  if (!raw) return null
  const m = raw.match(/([\d.,]+)\s*([kKmM])?/)
  if (!m) return null
  const n = Number(m[1]!.replace(/\.(?=\d{3})/g, '').replace(',', '.'))
  if (!Number.isFinite(n)) return null
  const mult = m[2]?.toLowerCase() === 'k' ? 1_000 : m[2]?.toLowerCase() === 'm' ? 1_000_000 : 1
  return n * mult
}

async function main(): Promise<void> {
  console.log(`Verificando ${targets.length} canales contra YouTube (tabla del ${VERIFIED_ON})\n`)

  for (const c of targets) {
    try {
      const info = await about(c.id)
      if (info.status !== 200) {
        fail(`${c.name}: el canal ${c.id} responde ${info.status}`)
        continue
      }

      if (c.proofs.includes('pais')) {
        if (info.country !== 'Uruguay') {
          fail(`${c.name}: la ficha dice prueba de país, y YouTube publica ${info.country ?? 'nada'}`)
        }
      }
      else if (info.country === 'Uruguay') {
        warn(`${c.name}: YouTube ya publica Uruguay; se le puede agregar la prueba "pais"`)
      }

      if (c.proofs.includes('sitio')) {
        const r = await siteLinksChannel(c)
        if (r === 'miss') fail(`${c.name}: ${c.proofUrl} ya no enlaza el canal`)
        if (r === 'unreachable') warn(`${c.name}: ${c.proofUrl} no respondió; la prueba de sitio queda sin revisar`)
      }

      const last = await lastUpload(c.id)
      if (last !== c.lastUpload) {
        warn(`${c.name}: último video ${last ?? 'sin feed'} (la tabla dice ${c.lastUpload ?? 'sin feed'})`)
      }
      const live = parseSubs(info.subs)
      if (live !== null && Math.abs(live - c.subscribersApprox) / c.subscribersApprox > SUBS_TOLERANCE) {
        warn(`${c.name}: suscriptores ${info.subs} (la tabla dice ${c.subscribers})`)
      }
    }
    catch (e) {
      warn(`${c.name}: no se pudo consultar (${String(e).slice(0, 60)})`)
    }
    await new Promise(r => setTimeout(r, DELAY_MS))
  }

  console.log(`\n${failures} contradicciones, ${warnings} avisos sobre ${targets.length} canales`)
  if (failures > 0) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
