import { defineEventHandler, getQuery } from 'h3'
import { connectToDatabase } from '../../../utils/database'
import { DailyInvestigationModel } from '../../../../../shared/models/daily_investigation'

/**
 * El archivo de notas diarias.
 *
 * SÓLO DEVUELVE LAS PUBLICADAS. Las rechazadas quedan en la colección con sus motivos, porque
 * son el registro de qué intentó publicar el motor y por qué no se pudo, pero nunca salen por
 * la API: si no pasaron el verificador, no se muestran.
 */
export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const page = Math.max(1, Number.parseInt(String(query.page ?? '1'), 10) || 1)
  const limit = Math.min(48, Math.max(1, Number.parseInt(String(query.limit ?? '20'), 10) || 20))
  const lane = typeof query.lane === 'string' && query.lane ? query.lane : null

  await connectToDatabase()
  const filter: Record<string, unknown> = { status: 'published' }
  if (lane) filter.lane = lane

  const [items, total] = await Promise.all([
    DailyInvestigationModel.find(filter)
      .select('slug dayKey lane subjectLabel amountUyu contractCount publishedAt es en sources ocids')
      .sort({ publishedAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    DailyInvestigationModel.countDocuments(filter),
  ])

  return {
    success: true,
    data: {
      items,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    },
  }
})
