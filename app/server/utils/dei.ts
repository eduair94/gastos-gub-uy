import { mongoose } from './database'

/**
 * Read side of `dei_companies` (loaded by src/jobs/load-dei.ts from MIEM's
 * Directorio de Empresas Industriales).
 *
 * The join to a supplier is by RUT: a supplier_patterns `supplierId` is a
 * RUT-based id (`R/210002980010` / `R213382910014`), so `deiRut(supplierId)`
 * (digits only) equals the DEI `rut`. Exact match, no fuzzy fallback — the few
 * non-numeric ids simply don't match, which is correct.
 *
 * Unlike supplier_enrichment (advisory AI context), this is official open data
 * — a fact of record. Consumers cite the source + snapshot date, not a hedge.
 */

/** A supplier_patterns id → its RUT (digits only), the DEI join key. */
export function deiRut(supplierId: string | null | undefined): string {
  return (supplierId ?? '').replace(/\D/g, '')
}

/** Public DEI shape returned to the client (no _id / internal timestamps). */
export interface DeiInfo {
  rut: string
  estado: string
  denominacionSocial: string
  nombreComercial: string
  tamano: string
  tiposActividad: string[]
  descripcionActividad: string
  ciiuPrincipal: string
  ciiuPrincipalDesc: string
  ciiuSecundarios: string[]
  departamento: string
  localidad: string
  direccion: string | null
  lat: number | null
  lng: number | null
  email: string | null
  sitioWeb: string | null
  telefono: string | null
  fechaRegistro: string | null
  fechaVencimiento: string | null
}

const PROJECTION = {
  _id: 0, rut: 1, estado: 1, denominacionSocial: 1, nombreComercial: 1, tamano: 1,
  tiposActividad: 1, descripcionActividad: 1, ciiuPrincipal: 1, ciiuPrincipalDesc: 1,
  ciiuSecundarios: 1, departamento: 1, localidad: 1, direccion: 1, lat: 1, lng: 1,
  email: 1, sitioWeb: 1, telefono: 1, fechaRegistro: 1, fechaVencimiento: 1,
} as const

/** DEI records for a set of supplier ids, keyed by the ORIGINAL supplierId. */
export async function fetchDei(supplierIds: Array<string | null | undefined>): Promise<Map<string, DeiInfo>> {
  const out = new Map<string, DeiInfo>()
  if (mongoose.connection.readyState !== 1) return out

  // supplierId → rut, keeping only those with a usable numeric RUT.
  const idToRut = new Map<string, string>()
  for (const id of supplierIds) {
    if (!id) continue
    const rut = deiRut(id)
    if (rut.length >= 8) idToRut.set(id, rut)
  }
  const ruts = [...new Set(idToRut.values())]
  if (!ruts.length) return out

  const rows = await mongoose.connection.db!
    .collection('dei_companies')
    .find({ rut: { $in: ruts } }, { projection: PROJECTION })
    .toArray()

  const byRut = new Map<string, DeiInfo>()
  for (const r of rows as unknown as DeiInfo[]) byRut.set(r.rut, r)

  for (const [id, rut] of idToRut) {
    const hit = byRut.get(rut)
    if (hit) out.set(id, hit)
  }
  return out
}

/** Attach `dei: DeiInfo | null` to each item by its supplier id. */
export async function attachDei<T>(items: T[], getId: (item: T) => string): Promise<Array<T & { dei: DeiInfo | null }>> {
  const map = await fetchDei(items.map(getId))
  return items.map(it => ({ ...it, dei: map.get(getId(it)) ?? null }))
}
