/**
 * Deterministic signature of a call's pliego PDFs. Pliegos can be MODIFIED after
 * publication (an aclaración/ajuste adds or replaces a pliego document), which
 * makes a cached AI summary stale. The projection writes this signature every
 * sync; the summary stores the signature it was built from; a mismatch means the
 * pliego changed and the summary must be regenerated.
 *
 * Signature = sorted `url@datePublished` of every PDF document, hashed to a short
 * stable string. URL-set changes catch added/removed pliegos; the datePublished
 * suffix catches a same-URL document that was re-issued.
 */
import { isPdfDocument } from "../services/pliego-extractor";

interface DocLike {
  url?: string | undefined;
  format?: string | undefined;
  datePublished?: Date | string | undefined;
}

/** FNV-1a 32-bit — tiny, dependency-free, stable across processes. */
function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** Empty string when there are no PDF documents (so "no pliego" is its own value). */
export function pliegoDocsSignature(documents: DocLike[] | undefined): string {
  const parts = (documents ?? [])
    .filter((d) => isPdfDocument(d))
    .map((d) => {
      const url = (d.url ?? "").trim();
      const dp = d.datePublished ? new Date(d.datePublished).toISOString() : "";
      return `${url}@${dp}`;
    })
    .sort();
  if (!parts.length) return "";
  return fnv1a(parts.join("|"));
}
