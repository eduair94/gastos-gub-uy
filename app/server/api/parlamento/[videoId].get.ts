import { createError, defineEventHandler, getRouterParam } from 'h3'
import { connectToDatabase, mongoose } from '../../utils/database'

/**
 * Una sesión con todos sus temas.
 *
 * La transcripción completa no viaja: son 190 KB por sesión y el lector que
 * quiera el texto tiene el video, que es la fuente. Lo que sí viaja es el conteo
 * de palabras, porque dice cuánto se habló.
 */
export default defineEventHandler(async (event) => {
  const videoId = getRouterParam(event, 'videoId')
  if (!videoId || !/^[A-Za-z0-9_-]{6,20}$/.test(videoId)) {
    throw createError({ statusCode: 400, statusMessage: 'videoId inválido' })
  }

  await connectToDatabase()
  if (mongoose.connection.readyState !== 1) {
    throw createError({ statusCode: 503, statusMessage: 'Database connection not ready' })
  }

  const col = mongoose.connection.db!.collection('parl_sessions')
  const session = await col.findOne(
    { videoId, summarizedAt: { $ne: null } },
    { projection: { _id: 0 } },
  )
  if (!session) {
    throw createError({ statusCode: 404, statusMessage: 'Sesión no encontrada' })
  }

  // Las sesiones vecinas de la misma cámara, para seguir leyendo.
  const [prev, next] = await Promise.all([
    col.findOne(
      { chamber: session.chamber, sessionDate: { $lt: session.sessionDate }, summarizedAt: { $ne: null } },
      { projection: { _id: 0, videoId: 1, headline: 1, sessionDate: 1 }, sort: { sessionDate: -1 } },
    ),
    col.findOne(
      { chamber: session.chamber, sessionDate: { $gt: session.sessionDate }, summarizedAt: { $ne: null } },
      { projection: { _id: 0, videoId: 1, headline: 1, sessionDate: 1 }, sort: { sessionDate: 1 } },
    ),
  ])

  return { success: true, data: { session, prev, next } }
})
