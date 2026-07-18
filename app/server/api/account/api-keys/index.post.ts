import { createError, defineEventHandler, readBody } from 'h3'
import { connectToDatabase } from '../../../utils/database'
import { API_KEY_CAP, ApiKeyModel } from '../../../../../shared/models/api_key'
import type { ApiKeyScope } from '../../../../../shared/types/monitor'
import { assertSameOrigin, requireUser } from '../../../utils/auth'
import { generateApiKey } from '../../../utils/api-key'

// Create an API key. Returns the full secret token EXACTLY ONCE — it is never
// retrievable again (only its sha256 hash is stored). Cookie-authed (web page).
export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const user = requireUser(event)
  const body = await readBody<{ label?: unknown, scopes?: unknown }>(event)

  const label = typeof body?.label === 'string' ? body.label.trim() : ''
  if (!label || label.length > 60) {
    throw createError({ statusCode: 400, statusMessage: 'Etiqueta requerida (1–60 caracteres)' })
  }

  const requested = Array.isArray(body?.scopes) ? body.scopes : ['read']
  const scopes = (['read', 'write'] as ApiKeyScope[]).filter(s => requested.includes(s))
  if (scopes.length === 0) scopes.push('read')

  await connectToDatabase()

  const count = await ApiKeyModel.countDocuments({ userId: user.uid, revokedAt: null })
  if (count >= API_KEY_CAP) {
    throw createError({ statusCode: 409, statusMessage: `Alcanzaste el máximo de ${API_KEY_CAP} API keys. Revocá una para crear otra.` })
  }

  const { token, prefix, hash } = generateApiKey()
  const key = await ApiKeyModel.create({ userId: user.uid, label, prefix, hash, scopes })

  return {
    success: true,
    data: { id: String(key._id), label: key.label, prefix: key.prefix, scopes: key.scopes, token },
  }
})
