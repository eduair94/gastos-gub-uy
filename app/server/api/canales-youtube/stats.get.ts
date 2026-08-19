import { defineEventHandler } from 'h3'
import { connectToDatabase, mongoose } from '../../utils/database'

/**
 * Las cifras vivas de cada canal del directorio.
 *
 * La página siempre tiene algo que mostrar: si esto no responde —o si un canal
 * todavía no pasó por el job— usa las cifras curadas del módulo, que son las del
 * día en que se verificó la tabla. Por eso el handler nunca tira: devuelve el
 * mapa vacío y la página no se entera.
 *
 * Lo escribe `src/jobs/refresh-youtube-channels.ts`, de madrugada.
 */
export default defineEventHandler(async () => {
  try {
    await connectToDatabase()
    if (mongoose.connection.readyState !== 1) {
      return { success: true, data: { stats: {}, checkedAt: null } }
    }

    const rows = await mongoose.connection.db!
      .collection('youtube_channel_stats')
      .find({ error: null }, {
        projection: {
          _id: 0,
          channelId: 1,
          subscribers: 1,
          subscribersApprox: 1,
          videos: 1,
          views: 1,
          country: 1,
          lastUpload: 1,
          selfDescription: 1,
          joined: 1,
          sample: 1,
          checkedAt: 1,
        },
      })
      .toArray()

    const checkedAt = rows.reduce<string | null>((newest, r: any) => {
      const iso = r.checkedAt ? new Date(r.checkedAt).toISOString() : null
      return iso && (!newest || iso > newest) ? iso : newest
    }, null)

    return {
      success: true,
      data: {
        stats: Object.fromEntries(rows.map((r: any) => [r.channelId, r])),
        checkedAt,
      },
    }
  }
  catch {
    // Un directorio sin cifras frescas sigue siendo un directorio.
    return { success: true, data: { stats: {}, checkedAt: null } }
  }
})
