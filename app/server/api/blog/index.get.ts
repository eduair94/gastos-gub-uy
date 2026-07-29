import { defineEventHandler, getQuery } from 'h3'
import { NewsletterIssueModel } from '../../../../shared/models/newsletter_issue'
import { connectToDatabase } from '../../utils/database'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const page = Math.max(1, Number.parseInt(String(query.page ?? '1'), 10) || 1)
  const limit = Math.min(24, Math.max(1, Number.parseInt(String(query.limit ?? '12'), 10) || 12))
  const skip = (page - 1) * limit

  await connectToDatabase()
  const filter = { status: 'published' }
  const [items, total] = await Promise.all([
    NewsletterIssueModel.find(filter)
      .select('weekKey slug title excerpt periodStart periodEnd publishedAt eligibleExpenseCount totalAmountUyu anomalySummary ai.model')
      .sort({ periodStart: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    NewsletterIssueModel.countDocuments(filter),
  ])

  return {
    success: true,
    data: {
      items,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    },
  }
})
