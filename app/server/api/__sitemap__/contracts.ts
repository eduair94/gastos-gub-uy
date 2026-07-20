import { ReleaseModel } from '../../../../shared/models/release'
import { connectToDatabase } from '../../utils/database'

/**
 * `releases` holds 2.17M+ records — nowhere near sitemap-worthy in full
 * (Google caps a single sitemap at 50k URLs, and a 2M-URL crawl budget ask
 * for a page type that's also reachable via every buyer/supplier/product
 * page's own contract list is wasteful). Only the most recent,
 * amount-bearing contracts are listed here; the long tail stays crawlable
 * via those internal links. See buyers.ts for why this is its own source.
 */
const RECENT_CONTRACTS_CAP = 15_000
const TTL_MS = 6 * 60 * 60 * 1000
let cache: { urls: unknown[], at: number } | null = null

export default defineSitemapEventHandler(async () => {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.urls

  await connectToDatabase()
  const contracts = await ReleaseModel.find({ 'amount.primaryAmount': { $gt: 0 } })
    .select('id date')
    .sort({ date: -1 })
    .limit(RECENT_CONTRACTS_CAP)
    .lean()
  const urls = contracts.map(r => ({
    loc: `/contracts/${encodeURIComponent(r.id)}`,
    lastmod: r.date,
    changefreq: 'monthly' as const,
    priority: 0.6,
  }))

  cache = { urls, at: Date.now() }
  return urls
})
