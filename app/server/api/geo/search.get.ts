import { createError, defineEventHandler, getHeader, getQuery, setHeader } from 'h3'

interface NominatimResult {
  place_id?: number
  display_name?: string
  lat?: string
  lon?: string
  type?: string
  boundingbox?: string[]
}

const NOMINATIM_BASE_URL = process.env.NOMINATIM_BASE_URL
  || 'https://nominatim.openstreetmap.org'
const NOMINATIM_USER_AGENT = process.env.NOMINATIM_USER_AGENT
  || 'ConLaTuyaMap/1.0 (https://conlatuya.checkleaked.cc)'

/** User-triggered, cached OpenStreetMap place search. Never used for autocomplete. */
export default defineEventHandler(async (event) => {
  const q = String(getQuery(event).q ?? '').trim().slice(0, 120)
  if (q.length < 3) {
    throw createError({ statusCode: 400, statusMessage: 'Search at least 3 characters' })
  }

  const language = String(getHeader(event, 'accept-language') ?? 'es-UY,es;q=0.9')
    .slice(0, 80)
  const url = new URL('/search', NOMINATIM_BASE_URL)
  url.searchParams.set('q', q)
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('limit', '5')
  url.searchParams.set('addressdetails', '0')

  let response: Response
  try {
    response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'Accept-Language': language,
        'User-Agent': NOMINATIM_USER_AGENT,
      },
      signal: AbortSignal.timeout(8_000),
    })
  }
  catch {
    throw createError({ statusCode: 502, statusMessage: 'Location search is unavailable' })
  }

  if (!response.ok) {
    throw createError({ statusCode: 502, statusMessage: 'Location search is unavailable' })
  }

  const raw = await response.json() as NominatimResult[]
  const results = raw.flatMap((item) => {
    const lat = Number(item.lat)
    const lng = Number(item.lon)
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !item.display_name) return []
    const bounds = item.boundingbox?.map(Number)
    return [{
      id: String(item.place_id ?? `${lat},${lng}`),
      label: item.display_name.slice(0, 240),
      lat,
      lng,
      type: String(item.type ?? ''),
      bounds: bounds?.length === 4 && bounds.every(Number.isFinite)
        ? {
            south: bounds[0],
            north: bounds[1],
            west: bounds[2],
            east: bounds[3],
          }
        : null,
    }]
  })

  setHeader(event, 'Cache-Control', 'public, max-age=86400')
  return { success: true, data: { results } }
})
