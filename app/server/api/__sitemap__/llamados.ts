import { OpenCallModel } from '../../../../shared/models/open_call'
import { connectToDatabase } from '../../utils/database'

/** See buyers.ts for why this is a separate, named sitemap source. */
const TTL_MS = 6 * 60 * 60 * 1000
let cache: { urls: unknown[], at: number } | null = null

export default defineSitemapEventHandler(async () => {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.urls

  await connectToDatabase()
  const calls = await OpenCallModel.find({}).select('compraId updatedAt firstSeenAt').lean()
  const urls = calls.map(c => ({
    loc: `/llamados/${encodeURIComponent(c.compraId)}`,
    lastmod: c.updatedAt ?? c.firstSeenAt,
    changefreq: 'daily' as const,
    priority: 0.7,
  }))

  cache = { urls, at: Date.now() }
  return urls
})
