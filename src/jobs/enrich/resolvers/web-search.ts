// src/jobs/enrich/resolvers/web-search.ts
import type { ContactResolver, ResolverInput, ResolverResult, ContactCandidate } from "../types";
import { domainOf, isJunkEmail, isRoleAccount, normalizeEmail } from "../hygiene";
import { extractEmailsFromHtml } from "./website";

export interface SearchHit { url: string; title: string; snippet: string }
export interface WebSearchDeps {
  search: (query: string) => Promise<SearchHit[]>;
  fetchHtml: (url: string) => Promise<string | null>;
  /**
   * Optional: verify which hit is really the supplier's own site (see
   * website-verify.ts). When provided, the returned `website` is whatever it
   * confirms over ALL hits (or null) — never the naive "first hit that loaded".
   * Absent → the legacy behaviour is kept for backward compatibility.
   */
  verifyWebsite?: (input: { name: string; rut: string }, hits: SearchHit[]) => Promise<string | null>;
}

const CAP = 0.5;
const SUPPLEMENTAL_CAP = 0.25;

export function createWebSearchResolver(deps: WebSearchDeps): ContactResolver {
  return {
    name: "webSearch",
    async resolve(input: ResolverInput): Promise<ResolverResult> {
      const query = `${input.name} ${input.rut} uruguay contacto email`;
      const hits = await deps.search(query).catch(() => []);
      const seenByHost = new Map<string, Map<string, ContactCandidate>>();
      const supplementalHosts = new Set<string>();
      // Legacy fallback website: first hit whose page loaded. Only used when no
      // verifier is injected (see WebSearchDeps.verifyWebsite).
      let firstLoaded: string | null = null;
      for (const hit of hits.slice(0, 3)) {
        const host = hostOf(hit.url);
        if (isUruguayEvidenceHit(input, hit)) supplementalHosts.add(host);
        const seen = seenByHost.get(host) ?? new Map<string, ContactCandidate>();
        seenByHost.set(host, seen);
        // emails may already be in the snippet
        for (const c of extractEmailsFromHtml(hit.snippet, host, hit.url)) add(seen, c);
        const html = await deps.fetchHtml(hit.url).catch(() => null);
        if (html) {
          if (!firstLoaded) firstLoaded = hit.url;
          for (const c of extractEmailsFromHtml(html, host, hit.url)) add(seen, c);
        }
      }
      // Verified discovery (preferred) confirms the domain belongs to the supplier
      // over ALL hits; without a verifier, fall back to the first hit that loaded.
      // A verified site carries `websiteSource: "webSearch"` so the orchestrator can
      // rank it above a stale, unverified seed; the unverified fallback carries none.
      const verified = deps.verifyWebsite
        ? await deps.verifyWebsite({ name: input.name, rut: input.rut }, hits).catch(() => null)
        : null;
      const selected = new Map<string, ContactCandidate>();
      const officialHost = verified ? hostOf(verified) : null;
      if (!deps.verifyWebsite) {
        for (const candidate of mergeSeen(seenByHost.values()).values()) {
          add(selected, asWebSearch(candidate, CAP));
        }
      } else {
        // Corporate-site emails remain the strongest web-search evidence.
        for (const candidate of seenByHost.get(officialHost ?? "")?.values() ?? []) {
          add(selected, asWebSearch(candidate, CAP));
        }
        // A third-party listing may expose a real person-level contact (the
        // Entre Lagos / Mariano Yabran case). Preserve it as low-confidence,
        // source-linked evidence, while rejecting role accounts, junk, and an
        // email belonging to the directory host itself.
        for (const [host, group] of seenByHost) {
          if (host === officialHost) continue;
          if (!supplementalHosts.has(host)) continue;
          for (const candidate of group.values()) {
            if (!isSupplementalContact(candidate, host)) continue;
            add(selected, asWebSearch(candidate, SUPPLEMENTAL_CAP));
          }
        }
      }
      const emails = [...selected.values()];
      if (verified) return { emails, website: verified, websiteSource: "webSearch" };
      if (!deps.verifyWebsite && firstLoaded) return { emails, website: firstLoaded };
      return { emails, website: null };
    },
  };
}

/**
 * Person-level addresses from third-party listings need a country anchor. A
 * company name alone is insufficient because common names (for example
 * "Entre Lagos") produce homonyms throughout Latin America. Uruguay-hosted
 * listings are eligible; a non-UY page must explicitly mention Uruguay or the
 * supplier's full RUT in its search evidence.
 */
function isUruguayEvidenceHit(input: ResolverInput, hit: SearchHit): boolean {
  const host = hostOf(hit.url);
  if (host === "uy" || host.endsWith(".uy") || host.startsWith("uy.")) return true;
  const evidence = `${hit.title} ${hit.snippet} ${hit.url}`;
  if (/\buruguay\b/i.test(evidence)) return true;
  const rut = input.rut.replace(/\D/g, "");
  return rut.length >= 8 && evidence.replace(/\D/g, "").includes(rut);
}

function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./i, "").toLowerCase(); } catch { return ""; }
}
function asWebSearch(candidate: ContactCandidate, cap: number): ContactCandidate {
  return {
    email: candidate.email,
    source: "webSearch",
    confidence: Math.min(candidate.confidence, cap),
    sourceUrl: candidate.sourceUrl ?? null,
  };
}
function isSupplementalContact(candidate: ContactCandidate, listingHost: string): boolean {
  const email = normalizeEmail(candidate.email);
  if (!email || isJunkEmail(email) || isRoleAccount(email)) return false;
  const emailHost = domainOf(email).replace(/^www\./i, "").toLowerCase();
  return emailHost !== listingHost && !!candidate.sourceUrl;
}
function add(map: Map<string, ContactCandidate>, c: ContactCandidate) {
  const prev = map.get(c.email);
  if (!prev || c.confidence > prev.confidence) map.set(c.email, c);
}
function mergeSeen(groups: Iterable<Map<string, ContactCandidate>>): Map<string, ContactCandidate> {
  const merged = new Map<string, ContactCandidate>();
  for (const group of groups) for (const candidate of group.values()) add(merged, candidate);
  return merged;
}
