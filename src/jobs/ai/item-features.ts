/**
 * Item "Características" scraper for the AI triage job.
 *
 * ARCE's OCDS feed omits the per-item characteristics table ("Tipo: SOMBRILLA DE CALOR",
 * "Presentación: ENVASE / Medida presentación: 250 G") and the "Variación" note that its own HTML
 * pages show. Those fields change what a price MEANS — a unit price "per G" can really be per 250 G
 * envase — so they are exactly the context the price-anomaly triage needs to tell an explainable
 * gap from a real one.
 *
 * This is a port of the proven parser in app/server/api/contracts/[id]/features.get.ts, kept
 * self-contained here because src/ jobs cannot import the Nuxt server route. The gov HTML format is
 * static, so the small duplication is low-risk. The job reads the `contract_item_features` cache
 * first and only scrapes (then caches) on a miss, so a page is fetched at most once per compra
 * corpus-wide — shared with the contract detail page's own lazy scrape.
 */

export interface ScrapedItem {
  /** Gov item number ("Ítem Nº 1" -> 1). Matches the OCDS award item id prefix. */
  nro: number;
  features: { name: string; value: string }[];
  variation?: string;
}

const FETCH_OPTS: RequestInit = {
  headers: {
    "user-agent": "conlatuya.checkleaked.cc (datos abiertos; contacto: sitio)",
    accept: "text/html",
  },
};

/** The government's id_compra: the ocid with its `ocds-<prefix>-` stripped. */
export function compraIdFromOcid(ocid?: string | null): string | null {
  if (!ocid || typeof ocid !== "string") return null;
  const m = /^ocds-[a-z0-9]+-(.+)$/i.exec(ocid.trim());
  const id = (m?.[1] ?? "").trim();
  return id || null;
}

export function llamadoUrl(ocid?: string | null): string | null {
  const compraId = compraIdFromOcid(ocid);
  return compraId ? `https://www.comprasestatales.gub.uy/consultas/detalle/mostrar-llamado/1/id/${encodeURIComponent(compraId)}` : null;
}

export function adjudicacionUrl(ocid?: string | null): string | null {
  const compraId = compraIdFromOcid(ocid);
  return compraId ? `https://www.comprasestatales.gub.uy/consultas/detalle/id/${encodeURIComponent(compraId)}` : null;
}

function decodeEntities(s: string): string {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&sol;/gi, "/")
    .replace(/&aacute;/gi, "á")
    .replace(/&eacute;/gi, "é")
    .replace(/&iacute;/gi, "í")
    .replace(/&oacute;/gi, "ó")
    .replace(/&uacute;/gi, "ú")
    .replace(/&ntilde;/gi, "ñ")
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/** Pulls every item's características + variación out of one page of the gov detail HTML. */
export function parseItemFeatures(rawHtml: string): ScrapedItem[] {
  const html = rawHtml.replace(/&nbsp;|&#0*160;|&#x0*a0;/gi, " ");
  const byNro = new Map<number, ScrapedItem>();
  const item = (nro: number): ScrapedItem => {
    let it = byNro.get(nro);
    if (!it) {
      it = { nro, features: [] };
      byNro.set(nro, it);
    }
    return it;
  };

  const tableRe = /<caption[^>]*>\s*Caracter[íi]sticas del [ÍI]tem N[ºo°]\s*(\d+)\s*<\/caption>[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/gi;
  for (const m of html.matchAll(tableRe)) {
    const nro = Number(m[1]);
    const rowRe = /<tr[^>]*>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<\/tr>/gi;
    for (const row of m[2]!.matchAll(rowRe)) {
      const name = decodeEntities(row[1]!);
      const value = decodeEntities(row[2]!);
      if (name && value) item(nro).features.push({ name, value });
    }
  }

  const headRe = /buy-item-title-small"[^>]*>\s*[ÍI]tem N[ºo°](?:&nbsp;|\s)*(\d+)/gi;
  const heads = [...html.matchAll(headRe)];
  for (let i = 0; i < heads.length; i++) {
    const nro = Number(heads[i]![1]);
    const slice = html.slice(heads[i]!.index!, heads[i + 1]?.index ?? html.length);
    const v = /Variaci[óo]n:\s*<\/li>\s*<li[^>]*>\s*<strong>([\s\S]*?)<\/strong>/i.exec(slice);
    if (v) {
      const variation = decodeEntities(v[1]!);
      if (variation) item(nro).variation = variation;
    }
  }

  return [...byNro.values()].sort((a, b) => a.nro - b.nro);
}

async function fetchPage(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { ...FETCH_OPTS, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/** Scrapes one gov page, following its item paginator (10 items/page). Null = page unreachable. */
async function scrapePage(url: string): Promise<ScrapedItem[] | null> {
  const first = await fetchPage(url);
  if (first === null) return null;

  const items = parseItemFeatures(first);

  const pag = /<div id="pagination">([\s\S]*?)<\/div>/i.exec(first)?.[1] ?? "";
  const hrefs = [...pag.matchAll(/href="([^"]+)"/gi)]
    .map((m) => m[1]!.replace(/&amp;/g, "&"))
    .filter((h) => !/javascript:/i.test(h))
    .slice(0, 9);

  const pages = await Promise.all(hrefs.map((h) => fetchPage(new URL(h, "https://www.comprasestatales.gub.uy").toString())));
  for (const html of pages) {
    if (html) items.push(...parseItemFeatures(html));
  }

  const seen = new Set<number>();
  return items.filter((it) => !seen.has(it.nro) && seen.add(it.nro));
}

export interface ScrapeResult {
  items: ScrapedItem[];
  source: "adjudicacion" | "llamado";
  /** True when a page we needed could not be fetched (network/5xx) — result may be incomplete. */
  transient: boolean;
}

/**
 * Scrape a compra's características, trying the page this release belongs to first. Returns the
 * scraped items (possibly empty) plus a `transient` flag so the caller can decide whether an empty
 * result is trustworthy enough to cache.
 */
export async function scrapeCompraFeatures(ocid: string | null | undefined, hasAward: boolean): Promise<ScrapeResult | null> {
  const urls: Array<{ source: "adjudicacion" | "llamado"; url: string | null }> = hasAward
    ? [
        { source: "adjudicacion", url: adjudicacionUrl(ocid) },
        { source: "llamado", url: llamadoUrl(ocid) },
      ]
    : [
        { source: "llamado", url: llamadoUrl(ocid) },
        { source: "adjudicacion", url: adjudicacionUrl(ocid) },
      ];

  let items: ScrapedItem[] | null = null;
  let source: "adjudicacion" | "llamado" = urls[0]!.source;
  let anyTransient = false;
  for (const u of urls) {
    if (!u.url) continue;
    const scraped = await scrapePage(u.url);
    if (scraped === null) {
      anyTransient = true;
      continue;
    }
    items = scraped;
    source = u.source;
    if (scraped.length) break;
  }

  if (items === null) return null;
  return { items, source, transient: items.length === 0 && anyTransient };
}
