import { defineEventHandler, getQuery, readBody } from 'h3'
import { connectToDatabase } from '../utils/database'
import { UserModel } from '../../../shared/models/user'

// Token-scoped opt-out. Public and cross-origin by design: the List-Unsubscribe
// one-click POST comes from the recipient's mail client, and the token is the
// only credential. Idempotent — sets notificationPrefs.enabled = false.
export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  let token = typeof query.token === 'string' ? query.token : ''
  if (!token) {
    const body = await readBody<{ token?: string }>(event).catch(() => null)
    token = body?.token ?? ''
  }
  if (!token) {
    return { success: false, message: 'Falta token' }
  }
  await connectToDatabase()
  const res = await UserModel.updateOne({ unsubscribeToken: token }, { $set: { 'notificationPrefs.enabled': false } })
  return { success: res.matchedCount > 0 }
})
