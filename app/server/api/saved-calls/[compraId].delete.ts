import { createError, defineEventHandler, getRouterParam } from 'h3'
import { connectToDatabase } from '../../utils/database'
import { SavedCallModel } from '../../../../shared/models/saved_call'
import { assertSameOrigin, requireUser } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const user = requireUser(event)
  const compraId = getRouterParam(event, 'compraId')
  if (!compraId) {
    throw createError({ statusCode: 400, statusMessage: 'Falta compraId' })
  }
  await connectToDatabase()
  await SavedCallModel.deleteOne({ userId: user.uid, compraId })
  return { success: true }
})
