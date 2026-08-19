import { defineEventHandler, getQuery } from 'h3'
import { CHANNELS } from '../../../data/canales-youtube'

/**
 * Últimos videos de los canales uruguayos del directorio.
 *
 * Lee el feed Atom público de cada canal: `youtube.com/feeds/videos.xml?channel_id=UC…`.
 * No hay API key, no hay cuota y no hay cuenta. Ese feed devuelve los 15 videos más
 * recientes con título, fecha y miniatura.
 *
 * TRES LÍMITES QUE NO SE TOCAN, porque el servicio es de un tercero:
 *
 *   1. Una sola corrida por hora. La respuesta se guarda en memoria del worker y
 *      `routeRules` la comparte entre los dos workers de pm2.
 *   2. Seis pedidos en paralelo como máximo, con 8 segundos de tope cada uno.
 *   3. Si el feed falla, se devuelve la última respuesta buena y se marca `stale`.
 *      Un canal caído nunca vacía la página.
 *
 * Sólo se consultan los canales del directorio, que ya pasaron la prueba de identidad
 * en ~/data/canales-youtube. Este endpoint no descubre canales nuevos.
 */

const TTL_MS = 60 * 60 * 1000
const CONCURRENCY = 6
const FETCH_TIMEOUT_MS = 8_000
/** Videos por canal que se conservan. El feed trae 15; la ficha de un canal muestra estos. */
const PER_CHANNEL = 6
/** Tope de la lista combinada. */
const MAX_ITEMS = 140
const UA = 'Mozilla/5.0 (compatible; gastos-gub/1.0; +https://github.com/eduair94/gastos-gub-uy)'

export interface FeedVideo {
  videoId: string
  title: string
  /** ISO de publicación. */
  published: string
  channelId: string
  channelName: string
  category: string
  url: string
  thumbnail: string
}

interface Payload {
  videos: FeedVideo[]
  /** ISO de la lectura. */
  fetchedAt: string
  /** Canales cuyo feed no respondió en esta corrida. */
  failed: string[]
}

let cache: { data: Payload, at: number } | null = null
/** Evita que dos pedidos simultáneos disparen dos barridos completos. */
let inFlight: Promise<Payload> | null = null

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'', nbsp: ' ',
}

function decode(raw: string): string {
  return raw
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(Number.parseInt(h, 16)))
    .replace(/&([a-zA-Z]+);/g, (m, n) => ENTITIES[n] ?? m)
    .replace(/\s+/g, ' ')
    .trim()
}

function parseFeed(xml: string, channelId: string, channelName: string, category: string): FeedVideo[] {
  const out: FeedVideo[] = []
  for (const m of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const entry = m[1] ?? ''
    const videoId = (entry.match(/<yt:videoId>([^<]+)<\/yt:videoId>/) ?? [])[1]
    const title = (entry.match(/<title>([\s\S]*?)<\/title>/) ?? [])[1]
    const published = (entry.match(/<published>([^<]+)<\/published>/) ?? [])[1]
    if (!videoId || !title || !published) continue
    out.push({
      videoId,
      title: decode(title),
      published: new Date(published).toISOString(),
      channelId,
      channelName,
      category,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      thumbnail: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
    })
  }
  out.sort((a, b) => b.published.localeCompare(a.published))
  return out.slice(0, PER_CHANNEL)
}

async function fetchChannel(id: string, name: string, category: string): Promise<FeedVideo[]> {
  const res = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${id}`, {
    headers: { 'user-agent': UA },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`feed ${id} → ${res.status}`)
  return parseFeed(await res.text(), id, name, category)
}

async function collect(): Promise<Payload> {
  const queue = [...CHANNELS]
  const videos: FeedVideo[] = []
  const failed: string[] = []

  // Pool de tamaño fijo: cada trabajador toma el próximo canal al terminar el suyo.
  async function worker(): Promise<void> {
    for (;;) {
      const channel = queue.shift()
      if (!channel) return
      try {
        videos.push(...await fetchChannel(channel.id, channel.name, channel.category))
      }
      catch {
        failed.push(channel.id)
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()))
  videos.sort((a, b) => b.published.localeCompare(a.published))
  return { videos: videos.slice(0, MAX_ITEMS), fetchedAt: new Date().toISOString(), failed }
}

/**
 * `?channel=UC…` recorta la respuesta a un canal.
 *
 * El barrido es el mismo y la caché también: la ficha de un canal no dispara 34 pedidos
 * a YouTube ni tiene su propia caché. Un id que no está en el directorio devuelve vacío,
 * porque este endpoint no consulta canales que no pasaron la prueba de identidad.
 */
function narrow(data: Payload, channelId: string | null): Payload {
  if (!channelId) return data
  return { ...data, videos: data.videos.filter(v => v.channelId === channelId) }
}

export default defineEventHandler(async (event) => {
  const raw = getQuery(event).channel
  const channelId = typeof raw === 'string' && CHANNELS.some(c => c.id === raw) ? raw : null

  if (cache && Date.now() - cache.at < TTL_MS) {
    return { success: true, data: narrow(cache.data, channelId), stale: false }
  }

  if (!inFlight) {
    inFlight = collect().finally(() => {
      inFlight = null
    })
  }

  try {
    const data = await inFlight
    // Un barrido que no trajo nada no pisa la última respuesta buena.
    if (data.videos.length === 0 && cache) {
      return { success: true, data: narrow(cache.data, channelId), stale: true }
    }
    cache = { data, at: Date.now() }
    return { success: true, data: narrow(data, channelId), stale: false }
  }
  catch {
    if (cache) return { success: true, data: narrow(cache.data, channelId), stale: true }
    return { success: true, data: { videos: [], fetchedAt: new Date().toISOString(), failed: CHANNELS.map(c => c.id) }, stale: true }
  }
})
