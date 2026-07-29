import { createError, defineEventHandler, getQuery, readBody } from 'h3'
import { connectToDatabase } from '../../utils/database'
import { UserModel } from '../../../../shared/models/user'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ token?: string }>(event).catch(() => ({}))
  const query = getQuery(event)
  const token = typeof body?.token === 'string'
    ? body.token
    : typeof query.token === 'string'
      ? query.token
      : ''
  if (!token) throw createError({ statusCode: 400, statusMessage: 'Falta token' })

  await connectToDatabase()
  const result = await UserModel.updateOne(
    { unsubscribeToken: token },
    {
      $set: {
        'newsletter.subscribed': false,
        'newsletter.unsubscribedAt': new Date(),
        'newsletter.source': 'account',
      },
    },
  )
  return { success: true, data: { unsubscribed: result.matchedCount > 0 } }
})
