import { createError, defineEventHandler, getRouterParam } from 'h3'
import { connectToDatabase } from '../../../utils/database'
import { DailyInvestigationModel } from '../../../../../shared/models/daily_investigation'

/**
 * Una nota diaria.
 *
 * UNA NOTA INEXISTENTE CONTESTA 404, no 200 con cuerpo vacío. Un 200 sobre nada le enseña al
 * crawler que la ruta existe y le mete una página vacía al índice. Es el mismo defecto que ya
 * se arregló en las fichas de caso.
 */
export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  if (!slug) throw createError({ statusCode: 400, statusMessage: 'Falta slug' })

  await connectToDatabase()
  const doc = await DailyInvestigationModel.findOne({ slug, status: 'published' }).lean()
  if (!doc) throw createError({ statusCode: 404, statusMessage: 'Nota no encontrada' })

  return { success: true, data: doc }
})
