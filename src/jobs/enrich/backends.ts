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

// --- Google Maps proxy (findPlaceFromText + placeDetails) ----------------------
// A keyless GET façade over Google Maps Platform. Base URL is overridable so the
// host can move without touching the resolver; defaults to the shared proxy.
const MAPS_PROXY = process.env.MAPS_PROXY_URL || "https://google-maps-proxy.checkleaked.cc";
// Location bias rectangle covering Uruguay (sw|ne), so candidates skew local.
const UY_BIAS = "rectangle:-35.1,-58.5|-30.0,-53.0";

export interface PlaceCandidate { placeId: string; name: string; address: string }
export interface PlaceDetails {
  name?: string;
  phone?: string | null;
  website?: string | null;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  hours?: string | null;
  mapsUrl?: string | null;
}

/** Text → candidate places. Returns [] on any failure (same swallow contract as fetchHtml). */
export async function findPlace(query: string): Promise<PlaceCandidate[]> {
  try {
    const res = await axios.get(`${MAPS_PROXY}/findPlaceFromText`, {
      timeout: 15000,
      headers: { "User-Agent": UA },
      params: {
        input: query, inputtype: "textquery",
        fields: "place_id,name,formatted_address,business_status",
        locationbias: UY_BIAS, language: "es",
      },
    });
    const cands = (res.data?.candidates ?? []) as any[];
    return cands
      .map(c => ({ placeId: String(c.place_id ?? ""), name: String(c.name ?? ""), address: String(c.formatted_address ?? "") }))
      .filter(c => c.placeId);
  } catch { return []; }
}

export interface GeocodeResult {
  /** Google status: OK | ZERO_RESULTS | … (present even when results are empty). */
  status: string;
  lat: number | null;
  lng: number | null;
  placeId: string | null;
  /** location_type: ROOFTOP > RANGE_INTERPOLATED > GEOMETRIC_CENTER > APPROXIMATE. */
  confidence: string | null;
  formattedAddress: string | null;
  /** Two-letter country of the top result (used to reject out-of-country hits). */
  countryCode: string | null;
}

/**
 * Address → coordinates via the proxy's Google Geocoding façade. Unlike
 * findPlaceFromText (business search), this resolves a KNOWN address to a point —
 * the right primitive for RUPE's verified fiscal addresses. Returns a result with
 * `status:"ERROR"` (never throws) on transport failure so the caller can record it.
 */
export async function geocode(address: string): Promise<GeocodeResult> {
  const empty = (status: string): GeocodeResult =>
    ({ status, lat: null, lng: null, placeId: null, confidence: null, formattedAddress: null, countryCode: null });
  try {
    const res = await axios.get(`${MAPS_PROXY}/geocode`, {
      timeout: 15000,
      headers: { "User-Agent": UA },
      params: { address, language: "es", region: "uy" },
    });
    const status = String(res.data?.status ?? "UNKNOWN");
    const r = (res.data?.results ?? [])[0];
    if (!r) return empty(status);
    const comps = (r.address_components ?? []) as Array<{ short_name?: string; types?: string[] }>;
    const country = comps.find((c) => (c.types ?? []).includes("country"));
    return {
      status,
      lat: r.geometry?.location?.lat ?? null,
      lng: r.geometry?.location?.lng ?? null,
      placeId: r.place_id ? String(r.place_id) : null,
      confidence: r.geometry?.location_type ? String(r.geometry.location_type) : null,
      formattedAddress: r.formatted_address ? String(r.formatted_address) : null,
      countryCode: country?.short_name ? String(country.short_name) : null,
    };
  } catch { return empty("ERROR"); }
}

/** place_id → full knowledge-panel details. Returns null on any failure. */
export async function placeDetails(placeId: string): Promise<PlaceDetails | null> {
  try {
    const res = await axios.get(`${MAPS_PROXY}/placeDetails`, {
      timeout: 15000,
      headers: { "User-Agent": UA },
      params: {
        place_id: placeId, language: "es",
        fields: "name,formatted_address,international_phone_number,formatted_phone_number,website,url,opening_hours,geometry",
      },
    });
    const r = res.data?.result;
    if (!r) return null;
    return {
      name: r.name,
      phone: r.international_phone_number || r.formatted_phone_number || null,
      website: r.website || null,
      address: r.formatted_address || null,
      lat: r.geometry?.location?.lat ?? null,
      lng: r.geometry?.location?.lng ?? null,
      hours: Array.isArray(r.opening_hours?.weekday_text) ? r.opening_hours.weekday_text.join(" | ") : null,
      mapsUrl: r.url || null,
    };
  } catch { return null; }
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
