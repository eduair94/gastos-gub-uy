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
  'X-Mailin-Custom'?: string
  'X-Mailin-custom'?: string
  tag?: string
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
      // nodemailer's local info.messageId (stored as providerMessageId) is
      // NOT what Brevo reports back on webhook events, so matching on it
      // never hits. Brevo DOES round-trip the X-Mailin-Custom header set at
      // send time — that per-send token is the reliable join key. No token
      // -> skip the status write (never fall back to an email-scoped update:
      // that's unscoped by campaign and could overwrite the wrong row for a
      // recipient enrolled in more than one campaign).
      const token = ev['X-Mailin-Custom'] ?? ev['X-Mailin-custom'] ?? ev.tag
      if (token) {
        await CampaignSendModel.updateOne({ token }, { $set: { status: m.status } })
      }
    }
    if (m.suppress && ev.email) {
      await suppress(ev.email, m.suppress, 'brevo:webhook')
    }
  }

  return { ok: true }
})
