// src/jobs/enrich/resolvers/website.ts
import type { ContactResolver, ResolverInput, ResolverResult, ContactCandidate, PhoneCandidate } from "../types";
import { RAW_EMAIL_RE } from "../email-regex";
import { extractWebsiteContactDetails } from "../website-contact-details";
import type { ISocialLink } from "../../../../shared/models/supplier_contacts";

// Emails embedded in HTML text or mailto: hrefs. Excludes image-suffix false positives.
const IMG_SUFFIX = /\.(png|jpe?g|gif|webp|svg)$/i;

export function registrableDomain(host: string): string {
  return host.replace(/^www\./, "").toLowerCase();
}

export function extractEmailsFromHtml(html: string, siteDomain: string, sourceUrl: string | null = null): ContactCandidate[] {
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
  return [...found].map(([email, confidence]) => ({
    email, source: "website" as const, confidence, sourceUrl,
  }));
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
      const phones = new Map<string, PhoneCandidate>();
      const socials = new Map<string, ISocialLink>();
      let websitePhone: string | null = null;
      let websiteAddress: string | null = null;
      let contactFormUrl: string | null = null;
      for (let i = 0; i < CONTACT_PATHS.length; i++) {
        const url = new URL(CONTACT_PATHS[i], base.origin).toString();
        const html = await fetchHtml(url).catch(() => null);
        if (!html) continue;
        for (const c of extractEmailsFromHtml(html, siteDomain, url)) {
          const prev = seen.get(c.email);
          if (!prev || c.confidence > prev.confidence) seen.set(c.email, c);
        }
        const details = extractWebsiteContactDetails(html, url);
        websitePhone ||= details.phone;
        for (const phone of details.phones) {
          const key = `${phone.replace(/\D/g, "") || phone}|${url}`;
          phones.set(key, { phone, source: "website", confidence: 0.8, sourceUrl: url });
        }
        websiteAddress ||= details.address;
        contactFormUrl ||= details.contactFormUrl;
        for (const social of details.socialLinks) socials.set(social.url, social);
        // Always try at least home ("") + the first contact path before short-circuiting,
        // since the home page alone often already carries a same-domain (0.75) match.
        if (i >= 1 && [...seen.values()].some(c => c.confidence >= 0.75)) break; // enough signal
      }
      return {
        emails: [...seen.values()], website: input.website,
        phone: websitePhone, phoneSource: websitePhone ? "website" : null,
        phones: [...phones.values()],
        websitePhone, websiteAddress, contactFormUrl, socialLinks: [...socials.values()],
      };
    },
  };
}
