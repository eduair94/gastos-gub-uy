import { createError, defineEventHandler, getRouterParam } from 'h3'
import { isValidObjectId } from 'mongoose'
import { connectToDatabase } from '../../../utils/database'
import { ApiKeyModel } from '../../../../../shared/models/api_key'
import { assertSameOrigin, requireUser } from '../../../utils/auth'

// Revoke an API key owned by the caller (soft-delete via revokedAt). Cookie-authed.
export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const user = requireUser(event)
  const id = getRouterParam(event, 'id')
  if (!id || !isValidObjectId(id)) {
    throw createError({ statusCode: 404, statusMessage: 'API key no encontrada' })
  }

  await connectToDatabase()
  const revoked = await ApiKeyModel.findOneAndUpdate(
    { _id: id, userId: user.uid, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  )
  if (!revoked) {
    throw createError({ statusCode: 404, statusMessage: 'API key no encontrada' })
  }

  return { success: true }
})
