import { SpendingTrendModel } from '../../utils/models'
import { connectToDatabase } from '../../utils/database'

/**
 * One URL per annual review at /gastos/[year]. See buyers.ts for why this is
 * its own named source.
 *
 * Filtered on `bridge`, which is the same condition the page uses to decide
 * whether to noindex. 2002 is the first year of the series, so it has no
 * previous year to be compared against and no bridge — it stays reachable and
 * linked from 2003, but a sitemap must not advertise a URL the page itself
 * marks `noindex`. That leaves 24 of the 25 documents.
 */
export default defineSitemapEventHandler(async () => {
  await connectToDatabase()

  const years = await SpendingTrendModel
    .find({ bridge: { $ne: null } })
    .select('year partial calculatedAt')
    .sort({ year: -1 })
    .lean()

  return years.map((y: any) => ({
    loc: `/gastos/${y.year}`,
    lastmod: y.calculatedAt ?? undefined,
    // The running year keeps changing; a closed year does not.
    changefreq: (y.partial ? 'daily' : 'yearly') as 'daily' | 'yearly',
    priority: y.partial ? 0.7 : 0.6,
  }))
})
