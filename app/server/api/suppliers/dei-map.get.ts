import { createError, defineEventHandler } from 'h3'
import { connectToDatabase } from '../../utils/database'
import { deiRut } from '../../utils/dei'
import { DeiCompanyModel, SupplierPatternModel } from '../../utils/models'

/**
 * Points for the map of registered industrial companies that are state
 * suppliers: every DEI company with valid coordinates that also appears in
 * supplier_patterns (matched by RUT). Sized/linked by the supplier's total.
 *
 * Reverse of the request-path join: DEI → supplier. A supplier `supplierId`
 * carries an `R` and a slash, so we reconstruct both shapes (+ bare rut) and
 * match on the indexed field.
 */

interface DeiMapPoint {
  supplierId: string
  name: string
  rut: string
  tamano: string
  departamento: string
  actividad: string
  lat: number
  lng: number
  totalValue: number
}

let cache: { at: number, points: DeiMapPoint[] } | null = null
const TTL = 30 * 60 * 1000

function candidateIds(ruts: string[]): string[] {
  const out: string[] = []
  for (const r of ruts) out.push(`R/${r}`, `R${r}`, r)
  return out
}

export default defineEventHandler(async () => {
  try {
    if (cache && Date.now() - cache.at < TTL) {
      return { success: true, data: { points: cache.points, cachedAt: new Date(cache.at).toISOString() } }
    }

    await connectToDatabase()

    // DEI companies that can actually be placed on a map.
    const dei = await DeiCompanyModel.find(
      { lat: { $ne: null }, lng: { $ne: null } },
      { rut: 1, denominacionSocial: 1, nombreComercial: 1, tamano: 1, departamento: 1, ciiuPrincipalDesc: 1, lat: 1, lng: 1, _id: 0 },
    ).lean()

    const byRut = new Map<string, typeof dei[number]>()
    for (const d of dei) byRut.set((d as { rut: string }).rut, d)

    // Which of those RUTs are state suppliers, and their totals.
    const suppliers = await SupplierPatternModel.find(
      { supplierId: { $in: candidateIds([...byRut.keys()]) } },
      { supplierId: 1, name: 1, totalValue: 1, _id: 0 },
    ).lean()

    const points: DeiMapPoint[] = []
    for (const s of suppliers as Array<{ supplierId: string, name: string, totalValue: number }>) {
      const d = byRut.get(deiRut(s.supplierId))
      if (!d) continue
      const dd = d as Record<string, unknown>
      points.push({
        supplierId: s.supplierId,
        name: s.name,
        rut: dd.rut as string,
        tamano: (dd.tamano as string) ?? '',
        departamento: (dd.departamento as string) ?? '',
        actividad: (dd.ciiuPrincipalDesc as string) ?? '',
        lat: dd.lat as number,
        lng: dd.lng as number,
        totalValue: Number(s.totalValue) || 0,
      })
    }

    cache = { at: Date.now(), points }
    return { success: true, data: { points, cachedAt: new Date(cache.at).toISOString() } }
  }
  catch (error) {
    console.error('Error building DEI map:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to build DEI map' })
  }
})
