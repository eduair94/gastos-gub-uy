import { createError, defineEventHandler, getQuery, setHeader } from 'h3'
import { SupplierContactModel } from '../../../../shared/models/supplier_contacts'
import { connectToDatabase } from '../../utils/database'
import { parseContactMapWindow } from '../../utils/contact-map'
import { buildContactFilter, CONTACTS_MAX_TIME_MS, sanitizeContact } from '../../utils/contacts'

/**
 * Provider locations nearest the center of the current map, constrained to the
 * visible bounds. The 2dsphere index orders candidates before the hard result
 * cap, so a world-scale directory never reaches the browser in one response.
 */
export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const window = parseContactMapWindow(query)
  if (!window) {
    throw createError({
      statusCode: 400,
      statusMessage: 'A valid map center and bounds are required',
    })
  }

  await connectToDatabase()
  const built = await buildContactFilter(query)
  const scan = {
    center: window.center,
    radiusMeters: window.radiusMeters,
  }
  if ('empty' in built) {
    return { success: true, data: { points: [], loaded: 0, truncated: false, scan } }
  }

  const { center, bounds, radiusMeters, limit } = window
  const filter: Record<string, unknown> = {
    ...built.filter,
    location: {
      $near: {
        $geometry: { type: 'Point', coordinates: [center.lng, center.lat] },
        $maxDistance: radiusMeters,
      },
    },
    lat: { $gte: bounds.south, $lte: bounds.north },
  }

  const lngCondition = bounds.west <= bounds.east
    ? { lng: { $gte: bounds.west, $lte: bounds.east } }
    : { $or: [{ lng: { $gte: bounds.west } }, { lng: { $lte: bounds.east } }] }
  if ('$and' in filter) {
    filter.$and = [...(filter.$and as Record<string, unknown>[]), lngCondition]
  }
  else {
    filter.$and = [lngCondition]
  }

  const rows = await SupplierContactModel.find(
    filter,
    {
      _id: 0,
      supplierId: 1,
      rut: 1,
      name: 1,
      locality: 1,
      address: 1,
      placeSource: 1,
      neverAwarded: 1,
      rupeEstado: 1,
      lat: 1,
      lng: 1,
      rubros: { $slice: 1 },
    },
  )
    .limit(limit + 1)
    .maxTimeMS(CONTACTS_MAX_TIME_MS)
    .lean()

  const truncated = rows.length > limit
  const points = rows.slice(0, limit).map((row) => {
    const safe = sanitizeContact(row as never)
    return {
      supplierId: safe.supplierId,
      rut: safe.rut,
      name: safe.name,
      lat: safe.lat,
      lng: safe.lng,
      locality: safe.locality,
      address: safe.address,
      placeSource: safe.placeSource,
      rubro: safe.rubro,
      neverAwarded: safe.neverAwarded,
      rupeEstado: safe.rupeEstado,
    }
  })

  setHeader(event, 'Cache-Control', 'public, max-age=30')
  return {
    success: true,
    data: {
      points,
      loaded: points.length,
      truncated,
      scan,
    },
  }
})
