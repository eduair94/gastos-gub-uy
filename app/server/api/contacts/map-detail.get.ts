import { createError, defineEventHandler, getQuery, setHeader } from 'h3'
import { SupplierContactModel } from '../../../../shared/models/supplier_contacts'
import { connectToDatabase } from '../../utils/database'
import { sanitizeContact } from '../../utils/contacts'

const CONTACT_PROJECTION = {
  _id: 0,
  supplierId: 1,
  rut: 1,
  name: 1,
  primaryEmail: 1,
  emails: 1,
  website: 1,
  websiteSource: 1,
  phone: 1,
  phoneSource: 1,
  phones: 1,
  websitePhone: 1,
  websiteAddress: 1,
  contactFormUrl: 1,
  socialLinks: 1,
  locality: 1,
  address: 1,
  placeSource: 1,
  mapsUrl: 1,
  hours: 1,
  lat: 1,
  lng: 1,
  rubros: 1,
  neverAwarded: 1,
  rupeEstado: 1,
} as const

function unique(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map(value => value?.trim()).filter((value): value is string => !!value))]
}

/** Lazy contact card for a selected map marker; keeps the viewport payload small. */
export default defineEventHandler(async (event) => {
  const supplierId = String(getQuery(event).supplierId ?? '').trim()
  if (!supplierId || supplierId.length > 180) {
    throw createError({ statusCode: 400, statusMessage: 'A valid supplierId is required' })
  }

  await connectToDatabase()
  const row = await SupplierContactModel.findOne({ supplierId }, CONTACT_PROJECTION).lean()
  if (!row) {
    throw createError({ statusCode: 404, statusMessage: 'Provider contact was not found' })
  }

  const safe = sanitizeContact(row as never)
  const emails = unique([safe.email, ...safe.emails.map(entry => entry.email)])
  const phones = unique([safe.phone, ...safe.phones.map(entry => entry.phone), safe.websitePhone])

  setHeader(event, 'Cache-Control', 'public, max-age=300')
  return {
    success: true,
    data: {
      supplierId: safe.supplierId,
      rut: safe.rut,
      name: safe.name,
      rubro: safe.rubro,
      emails,
      phones,
      website: safe.website,
      contactFormUrl: safe.contactFormUrl,
      socialLinks: safe.socialLinks.map(link => ({
        platform: link.platform,
        label: link.label,
        url: link.url,
      })),
      locality: safe.locality,
      address: safe.address,
      websiteAddress: safe.websiteAddress,
      hours: safe.hours,
      mapsUrl: safe.mapsUrl,
    },
  }
})
