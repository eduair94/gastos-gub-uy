import { defineEventHandler, getQuery } from 'h3'
import { connectToDatabase } from '../../utils/database'
import { ProcurementContactModel } from '../../../../shared/models/procurement_contacts'

// Public directory of contracting-unit purchasing contacts, from the
// precomputed procurement_contacts rollup (refresh-contacts job). Public data
// republished from comprasestatales.gub.uy.
export default defineEventHandler(async (event) => {
  const q = getQuery(event)
  const page = Math.max(1, Number(q.page ?? 1) || 1)
  const limit = Math.min(50, Math.max(1, Number(q.limit ?? 25) || 25))
  const search = typeof q.q === 'string' ? q.q.trim() : ''

  await connectToDatabase()

  const filter: Record<string, unknown> = {}
  if (search) {
    // $text over searchText (organism + name + email), default_language none.
    filter.$text = { $search: search }
  }

  const skip = (page - 1) * limit
  const [contacts, total] = await Promise.all([
    ProcurementContactModel.find(filter)
      .sort({ llamadosCount: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    ProcurementContactModel.countDocuments(filter),
  ])

  return {
    success: true,
    data: {
      contacts,
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    },
  }
})
