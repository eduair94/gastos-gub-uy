import { defineEventHandler, readBody } from 'h3'
import { connectToDatabase } from '../../utils/database'
import { PushSubscriptionModel } from '../../../../shared/models/push_subscription'
import { UserModel } from '../../../../shared/models/user'
import { requireWrite } from '../../utils/auth'

// Remove a Web Push subscription (this browser unsubscribed). If it was the user's
// last active device, also flip the `push` channel off so the matcher stops
// enqueuing push rows it can't deliver.
export default defineEventHandler(async (event) => {
  const user = requireWrite(event)
  const body = await readBody<{ endpoint?: string }>(event)

  await connectToDatabase()
  if (body?.endpoint) {
    await PushSubscriptionModel.deleteOne({ endpoint: body.endpoint, userId: user.uid })
  }
  else {
    // No endpoint → treat as "turn push off entirely for this account".
    await PushSubscriptionModel.updateMany({ userId: user.uid }, { $set: { active: false } })
  }

  const remaining = await PushSubscriptionModel.countDocuments({ userId: user.uid, active: true })
  if (remaining === 0) {
    await UserModel.updateOne({ uid: user.uid }, { $set: { 'notificationPrefs.channels.push': false } })
  }

  return { success: true, data: { activeDevices: remaining } }
})
