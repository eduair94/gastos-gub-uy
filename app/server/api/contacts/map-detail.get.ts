import { createError, defineEventHandler, getQuery, setHeader } from 'h3'
import { SupplierContactModel } from '../../../../shared/models/supplier_contacts'
import { connectToDatabase } from '../../utils/database'
import { sanitizeContact } from '../../utils/contacts'
import { fetchDei } from '../../utils/dei'
import { BuyerPatternModel, SupplierPatternModel } from '../../utils/models'
import { fetchRupe } from '../../utils/rupe'

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
  enrichmentMethods: 1,
  updatedAt: 1,
  mapsEnrichedAt: 1,
} as const

function unique(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map(value => value?.trim()).filter((value): value is string => !!value))]
}

function isoDate(value: unknown): string | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(String(value))
  return Number.isNaN(date.valueOf()) ? null : date.toISOString()
}

function httpUrl(value: string | null | undefined): string | null {
  const candidate = value?.trim()
  if (!candidate) return null
  try {
    const url = new URL(/^[a-z][a-z\d+.-]*:/i.test(candidate) ? candidate : `https://${candidate}`)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null
  }
  catch {
    return null
  }
}

/**
 * Complete, sanitized business record for a selected map marker. The viewport
 * endpoint stays small; this bounded detail query joins the contact, registry
 * and procurement summaries only after the marker is selected.
 */
export default defineEventHandler(async (event) => {
  const supplierId = String(getQuery(event).supplierId ?? '').trim()
  if (!supplierId || supplierId.length > 180) {
    throw createError({ statusCode: 400, statusMessage: 'A valid supplierId is required' })
  }

  await connectToDatabase()
  const [row, supplier, deiById, rupeById] = await Promise.all([
    SupplierContactModel.findOne({ supplierId }, CONTACT_PROJECTION).lean(),
    SupplierPatternModel.findOne(
      { supplierId },
      {
        _id: 0,
        supplierId: 1,
        name: 1,
        totalContracts: 1,
        years: 1,
        yearCount: 1,
        buyers: 1,
        buyerCount: 1,
        avgContractValue: 1,
        totalValue: 1,
        directAwardCount: 1,
        tenderAwardCount: 1,
        onlyDirectAward: 1,
        items: { $slice: 8 },
        topCategories: { $slice: 8 },
        lastUpdated: 1,
      },
    ).lean(),
    fetchDei([supplierId]),
    fetchRupe([supplierId]),
  ])
  if (!row) {
    throw createError({ statusCode: 404, statusMessage: 'Provider contact was not found' })
  }

  const safe = sanitizeContact(row as never)
  const dei = deiById.get(supplierId) ?? null
  const rupe = rupeById.get(supplierId) ?? null
  const emails = safe.emails.map(email => ({
    email: email.email,
    source: email.source,
    sourceUrl: email.sourceUrl,
    mxValid: email.mxValid,
  }))
  for (const email of unique([safe.email, dei?.email])) {
    if (emails.some(entry => entry.email.toLowerCase() === email.toLowerCase())) continue
    emails.push({
      email,
      source: email === dei?.email ? 'dei' : '',
      sourceUrl: null,
      mxValid: false,
    })
  }
  const phones = safe.phones.map(phone => ({
    phone: phone.phone,
    source: phone.source,
    sourceUrl: phone.sourceUrl,
  }))
  for (const phone of unique([safe.phone, safe.websitePhone, dei?.telefono])) {
    const phoneKey = phone.replace(/\D/g, '') || phone
    if (phones.some(entry => (entry.phone.replace(/\D/g, '') || entry.phone) === phoneKey)) continue
    phones.push({
      phone,
      source: phone === dei?.telefono ? 'dei' : '',
      sourceUrl: null,
    })
  }
  const website = httpUrl(safe.website) ?? httpUrl(dei?.sitioWeb)
  const buyerIds = (supplier?.buyers ?? []).slice(0, 6)
  const buyerRows = buyerIds.length
    ? await BuyerPatternModel.find(
      { buyerId: { $in: buyerIds } },
      { _id: 0, buyerId: 1, name: 1 },
    ).lean()
    : []
  const buyerNames = new Map(buyerRows.map(buyer => [buyer.buyerId, buyer.name]))

  setHeader(event, 'Cache-Control', 'public, max-age=300')
  return {
    success: true,
    data: {
      supplierId: safe.supplierId,
      rut: safe.rut,
      name: safe.name,
      rubro: safe.rubro,
      rubros: safe.rubros,
      emails,
      phones,
      website,
      websiteSource: website === httpUrl(safe.website) ? safe.websiteSource : (website ? 'dei' : null),
      websiteSourceUrl: httpUrl(safe.websiteSourceUrl),
      contactFormUrl: safe.contactFormUrl,
      socialLinks: safe.socialLinks,
      locality: safe.locality,
      address: safe.address,
      websiteAddress: safe.websiteAddress,
      placeSource: safe.placeSource,
      hours: safe.hours,
      mapsUrl: safe.mapsUrl,
      lat: safe.lat,
      lng: safe.lng,
      methods: safe.methods,
      neverAwarded: safe.neverAwarded,
      rupeEstado: rupe?.estado ?? safe.rupeEstado,
      dei,
      rupe,
      procurement: supplier
        ? {
            totalContracts: supplier.totalContracts,
            years: supplier.years ?? [],
            yearCount: supplier.yearCount,
            buyers: buyerIds.map(id => ({ id, name: buyerNames.get(id) ?? id })),
            buyerCount: supplier.buyerCount,
            avgContractValue: supplier.avgContractValue,
            totalValue: supplier.totalValue,
            directAwardCount: supplier.directAwardCount,
            tenderAwardCount: supplier.tenderAwardCount,
            onlyDirectAward: supplier.onlyDirectAward,
            items: (supplier.items ?? []).map(item => ({
              description: item.description,
              category: item.category ?? null,
              totalAmount: item.totalAmount,
              totalQuantity: item.totalQuantity,
              contractCount: item.contractCount,
              avgPrice: item.avgPrice,
              currency: item.currency ?? null,
              unitName: item.unitName ?? null,
              year: item.year ?? null,
            })),
            topCategories: (supplier.topCategories ?? []).map(category => ({
              category: category.category,
              totalAmount: category.totalAmount,
              contractCount: category.contractCount,
            })),
            lastUpdated: isoDate(supplier.lastUpdated),
          }
        : null,
      meta: {
        contactUpdatedAt: isoDate((row as { updatedAt?: unknown }).updatedAt),
        mapsEnrichedAt: isoDate((row as { mapsEnrichedAt?: unknown }).mapsEnrichedAt),
      },
    },
  }
})
