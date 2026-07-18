import { createError, defineEventHandler, getRouterParam, setHeader } from 'h3'
import { isValidObjectId } from 'mongoose'
import { connectToDatabase } from '../../../utils/database'
import { ContractItemFeaturesModel, ReleaseModel } from '../../../utils/models'
import { awardUrl, compraIdFromOcid, sourceUrl } from '../../../utils/query'

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
 * `contract_item_features`.
 */

interface ScrapedItem {
  nro: number
  features: { name: string, value: string }[]
  variation?: string
}

/** The handful of entities these pages actually emit, plus numeric refs. */
function decodeEntities(s: string): string {
  return s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&sol;/gi, '/')
    .replace(/&aacute;/gi, 'á')
    .replace(/&eacute;/gi, 'é')
    .replace(/&iacute;/gi, 'í')
    .replace(/&oacute;/gi, 'ó')
    .replace(/&uacute;/gi, 'ú')
    .replace(/&ntilde;/gi, 'ñ')
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * The compra's free-text object — `<p class="buy-object">` on the gov page
 * ("Sistema Veeam", "…traslado para 46 pasajeros…"). OCDS drops it on award
 * releases, and some compras have no tender release carrying `tender.description`
 * either, so this scrape is the only record of what the purchase was for.
 */
export function parseBuyObject(rawHtml: string): string | null {
  const m = /<p[^>]*class="[^"]*\bbuy-object\b[^"]*"[^>]*>([\s\S]*?)<\/p>/i.exec(rawHtml)
  if (!m) return null
  const text = decodeEntities(m[1]!)
  return text || null
}

/**
 * Pulls every item's características + variación out of one page of the
 * gov detail HTML. Tolerant by construction: each item is located by two
 * independent anchors (the `features-table` caption for características,
 * the `buy-item-title-small` heading for variación), so a layout change
 * that breaks one still yields the other.
 */
export function parseItemFeatures(rawHtml: string): ScrapedItem[] {
  // Normalise every non-breaking space form to a plain space BEFORE the regexes
  // run: the gov pages emit `&nbsp;`, but numeric `&#160;` / `&#xa0;` also occur,
  // and an item heading using the numeric form would otherwise not match headRe
  // and lose that item's variación.
  const html = rawHtml.replace(/&nbsp;|&#0*160;|&#x0*a0;/gi, ' ')

  const byNro = new Map<number, ScrapedItem>()
  const item = (nro: number): ScrapedItem => {
    let it = byNro.get(nro)
    if (!it) {
      it = { nro, features: [] }
      byNro.set(nro, it)
    }
    return it
  }

  // -- Características tables, keyed by their own caption --------------
  const tableRe = /<caption[^>]*>\s*Caracter[íi]sticas del [ÍI]tem N[ºo°]\s*(\d+)\s*<\/caption>[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/gi
  for (const m of html.matchAll(tableRe)) {
    const nro = Number(m[1])
    const rowRe = /<tr[^>]*>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<\/tr>/gi
    for (const row of m[2]!.matchAll(rowRe)) {
      const name = decodeEntities(row[1]!)
      const value = decodeEntities(row[2]!)
      if (name && value) item(nro).features.push({ name, value })
    }
  }

  // -- Variación notes, keyed by the item heading they sit under -------
  const headRe = /buy-item-title-small"[^>]*>\s*[ÍI]tem N[ºo°](?:&nbsp;|\s)*(\d+)/gi
  const heads = [...html.matchAll(headRe)]
  for (let i = 0; i < heads.length; i++) {
    const nro = Number(heads[i]![1])
    const slice = html.slice(heads[i]!.index!, heads[i + 1]?.index ?? html.length)
    const v = /Variaci[óo]n:\s*<\/li>\s*<li[^>]*>\s*<strong>([\s\S]*?)<\/strong>/i.exec(slice)
    if (v) {
      const variation = decodeEntities(v[1]!)
      if (variation) item(nro).variation = variation
    }
  }

  return [...byNro.values()].sort((a, b) => a.nro - b.nro)
}

const FETCH_OPTS: RequestInit = {
  headers: {
    // The gov site serves the same HTML to any client; a UA is set only
    // so our scraper is identifiable in their logs.
    'user-agent': 'conlatuya.checkleaked.cc (datos abiertos; contacto: sitio)',
    'accept': 'text/html',
  },
}

async function fetchPage(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { ...FETCH_OPTS, signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    return await res.text()
  }
  catch {
    return null
  }
}

/**
 * Scrapes one gov page, following its item paginator.
 *
 * Long item lists paginate ("Ítems adjudicados" shows 10 per page). The
 * numbered links carry their own hrefs, so we fetch whatever the page
 * advertises (same host only, capped) rather than guessing the scheme.
 * Returns null when even page 1 could not be fetched — "gov site down"
 * must stay distinguishable from "page has no características".
 */
async function scrape(url: string): Promise<{ items: ScrapedItem[], object: string | null } | null> {
  const first = await fetchPage(url)
  if (first === null) return null

  const items = parseItemFeatures(first)
  const object = parseBuyObject(first) // the object is on the first page only

  const pag = /<div id="pagination">([\s\S]*?)<\/div>/i.exec(first)?.[1] ?? ''
  const hrefs = [...pag.matchAll(/href="([^"]+)"/gi)]
    .map(m => m[1]!.replace(/&amp;/g, '&'))
    .filter(h => !/javascript:/i.test(h))
    .slice(0, 9)

  const pages = await Promise.all(hrefs.map(h =>
    fetchPage(new URL(h, 'https://www.comprasestatales.gub.uy').toString())))
  for (const html of pages) {
    if (html) items.push(...parseItemFeatures(html))
  }

  // Paginators repeat the current page; keep the first occurrence of each Nº.
  const seen = new Set<number>()
  return { items: items.filter(it => !seen.has(it.nro) && seen.add(it.nro)), object }
}

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
    // Serve the cache only once it has been scraped for the object too — stored
    // even as '' to record "we looked and there was none". Entries cached before
    // buy-object was captured have `object === undefined`; those fall through and
    // re-scrape once to backfill it, then short-circuit forever after.
    if (cached && cached.object !== undefined) {
      return {
        success: true,
        data: { compraId, source: cached.source, items: cached.items ?? [], object: cached.object || null },
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
    let source: 'adjudicacion' | 'llamado' = urls[0]!.source
    // A page we tried to fetch but couldn't (network/5xx) — distinct from a page
    // that loaded fine and simply has no características.
    let anyTransient = false
    for (const u of urls) {
      if (!u.url) continue
      const scraped = await scrape(u.url)
      if (scraped === null) {
        anyTransient = true
        continue
      }
      items = scraped.items
      if (object === null && scraped.object) object = scraped.object
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
          transient: true,
        },
      }
    }

    // Always record `object` (as '' when the page had none) so the entry is
    // marked "looked" and never re-scraped just for the object again.
    await ContractItemFeaturesModel.updateOne(
      { compraId },
      { $set: { compraId, items, source, object: object ?? '', fetchedAt: new Date() } },
      { upsert: true },
    ).catch(() => {})

    return { success: true, data: { compraId, source, items, object } }
  }
  catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    console.error('Error fetching item features:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch item features' })
  }
})
