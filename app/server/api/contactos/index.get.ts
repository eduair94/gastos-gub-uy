import { defineEventHandler, getQuery } from 'h3'
import { connectToDatabase } from '../../utils/database'
import { ProcurementContactModel } from '../../../../shared/models/procurement_contacts'
import {
  buildProcurementFilter,
  procurementSort,
  serializeProcurementContact,
  organismGroupOptions,
  PROC_CONTACTS_MAX_TIME_MS,
} from '../../utils/procurement-contacts'

// Public directory of contracting-unit purchasing contacts, from the precomputed
// procurement_contacts rollup (refresh-contacts job). Public data republished
// from comprasestatales.gub.uy. Filters: full-text search, organism group,
// deliverability (has email/phone), min llamados; sort by activity or name.
export default defineEventHandler(async (event) => {
  const q = getQuery(event)
  const page = Math.max(1, Number(q.page ?? 1) || 1)
  const limit = Math.min(50, Math.max(1, Number(q.limit ?? 25) || 25))

  await connectToDatabase()

  const filter = buildProcurementFilter(q)
  const skip = (page - 1) * limit
  const [docs, total] = await Promise.all([
    ProcurementContactModel.find(filter)
      .sort(procurementSort(q))
      .skip(skip)
      .limit(limit)
      .maxTimeMS(PROC_CONTACTS_MAX_TIME_MS)
      .lean(),
    ProcurementContactModel.countDocuments(filter, { maxTimeMS: PROC_CONTACTS_MAX_TIME_MS }),
  ])

  return {
    success: true,
    data: {
      contacts: docs.map(d => serializeProcurementContact(d as never)),
      groups: organismGroupOptions(),
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    },
  }
})
