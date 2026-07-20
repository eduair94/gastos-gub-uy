import { createError, defineEventHandler, getRouterParam, setHeader } from 'h3'
import { isValidObjectId } from 'mongoose'
import { connectToDatabase } from '../../../utils/database'
import { ContractItemFeaturesModel, ReleaseModel } from '../../../utils/models'
import { awardUrl, compraIdFromOcid, sourceUrl } from '../../../utils/query'
import { scrapeItemFeatures, type ScrapedItem } from '../../../../../shared/utils/item-features'

/**
 * Per-item "Características" scraped from the government's HTML pages.
 *
 * ARCE's OCDS feed drops two fields its own pages show for every item:
 * the características table ("Tipo: SOMBRILLA DE CALOR", "Presentación:
 * ENVASE / Medida presentación: 250 G") and the "Variación" note. These
 * are not cosmetic — the presentación is what makes a "$1.447 per G"
 * price actually mean "per 250 G envase" — so the detail page fetches
 * them here lazily and we scrape the gov page once per compra, caching
 * the result (including a confirmed-empty result) in
 * `contract_item_features`. The parser/scraper live in
 * `server/utils/item-features.ts`, shared with the batch endpoint and the
 * variants job.
 */

export default defineEventHandler(async (event) => {
  try {
    await connectToDatabase()

    const contractId = getRouterParam(event, 'id')
    if (!contractId) {
      throw createError({ statusCode: 400, statusMessage: 'Contract ID is required' })
    }

    const queryConditions: Array<Record<string, string>> = [
      { id: contractId },
      { ocid: contractId },
    ]
    if (isValidObjectId(contractId)) queryConditions.push({ _id: contractId })

    const release = await ReleaseModel.findOne({ $or: queryConditions })
      .select('ocid tag awards')
      .lean() as { ocid?: string, tag?: string[], awards?: unknown[] } | null

    const compraId = compraIdFromOcid(release?.ocid)
    if (!release || !compraId) {
      throw createError({ statusCode: 404, statusMessage: 'Contract not found' })
    }

    // The data is static once published; let clients and the CDN keep it.
    setHeader(event, 'cache-control', 'public, max-age=86400')

    const cached = await ContractItemFeaturesModel.findOne({ compraId }).lean()
    // Serve the cache only once it has been scraped for the object AND the
    // tax-inclusive total too — both stored even as '' / null to record "we
    // looked and there was none". Entries cached before either field was
    // captured have it `undefined`; those fall through and re-scrape once to
    // backfill, then short-circuit forever after.
    if (cached && cached.object !== undefined && cached.total !== undefined) {
      return {
        success: true,
        data: { compraId, source: cached.source, items: cached.items ?? [], object: cached.object || null, total: cached.total ?? null },
      }
    }

    // The adjudicación page exists only once awarded; the llamado page
    // always exists. Both print the same características table, so try
    // the page this release belongs to first and fall back to the other.
    const hasAward = (release.awards?.length ?? 0) > 0
    const urls: Array<{ source: 'adjudicacion' | 'llamado', url: string | null }> = hasAward
      ? [
          { source: 'adjudicacion', url: awardUrl(release.ocid) },
          { source: 'llamado', url: sourceUrl(release.ocid) },
        ]
      : [
          { source: 'llamado', url: sourceUrl(release.ocid) },
          { source: 'adjudicacion', url: awardUrl(release.ocid) },
        ]

    let items: ScrapedItem[] | null = null
    let object: string | null = null
    let total: { amount: number, currency: string } | null = null
    let source: 'adjudicacion' | 'llamado' = urls[0]!.source
    // A page we tried to fetch but couldn't (network/5xx) — distinct from a page
    // that loaded fine and simply has no características.
    let anyTransient = false
    for (const u of urls) {
      if (!u.url) continue
      const scraped = await scrapeItemFeatures(u.url)
      if (scraped === null) {
        anyTransient = true
        continue
      }
      items = scraped.items
      if (object === null && scraped.object) object = scraped.object
      // The "Monto Total de la Compra" lives on the adjudicación page; keep the
      // first one found (the llamado page carries no awarded total).
      if (total === null && scraped.total) total = scraped.total
      source = u.source
      if (scraped.items.length) break
    }

    // Don't cache a confirmed-empty result when a page we needed failed
    // transiently: if the adjudicación timed out and the llamado merely returned
    // an empty 200, the real características may still be on the page we couldn't
    // reach. Report empty for this view but leave the cache unset so the next
    // view retries, instead of poisoning it with a false "no características".
    // The object is still returned when we have it — it is useful on its own.
    if (items === null || (items.length === 0 && anyTransient)) {
      // Re-scrape failed. If this was a backfill of an already-cached compra,
      // keep serving its cached items rather than blanking them.
      return {
        success: true,
        data: {
          compraId,
          source: cached?.source ?? source,
          items: cached?.items ?? [],
          object: object ?? (cached?.object || null),
          total: total ?? (cached?.total ?? null),
          transient: true,
        },
      }
    }

    // Always record `object` (as '' when the page had none) so the entry is
    // marked "looked" and never re-scraped just for the object again.
    await ContractItemFeaturesModel.updateOne(
      { compraId },
      { $set: { compraId, items, source, object: object ?? '', total: total ?? null, fetchedAt: new Date() } },
      { upsert: true },
    ).catch(() => {})

    return { success: true, data: { compraId, source, items, object, total: total ?? null } }
  }
  catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    console.error('Error fetching item features:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch item features' })
  }
})
