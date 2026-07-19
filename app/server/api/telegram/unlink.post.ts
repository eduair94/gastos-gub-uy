import { defineEventHandler } from 'h3'
import { connectToDatabase } from '../../utils/database'
import { UserModel } from '../../../../shared/models/user'
import { requireWrite } from '../../utils/auth'

// Unlink the user's Telegram chat and turn the telegram channel off.
export default defineEventHandler(async (event) => {
  const user = requireWrite(event)
  await connectToDatabase()
  await UserModel.updateOne(
    { uid: user.uid },
    { $unset: { telegram: 1 }, $set: { 'notificationPrefs.channels.telegram': false } },
  )
  return { success: true }
})
