import { createError, defineEventHandler, getRequestHeader, readBody } from 'h3'
import { connectToDatabase } from '../../utils/database'
import { PushSubscriptionModel } from '../../../../shared/models/push_subscription'
import { UserModel } from '../../../../shared/models/user'
import { requireWrite } from '../../utils/auth'

// Register (or reactivate) a Web Push subscription for the current user's browser.
// Idempotent by `endpoint` so re-subscribing the same device just refreshes it.
// Subscribing IS opting in, so it also flips the `push` channel on.
export default defineEventHandler(async (event) => {
  const user = requireWrite(event)
  const body = await readBody<{ endpoint?: string, keys?: { p256dh?: string, auth?: string } }>(event)
  const endpoint = body?.endpoint
  const p256dh = body?.keys?.p256dh
  const auth = body?.keys?.auth
  if (!endpoint || !p256dh || !auth) {
    throw createError({ statusCode: 400, statusMessage: 'Suscripción push inválida' })
  }

  await connectToDatabase()
  const userAgent = getRequestHeader(event, 'user-agent')
  await PushSubscriptionModel.updateOne(
    { endpoint },
    {
      $set: {
        userId: user.uid,
        keys: { p256dh, auth },
        active: true,
        failureCount: 0,
        ...(userAgent ? { userAgent } : {}),
      },
    },
    { upsert: true },
  )
  await UserModel.updateOne({ uid: user.uid }, { $set: { 'notificationPrefs.channels.push': true } })

  return { success: true }
})
