import { defineEventHandler, getQuery, getRequestURL, setHeader } from 'h3'
import { connectToDatabase } from '../../utils/database'
import { AnomalyModel } from '../../utils/models'
import { buildAnomalyRssXml, parseAnomalyRssScope } from '../../utils/anomaly-rss'

const PROJECTION = [
  'releaseId',
  'severity',
  'detectedValue',
  'currency',
  'expectedRange',
  'firstDetectedAt',
  'metadata.supplierName',
  'metadata.buyerName',
  'metadata.itemDescription',
  'metadata.zScore',
  'metadata.baselineN',
  'metadata.itemUnit.name',
  'metadata.itemClassification.id',
  'metadata.itemClassification.description',
  'metadata.itemClassification.rubro',
  'metadata.itemClassification.subrubro',
  'aiVerdict.explainable',
  'aiVerdict.category',
].join(' ')

export default defineEventHandler(async (event) => {
  const scope = parseAnomalyRssScope(getQuery(event))
  await connectToDatabase()

  const rows = await AnomalyModel.find(scope.filter)
    .select(PROJECTION)
    .sort({ firstDetectedAt: -1, _id: -1 })
    .limit(50)
    .lean()

  const siteUrl = (useRuntimeConfig().public.siteUrl as string).replace(/\/+$/, '')
  const requestUrl = getRequestURL(event)
  const selfUrl = new URL('/rss/anomalies.xml', siteUrl)
  selfUrl.search = requestUrl.search

  setHeader(event, 'content-type', 'application/rss+xml; charset=utf-8')
  setHeader(event, 'cache-control', 'public, max-age=300, s-maxage=900, stale-while-revalidate=3600')
  setHeader(event, 'access-control-allow-origin', '*')
  setHeader(event, 'x-content-type-options', 'nosniff')

  return buildAnomalyRssXml({
    rows,
    scope,
    siteUrl,
    selfUrl: selfUrl.toString(),
  })
})
