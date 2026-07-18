import type { H3Event } from 'h3'
import { AnomalyFeedbackModel } from './models'
import { getUser } from './auth'

// The public + personal feedback shape attached to an anomaly on the read path.
// Counts are public; myVote/myComment reflect the requesting user only (null when
// anonymous or not yet voted). Other users' comments are never exposed.
export interface FeedbackSummary {
  up: number
  down: number
  myVote: 1 | -1 | null
  myComment: string | null
}

const EMPTY = (): FeedbackSummary => ({ up: 0, down: 0, myVote: null, myComment: null })

/**
 * Build a feedback summary for many anomalies at once (one aggregate for the
 * counts, plus one lookup of the caller's own votes when authenticated). Anomaly
 * ids with no feedback still get a zeroed entry. Callers must have connected to
 * the DB already. Returns a Map keyed by anomaly id string.
 */
export async function feedbackSummaries(event: H3Event, anomalyIds: string[]): Promise<Map<string, FeedbackSummary>> {
  const out = new Map<string, FeedbackSummary>()
  const ids = [...new Set(anomalyIds.filter(Boolean).map(String))]
  if (!ids.length) return out
  for (const id of ids) out.set(id, EMPTY())

  // Best-effort: feedback is a secondary enhancement on a public read path (the
  // anomalies list/detail render fine without it). A failure of the feedback
  // collection must never 500 the whole response — return the zeroed summaries.
  try {
    const counts = await AnomalyFeedbackModel.aggregate<{ _id: { anomalyId: string, vote: number }, n: number }>([
      { $match: { anomalyId: { $in: ids } } },
      { $group: { _id: { anomalyId: '$anomalyId', vote: '$vote' }, n: { $sum: 1 } } },
    ])
    for (const c of counts) {
      const s = out.get(c._id.anomalyId)
      if (!s) continue
      if (c._id.vote === 1) s.up = c.n
      else if (c._id.vote === -1) s.down = c.n
    }

    const user = getUser(event)
    if (user) {
      const mine = await AnomalyFeedbackModel.find({ userId: user.uid, anomalyId: { $in: ids } })
        .select('anomalyId vote comment')
        .lean()
      for (const m of mine) {
        const s = out.get(String(m.anomalyId))
        if (!s) continue
        s.myVote = (m.vote === 1 || m.vote === -1) ? m.vote : null
        s.myComment = m.comment ?? null
      }
    }
  }
  catch (error) {
    console.error('anomaly feedback summary failed (returning zeroed counts):', error)
  }
  return out
}

/** Convenience wrapper for a single anomaly. */
export async function feedbackSummary(event: H3Event, anomalyId: string): Promise<FeedbackSummary> {
  const map = await feedbackSummaries(event, [anomalyId])
  return map.get(String(anomalyId)) ?? EMPTY()
}

/** Just the public up/down counts for one anomaly — used after a mutation. */
export async function feedbackCounts(anomalyId: string): Promise<{ up: number, down: number }> {
  const rows = await AnomalyFeedbackModel.aggregate<{ _id: number, n: number }>([
    { $match: { anomalyId: String(anomalyId) } },
    { $group: { _id: '$vote', n: { $sum: 1 } } },
  ])
  let up = 0
  let down = 0
  for (const r of rows) {
    if (r._id === 1) up = r.n
    else if (r._id === -1) down = r.n
  }
  return { up, down }
}
