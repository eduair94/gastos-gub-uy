import { ProductAnalyticsModel } from '../../utils/models'
import { connectToDatabase } from '../../utils/database'

/** See buyers.ts for why this is a separate, named sitemap source. */
const TTL_MS = 6 * 60 * 60 * 1000
let cache: { urls: unknown[], at: number } | null = null

export default defineSitemapEventHandler(async () => {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.urls

  await connectToDatabase()
  const products = await ProductAnalyticsModel.find({}).select('code updatedAt').lean()
  const urls = products.map(p => ({
    loc: `/products/${encodeURIComponent(p.code)}`,
    lastmod: p.updatedAt,
    changefreq: 'weekly' as const,
    priority: 0.5,
  }))

  cache = { urls, at: Date.now() }
  return urls
})
