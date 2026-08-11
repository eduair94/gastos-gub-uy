import { createError, defineEventHandler, getRouterParam } from 'h3'
import { getTopic } from '../../../../../shared/spending-topics'
import { connectToDatabase } from '../../../utils/database'
import { TopicSpendingModel } from '../../../utils/models'

/**
 * A spending topic's rollup — the read side of src/jobs/refresh-topic-spending.ts.
 *
 * One `findOne` by index; nothing aggregates on the request path. The topic's own
 * definition (the term list, the rejected terms and the evidence for each) is served
 * alongside the numbers on purpose: the methodology is part of the answer, not a
 * footnote, and a reader has to be able to contest one term without arguing about
 * the total.
 *
 * `?key=` accepts the topic key (`genero-diversidad`) or its slug (`genero`).
 */
export default defineEventHandler(async (event) => {
  const key = getRouterParam(event, 'key') ?? ''
  const topic = getTopic(key)
  if (!topic) {
    throw createError({ statusCode: 404, statusMessage: `Unknown spending topic "${key}"` })
  }

  try {
    await connectToDatabase()

    const doc = await TopicSpendingModel
      .findOne({ topicKey: topic.key })
      .sort({ calculatedAt: -1 })
      .lean()

    if (!doc) {
      throw createError({
        statusCode: 404,
        statusMessage: `Topic "${topic.key}" not computed yet. Run: npm run refresh-topic-spending`,
      })
    }

    return {
      success: true,
      data: {
        stats: doc,
        topic: {
          key: topic.key,
          slug: topic.slug,
          labelEs: topic.labelEs,
          labelEn: topic.labelEn,
          dekEs: topic.dekEs,
          dekEn: topic.dekEn,
          terms: topic.terms.map(t => ({ term: t.term, strength: t.strength, note: t.note })),
          rejectedTerms: topic.rejectedTerms,
          categories: topic.categories,
          catalogCodes: topic.catalogCodes,
          sources: topic.sources,
        },
      },
    }
  }
  catch (error: any) {
    if (error?.statusCode) throw error
    console.error('Error reading topic spending:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to read topic spending' })
  }
})
