import { createError, defineEventHandler, getRouterParam } from 'h3'
import { isValidObjectId } from 'mongoose'
import { connectToDatabase } from '../../../utils/database'
import { WebhookSubscriptionModel } from '../../../../../shared/models/webhook_subscription'
import { requireWrite } from '../../../utils/auth'

// Unsubscribe (REST Hook unsubscribe) — deletes a subscription owned by the caller.
export default defineEventHandler(async (event) => {
  const user = requireWrite(event)
  const id = getRouterParam(event, 'id')
  if (!id || !isValidObjectId(id)) {
    throw createError({ statusCode: 404, statusMessage: 'Webhook no encontrado' })
  }

  await connectToDatabase()
  const res = await WebhookSubscriptionModel.deleteOne({ _id: id, userId: user.uid })
  if (res.deletedCount === 0) {
    throw createError({ statusCode: 404, statusMessage: 'Webhook no encontrado' })
  }
  return { success: true }
})
