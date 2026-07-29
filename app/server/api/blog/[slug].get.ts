import { createError, defineEventHandler, getRouterParam } from 'h3'
import { NewsletterIssueModel } from '../../../../shared/models/newsletter_issue'
import { connectToDatabase } from '../../utils/database'

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug') ?? ''
  if (!/^resumen-semanal-\d{4}-\d{2}-\d{2}$/.test(slug)) {
    throw createError({ statusCode: 404, statusMessage: 'Publicación no encontrada' })
  }

  await connectToDatabase()
  const issue = await NewsletterIssueModel.findOne({ slug, status: 'published' })
    .select('-deliveryEnqueuedAt')
    .lean()
  if (!issue) throw createError({ statusCode: 404, statusMessage: 'Publicación no encontrada' })
  return { success: true, data: issue }
})
