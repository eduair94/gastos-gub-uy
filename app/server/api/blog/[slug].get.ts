import { createError, defineEventHandler, getRouterParam } from 'h3'
import { NewsletterDailyIssueModel } from '../../../../shared/models/newsletter_daily_issue'
import { NewsletterIssueModel } from '../../../../shared/models/newsletter_issue'
import { connectToDatabase } from '../../utils/database'

/**
 * Una edición del newsletter, semanal o diaria.
 *
 * SON DOS COLECCIONES Y UN SOLO ARCHIVO PÚBLICO. La semanal resume el período; la diaria lleva
 * la nota del día. Sus documentos tienen forma distinta y por eso viven separados, pero el
 * lector no tiene por qué enterarse: las dos se leen en /blog.
 *
 * EL SLUG DECIDE LA COLECCIÓN, y sigue validándose con una expresión estricta. Sin esa
 * validación cualquier cadena golpea la base, y un slug inexistente tiene que contestar 404 y
 * nunca 200 con cuerpo vacío.
 */
export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug') ?? ''

  await connectToDatabase()

  if (/^resumen-semanal-\d{4}-\d{2}-\d{2}$/.test(slug)) {
    const issue = await NewsletterIssueModel.findOne({ slug, status: 'published' })
      .select('-deliveryEnqueuedAt')
      .lean()
    if (!issue) throw createError({ statusCode: 404, statusMessage: 'Publicación no encontrada' })
    return { success: true, data: { ...issue, kind: 'weekly' as const } }
  }

  if (/^diario-\d{4}-\d{2}-\d{2}$/.test(slug)) {
    const issue = await NewsletterDailyIssueModel.findOne({ slug, status: 'published' })
      .select('-deliveryEnqueuedAt')
      .lean()
    if (!issue) throw createError({ statusCode: 404, statusMessage: 'Publicación no encontrada' })
    return { success: true, data: { ...issue, kind: 'daily' as const } }
  }

  throw createError({ statusCode: 404, statusMessage: 'Publicación no encontrada' })
})
