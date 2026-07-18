import { defineEventHandler } from 'h3'
import { connectToDatabase } from '../../utils/database'
import { WatchModel } from '../../../../shared/models/watch'
import { requireUser } from '../../utils/auth'

// List the current user's watches (rubro subscriptions), newest first.
export default defineEventHandler(async (event) => {
  const user = requireUser(event)
  await connectToDatabase()
  const watches = await WatchModel.find({ userId: user.uid }).sort({ createdAt: -1 }).lean()
  return { success: true, data: watches }
})
