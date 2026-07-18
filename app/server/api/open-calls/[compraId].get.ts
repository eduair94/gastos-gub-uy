import { createError, defineEventHandler, getRouterParam } from 'h3'
import { connectToDatabase } from '../../utils/database'
import { OpenCallModel } from '../../../../shared/models/open_call'
import { SavedCallModel } from '../../../../shared/models/saved_call'
import { sourceUrl } from '../../utils/query'
import { getUser } from '../../utils/auth'

// Public detail for one open call. Adds the official source link (derived from
// ocid, never id) and, for a signed-in user, whether they saved it.
export default defineEventHandler(async (event) => {
  const compraId = getRouterParam(event, 'compraId')
  if (!compraId) {
    throw createError({ statusCode: 400, statusMessage: 'Falta compraId' })
  }
  await connectToDatabase()
  const call = await OpenCallModel.findOne({ compraId }).lean()
  if (!call) {
    throw createError({ statusCode: 404, statusMessage: 'Llamado no encontrado' })
  }

  const user = getUser(event)
  const savedByMe = user ? Boolean(await SavedCallModel.exists({ userId: user.uid, compraId })) : false

  return { success: true, data: { ...call, sourceUrl: sourceUrl(call.ocid), savedByMe } }
})
