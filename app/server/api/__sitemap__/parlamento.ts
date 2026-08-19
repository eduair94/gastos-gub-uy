import { connectToDatabase, mongoose } from '../../utils/database'

/**
 * Una URL por sesión resumida, en /parlamento/[videoId].
 *
 * Sólo entran las que tienen resumen: una sesión a medio procesar no se publica
 * y por lo tanto no se anuncia. El índice `/parlamento` lo encuentra el escáner
 * de rutas, así que no va acá.
 */
export default defineSitemapEventHandler(async () => {
  await connectToDatabase()
  if (mongoose.connection.readyState !== 1) return []

  const rows = await mongoose.connection.db!
    .collection('parl_sessions')
    .find({ summarizedAt: { $ne: null } }, { projection: { _id: 0, videoId: 1, summarizedAt: 1 } })
    .sort({ sessionDate: -1 })
    .limit(2000)
    .toArray()

  return rows.map((r: any) => ({
    loc: `/parlamento/${r.videoId}`,
    lastmod: r.summarizedAt ?? undefined,
    changefreq: 'monthly' as const,
    priority: 0.6,
  }))
})
