import { defineEventHandler, getHeader, getQuery, readBody, setResponseStatus } from 'h3'
import { connectToDatabase } from '../../utils/database'
import { CampaignSendModel } from '../../../../shared/models/campaign_send'
import { mapBrevoEvent } from '../../../../src/jobs/campaign/brevo-events'
import { suppress } from '../../../../src/jobs/campaign/suppression'

// Brevo transactional-event webhook (delivered/opened/click/bounce/spam/unsub).
// Brevo has no HMAC signing, so a shared secret carried in the URL (or a
// header, for callers that support one) is the only guard here.

interface BrevoWebhookEvent {
  event?: string
  messageId?: string
  'message-id'?: string
  email?: string
}

export default defineEventHandler(async (event) => {
  const expected = process.env.CAMPAIGN_WEBHOOK_SECRET
  const query = getQuery(event)
  const got = (typeof query.secret === 'string' ? query.secret : '') || getHeader(event, 'x-webhook-secret') || ''
  if (!expected || got !== expected) {
    setResponseStatus(event, 401)
    return { ok: false }
  }

  await connectToDatabase()

  const body = await readBody<BrevoWebhookEvent | BrevoWebhookEvent[]>(event).catch(() => null)
  const events = Array.isArray(body) ? body : body ? [body] : []

  for (const ev of events) {
    const m = mapBrevoEvent({ event: ev.event ?? '', messageId: ev.messageId, email: ev.email })
    if (m.status) {
      const providerMessageId = ev['message-id'] || ev.messageId
      const filter = providerMessageId ? { providerMessageId } : ev.email ? { email: ev.email } : null
      if (filter) {
        await CampaignSendModel.updateOne(filter, { $set: { status: m.status } })
      }
    }
    if (m.suppress && ev.email) {
      await suppress(ev.email, m.suppress, 'brevo:webhook')
    }
  }

  return { ok: true }
})
