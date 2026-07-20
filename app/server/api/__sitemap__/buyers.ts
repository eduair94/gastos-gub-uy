import { BuyerPatternModel } from '../../utils/models'
import { connectToDatabase } from '../../utils/database'

/**
 * One of several small, named sitemap sources (see nuxt.config `sitemap.sitemaps`)
 * instead of one combined list: @nuxtjs/sitemap only auto-chunks each NAMED
 * sitemap past `defaultSitemapsChunkSize` — a single giant `sources` array
 * (tried first) rendered as one ~45MB, 40s-to-generate file with every entity
 * type mixed together, nowhere near Google's 50k-URLs-per-file limit either.
 * Splitting by entity keeps each source small, fast and independently cached.
 */
const TTL_MS = 6 * 60 * 60 * 1000
let cache: { urls: unknown[], at: number } | null = null

export default defineSitemapEventHandler(async () => {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.urls

  await connectToDatabase()
  const buyers = await BuyerPatternModel.find({}).select('buyerId lastUpdated').lean()
  const urls = buyers.map(b => ({
    loc: `/buyers/${encodeURIComponent(b.buyerId)}`,
    lastmod: b.lastUpdated,
    changefreq: 'weekly' as const,
    priority: 0.7,
  }))

  cache = { urls, at: Date.now() }
  return urls
})
