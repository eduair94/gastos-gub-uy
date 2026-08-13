import { createError, defineEventHandler, getRouterParam } from 'h3'
import { connectToDatabase } from '../../../utils/database'
import { OrganismNewsModel } from '../../../utils/models'

/**
 * Prensa sobre las compras de este organismo.
 *
 * Lectura plana de `organism_news`, que llena src/jobs/refresh-organism-news.ts de a
 * tandas por noche. Deliberadamente NO se consulta el feed en vivo: sería pegarle a un
 * tercero en cada visita, y la prensa no cambia entre dos cargas de la misma página.
 *
 * Devuelve una lista vacía cuando el organismo no tiene notas relevantes o cuando
 * todavía no se consultó — el panel simplemente no se muestra. Un "no hay noticias"
 * afirmado sobre un organismo que nunca miramos sería falso.
 */
export default defineEventHandler(async (event) => {
  await connectToDatabase()

  const raw = getRouterParam(event, 'id')
  if (!raw) throw createError({ statusCode: 400, statusMessage: 'Buyer ID is required' })
  const buyerId = decodeURIComponent(raw)

  const doc = await OrganismNewsModel.findOne(
    { buyerId },
    { _id: 0, items: 1, fetchedAt: 1, buyerName: 1 },
  ).lean() as { items?: unknown[], fetchedAt?: Date, buyerName?: string } | null

  return {
    success: true,
    data: {
      items: doc?.items ?? [],
      fetchedAt: doc?.fetchedAt ?? null,
      buyerName: doc?.buyerName ?? null,
    },
  }
})
