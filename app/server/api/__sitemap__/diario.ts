import { DailyInvestigationModel } from '../../../../shared/models/daily_investigation'
import { NewsletterDailyIssueModel } from '../../../../shared/models/newsletter_daily_issue'
import { connectToDatabase } from '../../utils/database'

/**
 * Las notas diarias y las ediciones diarias del newsletter.
 *
 * TTL CORTO A PROPÓSITO. Los otros sitemaps cachean seis horas porque su contenido cambia por
 * lotes. Acá se publica una nota nueva todas las mañanas, y seis horas de caché serían seis
 * horas en las que el crawler no ve lo del día. Una hora alcanza y el costo es una consulta.
 *
 * SÓLO LO PUBLICADO. Una nota rechazada por el verificador sigue en la colección con sus
 * motivos y no puede entrar acá: meter en el sitemap una URL que contesta 404 es exactamente el
 * defecto que ya se arregló en las fichas.
 */
const TTL_MS = 60 * 60 * 1000
let cache: { urls: unknown[], at: number } | null = null

export default defineSitemapEventHandler(async () => {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.urls
  await connectToDatabase()

  const [notes, issues] = await Promise.all([
    DailyInvestigationModel.find({ status: 'published' })
      .select('slug updatedAt')
      .sort({ publishedAt: -1 })
      .lean(),
    NewsletterDailyIssueModel.find({ status: 'published' })
      .select('slug updatedAt')
      .sort({ publishedAt: -1 })
      .lean(),
  ])

  const urls = [
    ...notes.map(note => ({
      loc: `/investigaciones/diario/${note.slug}`,
      lastmod: note.updatedAt,
      changefreq: 'never' as const,
      priority: 0.6,
    })),
    ...issues.map(issue => ({
      loc: `/blog/${issue.slug}`,
      lastmod: issue.updatedAt,
      changefreq: 'never' as const,
      priority: 0.5,
    })),
  ]
  cache = { urls, at: Date.now() }
  return urls
})
