import { defineEventHandler, getQuery, readBody } from 'h3'
import { connectToDatabase } from '../../utils/database'
import { resolveUnsubscribe } from '../../../../src/jobs/campaign/unsubscribe-core'

// Non-user (campaign_sends) token opt-out. Public and cross-origin by design:
// the List-Unsubscribe one-click POST comes from the recipient's mail client,
// and the token is the only credential. Idempotent — marks the send
// "unsubscribed" and suppresses the email for future campaign sends.
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
  const result = await resolveUnsubscribe(token)
  return { success: !!result }
})
