import { defineEventHandler } from 'h3'
import { connectToDatabase } from '../../utils/database'
import { NotificationModel } from '../../../../shared/models/notification'
import { requireWrite } from '../../utils/auth'

// Mark every unread inbox notification read.
export default defineEventHandler(async (event) => {
  const user = requireWrite(event)
  await connectToDatabase()
  const res = await NotificationModel.updateMany(
    { userId: user.uid, type: 'alert', channel: 'inapp', readAt: null },
    { $set: { readAt: new Date() } },
  )
  return { success: true, data: { updated: res.modifiedCount } }
})
