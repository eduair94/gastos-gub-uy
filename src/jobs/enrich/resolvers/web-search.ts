// src/jobs/enrich/resolvers/web-search.ts
import type { ContactResolver, ResolverInput, ResolverResult, ContactCandidate } from "../types";
import { extractEmailsFromHtml } from "./website";

export interface SearchHit { url: string; title: string; snippet: string }
export interface WebSearchDeps {
  search: (query: string) => Promise<SearchHit[]>;
  fetchHtml: (url: string) => Promise<string | null>;
}

const CAP = 0.5;

export function createWebSearchResolver(deps: WebSearchDeps): ContactResolver {
  return {
    name: "webSearch",
    async resolve(input: ResolverInput): Promise<ResolverResult> {
      const query = `${input.name} ${input.rut} uruguay contacto email`;
      const hits = await deps.search(query).catch(() => []);
      const seen = new Map<string, ContactCandidate>();
      let website: string | null = null;
      for (const hit of hits.slice(0, 3)) {
        // emails may already be in the snippet
        for (const c of extractEmailsFromHtml(hit.snippet, hostOf(hit.url))) add(seen, c);
        const html = await deps.fetchHtml(hit.url).catch(() => null);
        if (html) {
          if (!website) website = hit.url;
          for (const c of extractEmailsFromHtml(html, hostOf(hit.url))) add(seen, c);
        }
      }
      // Rebrand every candidate as webSearch + cap confidence (unverified origin).
      const emails: ContactCandidate[] = [...seen.values()].map(c => ({
        email: c.email, source: "webSearch", confidence: Math.min(c.confidence, CAP),
      }));
      return { emails, website };
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
