import { defineEventHandler, getQuery } from 'h3'
import { connectToDatabase } from '../../utils/database'
import { BidderCompetitionModel, CallBiddersModel } from '../../utils/models'

/**
 * Cuánta competencia hay en las compras de cada organismo.
 *
 * Lee el rollup `bidder_competition` (src/jobs/refresh-bidder-competition.ts) — un find
 * plano, sin agregación en vivo: el universo por organismo se cuenta agrupando `releases`
 * por `buyer.id`, que NO tiene índice, y eso no puede vivir en un request.
 *
 * Devuelve SIEMPRE los tres números juntos (universo, sondeadas, publicadas) y el
 * porcentaje sólo cuando la muestra lo sostiene. Un "% de oferente único" sin denominador
 * repetiría la trampa del "% de compra directa": el organismo poco mirado saldría limpio.
 */
const SORT_FIELDS: Record<string, Record<string, 1 | -1>> = {
  sole: { soleRate: -1, withBidders: -1 },
  competition: { soleRate: 1, withBidders: -1 },
  coverage: { coverage: -1, probed: -1 },
  probed: { probed: -1 },
  avg: { avgBidders: -1, withBidders: -1 },
}

export default defineEventHandler(async (event) => {
  await connectToDatabase()
  const query = getQuery(event)

  const page = Math.max(1, Number.parseInt(String(query.page ?? '1'), 10) || 1)
  const limit = Math.min(100, Math.max(1, Number.parseInt(String(query.limit ?? '25'), 10) || 25))
  const sortBy = String(query.sortBy ?? 'sole')
  const search = String(query.search ?? '').trim()
  // Por defecto sólo los concluyentes: mostrar un 100% construido sobre 2 compras
  // sería exactamente el titular falso que este endpoint existe para no dar.
  const onlyConclusive = String(query.all ?? '') !== '1'

  const filter: Record<string, unknown> = {}
  if (onlyConclusive) filter.conclusive = true
  if (search) filter.buyerName = { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' }

  const sort = SORT_FIELDS[sortBy] ?? SORT_FIELDS.sole!

  const [rows, total, totals] = await Promise.all([
    BidderCompetitionModel.find(filter, { _id: 0, __v: 0 })
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    BidderCompetitionModel.countDocuments(filter),
    // Los totales van sobre `call_bidders` y no sobre el rollup: son la foto de lo
    // efectivamente mirado, sin el filtro de concluyencia.
    CallBiddersModel.aggregate([
      {
        $group: {
          _id: null,
          probed: { $sum: 1 },
          withBidders: { $sum: { $cond: ['$found', 1, 0] } },
          sole: { $sum: { $cond: [{ $eq: ['$count', 1] }, 1, 0] } },
          bidders: { $sum: { $ifNull: ['$count', 0] } },
        },
      },
    ]),
  ])

  const t = totals[0] ?? { probed: 0, withBidders: 0, sole: 0, bidders: 0 }
  const lastRun = rows[0]?.calculatedAt ?? null

  return {
    success: true,
    data: {
      rows,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      totals: {
        probed: t.probed,
        withBidders: t.withBidders,
        sole: t.sole,
        soleRate: t.withBidders > 0 ? t.sole / t.withBidders : null,
        avgBidders: t.withBidders > 0 ? t.bidders / t.withBidders : null,
      },
      calculatedAt: lastRun,
    },
  }
})
