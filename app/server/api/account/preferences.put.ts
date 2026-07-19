import { defineEventHandler, readBody } from 'h3'
import { connectToDatabase } from '../../utils/database'
import { UserModel } from '../../../../shared/models/user'
import { requireWrite } from '../../utils/auth'
import type { NotificationChannel } from '../../../../shared/types/monitor'

const CHANNELS: NotificationChannel[] = ['email', 'push', 'telegram', 'inapp']

// Update notification preferences (master enabled / instant|daily / per-channel
// toggles) and UI locale. Push + Telegram delivery still require an actual
// connection (subscription / linked chat) regardless of the toggle.
export default defineEventHandler(async (event) => {
  const user = requireWrite(event)
  const body = await readBody<{
    enabled?: boolean
    frequency?: string
    locale?: string
    channels?: Partial<Record<NotificationChannel, boolean>>
  }>(event)

  const set: Record<string, unknown> = {}
  if (typeof body?.enabled === 'boolean') set['notificationPrefs.enabled'] = body.enabled
  if (body?.frequency === 'instant' || body?.frequency === 'daily') set['notificationPrefs.frequency'] = body.frequency
  if (body?.locale === 'es' || body?.locale === 'en') set.locale = body.locale
  if (body?.channels && typeof body.channels === 'object') {
    for (const ch of CHANNELS) {
      const v = body.channels[ch]
      if (typeof v === 'boolean') set[`notificationPrefs.channels.${ch}`] = v
    }
  }

  await connectToDatabase()
  const updated = await UserModel.findOneAndUpdate({ uid: user.uid }, { $set: set }, { new: true })
    .select('notificationPrefs locale')
    .lean()

  return { success: true, data: { notificationPrefs: updated?.notificationPrefs, locale: updated?.locale } }
})
