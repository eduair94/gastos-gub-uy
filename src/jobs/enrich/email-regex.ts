// src/jobs/enrich/email-regex.ts
// Shared by resolvers that scrape emails out of free text (HTML bodies, mailto:
// hrefs, gazette blobs). Not anchored — for extraction, not validation; see
// hygiene.ts's normalizeEmail/EMAIL_RE for the strict anchored validator.
export const RAW_EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
