import { createError, defineEventHandler, getRouterParam } from 'h3'
import { connectToDatabase } from '../../../utils/database'
import { BuyerPatternModel, TcrResolutionModel } from '../../../utils/models'

/**
 * Resoluciones del Tribunal de Cuentas que nombran a este organismo.
 *
 * El panel del TC ya existía en la ficha del CONTRATO, pero sólo aparece si esa compra
 * puntual quedó atada a una resolución. Un lector parado en el organismo no veía nada.
 *
 * CÓMO SE CRUZA, Y SU LÍMITE: `tcr_resolutions` guarda el organismo como texto (así lo
 * publica el Tribunal), no un buyerId. Se compara el nombre normalizado — sirve para
 * traer las resoluciones de este organismo, y no sirve para afirmar que son TODAS: el
 * Tribunal puede nombrarlo con otra grafía. Por eso el panel dice "al menos", nunca un
 * total cerrado.
 *
 * LO QUE ESTE NÚMERO NO ES: un contador de irregularidades. El Tribunal se pronuncia de
 * forma rutinaria sobre muchísimo gasto, y la cantidad de resoluciones sigue al TAMAÑO
 * del organismo, no a su conducta. Además la ficha en línea publica sólo el VISTO: si el
 * gasto fue observado está en el PDF. Por eso acá no hay ranking ni comparación entre
 * organismos — sólo la lista, en la ficha de cada uno, con el enlace a la resolución.
 */
const MAX_ITEMS = 10

function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
}

export default defineEventHandler(async (event) => {
  await connectToDatabase()

  const raw = getRouterParam(event, 'id')
  if (!raw) throw createError({ statusCode: 400, statusMessage: 'Buyer ID is required' })
  const buyerId = decodeURIComponent(raw)

  const buyer = await BuyerPatternModel.findOne({ buyerId }, { _id: 0, name: 1 }).lean() as { name?: string } | null
  const name = buyer?.name?.trim()
  if (!name) return { success: true, data: { items: [], total: 0, matchedOn: null } }

  const target = norm(name)

  // Consulta EXACTA sobre la clave normalizada, servida por el índice
  // {organismKey, resolvedAt}. La primera versión traía 600 documentos por render y los
  // filtraba en memoria: caro en cada carga de ficha de organismo, y sin techo real.
  const [items, total] = await Promise.all([
    TcrResolutionModel.find(
      { organismKey: target, isProcurement: true, exists: true },
      { _id: 0, tcrId: 1, date: 1, subject: 1, expediente: 1, visto: 1, pdfUrl: 1, sourceUrl: 1, procurementTitle: 1, matchedOcid: 1 },
    )
      .sort({ resolvedAt: -1 })
      .limit(MAX_ITEMS)
      .lean(),
    TcrResolutionModel.countDocuments({ organismKey: target, isProcurement: true, exists: true }),
  ])

  return {
    success: true,
    data: { items, total, matchedOn: name },
  }
})
