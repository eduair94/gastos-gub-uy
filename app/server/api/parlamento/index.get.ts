import { createError, defineEventHandler, getQuery } from 'h3'
import { connectToDatabase, mongoose } from '../../utils/database'

/**
 * Las sesiones del Parlamento con resumen, más nuevas primero.
 *
 * Devuelve SÓLO las que tienen resumen: una sesión a medio procesar no se
 * publica. La transcripción nunca sale por acá — pesa 190 KB por sesión y la
 * lista no la necesita.
 *
 * `?chamber=senadores|representantes` filtra por cámara. `?limit` corta.
 */
const MAX_LIMIT = 60

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const chamber = typeof query.chamber === 'string' && ['senadores', 'representantes', 'asamblea'].includes(query.chamber)
    ? query.chamber
    : null
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number.parseInt(String(query.limit ?? '30'), 10) || 30))

  await connectToDatabase()
  if (mongoose.connection.readyState !== 1) {
    throw createError({ statusCode: 503, statusMessage: 'Database connection not ready' })
  }

  const col = mongoose.connection.db!.collection('parl_sessions')
  const filter: Record<string, unknown> = { summarizedAt: { $ne: null } }
  if (chamber) filter.chamber = chamber

  const [sessions, counts] = await Promise.all([
    col
      .find(filter, {
        projection: {
          _id: 0,
          videoId: 1,
          chamber: 1,
          videoTitle: 1,
          sessionDate: 1,
          durationSeconds: 1,
          headline: 1,
          summary: 1,
          topics: 1,
          votes: 1,
          transcriptWords: 1,
          summarizedAt: 1,
        },
      })
      .sort({ sessionDate: -1 })
      .limit(limit)
      .toArray(),
    col.aggregate([
      { $match: { summarizedAt: { $ne: null } } },
      { $group: { _id: '$chamber', n: { $sum: 1 } } },
    ]).toArray(),
  ])

  return {
    success: true,
    data: {
      sessions: sessions.map((row) => {
        // Los recuentos no viajan a la lista: se cuentan acá y se deja el número.
        const { votes = [], ...s } = row as typeof row & { votes?: { subject?: string, scope?: string }[] }
        return {
          ...s,
          // La lista muestra los tres primeros temas, y de cada uno sólo el título,
          // el minuto y el resultado. La explicación entera vive en la ficha.
          topics: (s.topics ?? []).slice(0, 3).map((t: Record<string, unknown>) => ({
            title: t.title,
            t: t.t,
            outcome: t.outcome ?? 'sin-votacion',
          })),
          topicCount: (s.topics ?? []).length,
          // Cuántas veces votó la cámara, sin contar la marcha de la sesión.
          voteCount: votes.filter(v => v.scope !== 'tramite' && (v.subject ?? '').trim()).length,
        }
      }),
      byChamber: Object.fromEntries(counts.map((c: any) => [c._id, c.n])),
      total: counts.reduce((a: number, c: any) => a + c.n, 0),
    },
  }
})
