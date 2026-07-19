import { createError, defineEventHandler, getRouterParam } from 'h3'
import { isValidObjectId } from 'mongoose'
import { connectToDatabase } from '../../../utils/database'
import { NotificationModel } from '../../../../../shared/models/notification'
import { requireWrite } from '../../../utils/auth'

// Mark one inbox notification read (idempotent — only sets readAt if unset).
export default defineEventHandler(async (event) => {
  const user = requireWrite(event)
  const id = getRouterParam(event, 'id')
  if (!id || !isValidObjectId(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Id inválido' })
  }

  await connectToDatabase()
  const res = await NotificationModel.updateOne(
    { _id: id, userId: user.uid, readAt: null },
    { $set: { readAt: new Date() } },
  )
  return { success: true, data: { updated: res.modifiedCount } }
})
