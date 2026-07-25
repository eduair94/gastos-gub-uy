import { parseCategories } from '../../../shared/utils/anomaly-categories'

export type RssLanguage = 'es' | 'en'

export interface AnomalyRssScope {
  filter: Record<string, unknown>
  lang: RssLanguage
  severity?: 'low' | 'medium' | 'high' | 'critical'
  ai?: 'unexplained' | 'explainable' | 'uncertain' | 'scored' | 'unscored'
  categories: string[]
  minZ?: number
  currency?: string
  supplier: string[]
  buyer: string[]
  rubroName: string[]
  product: string[]
  year?: number
}

export interface AnomalyRssRow {
  _id: unknown
  releaseId?: string
  severity?: string
  detectedValue?: number
  currency?: string
  expectedRange?: { min?: number, max?: number }
  firstDetectedAt?: Date | string
  sourceDate?: Date | string
  metadata?: {
    supplierName?: string
    buyerName?: string
    itemDescription?: string
    zScore?: number
    baselineN?: number
    itemUnit?: { name?: string }
    itemClassification?: {
      id?: string
      description?: string
      rubro?: string
      subrubro?: string
    }
  }
  aiVerdict?: {
    explainable?: string
    category?: string
  }
}

const SEVERITIES = new Set(['low', 'medium', 'high', 'critical'])
const AI_VALUES = new Set(['unexplained', 'explainable', 'uncertain', 'scored', 'unscored'])
const MAX_VALUES_PER_FACET = 5
const MAX_VALUE_LENGTH = 180

function scalar(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const clean = value.trim().slice(0, MAX_VALUE_LENGTH)
  return clean || undefined
}

function values(value: unknown): string[] {
  const input = Array.isArray(value) ? value : [value]
  const output: string[] = []
  for (const candidate of input) {
    const clean = scalar(candidate)
    if (clean && !output.includes(clean)) output.push(clean)
    if (output.length >= MAX_VALUES_PER_FACET) break
  }
  return output
}

function exactOrIn(input: string[]): string | { $in: string[] } | undefined {
  if (input.length === 1) return input[0]
  if (input.length > 1) return { $in: input }
  return undefined
}

/**
 * Parses only the public filters supported by the anomaly list. Keeping the RSS
 * contract on the same query names means a personalised feed URL can always
 * link back to the matching human-readable list.
 */
export function parseAnomalyRssScope(query: Record<string, unknown>): AnomalyRssScope {
  const filter: Record<string, unknown> = { firstDetectedAt: { $exists: true } }
  const lang: RssLanguage = query.lang === 'en' ? 'en' : 'es'

  const severityValue = scalar(query.severity)?.toLowerCase()
  const severity = severityValue && SEVERITIES.has(severityValue)
    ? severityValue as AnomalyRssScope['severity']
    : undefined
  if (severity) filter.severity = severity

  const aiValue = scalar(query.ai)?.toLowerCase()
  const ai = aiValue && AI_VALUES.has(aiValue)
    ? aiValue as AnomalyRssScope['ai']
    : undefined
  const aiMap: Record<string, string> = {
    unexplained: 'no',
    explainable: 'yes',
    uncertain: 'uncertain',
  }
  if (ai === 'scored') filter['aiVerdict.explainable'] = { $exists: true }
  else if (ai === 'unscored') filter['aiVerdict.explainable'] = { $exists: false }
  else if (ai) filter['aiVerdict.explainable'] = aiMap[ai]

  const categories = parseCategories(query.category)
  if (categories.length === 1) filter['aiVerdict.category'] = categories[0]
  else if (categories.length > 1) filter['aiVerdict.category'] = { $in: categories }

  const minZValue = Number(query.minZ)
  const minZ = Number.isFinite(minZValue) && minZValue > 0
    ? Math.min(minZValue, 10_000)
    : undefined
  if (minZ) filter['metadata.zScore'] = { $gte: minZ }

  const currencyValue = scalar(query.currency)?.toUpperCase()
  const currency = currencyValue && /^[A-Z]{3}$/.test(currencyValue) ? currencyValue : undefined
  if (currency) filter.currency = currency

  const supplier = values(query.supplier)
  const buyer = values(query.buyer)
  const rubroName = values(query.rubroName)
  const product = values(query.product)
  const supplierFilter = exactOrIn(supplier)
  const buyerFilter = exactOrIn(buyer)
  const rubroFilter = exactOrIn(rubroName)
  const productFilter = exactOrIn(product)
  if (supplierFilter) filter['metadata.supplierName'] = supplierFilter
  if (buyerFilter) filter['metadata.buyerName'] = buyerFilter
  if (rubroFilter) filter['metadata.itemClassification.rubro'] = rubroFilter
  if (productFilter) filter['metadata.itemClassification.id'] = productFilter

  const yearValue = Number(query.year)
  const year = Number.isInteger(yearValue) && yearValue > 1900 && yearValue < 2200
    ? yearValue
    : undefined
  if (year) filter.sourceYear = year

  return {
    filter,
    lang,
    severity,
    ai,
    categories,
    minZ,
    currency,
    supplier,
    buyer,
    rubroName,
    product,
    year,
  }
}

export function escapeXml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function compactText(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function money(value: unknown, currency: string, lang: RssLanguage): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return lang === 'es' ? 'sin dato' : 'not reported'
  try {
    return new Intl.NumberFormat(lang === 'es' ? 'es-UY' : 'en', {
      style: 'currency',
      currency,
      maximumFractionDigits: value >= 100 ? 0 : 2,
    }).format(value)
  }
  catch {
    return `${currency} ${value}`
  }
}

function severityLabel(severity: string | undefined, lang: RssLanguage): string {
  const labels: Record<RssLanguage, Record<string, string>> = {
    es: { critical: 'CRÍTICA', high: 'ALTA', medium: 'MEDIA', low: 'BAJA' },
    en: { critical: 'CRITICAL', high: 'HIGH', medium: 'MEDIUM', low: 'LOW' },
  }
  return labels[lang][severity ?? ''] ?? (lang === 'es' ? 'ALERTA' : 'FLAG')
}

function aiLabel(value: string | undefined, lang: RssLanguage): string | undefined {
  const labels: Record<RssLanguage, Record<string, string>> = {
    es: { no: 'sin explicación', yes: 'con explicación posible', uncertain: 'requiere revisión' },
    en: { no: 'unexplained', yes: 'possibly explained', uncertain: 'needs review' },
  }
  return value ? labels[lang][value] : undefined
}

function itemName(row: AnomalyRssRow, lang: RssLanguage): string {
  return compactText(row.metadata?.itemClassification?.description)
    || compactText(row.metadata?.itemDescription)
    || (lang === 'es' ? 'Compra señalada' : 'Flagged purchase')
}

function scopeSuffix(scope: AnomalyRssScope): string {
  const parts: string[] = []
  if (scope.rubroName.length) parts.push(scope.rubroName.length === 1 ? scope.rubroName[0]! : `${scope.rubroName[0]} +${scope.rubroName.length - 1}`)
  if (scope.severity) parts.push(severityLabel(scope.severity, scope.lang))
  if (scope.ai) {
    const labels: Record<RssLanguage, Record<string, string>> = {
      es: { unexplained: 'sin explicación', explainable: 'con explicación', uncertain: 'a revisar', scored: 'revisadas por IA', unscored: 'sin revisar' },
      en: { unexplained: 'unexplained', explainable: 'explained', uncertain: 'to review', scored: 'AI-reviewed', unscored: 'not reviewed' },
    }
    parts.push(labels[scope.lang][scope.ai])
  }
  if (scope.categories.length) parts.push(scope.categories.join(', '))
  if (scope.minZ) parts.push(`≥ ×${scope.minZ}`)
  return parts.length ? ` — ${parts.join(' · ')}` : ''
}

export function scopeQuery(scope: AnomalyRssScope): URLSearchParams {
  const query = new URLSearchParams()
  if (scope.severity) query.set('severity', scope.severity)
  if (scope.ai) query.set('ai', scope.ai)
  for (const category of scope.categories) query.append('category', category)
  if (scope.minZ) query.set('minZ', String(scope.minZ))
  if (scope.currency) query.set('currency', scope.currency)
  for (const value of scope.supplier) query.append('supplier', value)
  for (const value of scope.buyer) query.append('buyer', value)
  for (const value of scope.rubroName) query.append('rubroName', value)
  for (const value of scope.product) query.append('product', value)
  if (scope.year) query.set('year', String(scope.year))
  return query
}

export function buildAnomalyRssXml(input: {
  rows: AnomalyRssRow[]
  scope: AnomalyRssScope
  siteUrl: string
  selfUrl: string
}): string {
  const { rows, scope, selfUrl } = input
  const siteUrl = input.siteUrl.replace(/\/+$/, '')
  const lang = scope.lang
  const title = `${lang === 'es' ? 'Alertas de precio' : 'Price flags'}${scopeSuffix(scope)}`
  const description = lang === 'es'
    ? 'Anomalías de precio en las compras públicas del Uruguay, ordenadas por la fecha más reciente de la compra. Una alerta es una señal estadística, no una acusación.'
    : 'Price anomalies in Uruguay’s public procurement, ordered by the newest procurement date. A flag is a statistical signal, not an accusation.'

  const listQuery = scopeQuery(scope)
  listQuery.set('sort', 'recent')
  const listPath = lang === 'en' ? '/en/analytics/anomalies' : '/analytics/anomalies'
  const listUrl = `${siteUrl}${listPath}?${listQuery.toString()}`
  const newest = rows.find(row => row.sourceDate)?.sourceDate
    ?? rows.find(row => row.firstDetectedAt)?.firstDetectedAt
  const buildDate = newest ? new Date(newest) : new Date()
  const validBuildDate = Number.isNaN(buildDate.getTime()) ? new Date() : buildDate

  const items = rows.map((row) => {
    const currency = /^[A-Z]{3}$/.test(row.currency ?? '') ? row.currency! : 'UYU'
    const paid = money(row.detectedValue, currency, lang)
    const range = row.expectedRange
    const expected = typeof range?.min === 'number' && typeof range?.max === 'number'
      ? `${money(range.min, currency, lang)}–${money(range.max, currency, lang)}`
      : (lang === 'es' ? 'sin rango informado' : 'no reported range')
    const details = [
      lang === 'es' ? `Se pagó ${paid}; rango habitual ${expected}.` : `Paid ${paid}; usual range ${expected}.`,
      typeof row.metadata?.zScore === 'number'
        ? (lang === 'es' ? `Divergencia: ×${row.metadata.zScore.toFixed(1)}.` : `Divergence: ×${row.metadata.zScore.toFixed(1)}.`)
        : '',
      row.metadata?.buyerName
        ? `${lang === 'es' ? 'Organismo' : 'Buyer'}: ${compactText(row.metadata.buyerName)}.`
        : '',
      row.metadata?.supplierName
        ? `${lang === 'es' ? 'Proveedor' : 'Supplier'}: ${compactText(row.metadata.supplierName)}.`
        : '',
      aiLabel(row.aiVerdict?.explainable, lang)
        ? `${lang === 'es' ? 'Revisión IA' : 'AI review'}: ${aiLabel(row.aiVerdict?.explainable, lang)}.`
        : '',
    ].filter(Boolean).join(' ')

    const releaseId = compactText(row.releaseId)
    const link = releaseId
      ? `${siteUrl}${lang === 'en' ? '/en' : ''}/contracts/${encodeURIComponent(releaseId)}`
      : listUrl
    const itemDateValue = row.sourceDate ?? row.firstDetectedAt
    const itemDate = itemDateValue ? new Date(itemDateValue) : validBuildDate
    const pubDate = Number.isNaN(itemDate.getTime()) ? validBuildDate : itemDate
    const categories = [
      row.severity,
      row.metadata?.itemClassification?.rubro,
      row.metadata?.itemClassification?.subrubro,
      row.aiVerdict?.category,
    ].filter((value): value is string => Boolean(value))

    return [
      '    <item>',
      `      <title>${escapeXml(`[${severityLabel(row.severity, lang)}] ${itemName(row, lang)}`)}</title>`,
      `      <link>${escapeXml(link)}</link>`,
      `      <guid isPermaLink="false">${escapeXml(`urn:conlatuya:anomaly:${String(row._id)}`)}</guid>`,
      `      <pubDate>${pubDate.toUTCString()}</pubDate>`,
      `      <description>${escapeXml(details)}</description>`,
      ...categories.map(category => `      <category>${escapeXml(category)}</category>`),
      '    </item>',
    ].join('\n')
  }).join('\n')

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    '  <channel>',
    `    <title>${escapeXml(title)}</title>`,
    `    <link>${escapeXml(listUrl)}</link>`,
    `    <atom:link href="${escapeXml(selfUrl)}" rel="self" type="application/rss+xml"/>`,
    `    <description>${escapeXml(description)}</description>`,
    `    <language>${lang === 'es' ? 'es-UY' : 'en'}</language>`,
    `    <lastBuildDate>${validBuildDate.toUTCString()}</lastBuildDate>`,
    '    <ttl>15</ttl>',
    '    <generator>Con la tuya, contribuyente</generator>',
    items,
    '  </channel>',
    '</rss>',
    '',
  ].join('\n')
}
