// src/jobs/enrich/backends.ts
import axios from "axios";
import type { SearchHit } from "./resolvers/web-search";

const UA = "gastos-gub-enrichment/1.0 (+https://gastos-gub.uy)";

export async function fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await axios.get<string>(url, {
      timeout: 12000, maxRedirects: 3, responseType: "text",
      headers: { "User-Agent": UA, "Accept-Language": "es-UY,es;q=0.9" },
      validateStatus: s => s >= 200 && s < 400,
    });
    return typeof res.data === "string" ? res.data : String(res.data);
  } catch { return null; }
}

// DuckDuckGo HTML endpoint — no key, returns anchors + snippets. Swap for a SERP
// API later without touching the resolver (it only depends on the SearchHit shape).
export async function search(query: string): Promise<SearchHit[]> {
  const html = await fetchHtml(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`);
  if (!html) return [];
  const hits: SearchHit[] = [];
  const re = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>(.*?)<\/a>/gis;
  for (const m of html.matchAll(re)) {
    hits.push({ url: decodeDdg(m[1]), title: strip(m[2]), snippet: strip(m[2]) });
    if (hits.length >= 5) break;
  }
  return hits;
}

// impo gazette search → return the result page HTML blob(s) for regex scanning.
export async function searchGazette(query: string): Promise<string[]> {
  const html = await fetchHtml(`https://www.impo.com.uy/diariooficial/?buscar=${encodeURIComponent(query)}`);
  return html ? [html] : [];
}

function strip(s: string): string { return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(); }
function decodeDdg(href: string): string {
  const m = href.match(/uddg=([^&]+)/);
  return m ? decodeURIComponent(m[1]) : href;
}
