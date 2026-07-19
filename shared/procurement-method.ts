/**
 * Procurement-method classification — the competitiveness lens.
 *
 * `tender.procurementMethodDetails` carries Spanish procedure names (the field users
 * filter by). We fold them into three families for the departmental comparison:
 *
 *   - direct  : non-competitive awards — "Compra Directa", "Compra por Excepción"
 *               (Art. 33 exceptions), any "Contratación Directa" variant.
 *   - tender  : competitive procedures — "Licitación Abreviada/Pública",
 *               "Concurso de Precios".
 *   - other   : everything else with a declared method — Convenio Marco, Concesión,
 *               Arrendamiento/Venta, PFI, etc. (neither a plain direct award nor a
 *               classic tender; kept separate so it never inflates either ratio).
 *   - unknown : no method declared (~69% of releases nationally — see filters.get.ts).
 *
 * The % compra directa is computed over (direct + tender + other) = "método conocido",
 * NOT over the total, so the pervasive nulls don't silently deflate it. Keyword-based
 * (normalized) so minor string variants classify correctly.
 */
export type MethodClass = 'direct' | 'tender' | 'other' | 'unknown'

function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
}

export function methodClass(details?: string | null): MethodClass {
  if (!details || !details.trim()) return 'unknown'
  const s = norm(details)
  // Competitive first: "licitación" and "concurso de precios" are unambiguous tenders.
  if (s.includes('licitacion') || s.includes('concurso de precios')) return 'tender'
  // Non-competitive direct awards, incl. Art. 33 "excepción" and any "directa" variant.
  if (s.includes('compra directa') || s.includes('contratacion directa') || s.includes('excepcion') || s.includes('directa')) {
    return 'direct'
  }
  return 'other'
}

/** True for the two families that make up the "% compra directa" denominator. */
export function isKnownMethod(c: MethodClass): boolean {
  return c !== 'unknown'
}
