import { defineEventHandler } from 'h3'
import { connectToDatabase } from '../../../utils/database'
import { ApiKeyModel } from '../../../../../shared/models/api_key'
import { requireUser } from '../../../utils/auth'

// List the caller's active API keys. Never returns the secret or its hash — only
// the public prefix and metadata. Called from the authed web page (cookie auth).
export default defineEventHandler(async (event) => {
  const user = requireUser(event)
  await connectToDatabase()

  const keys = await ApiKeyModel.find({ userId: user.uid, revokedAt: null })
    .sort({ createdAt: -1 })
    .select('label prefix scopes lastUsedAt createdAt')
    .lean()

  return { success: true, data: keys }
})
