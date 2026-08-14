import { createError, defineEventHandler, getRouterParam } from 'h3'
import { connectToDatabase } from '../../../utils/database'
import { CallBiddersModel, ReleaseModel } from '../../../utils/models'

/**
 * "¿A cuántos llamados se presentó esta empresa y cuántos ganó?"
 *
 * Una pregunta que hasta ahora no se podía contestar en Uruguay: el feed OCDS publica
 * únicamente al ganador, así que las ofertas perdidas no existían en ningún lado. Salen
 * del bloque "Proveedores participantes" de la ficha del gobierno (`call_bidders`), donde
 * el 100% de las filas trae RUT de 12 dígitos — que es lo que permite este cruce.
 *
 * COBERTURA PARCIAL, Y SE DICE. El scraper avanza de a tandas por noche, así que esto NO
 * es el historial completo de la empresa: es lo que se miró. Por eso el endpoint devuelve
 * siempre `probed` junto a los porcentajes, y la UI lo muestra al lado. Una tasa de éxito
 * sin denominador sería un número inventado.
 */
export default defineEventHandler(async (event) => {
  await connectToDatabase()

  const raw = getRouterParam(event, 'id')
  if (!raw) throw createError({ statusCode: 400, statusMessage: 'Supplier ID is required' })
  const supplierId = decodeURIComponent(raw)

  // El mismo RUT vive en el corpus con cuatro formas ("R/2148…", "R2148…", pelado, con
  // espacio final). Los 12 dígitos son la única forma que las alcanza a todas.
  const rut = supplierId.replace(/\D/g, '')
  if (rut.length !== 12) {
    return { success: true, data: { available: false, reason: 'no-rut', probed: 0 } }
  }

  const calls = await CallBiddersModel.find(
    { 'bidders.rut': rut, 'found': true },
    { _id: 0, ocid: 1, compraId: 1, count: 1, bidders: 1, buyerName: 1, sourceYear: 1 },
  )
    .limit(500)
    .lean()

  if (!calls.length) {
    return { success: true, data: { available: false, reason: 'not-seen', probed: 0 } }
  }

  // ¿Cuáles ganó? El ganador está en el release de adjudicación, no en el bloque de
  // oferentes, así que hay que preguntarle al corpus por esos ocids.
  //
  // El id del adjudicatario NO se compara con un regex: `{ $regex: rut }` no está anclado,
  // así que un id que apenas CONTENGA esos 12 dígitos (p. ej. uno de 13) contaría como
  // victoria de otra empresa. Se traen los ids y se comparan con la misma normalización a
  // 12 dígitos que usa el resto del cruce — exacta, y sin depender de un regex sobre un
  // campo multikey.
  const ocids = calls.map(c => c.ocid)
  const awarded = await ReleaseModel.find(
    { ocid: { $in: ocids } },
    { '_id': 0, 'ocid': 1, 'awards.suppliers.id': 1 },
  ).lean()

  const wonSet = new Set<string>()
  for (const r of awarded as Array<Record<string, any>>) {
    const ids: string[] = (r.awards ?? []).flatMap((a: any) => (a.suppliers ?? []).map((s: any) => String(s?.id ?? '')))
    if (ids.some(id => id.replace(/\D/g, '') === rut)) wonSet.add(r.ocid)
  }

  // Contra quién compite. Sólo los rivales, y ordenados por cuántas veces coincidieron:
  // es el mapa de quién se presenta siempre a los mismos llamados.
  const rivals = new Map<string, { name: string, rut: string, times: number }>()
  let soleBidder = 0
  for (const c of calls) {
    if (c.count === 1) soleBidder++
    for (const b of c.bidders ?? []) {
      if (!b.rut || b.rut === rut) continue
      const cur = rivals.get(b.rut) ?? { name: b.name, rut: b.rut, times: 0 }
      cur.times++
      rivals.set(b.rut, cur)
    }
  }

  const probed = calls.length
  const wins = calls.filter(c => wonSet.has(c.ocid)).length

  return {
    success: true,
    data: {
      available: true,
      probed,
      wins,
      // Sobre lo mirado, nunca sobre "todos sus llamados".
      winRate: probed > 0 ? wins / probed : null,
      /** Llamados donde fue el único que se presentó. */
      soleBidder,
      avgRivals: probed > 0 ? [...calls].reduce((a, c) => a + Math.max(0, (c.count ?? 1) - 1), 0) / probed : 0,
      rivals: [...rivals.values()].sort((a, b) => b.times - a.times).slice(0, 8),
    },
  }
})
