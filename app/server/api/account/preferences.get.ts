import { defineEventHandler } from 'h3'
import { connectToDatabase } from '../../utils/database'
import { PushSubscriptionModel } from '../../../../shared/models/push_subscription'
import { requireUser } from '../../utils/auth'

// The current user's notification preferences (+ email/locale for the form) plus
// the connection state the settings UI needs: whether Telegram is linked and how
// many push devices are active.
export default defineEventHandler(async (event) => {
  const user = requireUser(event)
  await connectToDatabase()
  const pushDevices = await PushSubscriptionModel.countDocuments({ userId: user.uid, active: true })

  return {
    success: true,
    data: {
      email: user.email,
      emailVerified: user.emailVerified,
      locale: user.locale,
      notificationPrefs: user.notificationPrefs,
      telegram: {
        linked: !!user.telegram?.active,
        username: user.telegram?.username ?? null,
      },
      push: {
        devices: pushDevices,
      },
    },
  }
})
