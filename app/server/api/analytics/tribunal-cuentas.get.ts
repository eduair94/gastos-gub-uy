import { defineEventHandler, getQuery } from 'h3'
import { connectToDatabase } from '../../utils/database'
import { TcrResolutionModel } from '../../utils/models'

/**
 * Resoluciones del Tribunal de Cuentas sobre compras, con la compra al lado.
 *
 * Lee `tcr_resolutions` (src/jobs/scrape-tcr-resolutions.ts). Sirve tres cosas que la
 * página tiene que mostrar juntas para no mentir:
 *
 *   1. `rows` — las resoluciones, con `matchedOcid` cuando se pudo atar a una compra.
 *   2. `totals` — cuántas fichas se leyeron, cuántas son de contrataciones y cuántas
 *      se ataron. Es el denominador: el archivo se recorre de a tandas por noche.
 *   3. `range` — qué fechas cubre lo leído. El recorrido va por id descendente y los
 *      ids son casi cronológicos, así que hoy lo leído se concentra en los últimos años
 *      del archivo. Sin decirlo, la página parecería el archivo completo.
 */
export default defineEventHandler(async (event) => {
  await connectToDatabase()
  const query = getQuery(event)

  const page = Math.max(1, Number.parseInt(String(query.page ?? '1'), 10) || 1)
  const limit = Math.min(100, Math.max(1, Number.parseInt(String(query.limit ?? '25'), 10) || 25))
  const search = String(query.search ?? '').trim()
  // Por defecto sólo las atadas: son las que aportan algo que no está en tcr.gub.uy.
  const onlyLinked = String(query.all ?? '') !== '1'

  const filter: Record<string, unknown> = { isProcurement: true, exists: true }
  if (onlyLinked) filter.matchedOcid = { $ne: null }
  if (search) {
    const rx = { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' }
    filter.$or = [{ organism: rx }, { organismPath: rx }, { visto: rx }, { procurementTitle: rx }]
  }

  const [rows, total, totals, oldest, newest] = await Promise.all([
    TcrResolutionModel.find(filter, { _id: 0, __v: 0, probedAt: 0 })
      .sort({ resolvedAt: -1, tcrId: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    TcrResolutionModel.countDocuments(filter),
    TcrResolutionModel.aggregate([
      {
        $group: {
          _id: null,
          probed: { $sum: 1 },
          exists: { $sum: { $cond: ['$exists', 1, 0] } },
          procurement: { $sum: { $cond: ['$isProcurement', 1, 0] } },
          named: { $sum: { $cond: [{ $ne: ['$procurementTitle', null] }, 1, 0] } },
          linked: { $sum: { $cond: [{ $ne: ['$matchedOcid', null] }, 1, 0] } },
          ambiguous: { $sum: { $cond: [{ $and: [{ $eq: ['$matchedOcid', null] }, { $gt: ['$matchCandidates', 1] }] }, 1, 0] } },
        },
      },
    ]),
    TcrResolutionModel.findOne({ resolvedAt: { $ne: null } }, { _id: 0, resolvedAt: 1 }).sort({ resolvedAt: 1 }).lean(),
    TcrResolutionModel.findOne({ resolvedAt: { $ne: null } }, { _id: 0, resolvedAt: 1 }).sort({ resolvedAt: -1 }).lean(),
  ])

  const t = totals[0] ?? { probed: 0, exists: 0, procurement: 0, named: 0, linked: 0, ambiguous: 0 }

  return {
    success: true,
    data: {
      rows,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      totals: t,
      range: {
        from: (oldest as { resolvedAt?: Date } | null)?.resolvedAt ?? null,
        to: (newest as { resolvedAt?: Date } | null)?.resolvedAt ?? null,
      },
    },
  }
})
