import { createError, defineEventHandler, getRouterParam } from 'h3'
import type { PipelineStage } from 'mongoose'
import { ReleaseModel } from '../../../../shared/models/release'
import { casoExplorerQuery, casoToQueryParams, getCasoDef, getCasoTheme, listCasoDefsByTheme } from '../../utils/casos'
import { connectToDatabase, mongoose } from '../../utils/database'
import { sourceUrl } from '../../utils/query'
import { buildContractFilters, toMatchDocument } from '../contracts/index.get'

/**
 * One caso, resolved live.
 *
 * Two shapes come out of here, and which one you get is the point of the page:
 *
 *   • The caso HAS a query → the same cross-reference `/api/curros/[slug]`
 *     builds: totals, who got paid, what it bought, a year trend and a ledger.
 *   • The caso has NO query → `crossRef: null`. That is not a failure. Most of
 *     the largest questioned spending in Uruguay (PPPs, fideicomisos, the
 *     ROU–UPM contract, own-budget execution by state companies) never reaches
 *     the OCDS Compras Estatales feed, and a page that invented a number for it
 *     would be lying. The client renders the absence, with `feedCoverage`
 *     explaining which channel the money took instead.
 *
 * The database is only touched in the first case, so a dossier on an off-feed
 * contract renders with no Mongo round-trip at all.
 *
 * Totals exclude implausible-quantity artefacts (see stats.get.ts) so one
 * corrupt source record cannot blow up a case total.
 */
const IMPLAUSIBLE_UYU = 1e11
const MAX_TIME_MS = 9000
/** Roughly a quarter of what proxies and browsers tolerate in a URL. */
const MAX_EXPLORER_QUERY_CHARS = 1800

function explorerQueryLength(q: Record<string, string>): number {
  return Object.entries(q).reduce((n, [k, v]) => n + k.length + v.length + 2, 0)
}

const plausible = {
  $cond: [{ $lt: ['$amount.primaryAmount', IMPLAUSIBLE_UYU] }, { $ifNull: ['$amount.primaryAmount', 0] }, 0],
}

interface LeanRelease {
  id?: string
  ocid?: string
  tender?: { title?: string }
  buyer?: { name?: string }
  awards?: Array<{ suppliers?: Array<{ name?: string }>, items?: Array<{ description?: string, classification?: { description?: string } }> }>
  amount?: { primaryAmount?: number }
  date?: Date
}

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug') ?? ''
  const def = getCasoDef(slug)
  if (!def) {
    throw createError({ statusCode: 404, statusMessage: 'Caso not found' })
  }

  const theme = getCasoTheme(def.theme)

  // Lateral navigation: theme siblings first (they share the reader's current
  // question), then any explicit `related` from other themes.
  const siblings = listCasoDefsByTheme(def.theme).filter(c => c.slug !== def.slug)
  const explicit = (def.related ?? [])
    .map(s => getCasoDef(s))
    .filter((c): c is NonNullable<typeof c> => Boolean(c) && c!.slug !== def.slug && c!.theme !== def.theme)
  const related = [...siblings, ...explicit].slice(0, 8).map(c => ({
    slug: c.slug,
    emoji: c.emoji,
    theme: c.theme,
    status: c.status,
    statusKind: c.statusKind,
    es: { title: c.es.title },
    en: { title: c.en.title },
  }))

  const base = {
    slug: def.slug,
    emoji: def.emoji,
    theme: def.theme,
    themeMeta: theme ? { key: theme.key, emoji: theme.emoji, es: theme.es, en: theme.en } : null,
    period: def.period ?? null,
    statusKind: def.statusKind,
    status: def.status,
    amountReported: def.amountReported ?? null,
    organisms: def.organisms,
    suppliersNamed: def.suppliersNamed ?? [],
    feedCoverage: def.feedCoverage,
    investigationPath: def.investigationPath ?? null,
    es: def.es,
    en: def.en,
    sources: def.sources,
    related,
  }

  if (!def.query) {
    return {
      success: true,
      data: {
        ...base,
        crossRef: null,
        explorerQuery: null,
        meta: {
          crossReferenceBasis: 'this case has no cross-reference: the spending does not travel through the Compras Estatales open data',
        },
      },
    }
  }

  await connectToDatabase()
  if (mongoose.connection.readyState !== 1) {
    throw createError({ statusCode: 503, statusMessage: 'Database connection not ready' })
  }

  const filters = buildContractFilters(casoToQueryParams(def.query))
  const match = toMatchDocument(filters)

  // $text (when the query has a search phrase) must lead the pipeline.
  const pre: PipelineStage[] = []
  if (filters.text) {
    pre.push({ $match: filters.text })
    if (filters.and.length) pre.push({ $match: { $and: filters.and } })
  }
  else if (filters.and.length) {
    pre.push({ $match: { $and: filters.and } })
  }

  const facet: PipelineStage = {
    $facet: {
      totals: [
        { $group: { _id: null, count: { $sum: 1 }, totalValue: { $sum: plausible } } },
      ],
      byYear: [
        { $group: { _id: '$sourceYear', count: { $sum: 1 }, value: { $sum: plausible } } },
        { $sort: { _id: 1 } },
      ],
      // Release amount is per release, not per supplier — a multi-supplier award
      // adds its full amount to each. Ranking holds; absolute values are a ceiling.
      suppliers: [
        { $unwind: '$awards' },
        { $unwind: '$awards.suppliers' },
        { $group: { _id: '$awards.suppliers.name', value: { $sum: '$amount.primaryAmount' }, count: { $sum: 1 } } },
        { $sort: { value: -1 } },
        { $limit: 10 },
      ],
      supplierCount: [
        { $unwind: '$awards' },
        { $unwind: '$awards.suppliers' },
        { $group: { _id: '$awards.suppliers.name' } },
        { $count: 'n' },
      ],
      buyers: [
        { $group: { _id: '$buyer.name', value: { $sum: plausible }, count: { $sum: 1 } } },
        { $sort: { value: -1 } },
        { $limit: 8 },
      ],
      // Rubro spend from the item lines (quantity x unit price) in the contract's
      // own currency. Single-currency cases only; a mixed-currency case would
      // need per-currency splitting.
      categories: [
        { $unwind: '$awards' },
        { $unwind: '$awards.items' },
        {
          $group: {
            _id: '$awards.items.classification.description',
            value: { $sum: { $multiply: [{ $ifNull: ['$awards.items.quantity', 0] }, { $ifNull: ['$awards.items.unit.value.amount', 0] }] } },
            releases: { $addToSet: '$_id' },
          },
        },
        { $project: { value: 1, contracts: { $size: '$releases' } } },
        { $sort: { value: -1 } },
        { $limit: 8 },
      ],
    },
  }

  const [aggResult] = await ReleaseModel.aggregate([...pre, facet], {
    allowDiskUse: false,
    maxTimeMS: MAX_TIME_MS,
  })

  const items = await ReleaseModel
    .find(match, {
      'id': 1,
      'ocid': 1,
      'tender.title': 1,
      'buyer.name': 1,
      'awards.suppliers.name': 1,
      'awards.items.description': 1,
      'awards.items.classification.description': 1,
      'amount.primaryAmount': 1,
      'date': 1,
    })
    .sort({ 'amount.primaryAmount': -1 })
    .limit(30)
    .maxTimeMS(MAX_TIME_MS)
    .lean() as LeanRelease[]

  const totals = aggResult?.totals?.[0] ?? { count: 0, totalValue: 0 }
  const supplierCount = aggResult?.supplierCount?.[0]?.n ?? 0
  const explorerQuery = casoExplorerQuery(def.query)

  const toNamed = (rows: Array<{ _id: unknown, value: number, count: number }> = []) =>
    rows.filter(r => typeof r._id === 'string' && r._id).map(r => ({ name: r._id as string, value: r.value ?? 0, count: r.count }))

  const byYear = (aggResult?.byYear ?? [])
    .filter((b: { _id: unknown }) => Number.isFinite(Number(b._id)))
    .map((b: { _id: unknown, count: number, value: number }) => ({ year: Number(b._id), count: b.count, value: b.value ?? 0 }))

  const ledger = items.map((doc) => {
    const firstAward = doc.awards?.[0]
    const supplier = firstAward?.suppliers?.[0]?.name ?? null
    const firstItem = firstAward?.items?.[0]
    const title = doc.tender?.title || firstItem?.description || firstItem?.classification?.description || null
    return {
      id: doc.id,
      title,
      buyerName: doc.buyer?.name ?? null,
      supplier,
      amount: doc.amount?.primaryAmount ?? null,
      date: doc.date ?? null,
      sourceUrl: sourceUrl(doc.ocid),
    }
  })

  return {
    success: true,
    data: {
      ...base,
      crossRef: {
        kpis: {
          total: totals.totalValue ?? 0,
          count: totals.count ?? 0,
          suppliers: supplierCount,
        },
        byYear,
        suppliers: toNamed(aggResult?.suppliers),
        buyers: toNamed(aggResult?.buyers),
        categories: (aggResult?.categories ?? [])
          .filter((c: { _id: unknown }) => typeof c._id === 'string' && c._id)
          .map((c: { _id: string, value: number, contracts: number }) => ({ name: c._id, value: c.value ?? 0, contracts: c.contracts })),
        ledger,
      },
      // "Open this set in the explorer" only when the set FITS in a link. A
      // caso scoped to a whole inciso carries every buying unit under it by
      // name, which serialises to kilobytes; a truncated link would silently
      // open a DIFFERENT set of contracts than the one on this page, so the
      // link is withheld instead.
      explorerQuery: explorerQuery && explorerQueryLength(explorerQuery) <= MAX_EXPLORER_QUERY_CHARS
        ? explorerQuery
        : null,
      // What the cross-reference actually selected, in the reader's terms. The
      // per-caso `caveat` explains the limits in prose; this states the filter
      // itself, because "what the state spent with these bodies" and "what
      // these bodies bought whose object mentions X" are different claims and
      // the page must not blur them.
      scope: {
        search: def.query.search ?? null,
        buyerCount: def.query.buyers?.length ?? 0,
        suppliers: def.query.suppliers ?? [],
        yearFrom: def.query.yearFrom ?? null,
        yearTo: def.query.yearTo ?? null,
      },
      meta: {
        crossReferenceBasis: 'the DB set is what the state spent with the bodies and suppliers named in the case — a cross-reference, not a measure of wrongdoing',
        supplierValueBasis: 'upper bound; release amount is not apportioned across suppliers',
        categoryValueBasis: 'item line total (quantity x unit price) in the contract currency',
        totalExcludesAbove: IMPLAUSIBLE_UYU,
      },
    },
  }
})
