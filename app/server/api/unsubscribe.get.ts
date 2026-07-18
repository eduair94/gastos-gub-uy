import { defineEventHandler, getQuery } from 'h3'
import { connectToDatabase } from '../utils/database'
import { UserModel } from '../../../shared/models/user'

// GET variant of the token opt-out (some mail clients follow the link with GET).
export default defineEventHandler(async (event) => {
  const token = typeof getQuery(event).token === 'string' ? (getQuery(event).token as string) : ''
  if (!token) {
    return { success: false, message: 'Falta token' }
  }
  await connectToDatabase()
  const res = await UserModel.updateOne({ unsubscribeToken: token }, { $set: { 'notificationPrefs.enabled': false } })
  return { success: res.matchedCount > 0 }
})
