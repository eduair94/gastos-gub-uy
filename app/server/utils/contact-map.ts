export interface ContactMapWindow {
  center: { lat: number, lng: number }
  bounds: { south: number, west: number, north: number, east: number }
  radiusMeters: number
  limit: number
}

function finiteNumber(value: unknown): number | null {
  const raw = Array.isArray(value) ? value[0] : value
  if (raw === undefined || raw === null || raw === '') return null
  const parsed = typeof raw === 'number' ? raw : Number(String(raw ?? ''))
  return Number.isFinite(parsed) ? parsed : null
}

function haversineMeters(
  from: { lat: number, lng: number },
  to: { lat: number, lng: number },
): number {
  const rad = Math.PI / 180
  const lat1 = from.lat * rad
  const lat2 = to.lat * rad
  const dLat = (to.lat - from.lat) * rad
  const dLng = (to.lng - from.lng) * rad
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * 6_371_008.8 * Math.asin(Math.min(1, Math.sqrt(a)))
}

/**
 * Parse the visible Leaflet window and derive a bounded nearest-neighbour
 * radius. Mongo receives server-computed distances rather than a caller's
 * arbitrary maxDistance.
 */
export function parseContactMapWindow(query: Record<string, unknown>): ContactMapWindow | null {
  const lat = finiteNumber(query.lat)
  const lng = finiteNumber(query.lng)
  const south = finiteNumber(query.south)
  const west = finiteNumber(query.west)
  const north = finiteNumber(query.north)
  const east = finiteNumber(query.east)
  if ([lat, lng, south, west, north, east].some(value => value === null)) return null
  if (lat! < -90 || lat! > 90 || lng! < -180 || lng! > 180) return null
  if (south! < -90 || north! > 90 || south! >= north!) return null
  if (west! < -180 || west! > 180 || east! < -180 || east! > 180) return null

  const center = { lat: lat!, lng: lng! }
  const corners = [
    { lat: south!, lng: west! },
    { lat: south!, lng: east! },
    { lat: north!, lng: west! },
    { lat: north!, lng: east! },
  ]
  const radiusMeters = Math.min(
    20_037_500,
    Math.max(1_000, ...corners.map(corner => haversineMeters(center, corner))),
  )
  const requestedLimit = Math.trunc(finiteNumber(query.limit) ?? 800)

  return {
    center,
    bounds: { south: south!, west: west!, north: north!, east: east! },
    radiusMeters,
    limit: Math.min(1_500, Math.max(100, requestedLimit)),
  }
}
