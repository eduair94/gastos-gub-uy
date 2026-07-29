import { NewsletterIssueModel } from '../../../../shared/models/newsletter_issue'
import { connectToDatabase } from '../../utils/database'

const TTL_MS = 6 * 60 * 60 * 1000
let cache: { urls: unknown[], at: number } | null = null

export default defineSitemapEventHandler(async () => {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.urls
  await connectToDatabase()
  const issues = await NewsletterIssueModel.find({ status: 'published' })
    .select('slug updatedAt')
    .sort({ periodStart: -1 })
    .lean()
  const urls = issues.map(issue => ({
    loc: `/blog/${issue.slug}`,
    lastmod: issue.updatedAt,
    changefreq: 'never' as const,
    priority: 0.7,
  }))
  cache = { urls, at: Date.now() }
  return urls
})
