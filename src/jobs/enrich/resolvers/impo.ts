// src/jobs/enrich/resolvers/impo.ts
import type { ContactResolver, ResolverInput, ResolverResult, ContactCandidate } from "../types";

const RAW_EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

/**
 * impo.com.uy is the Diario Oficial: company legal notices occasionally embed a
 * contact email in free text. Low yield + noisy, so confidence is 0.3 and this
 * is never the backbone. searchGazette is injected (the concrete impo query is
 * wired in Task 8) so the parser stays unit-testable.
 */
export function createImpoResolver(
  searchGazette: (query: string) => Promise<string[]>,
): ContactResolver {
  return {
    name: "impo",
    async resolve(input: ResolverInput): Promise<ResolverResult> {
      const blobs = await searchGazette(`${input.rut} ${input.name}`).catch(() => []);
      const seen = new Set<string>();
      const emails: ContactCandidate[] = [];
      for (const blob of blobs) {
        for (const m of blob.matchAll(RAW_EMAIL_RE)) {
          const email = m[0].toLowerCase();
          if (seen.has(email)) continue;
          seen.add(email);
          emails.push({ email, source: "impo", confidence: 0.3 });
        }
      }
      return { emails };
    },
  };
}
