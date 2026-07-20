/**
 * Shared "Características del Ítem" scraper.
 *
 * ARCE's OCDS feed drops two fields its own HTML pages show for every item: the
 * características table ("Tipo: SOMBRILLA DE CALOR", "Presentación: ENVASE /
 * Medida presentación: 250 G") and the "Variación" note. These are not cosmetic
 * — the presentación is what makes a "$1.447 per G" price actually mean "per 250
 * G envase" — so we scrape them from the government page and cache the result
 * (including a confirmed-empty one) in `contract_item_features`.
 *
 * Extracted here so the single contract endpoint, the batch endpoint, and the
 * offline variants job all share one parser/scraper — one place a gov-layout
 * change is fixed.
 */

import { parseOfficialTotal, parseUyCurrency, parseUyNumber, type OfficialTotal } from './comprasestatales-total'

export interface Money {
  amount: number
  currency: string
}

export interface ScrapedItem {
  nro: number
  features: { name: string, value: string }[]
  variation?: string
  /** "Cantidad" — the page's fractional quantity (OCDS truncates it to an integer). */
  quantity?: number
  /** The quantity's unit as printed ("KG", "UNIDAD", "FRASCO"). */
  quantityUnit?: string
  /** "Precio unitario sin impuestos" — the tax-EXCLUSIVE unit price (matches OCDS). */
  netUnitPrice?: Money
  /** "Monto total con impuestos" — the tax-INCLUSIVE line total (not in OCDS). */
  grossTotal?: Money
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
 * Value of a `<li>label:</li><li><strong>value</strong></li>` pair inside `slice`.
 * Matched globally (first occurrence of the full structure) rather than anchored
 * to the first bare mention of the label, so a stray "Cantidad" in item prose
 * can't shadow the real amount below it. Returns the raw inner text or null.
 */
function sliceStrong(slice: string, label: string): string | null {
  const esc = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const m = new RegExp(`${esc}[^<]*<\\/li>\\s*<li[^>]*>\\s*<strong>\\s*([^<]+?)\\s*<\\/strong>`, 'i').exec(slice)
  return m ? m[1]! : null
}

/** `"$ 324,80"` / `"U$S 4.201,00"` -> `{ amount, currency }`; null if unparseable. */
function parseMoney(raw: string | null): Money | null {
  if (!raw) return null
  const amount = parseUyNumber(raw)
  if (amount === null) return null
  return { amount, currency: parseUyCurrency(raw) }
}

/**
 * Pulls every item's características + variación out of one page of the gov
 * detail HTML. Tolerant by construction: each item is located by two independent
 * anchors (the `features-table` caption for características, the
 * `buy-item-title-small` heading for variación), so a layout change that breaks
 * one still yields the other.
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

  // -- Per-item slice: variación + the amounts the OCDS feed drops --------
  // Each item's heading is followed by a flat `<li>label:</li><li><strong>value
  // </strong></li>` list carrying "Cantidad", "Precio unitario sin impuestos"
  // (tax-exclusive, matches OCDS) and "Monto total con impuestos" (tax-inclusive,
  // NOT in OCDS). We read all of them off the heading slice, bound to the label's
  // own sibling <li> so no other bolded field can stand in.
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

    const qtyRaw = sliceStrong(slice, 'Cantidad')
    if (qtyRaw) {
      const value = parseUyNumber(qtyRaw)
      if (value !== null) item(nro).quantity = value
      const unit = qtyRaw.replace(/[0-9.,]/g, '').trim()
      if (unit) item(nro).quantityUnit = unit
    }

    const net = parseMoney(sliceStrong(slice, 'Precio unitario sin impuestos'))
    if (net) item(nro).netUnitPrice = net

    const gross = parseMoney(sliceStrong(slice, 'Monto total con impuestos'))
    if (gross) item(nro).grossTotal = gross
  }

  return [...byNro.values()].sort((a, b) => a.nro - b.nro)
}

const FETCH_OPTS: RequestInit = {
  headers: {
    // The gov site serves the same HTML to any client; a UA is set only so our
    // scraper is identifiable in their logs.
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
 * Long item lists paginate ("Ítems adjudicados" shows 10 per page). The numbered
 * links carry their own hrefs, so we fetch whatever the page advertises (same
 * host only, capped) rather than guessing the scheme. Returns null when even
 * page 1 could not be fetched — "gov site down" must stay distinguishable from
 * "page has no características".
 */
export async function scrapeItemFeatures(url: string): Promise<{ items: ScrapedItem[], object: string | null, total: OfficialTotal | null } | null> {
  const first = await fetchPage(url)
  if (first === null) return null

  const items = parseItemFeatures(first)
  const object = parseBuyObject(first) // the object is on the first page only
  const total = parseOfficialTotal(first) // "Monto Total de la Compra" — page 1 only

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
  return { items: items.filter(it => !seen.has(it.nro) && seen.add(it.nro)), object, total }
}
