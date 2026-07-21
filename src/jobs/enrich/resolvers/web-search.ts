// src/jobs/enrich/resolvers/web-search.ts
import type { ContactResolver, ResolverInput, ResolverResult, ContactCandidate } from "../types";
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

export function createWebSearchResolver(deps: WebSearchDeps): ContactResolver {
  return {
    name: "webSearch",
    async resolve(input: ResolverInput): Promise<ResolverResult> {
      const query = `${input.name} ${input.rut} uruguay contacto email`;
      const hits = await deps.search(query).catch(() => []);
      const seen = new Map<string, ContactCandidate>();
      // Legacy fallback website: first hit whose page loaded. Only used when no
      // verifier is injected (see WebSearchDeps.verifyWebsite).
      let firstLoaded: string | null = null;
      for (const hit of hits.slice(0, 3)) {
        // emails may already be in the snippet
        for (const c of extractEmailsFromHtml(hit.snippet, hostOf(hit.url))) add(seen, c);
        const html = await deps.fetchHtml(hit.url).catch(() => null);
        if (html) {
          if (!firstLoaded) firstLoaded = hit.url;
          for (const c of extractEmailsFromHtml(html, hostOf(hit.url))) add(seen, c);
        }
      }
      // Verified discovery (preferred) confirms the domain belongs to the supplier
      // over ALL hits; without a verifier, fall back to the first hit that loaded.
      // A verified site carries `websiteSource: "webSearch"` so the orchestrator can
      // rank it above a stale, unverified seed; the unverified fallback carries none.
      const verified = deps.verifyWebsite
        ? await deps.verifyWebsite({ name: input.name, rut: input.rut }, hits).catch(() => null)
        : null;
      // Rebrand every candidate as webSearch + cap confidence (unverified origin).
      const emails: ContactCandidate[] = [...seen.values()].map(c => ({
        email: c.email, source: "webSearch", confidence: Math.min(c.confidence, CAP),
      }));
      if (verified) return { emails, website: verified, websiteSource: "webSearch" };
      if (!deps.verifyWebsite && firstLoaded) return { emails, website: firstLoaded };
      return { emails, website: null };
    },
  };
}

function hostOf(url: string): string {
  try { return new URL(url).hostname; } catch { return ""; }
}
function add(map: Map<string, ContactCandidate>, c: ContactCandidate) {
  const prev = map.get(c.email);
  if (!prev || c.confidence > prev.confidence) map.set(c.email, c);
}
