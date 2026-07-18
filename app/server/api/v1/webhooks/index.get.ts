import { defineEventHandler } from 'h3'
import { connectToDatabase } from '../../../utils/database'
import { WebhookSubscriptionModel } from '../../../../../shared/models/webhook_subscription'
import { requireWrite } from '../../../utils/auth'

// List the caller's webhook subscriptions. Never returns the signing `secret`.
export default defineEventHandler(async (event) => {
  const user = requireWrite(event)
  await connectToDatabase()

  const subs = await WebhookSubscriptionModel.find({ userId: user.uid })
    .sort({ createdAt: -1 })
    .select('url events filters active failureCount lastDeliveryAt createdAt')
    .lean()

  return { success: true, data: subs }
})
