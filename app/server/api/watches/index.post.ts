import { createError, defineEventHandler, readBody } from 'h3'
import { connectToDatabase } from '../../utils/database'
import { WatchModel } from '../../../../shared/models/watch'
import { UserModel } from '../../../../shared/models/user'
import { requireWrite } from '../../utils/auth'
import { parseWatchPayload, WATCH_CAP } from '../../utils/watch-input'

// Create a watch. Enforces the free-tier cap and keeps the denormalized
// users.watchCount in sync.
export default defineEventHandler(async (event) => {
  const user = requireWrite(event)
  const body = await readBody<Record<string, unknown>>(event)
  const payload = parseWatchPayload(body)

  await connectToDatabase()

  const count = await WatchModel.countDocuments({ userId: user.uid })
  if (count >= WATCH_CAP) {
    throw createError({ statusCode: 409, statusMessage: `Alcanzaste el máximo de ${WATCH_CAP} alertas. Eliminá una para crear otra.` })
  }

  const watch = await WatchModel.create({ userId: user.uid, ...payload })
  await UserModel.updateOne({ uid: user.uid }, { $inc: { watchCount: 1 } })

  return { success: true, data: watch.toObject() }
})
