import { createError, defineEventHandler, getRouterParam } from 'h3'
import { connectToDatabase } from '../../../utils/database'
import { casoExplorerQuery } from '../../../utils/casos'
import type { CasoQuery } from '../../../utils/casos'
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

  /**
   * El recorte del explorador se arma acá y no en la página.
   *
   * `casoExplorerQuery` es código de servidor, y además escapa la coma dentro de cada valor.
   * Sin ese escape, «Administración Nacional de Combustible, Alcohol y Portland» viaja partido
   * en dos fragmentos que no son ningún comprador, y el filtro no devuelve nada.
   */
  const explorerQuery = casoExplorerQuery((doc.query ?? {}) as CasoQuery)

  return { success: true, data: { ...doc, explorerQuery } }
})
