// src/jobs/enrich/website-verify.ts
//
// Decide whether a search hit is really the supplier's OWN website, before it is
// stored as `supplier_contacts.website`. The webSearch resolver used to take "the
// first hit whose page loads" — good enough to sometimes find the site, useless at
// keeping out directories, competitors and namesakes ("Innovaluy SRL" → an Italian
// furniture maker on innovaluy.it).
//
// Same shape as the Google Maps verification (match-score prefilter → Gemini judge
// on the ambiguous band, fails CLOSED), with two website-specific twists:
//   - aggregators/socials/marketplaces are never a company's own site → hard-dropped;
//   - a name token carried in a `.uy` domain is such a strong ownership signal that
//     it is auto-accepted without spending a judge call. Everything else — foreign
//     TLDs, generic .com, title-only matches — goes to the judge, because a name
//     score alone cannot tell a company from its foreign namesake.

import type { SearchHit } from "./resolvers/web-search";
import type { JudgeFn, MatchPair, MatchVerdict } from "./match-judge";
import type { WebsiteSource } from "../../../shared/models/supplier_contacts";
import { scoreMatch, contentTokens, LOW_SCORE } from "./match-score";
import { callGeminiStructured, type GeminiSchema } from "../ai/gemini-client";

/**
 * Trust ranking of a website's provenance — higher wins when the orchestrator
 * reconciles the website across resolvers and against a previously-stored one.
 * An official registry site (dei/rupe) beats a crawl4ai-verified one, which beats
 * a ToS-restricted Places site, which beats an unverified/unknown seed. This is
 * what lets a verified domain OVERRIDE the stale, unverified first-hit URL an
 * earlier run may have stored.
 */
export function websiteSourceRank(src: WebsiteSource | null | undefined): number {
  switch (src) {
    case "dei": return 4;
    case "rupe": return 3;
    case "webSearch": return 2;
    case "googleMaps": return 1;
    default: return 0; // unverified / unknown
  }
}

/** Registrable-domain suffixes that are never a supplier's own site. */
const AGGREGATOR_SUFFIXES = [
  // social
  "facebook.com", "instagram.com", "linkedin.com", "twitter.com", "x.com",
  "youtube.com", "tiktok.com", "wa.me", "whatsapp.com",
  // marketplaces / reviews / maps
  "mercadolibre.com.uy", "mercadolibre.com", "mercadolibre.com.ar",
  "yelp.com", "foursquare.com", "amazon.com", "booking.com", "tripadvisor.com",
  // business directories
  "paginasamarillas.com.uy", "paginasamarillas.com", "guiaempresas.com",
  "guialocal.com.uy", "cybo.com", "opendi.uy", "somosuruguay.com.uy",
  "empresite.com", "einforma.com", "dateas.com", "infoempresas.com.uy",
  // contact-data brokers (list a supplier, are not its site)
  "contactout.com", "rocketreach.co", "zoominfo.com", "apollo.io",
  "signalhire.com", "lusha.com", "leadiq.com", "kaspr.io",
  // company-info / financial / trade-data directories (a PROFILE of the firm, not its site)
  "dnb.com", "emis.com", "bloomberg.com", "crunchbase.com", "opencorporates.com",
  "kompass.com", "europages.com", "companywall.com.uy", "expouy.com", "guiauruguay.com.uy",
  "veritradecorp.com", "importgenius.com", "panjiva.com", "seair.co.in", "tradeindia.com",
  "exportgenius.in", "volza.com", "connect2india.com", "zauba.com", "infobel.com",
  // encyclopedias / search / jobs
  "wikipedia.org", "google.com", "bing.com",
  "computrabajo.com.uy", "buscojobs.com.uy",
];

// Path shapes that mark a THIRD-PARTY listing even on an otherwise-legit domain
// (e.g. uruguayxxi.gub.uy is a real gov site, but /en/service-directory/<firm>/ is
// a directory page, not the firm's own site).
const DIRECTORY_PATH_RX = /\/(business-directory|company-profiles?|service-directory|directorio|companies|company_profile|empresa-)/i;

function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./i, "").toLowerCase(); } catch { return ""; }
}

/** True when the host is a social network / marketplace / directory, not a company site. */
export function isAggregatorHost(host: string): boolean {
  const h = host.replace(/^www\./i, "").toLowerCase();
  return AGGREGATOR_SUFFIXES.some((s) => h === s || h.endsWith("." + s));
}

/**
 * True when a URL is a third-party listing rather than the supplier's own site —
 * either the host is a known aggregator/directory, or the PATH is a directory
 * page on an otherwise-legit domain (so a firm's real .gub.uy page passes, but a
 * /service-directory/<firm>/ listing on the same host does not).
 */
export function isDirectoryUrl(url: string): boolean {
  const host = hostOf(url);
  if (!host || isAggregatorHost(host)) return true;
  let path = "";
  try { path = new URL(url).pathname; } catch { return false; }
  return DIRECTORY_PATH_RX.test(path);
}

// Two-level public suffixes seen on Uruguayan domains, stripped to expose the
// company's own label (ancap.com.uy → "ancap", garinohnos.com.uy → "garinohnos").
const TWO_LEVEL_TLD = new Set(["com", "gub", "org", "edu", "net", "co", "gov", "mil", "ltda"]);

/** The concatenated significant label of a domain (no www, no public suffix). */
export function domainLabel(url: string): string {
  const host = hostOf(url);
  if (!host) return "";
  const parts = host.split(".");
  if (parts.length >= 3 && TWO_LEVEL_TLD.has(parts[parts.length - 2]!)) parts.splice(parts.length - 2, 2);
  else if (parts.length >= 2) parts.splice(parts.length - 1, 1);
  return parts.join("");
}

/** True when the host is under `.uy` (any level). */
function isUyDomain(url: string): boolean {
  return /\.uy$/i.test(hostOf(url));
}

/** A supplier name token (>=5 chars) carried inside the domain label. */
function nameTokenInDomain(name: string, label: string, minLen: number): boolean {
  return contentTokens(name).some((t) => t.length >= minLen && label.includes(t));
}

/**
 * Similarity in [0,1] of a hit against the supplier name: the better of the page
 * title match and a domain-containment signal (a distinctive name token embedded
 * in the concatenated domain label, which the space-tokenised title match misses).
 */
export function scoreWebsiteCandidate(name: string, hit: SearchHit): number {
  const titleScore = scoreMatch(name, hit.title);
  const label = domainLabel(hit.url);
  let domScore = 0;
  if (label && nameTokenInDomain(name, label, 5)) domScore = 0.85;
  else if (label && nameTokenInDomain(name, label, 4)) domScore = 0.6;
  return Math.max(titleScore, domScore);
}

/** A name token in a `.uy` domain — a strong enough ownership signal to skip the judge. */
function strongUyOwnership(name: string, url: string): boolean {
  return isUyDomain(url) && nameTokenInDomain(name, domainLabel(url), 5);
}

export interface WebsiteVerifierDeps {
  judge: JudgeFn;
  /** Minimum judge confidence to accept a match. Default 0.5. */
  minConf?: number;
}
export interface VerifyInput { name: string; rut: string }

/**
 * Returns the verified website URL, or null. Fails CLOSED: an unresolved/uncertain
 * candidate is dropped rather than guessed. The judge is only consulted for the
 * plausible band that is not already strong-.uy-owned; aggregators and sub-LOW
 * scores never reach it.
 */
export function createWebsiteVerifier(deps: WebsiteVerifierDeps) {
  const minConf = deps.minConf ?? 0.5;
  return async function verify(input: VerifyInput, hits: SearchHit[]): Promise<string | null> {
    const scored = hits
      .filter((h) => /^https?:\/\//i.test(h.url) && !isDirectoryUrl(h.url))
      .map((h) => ({ h, score: scoreWebsiteCandidate(input.name, h) }))
      .filter((x) => x.score >= LOW_SCORE)
      .sort((a, b) => b.score - a.score);
    if (!scored.length) return null;

    // Strong .uy ownership → accept without a judge call, preferring the CANONICAL
    // domain: the shortest registrable label wins ("tiendainglesa.com.uy" over a
    // "paneltiendainglesa.com.uy" panel/sub-brand that also carries the name), score
    // as the tie-break.
    const strong = scored
      .filter((x) => strongUyOwnership(input.name, x.h.url))
      .sort((a, b) => (domainLabel(a.h.url).length - domainLabel(b.h.url).length) || (b.score - a.score));
    if (strong.length) return strong[0]!.h.url;

    // Otherwise let the judge decide the plausible band (namesakes, generic TLDs).
    const pairs = scored.map((x, i) => ({
      i,
      name: input.name,
      candidate: `${domainLabel(x.h.url)} (${hostOf(x.h.url)}) — ${x.h.title}`,
    }));
    const verdicts = await deps.judge(pairs);
    const accepted = scored
      .map((x, i) => ({ url: x.h.url, v: verdicts.get(i) }))
      .filter((x) => x.v && x.v.match && x.v.conf >= minConf)
      .sort((a, b) => (b.v!.conf) - (a.v!.conf));
    return accepted.length ? accepted[0]!.url : null;
  };
}

// A WEBSITE-SPECIFIC judge (distinct from match-judge's "same company?"). A
// directory/data-broker page IS "about" the firm, so the same-company judge
// waves it through (a live run stored veritradecorp.com for CIRCUITO VIAL). This
// one is told to accept ONLY the company's OWN official domain and reject any
// third-party listing/portal/marketplace/news, so a supplier with no site of its
// own correctly resolves to null rather than a directory. Same JudgeFn shape as
// createGeminiJudge, so createWebsiteVerifier takes either.
const WEBSITE_SYSTEM =
  "Sos un verificador de SITIOS WEB OFICIALES de empresas uruguayas. Te doy la razon social de un " +
  "proveedor del Estado y un CANDIDATO (dominio + titulo de pagina). match=true SOLO si el candidato es el " +
  "sitio web PROPIO y oficial de esa empresa (su dominio corporativo). match=false si es un directorio, " +
  "listado o portal de datos comerciales/aduaneros (dnb, emis, veritradecorp, guias de empresas), una red " +
  "social, un marketplace, una noticia, un organismo distinto, o cualquier pagina de un TERCERO que solo " +
  "menciona a la empresa. Ante la duda, match=false. Un veredicto por item, con su indice i.";

const WEBSITE_SCHEMA: GeminiSchema = {
  type: "OBJECT",
  properties: {
    verdicts: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { i: { type: "INTEGER" }, match: { type: "BOOLEAN" }, conf: { type: "NUMBER" } },
        required: ["i", "match", "conf"],
      },
    },
  },
  required: ["verdicts"],
};

export interface WebsiteJudgeDeps {
  apiKey: string;
  model?: string;
  call?: typeof callGeminiStructured;
  batchSize?: number;
}

/** Build a website-ownership judge bound to a Gemini key. Empty input → empty map (no call). */
export function createWebsiteJudge(deps: WebsiteJudgeDeps): JudgeFn {
  const model = deps.model ?? "gemini-2.5-flash-lite";
  const call = deps.call ?? callGeminiStructured;
  const batchSize = deps.batchSize ?? 25;
  return async (pairs: MatchPair[]): Promise<Map<number, MatchVerdict>> => {
    const out = new Map<number, MatchVerdict>();
    if (!pairs.length) return out;
    for (let i = 0; i < pairs.length; i += batchSize) {
      const group = pairs.slice(i, i + batchSize);
      const prompt = group.map((p) => `${p.i}. razon_social="${p.name}" | candidato="${p.candidate}"`).join("\n");
      try {
        const res = await call<{ verdicts: MatchVerdict[] }>({
          apiKey: deps.apiKey, model, systemInstruction: WEBSITE_SYSTEM, prompt, schema: WEBSITE_SCHEMA, temperature: 0,
        });
        for (const v of res.data?.verdicts ?? []) {
          if (typeof v?.i === "number") out.set(v.i, { i: v.i, match: !!v.match, conf: Number(v.conf) || 0 });
        }
      } catch {
        // Judge failure must not accept a match — leave unresolved (absent = not confirmed).
      }
    }
    return out;
  };
}
