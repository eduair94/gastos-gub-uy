import { createError, defineEventHandler, getRouterParam } from 'h3'
import { connectToDatabase, mongoose } from '../../utils/database'
import { WatchModel } from '../../../../shared/models/watch'
import { requireUser } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const user = requireUser(event)
  const id = getRouterParam(event, 'id')
  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    throw createError({ statusCode: 404, statusMessage: 'Alerta no encontrada' })
  }
  await connectToDatabase()
  const watch = await WatchModel.findOne({ _id: id, userId: user.uid }).lean()
  if (!watch) {
    throw createError({ statusCode: 404, statusMessage: 'Alerta no encontrada' })
  }
  return { success: true, data: watch }
})
