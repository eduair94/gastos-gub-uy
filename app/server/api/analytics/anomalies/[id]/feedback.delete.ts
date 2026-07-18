import { createError, defineEventHandler, getRouterParam } from 'h3'
import { isValidObjectId } from 'mongoose'
import { connectToDatabase } from '../../../../utils/database'
import { AnomalyFeedbackModel } from '../../../../utils/models'
import { requireWrite } from '../../../../utils/auth'
import { feedbackCounts } from '../../../../utils/anomaly-feedback'

// Retract a user's vote on one anomaly flag. Idempotent — deleting a vote that
// isn't there is a no-op and still returns the current counts.
export default defineEventHandler(async (event) => {
  const user = requireWrite(event)

  const anomalyId = getRouterParam(event, 'id')
  if (!anomalyId || !isValidObjectId(anomalyId)) {
    throw createError({ statusCode: 400, statusMessage: 'Id de anomalía inválido' })
  }

  await connectToDatabase()
  await AnomalyFeedbackModel.deleteOne({ userId: user.uid, anomalyId })

  const counts = await feedbackCounts(anomalyId)
  return { success: true, data: { counts } }
})
