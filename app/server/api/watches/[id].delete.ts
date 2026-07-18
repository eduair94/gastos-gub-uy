import { createError, defineEventHandler, getRouterParam } from 'h3'
import { connectToDatabase, mongoose } from '../../utils/database'
import { WatchModel } from '../../../../shared/models/watch'
import { UserModel } from '../../../../shared/models/user'
import { requireWrite } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const user = requireWrite(event)
  const id = getRouterParam(event, 'id')
  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    throw createError({ statusCode: 404, statusMessage: 'Alerta no encontrada' })
  }

  await connectToDatabase()
  const res = await WatchModel.deleteOne({ _id: id, userId: user.uid })
  if (res.deletedCount === 0) {
    throw createError({ statusCode: 404, statusMessage: 'Alerta no encontrada' })
  }
  await UserModel.updateOne({ uid: user.uid, watchCount: { $gt: 0 } }, { $inc: { watchCount: -1 } })
  return { success: true }
})
