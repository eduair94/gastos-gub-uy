import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { isValidObjectId } from 'mongoose'
import { connectToDatabase } from '../../../../utils/database'
import { AnomalyModel, AnomalyFeedbackModel } from '../../../../utils/models'
import { requireWrite } from '../../../../utils/auth'
import { feedbackCounts } from '../../../../utils/anomaly-feedback'

// Cast or update a logged-in user's verdict on one anomaly flag:
//   vote =  1  → real anomaly (upvote)
//   vote = -1  → false positive (downvote)
// with an optional justification comment. One vote per (user, anomaly): the upsert
// on that pair makes re-voting idempotent (it updates in place).
export default defineEventHandler(async (event) => {
  const user = requireWrite(event)

  const anomalyId = getRouterParam(event, 'id')
  if (!anomalyId || !isValidObjectId(anomalyId)) {
    throw createError({ statusCode: 400, statusMessage: 'Id de anomalía inválido' })
  }

  const body = await readBody<{ vote?: number, comment?: string }>(event)
  const vote = Number(body?.vote)
  if (vote !== 1 && vote !== -1) {
    throw createError({ statusCode: 400, statusMessage: 'Voto inválido (debe ser 1 o -1)' })
  }

  await connectToDatabase()
  const anomaly = await AnomalyModel.findById(anomalyId)
    .select('type releaseId awardId metadata.supplierName')
    .lean()
  if (!anomaly) {
    throw createError({ statusCode: 404, statusMessage: 'Anomalía no encontrada' })
  }

  const set: Record<string, unknown> = { vote }
  const unset: Record<string, unknown> = {}
  if (typeof body?.comment === 'string') {
    const c = body.comment.trim().slice(0, 1000)
    if (c) set.comment = c
    else unset.comment = ''
  }

  const update: Record<string, unknown> = {
    $set: set,
    // Snapshot (once) the fields an offline analysis needs — so "which suppliers /
    // types draw the most false-positive votes" needs no join to `anomalies`.
    $setOnInsert: {
      userId: user.uid,
      anomalyId,
      anomalyType: (anomaly as { type?: string }).type,
      releaseId: (anomaly as { releaseId?: string }).releaseId,
      awardId: (anomaly as { awardId?: string }).awardId,
      supplierName: (anomaly as { metadata?: { supplierName?: string } }).metadata?.supplierName,
    },
  }
  if (Object.keys(unset).length) update.$unset = unset

  // Idempotent upsert on the unique (userId, anomalyId). Two concurrent FIRST votes
  // (two tabs / a retry) can both miss the doc and race the insert; the unique index
  // rejects one with E11000. Retry once — the doc now exists, so it updates in place.
  async function upsertVote() {
    return AnomalyFeedbackModel.findOneAndUpdate(
      { userId: user.uid, anomalyId },
      update,
      { upsert: true, new: true },
    ).lean()
  }
  let feedback
  try {
    feedback = await upsertVote()
  }
  catch (err) {
    if ((err as { code?: number }).code === 11000) {
      feedback = await upsertVote()
    }
    else {
      throw err
    }
  }

  const counts = await feedbackCounts(anomalyId)
  return { success: true, data: { feedback, counts } }
})
