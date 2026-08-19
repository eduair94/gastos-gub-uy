import { defineEventHandler, getQuery } from 'h3'
import { NewsletterDailyIssueModel } from '../../../../shared/models/newsletter_daily_issue'
import { NewsletterIssueModel } from '../../../../shared/models/newsletter_issue'
import { connectToDatabase } from '../../utils/database'

/**
 * El archivo del newsletter: semanal y diario, en una sola lista por fecha.
 *
 * SE PAGINA EN MEMORIA Y ESTÁ BIEN ASÍ. Son dos colecciones y el orden es por `periodStart`,
 * que ninguna base puede ordenar entre colecciones sin un `$unionWith`. El volumen lo permite:
 * el semanal suma 52 documentos por año y el diario 365, así que el archivo entero cabe en una
 * consulta liviana durante años. Cuando deje de caber, la salida es un `$unionWith`, no un
 * segundo endpoint.
 *
 * `?kind=weekly` o `?kind=daily` filtra una sola cadencia, para las pestañas de /blog.
 */
export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const page = Math.max(1, Number.parseInt(String(query.page ?? '1'), 10) || 1)
  const limit = Math.min(24, Math.max(1, Number.parseInt(String(query.limit ?? '12'), 10) || 12))
  const kind = query.kind === 'weekly' || query.kind === 'daily' ? query.kind : null

  await connectToDatabase()

  const [weekly, daily] = await Promise.all([
    kind === 'daily'
      ? Promise.resolve([])
      : NewsletterIssueModel.find({ status: 'published' })
          .select('weekKey slug title excerpt periodStart periodEnd publishedAt eligibleExpenseCount totalAmountUyu anomalySummary ai.model')
          .sort({ periodStart: -1 })
          .lean(),
    kind === 'weekly'
      ? Promise.resolve([])
      : NewsletterDailyIssueModel.find({ status: 'published' })
          .select('dayKey slug title excerpt periodStart periodEnd publishedAt eligibleExpenseCount totalAmountUyu notes newAnomalies')
          .sort({ periodStart: -1 })
          .lean(),
  ])

  const merged = [
    ...weekly.map(i => ({ ...i, kind: 'weekly' as const })),
    ...daily.map(i => ({ ...i, kind: 'daily' as const, noteCount: (i.notes ?? []).length })),
  ].sort((a, b) => new Date(b.periodStart).getTime() - new Date(a.periodStart).getTime())

  const total = merged.length
  const items = merged.slice((page - 1) * limit, page * limit)

  return {
    success: true,
    data: {
      items,
      pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
    },
  }
})
