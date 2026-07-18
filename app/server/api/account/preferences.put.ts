import { defineEventHandler, readBody } from 'h3'
import { connectToDatabase } from '../../utils/database'
import { UserModel } from '../../../../shared/models/user'
import { requireWrite } from '../../utils/auth'

// Update notification preferences (enabled / instant|daily) and UI locale.
export default defineEventHandler(async (event) => {
  const user = requireWrite(event)
  const body = await readBody<{ enabled?: boolean, frequency?: string, locale?: string }>(event)

  const set: Record<string, unknown> = {}
  if (typeof body?.enabled === 'boolean') set['notificationPrefs.enabled'] = body.enabled
  if (body?.frequency === 'instant' || body?.frequency === 'daily') set['notificationPrefs.frequency'] = body.frequency
  if (body?.locale === 'es' || body?.locale === 'en') set.locale = body.locale

  await connectToDatabase()
  const updated = await UserModel.findOneAndUpdate({ uid: user.uid }, { $set: set }, { new: true })
    .select('notificationPrefs locale')
    .lean()

  return { success: true, data: { notificationPrefs: updated?.notificationPrefs, locale: updated?.locale } }
})
