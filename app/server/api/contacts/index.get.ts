import { createError, defineEventHandler, getQuery } from 'h3'
import { connectToDatabase } from '../../utils/database'
import { buildContactFilter, contactSort, CONTACTS_MAX_TIME_MS, sanitizeContact } from '../../utils/contacts'
import { attachDei } from '../../utils/dei'
import { attachOnlyDirectAward } from '../../utils/only-direct-award'
import { attachRupe } from '../../utils/rupe'
import { SupplierContactModel } from '../../utils/models'

/**
 * Paginated read of the public provider contact directory (`supplier_contacts`).
 * Default scope = deliverable (valid email); see buildContactFilter. Rows are
 * ToS-sanitized and decorated with a DEI registry badge (page rows only).
 */
export default defineEventHandler(async (event) => {
  try {
    await connectToDatabase()

    const query = getQuery(event)
    const page = Math.max(1, Number(query.page ?? 1) || 1)
    const limit = Math.min(100, Math.max(1, Number(query.limit ?? 25) || 25))

    const built = await buildContactFilter(query)
    if ('empty' in built) {
      return { success: true, data: { contacts: [], pagination: { page, limit, total: 0, totalPages: 0 } } }
    }

    const skip = (page - 1) * limit
    const [rows, total] = await Promise.all([
      SupplierContactModel.find(built.filter)
        .sort(contactSort(query))
        .skip(skip)
        .limit(limit)
        .maxTimeMS(CONTACTS_MAX_TIME_MS)
        .lean(),
      SupplierContactModel.countDocuments(built.filter, { maxTimeMS: CONTACTS_MAX_TIME_MS }),
    ])

    // DEI badge keyed off the page rows only, then ToS-sanitize each.
    const withDei = await attachDei(rows, r => (r as { supplierId?: string }).supplierId ?? '')
    const withRupe = await attachRupe(withDei, r => (r as { supplierId?: string }).supplierId ?? '')
    const decorated = await attachOnlyDirectAward(withRupe, r => (r as { supplierId?: string }).supplierId ?? '')
    const contacts = decorated.map(r => sanitizeContact(r as never))

    return {
      success: true,
      data: {
        contacts,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      },
    }
  }
  catch (error) {
    console.error('Error fetching contacts:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch contacts' })
  }
})
