import type { FilterQuery } from 'mongoose'
import { createError, defineEventHandler, getQuery, getRouterParam } from 'h3'
import type { ITopicContract } from '../../../../../../shared/models'
import { getTopic } from '../../../../../../shared/spending-topics'
import { connectToDatabase } from '../../../../utils/database'
import { TopicContractModel } from '../../../../utils/models'

/**
 * The contract listing behind a spending topic.
 *
 * Reads `topic_contracts`, which the weekly job already classified — so this is an
 * indexed find + sort, never a scan of `releases`. Every filter maps to a prefix of
 * one of the `topicKey + inTopic + …` compounds built by scripts/ensure-indexes.ts.
 *
 * `?rejected=1` serves the DISCARDED candidates instead. That view is deliberately
 * reachable: a topic recovered from free text is only auditable if the reader can
 * see what it threw away and the reason the model gave.
 */
const SORTS = {
  amount: { amount: -1 as const },
  recent: { firstSeenAt: -1 as const },
  year: { sourceYear: -1 as const },
} satisfies Record<string, Record<string, -1 | 1>>

const MAX_LIMIT = 100

export default defineEventHandler(async (event) => {
  const key = getRouterParam(event, 'key') ?? ''
  const topic = getTopic(key)
  if (!topic) {
    throw createError({ statusCode: 404, statusMessage: `Unknown spending topic "${key}"` })
  }

  const q = getQuery(event)
  const page = Math.max(1, Number(q.page) || 1)
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(q.limit) || 25))
  const sortKey = (String(q.sort || 'amount') in SORTS ? String(q.sort) : 'amount') as keyof typeof SORTS
  const rejected = q.rejected === '1' || q.rejected === 'true'

  const filter: FilterQuery<ITopicContract> = {
    topicKey: topic.key,
    inTopic: !rejected,
  }
  if (q.year) filter.sourceYear = Number(q.year)
  if (q.buyerId) filter.buyerId = String(q.buyerId)
  if (q.category) filter.category = String(q.category)
  if (q.party) filter.party = String(q.party)
  if (q.supplierId) filter['suppliers.id'] = String(q.supplierId)
  if (q.hasAmount === '1') filter.hasAmount = true

  try {
    await connectToDatabase()

    const [items, total] = await Promise.all([
      TopicContractModel
        .find(filter, {
          'ocid': 1,
          'releaseId': 1,
          'compraId': 1,
          'title': 1,
          'description': 1,
          'buyerId': 1,
          'buyerName': 1,
          'suppliers': 1,
          'sourceYear': 1,
          'date': 1,
          'amount': 1,
          'hasAmount': 1,
          'category': 1,
          'procurementMethod': 1,
          'party': 1,
          'partyLabel': 1,
          'mandateHolder': 1,
          'isTransition': 1,
          'hits': 1,
          'firstSeenAt': 1,
          'ai.reason': 1,
          'ai.confidence': 1,
        })
        .sort(SORTS[sortKey])
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      TopicContractModel.countDocuments(filter),
    ])

    return {
      success: true,
      data: {
        items,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      },
    }
  }
  catch (error: any) {
    if (error?.statusCode) throw error
    console.error('Error listing topic contracts:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to list topic contracts' })
  }
})
