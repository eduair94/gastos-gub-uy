import { createError, defineEventHandler, readBody } from 'h3'
import { connectToDatabase } from '../../utils/database'
import { SavedCallModel } from '../../../../shared/models/saved_call'
import { OpenCallModel } from '../../../../shared/models/open_call'
import { requireWrite } from '../../utils/auth'

// Save (bookmark) a call, optionally with a reminder N days before its deadline.
export default defineEventHandler(async (event) => {
  const user = requireWrite(event)
  const body = await readBody<{ compraId?: string, note?: string, reminderDaysBefore?: number }>(event)

  const compraId = String(body?.compraId ?? '').trim()
  if (!compraId) {
    throw createError({ statusCode: 400, statusMessage: 'Falta compraId' })
  }

  await connectToDatabase()
  const exists = await OpenCallModel.exists({ compraId })
  if (!exists) {
    throw createError({ statusCode: 404, statusMessage: 'Llamado no encontrado' })
  }

  const set: Record<string, unknown> = {}
  if (typeof body?.note === 'string') set.note = body.note.slice(0, 500)
  const days = Number(body?.reminderDaysBefore)
  if (Number.isFinite(days) && days > 0 && days <= 30) set.reminderDaysBefore = Math.trunc(days)

  const saved = await SavedCallModel.findOneAndUpdate(
    { userId: user.uid, compraId },
    { $set: set, $setOnInsert: { userId: user.uid, compraId } },
    { upsert: true, new: true },
  ).lean()

  return { success: true, data: saved }
})
