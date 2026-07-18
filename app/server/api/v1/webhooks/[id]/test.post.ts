import { createError, defineEventHandler, getRouterParam } from 'h3'
import { isValidObjectId } from 'mongoose'
import { connectToDatabase } from '../../../../utils/database'
import { WebhookSubscriptionModel } from '../../../../../../shared/models/webhook_subscription'
import { signPayload } from '../../../../../../shared/webhooks/sign'
import { requireWrite } from '../../../../utils/auth'

// Send a sample event to the subscription's URL so the integrator can confirm
// their receiver works. Does not persist a delivery. Returns the target's status.
export default defineEventHandler(async (event) => {
  const user = requireWrite(event)
  const id = getRouterParam(event, 'id')
  if (!id || !isValidObjectId(id)) {
    throw createError({ statusCode: 404, statusMessage: 'Webhook no encontrado' })
  }

  await connectToDatabase()
  const sub = await WebhookSubscriptionModel.findOne({ _id: id, userId: user.uid }).lean()
  if (!sub) {
    throw createError({ statusCode: 404, statusMessage: 'Webhook no encontrado' })
  }

  const body = JSON.stringify({
    event: 'ping',
    delivery: `test-${id}`,
    data: { message: 'Test event from gastos.gub.uy webhooks', subscriptionId: id },
  })
  const signature = signPayload(sub.secret, body)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 5000)
  try {
    const res = await fetch(sub.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-gastosgub-event': 'ping',
        'x-gastosgub-delivery': `test-${id}`,
        'x-gastosgub-signature': signature,
      },
      body,
      signal: controller.signal,
    })
    return { success: true, data: { ok: res.ok, status: res.status } }
  }
  catch (e) {
    return { success: false, data: { ok: false, error: e instanceof Error ? e.message : 'delivery failed' } }
  }
  finally {
    clearTimeout(timer)
  }
})
