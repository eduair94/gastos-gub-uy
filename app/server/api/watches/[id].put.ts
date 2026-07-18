import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { connectToDatabase, mongoose } from '../../utils/database'
import { WatchModel } from '../../../../shared/models/watch'
import { assertSameOrigin, requireUser } from '../../utils/auth'
import { parseWatchPayload } from '../../utils/watch-input'

export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const user = requireUser(event)
  const id = getRouterParam(event, 'id')
  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    throw createError({ statusCode: 404, statusMessage: 'Alerta no encontrada' })
  }

  const body = await readBody<Record<string, unknown>>(event)
  const payload = parseWatchPayload(body)

  // Absent optional filters are $unset so an edit that clears them takes effect.
  const set: Record<string, unknown> = {
    name: payload.name,
    active: payload.active,
    categories: payload.categories,
    keywords: payload.keywords,
    keywordMode: payload.keywordMode,
    buyers: payload.buyers,
  }
  const unset: Record<string, ''> = {}
  if (payload.minValue !== undefined) set.minValue = payload.minValue
  else unset.minValue = ''
  if (payload.maxValue !== undefined) set.maxValue = payload.maxValue
  else unset.maxValue = ''
  if (payload.procurementMethods) set.procurementMethods = payload.procurementMethods
  else unset.procurementMethods = ''

  const update: Record<string, unknown> = { $set: set }
  if (Object.keys(unset).length) update.$unset = unset

  await connectToDatabase()
  const watch = await WatchModel.findOneAndUpdate({ _id: id, userId: user.uid }, update, { new: true }).lean()
  if (!watch) {
    throw createError({ statusCode: 404, statusMessage: 'Alerta no encontrada' })
  }
  return { success: true, data: watch }
})
