import { createError, defineEventHandler } from 'h3'
import { ReleaseModel } from '../../../../shared/models/release'
import { connectToDatabase } from '../../utils/database'
import { FilterDataModel } from '../../utils/models'

/**
 * Available filter options, with counts, for the contract explorer.
 *
 * Most facets come from the precomputed `filter_data` collection (5 documents
 * keyed by `type`), so this endpoint never aggregates the 2.1M-document
 * `releases` collection on the request path.
 *
 * Two facets are NOT in `filter_data` and are handled explicitly below:
 * `procurementMethodDetails` and `currencies`.
 */

interface FilterOption { value: string | number, label: string, count: number | null }

const FILTER_DATA_TTL_MS = 15 * 60 * 1000 // 15 minutes
const DERIVED_TTL_MS = 6 * 60 * 60 * 1000 // 6 hours
const BOUNDS_TTL_MS = 15 * 60 * 1000 // 15 minutes

/**
 * Seed values for the two derived facets, from a full scan of the live
 * collection on 2026-07-17 (2,171,928 releases).
 *
 * These are a point-in-time fallback, not the source of truth: the background
 * refresh below replaces them with live values and keeps doing so every 6h, so
 * the list cannot silently drift the way a purely hardcoded one would. They
 * exist so that a cold process — or a refresh that times out — still serves a
 * correct-looking facet instead of an empty one.
 *
 * `procurementMethodDetails` holds the Uruguayan procedure names users actually
 * search by; `tender.procurementMethod` only carries the English OCDS enum
 * (open/direct/limited). 23 distinct values exist including null (69.31% of
 * documents are null — the facet covers the remaining 30.69%).
 */
const PROCUREMENT_METHOD_DETAILS_SEED: FilterOption[] = [
  { value: 'Compra Directa', label: 'Compra Directa', count: 484778 },
  { value: 'Licitación Abreviada', label: 'Licitación Abreviada', count: 103429 },
  { value: 'Concurso de Precios', label: 'Concurso de Precios', count: 38908 },
  { value: 'Compra por Excepción', label: 'Compra por Excepción', count: 16696 },
  { value: 'Licitación Pública', label: 'Licitación Pública', count: 16487 },
  { value: 'Llamado a Expresiones de Interés', label: 'Llamado a Expresiones de Interés', count: 1901 },
  { value: 'Concesión', label: 'Concesión', count: 901 },
  { value: 'PFI - Comparación de precios', label: 'PFI - Comparación de precios', count: 755 },
  { value: 'Procedimiento Especial', label: 'Procedimiento Especial', count: 595 },
  { value: 'Venta/Arrendamiento Licitación Abreviada', label: 'Venta/Arrendamiento Licitación Abreviada', count: 474 },
  { value: 'Venta/Arrendamiento por Remate', label: 'Venta/Arrendamiento por Remate', count: 377 },
  { value: 'Solicitud de Información', label: 'Solicitud de Información', count: 260 },
  { value: 'Pregón', label: 'Pregón', count: 218 },
  { value: 'PFI - Licitación pública nacional', label: 'PFI - Licitación pública nacional', count: 193 },
  { value: 'Venta/Arrendamiento Directa', label: 'Venta/Arrendamiento Directa', count: 144 },
  { value: 'PFI - Licitación pública internacional', label: 'PFI - Licitación pública internacional', count: 97 },
  { value: 'Venta/Arrendamiento Licitación Pública', label: 'Venta/Arrendamiento Licitación Pública', count: 90 },
  { value: 'PFI - Contratación directa', label: 'PFI - Contratación directa', count: 62 },
  { value: 'Venta/Arrendamiento Concurso de Precios', label: 'Venta/Arrendamiento Concurso de Precios', count: 61 },
  { value: 'Convenio Marco', label: 'Convenio Marco', count: 48 },
  { value: 'Arrendamiento de Obra', label: 'Arrendamiento de Obra', count: 45 },
  { value: 'Venta/Arrendamiento por Excepción', label: 'Venta/Arrendamiento por Excepción', count: 18 },
]

/**
 * Currencies present in `amount.currencies`. Derived rather than hardcoded:
 * the real data contains ARS, ZAR, GBP, CAD, CHF and BRL, and contains no `UR`
 * at all, so a hand-written list would be wrong in both directions.
 */
const CURRENCIES_SEED: FilterOption[] = [
  { value: 'UYU', label: 'UYU', count: 1294354 },
  { value: 'USD', label: 'USD', count: 114517 },
  { value: 'EUR', label: 'EUR', count: 1920 },
  { value: 'UYI', label: 'UYI', count: 615 },
  { value: 'GBP', label: 'GBP', count: 64 },
  { value: 'BRL', label: 'BRL', count: 51 },
  { value: 'CHF', label: 'CHF', count: 40 },
  { value: 'ZAR', label: 'ZAR', count: 13 },
  { value: 'CAD', label: 'CAD', count: 11 },
  { value: 'ARS', label: 'ARS', count: 1 },
]

interface DerivedFacets {
  procurementMethodDetails: FilterOption[]
  currencies: FilterOption[]
}

const derivedCache: {
  value: DerivedFacets
  computedAt: number
  source: 'seed' | 'live'
  refreshing: boolean
} = {
  value: {
    procurementMethodDetails: PROCUREMENT_METHOD_DETAILS_SEED,
    currencies: CURRENCIES_SEED,
  },
  computedAt: 0,
  source: 'seed',
  refreshing: false,
}

/**
 * Recomputes both derived facets in ONE pass over `releases` (~8.8s measured).
 *
 * This is stale-while-revalidate: it is never awaited by a request. A request
 * always gets the cached value immediately and, if it is stale, schedules this
 * to run behind it. That keeps the endpoint at index-seek latency while still
 * self-correcting every 6h. `refreshing` dedupes, so concurrent requests can
 * never stack up multiple full scans.
 */
async function refreshDerivedFacets(): Promise<void> {
  if (derivedCache.refreshing) return
  derivedCache.refreshing = true

  try {
    const [result] = await ReleaseModel.aggregate(
      [
        {
          $facet: {
            procurementMethodDetails: [
              { $group: { _id: '$tender.procurementMethodDetails', count: { $sum: 1 } } },
              { $sort: { count: -1 } },
            ],
            currencies: [
              { $unwind: '$amount.currencies' },
              { $group: { _id: '$amount.currencies', count: { $sum: 1 } } },
              { $sort: { count: -1 } },
            ],
          },
        },
      ],
      // Generous: this runs in the background, not on the request path.
      { allowDiskUse: false, maxTimeMS: 60000 },
    )

    const toOptions = (rows: Array<{ _id: unknown, count: number }> = []): FilterOption[] =>
      rows
        .filter(r => typeof r._id === 'string' && r._id.trim())
        .map(r => ({ value: r._id as string, label: r._id as string, count: r.count }))

    const procurementMethodDetails = toOptions(result?.procurementMethodDetails)
    const currencies = toOptions(result?.currencies)

    // Never replace a good seed with an empty result.
    if (procurementMethodDetails.length) derivedCache.value.procurementMethodDetails = procurementMethodDetails
    if (currencies.length) derivedCache.value.currencies = currencies

    derivedCache.computedAt = Date.now()
    derivedCache.source = 'live'
  }
  catch (error) {
    // Keep serving the seed; retry on the next stale request.
    console.warn('[contracts/filters] derived facet refresh failed:', (error as Error).message)
  }
  finally {
    derivedCache.refreshing = false
  }
}

function getDerivedFacets(): DerivedFacets {
  if (Date.now() - derivedCache.computedAt > DERIVED_TTL_MS && !derivedCache.refreshing) {
    // Fire and forget — the current request must not wait for a full scan.
    void refreshDerivedFacets()
  }
  return derivedCache.value
}

/** `amount.primaryAmount` min/max via two index seeks on `amount.primaryAmount_1`. */
const boundsCache: { value: { min: number, max: number } | null, computedAt: number } = {
  value: null,
  computedAt: 0,
}

async function getAmountBounds(): Promise<{ min: number, max: number } | null> {
  if (boundsCache.value && Date.now() - boundsCache.computedAt < BOUNDS_TTL_MS) {
    return boundsCache.value
  }

  try {
    // Each is an index seek (~180ms measured), not a scan. `$gt: 0` skips the
    // nulls that would otherwise sort to the front.
    const [minDoc, maxDoc] = await Promise.all([
      ReleaseModel.find({ 'amount.primaryAmount': { $gt: 0 } })
        .sort({ 'amount.primaryAmount': 1 }).limit(1)
        .select('amount.primaryAmount').maxTimeMS(3000).lean(),
      ReleaseModel.find({ 'amount.primaryAmount': { $gt: 0 } })
        .sort({ 'amount.primaryAmount': -1 }).limit(1)
        .select('amount.primaryAmount').maxTimeMS(3000).lean(),
    ])

    const min = (minDoc?.[0] as { amount?: { primaryAmount?: number } })?.amount?.primaryAmount
    const max = (maxDoc?.[0] as { amount?: { primaryAmount?: number } })?.amount?.primaryAmount

    if (typeof min !== 'number' || typeof max !== 'number') return boundsCache.value

    boundsCache.value = { min, max }
    boundsCache.computedAt = Date.now()
    return boundsCache.value
  }
  catch (error) {
    console.warn('[contracts/filters] amount bounds failed:', (error as Error).message)
    return boundsCache.value
  }
}

/** Precomputed facets from `filter_data`. */
const filterDataCache: { value: Awaited<ReturnType<typeof loadFilterData>> | null, computedAt: number } = {
  value: null,
  computedAt: 0,
}

async function loadFilterData() {
  const docs = await FilterDataModel.find()
    .select('type data lastUpdated generatedFromReleases')
    .maxTimeMS(5000)
    .lean()

  const byType = new Map<string, { options: FilterOption[], lastUpdated: Date, generatedFromReleases: number }>()

  for (const doc of docs as unknown as Array<{
    type: string
    data: Array<{ value: string | number, label: string, count: number }>
    lastUpdated: Date
    generatedFromReleases: number
  }>) {
    byType.set(doc.type, {
      options: (doc.data || []).map(o => ({ value: o.value, label: o.label, count: o.count })),
      lastUpdated: doc.lastUpdated,
      generatedFromReleases: doc.generatedFromReleases,
    })
  }

  return byType
}

async function getFilterData() {
  if (filterDataCache.value && Date.now() - filterDataCache.computedAt < FILTER_DATA_TTL_MS) {
    return filterDataCache.value
  }
  const value = await loadFilterData()
  filterDataCache.value = value
  filterDataCache.computedAt = Date.now()
  return value
}

export default defineEventHandler(async () => {
  const startTime = Date.now()

  try {
    await connectToDatabase()

    const [filterData, amountBounds] = await Promise.all([
      getFilterData(),
      getAmountBounds(),
    ])

    const derived = getDerivedFacets()

    const years = (filterData.get('years')?.options || [])
      .filter(y => Number(y.value) > 2000)
      .sort((a, b) => Number(b.value) - Number(a.value))

    const statuses = filterData.get('statuses')?.options || []
    const procurementMethods = filterData.get('procurementMethods')?.options || []
    const buyers = filterData.get('buyers')?.options || []
    const suppliers = filterData.get('suppliers')?.options || []

    const sources = Array.from(filterData.entries()).reduce((acc, [type, v]) => {
      acc[type] = {
        lastUpdated: v.lastUpdated,
        generatedFromReleases: v.generatedFromReleases,
        optionCount: v.options.length,
      }
      return acc
    }, {} as Record<string, unknown>)

    return {
      success: true,
      data: {
        years,
        statuses,
        procurementMethods,
        procurementMethodDetails: derived.procurementMethodDetails,
        buyers,
        suppliers,
        currencies: derived.currencies,
        amountBounds,
      },
      meta: {
        precomputed: true,
        // `filter_data` counts lag the live collection — e.g. statuses reports
        // active=152,525 / cancelled=2,964 while the live collection holds
        // 179,751 / 3,578. Surfacing `lastUpdated` lets the UI label the age
        // rather than implying these are live counts.
        lastUpdated: sources
          ? Object.values(sources).reduce<number | null>((max, s) => {
              const t = new Date((s as { lastUpdated: Date }).lastUpdated).getTime()
              return Number.isFinite(t) && (max === null || t > max) ? t : max
            }, null)
          : null,
        // tender.status is null on 91.56% of documents and only ever holds
        // 'active' or 'cancelled' — a very thin facet, flagged for the UI.
        statusCoverage: {
          populated: 183329,
          total: 2171928,
          nullRatio: 0.9156,
          note: 'tender.status is absent from the vast majority of releases',
        },
        derivedFacets: {
          source: derivedCache.source,
          computedAt: derivedCache.computedAt || null,
          refreshing: derivedCache.refreshing,
          note: 'procurementMethodDetails and currencies are not in filter_data; derived by a background scan refreshed every 6h, seeded from a 2026-07-17 scan',
        },
        amountBoundsNote: amountBounds
          ? 'Derived via index seeks. Max reflects a known data-quality outlier in amount.primaryAmount.'
          : 'Unavailable',
        sources,
        executionTimeMs: Date.now() - startTime,
      },
    }
  }
  catch (error) {
    console.error('Error fetching filter data:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch filter options',
    })
  }
})
