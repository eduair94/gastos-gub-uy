// src/jobs/enrich/resolvers/website.ts
import type { ContactResolver, ResolverInput, ResolverResult, ContactCandidate } from "../types";

// Emails embedded in HTML text or mailto: hrefs. Excludes image-suffix false positives.
const RAW_EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const IMG_SUFFIX = /\.(png|jpe?g|gif|webp|svg)$/i;

export function registrableDomain(host: string): string {
  return host.replace(/^www\./, "").toLowerCase();
}

export function extractEmailsFromHtml(html: string, siteDomain: string): ContactCandidate[] {
  const found = new Map<string, number>();
  const site = registrableDomain(siteDomain);
  for (const m of html.matchAll(RAW_EMAIL_RE)) {
    const raw = m[0];
    if (IMG_SUFFIX.test(raw)) continue;
    const email = raw.toLowerCase();
    const dom = email.slice(email.lastIndexOf("@") + 1);
    // same-domain → 0.75, off-domain (gmail etc.) → 0.45
    const conf = registrableDomain(dom) === site ? 0.75 : 0.45;
    found.set(email, Math.max(found.get(email) ?? 0, conf));
  }
  return [...found].map(([email, confidence]) => ({ email, source: "website" as const, confidence }));
}

const CONTACT_PATHS = ["", "/contacto", "/contact", "/contactenos", "/contacto-2", "/nosotros"];

export function createWebsiteResolver(
  fetchHtml: (url: string) => Promise<string | null>,
): ContactResolver {
  return {
    name: "website",
    async resolve(input: ResolverInput): Promise<ResolverResult> {
      if (!input.website) return { emails: [] };
      let base: URL;
      try { base = new URL(input.website); } catch { return { emails: [] }; }
      const siteDomain = base.hostname;
      const seen = new Map<string, ContactCandidate>();
      for (let i = 0; i < CONTACT_PATHS.length; i++) {
        const url = new URL(CONTACT_PATHS[i], base.origin).toString();
        const html = await fetchHtml(url).catch(() => null);
        if (!html) continue;
        for (const c of extractEmailsFromHtml(html, siteDomain)) {
          const prev = seen.get(c.email);
          if (!prev || c.confidence > prev.confidence) seen.set(c.email, c);
        }
        // Always try at least home ("") + the first contact path before short-circuiting,
        // since the home page alone often already carries a same-domain (0.75) match.
        if (i >= 1 && [...seen.values()].some(c => c.confidence >= 0.75)) break; // enough signal
      }
      return { emails: [...seen.values()], website: input.website };
    },
  };
}
