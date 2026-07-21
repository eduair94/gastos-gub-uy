import { mongoose } from './database'

/**
 * Read side of `rupe_registry` (loaded by src/jobs/load-rupe.ts + geocoded by
 * src/jobs/geocode-rupe.ts from ARCE's Registro Único de Proveedores del Estado).
 *
 * The join to a supplier is by RUT, exactly like DEI: a supplier_patterns
 * `supplierId` is a RUT-based id (`R/210002980010`), so `rupeRut(supplierId)`
 * (digits only) equals the RUPE `rut`. Exact match, no fuzzy fallback here — the
 * few non-numeric ids simply don't match, which is correct. RUT covers 91.7% of
 * suppliers, far beyond DEI's ~6%.
 *
 * Official government open data — a fact of record, freely displayable. Consumers
 * cite the source, not a hedge. Coordinates are present only once geocode-rupe has
 * run for that address; the address text is always available.
 */

/** A supplier_patterns id → its RUT (digits only), the RUPE join key. */
export function rupeRut(supplierId: string | null | undefined): string {
  return (supplierId ?? '').replace(/\D/g, '')
}

/** Public RUPE shape returned to the client (no _id / internal geocode bookkeeping). */
export interface RupeInfo {
  rut: string
  pais: string
  denominacionSocial: string
  domicilioFiscal: string | null
  localidad: string | null
  departamento: string | null
  estado: string
  lat: number | null
  lng: number | null
}

const PROJECTION = {
  _id: 0, rut: 1, pais: 1, denominacionSocial: 1, domicilioFiscal: 1,
  localidad: 1, departamento: 1, estado: 1, lat: 1, lng: 1,
} as const

/** RUPE records for a set of supplier ids, keyed by the ORIGINAL supplierId. */
export async function fetchRupe(supplierIds: Array<string | null | undefined>): Promise<Map<string, RupeInfo>> {
  const out = new Map<string, RupeInfo>()
  if (mongoose.connection.readyState !== 1) return out

  // supplierId → rut, keeping only those with a usable numeric RUT.
  const idToRut = new Map<string, string>()
  for (const id of supplierIds) {
    if (!id) continue
    const rut = rupeRut(id)
    if (rut.length >= 8) idToRut.set(id, rut)
  }
  const ruts = [...new Set(idToRut.values())]
  if (!ruts.length) return out

  const rows = await mongoose.connection.db!
    .collection('rupe_registry')
    .find({ rut: { $in: ruts } }, { projection: PROJECTION })
    .toArray()

  const byRut = new Map<string, RupeInfo>()
  for (const r of rows as unknown as RupeInfo[]) byRut.set(r.rut, r)

  for (const [id, rut] of idToRut) {
    const hit = byRut.get(rut)
    if (hit) out.set(id, hit)
  }
  return out
}

/** Attach `rupe: RupeInfo | null` to each item by its supplier id. */
export async function attachRupe<T>(items: T[], getId: (item: T) => string): Promise<Array<T & { rupe: RupeInfo | null }>> {
  const map = await fetchRupe(items.map(getId))
  return items.map(it => ({ ...it, rupe: map.get(getId(it)) ?? null }))
}
