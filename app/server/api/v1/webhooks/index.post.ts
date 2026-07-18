import { createError, defineEventHandler, readBody } from 'h3'
import { connectToDatabase } from '../../../utils/database'
import { WEBHOOK_SUBSCRIPTION_CAP, WebhookSubscriptionModel } from '../../../../../shared/models/webhook_subscription'
import type { IWebhookFilters, WebhookEvent } from '../../../../../shared/types/monitor'
import { assertSafeWebhookUrl, generateWebhookSecret } from '../../../../../shared/webhooks/sign'
import { requireWrite } from '../../../utils/auth'

const EVENTS: WebhookEvent[] = ['tender.matched', 'anomaly.detected', 'award.created']

function parseFilters(raw: unknown): IWebhookFilters | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const f = raw as Record<string, unknown>
  const out: IWebhookFilters = {}
  const strArr = (v: unknown) => (Array.isArray(v) ? v.map(String).slice(0, 100) : undefined)
  if (strArr(f.categories)) out.categories = strArr(f.categories)
  if (strArr(f.keywords)) out.keywords = strArr(f.keywords)
  if (strArr(f.buyers)) out.buyers = strArr(f.buyers)
  if (typeof f.minAmount === 'number') out.minAmount = f.minAmount
  if (typeof f.minZ === 'number') out.minZ = f.minZ
  if (typeof f.severity === 'string') out.severity = f.severity
  if (typeof f.supplierId === 'string') out.supplierId = f.supplierId
  return Object.keys(out).length ? out : undefined
}

// Create a webhook subscription (REST Hook subscribe). Returns the signing
// `secret` once. Requires a write-scoped API key or the web session.
export default defineEventHandler(async (event) => {
  const user = requireWrite(event)
  const apiKey = event.context.apiKey as { id: string } | null
  const body = await readBody<{ url?: unknown, events?: unknown, filters?: unknown }>(event)

  const url = typeof body?.url === 'string' ? body.url.trim() : ''
  try {
    assertSafeWebhookUrl(url)
  }
  catch (e) {
    throw createError({ statusCode: 400, statusMessage: e instanceof Error ? e.message : 'URL inválida' })
  }

  const requested = Array.isArray(body?.events) ? body.events.map(String) : []
  const events = EVENTS.filter(e => requested.includes(e))
  if (events.length === 0) {
    throw createError({ statusCode: 400, statusMessage: `Elegí al menos un evento: ${EVENTS.join(', ')}` })
  }

  await connectToDatabase()
  const count = await WebhookSubscriptionModel.countDocuments({ userId: user.uid })
  if (count >= WEBHOOK_SUBSCRIPTION_CAP) {
    throw createError({ statusCode: 409, statusMessage: `Alcanzaste el máximo de ${WEBHOOK_SUBSCRIPTION_CAP} webhooks.` })
  }

  const secret = generateWebhookSecret()
  const sub = await WebhookSubscriptionModel.create({
    userId: user.uid,
    apiKeyId: apiKey?.id,
    url,
    events,
    filters: parseFilters(body?.filters),
    secret,
  })

  return {
    success: true,
    data: {
      id: String(sub._id),
      url: sub.url,
      events: sub.events,
      filters: sub.filters ?? null,
      active: sub.active,
      secret, // shown once
    },
  }
})
