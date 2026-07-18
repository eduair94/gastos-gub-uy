/**
 * Text normalization shared by the open-call projector (building `searchText`)
 * and the watch keyword store + matcher. Both sides MUST normalize identically,
 * or a keyword the user typed with accents/case would never match the call text.
 *
 * Normalization: lowercase, strip diacritics (NFD + combining-mark removal),
 * collapse whitespace, trim.
 */
const COMBINING_MARKS = /[̀-ͯ]/g;

export function normalizeText(input: string | null | undefined): string {
  if (!input) return "";
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** A single keyword/phrase normalized for storage and comparison. */
export function normalizeKeyword(input: string | null | undefined): string {
  return normalizeText(input);
}

/** Word tokens of a normalized string (alphanumeric runs). */
export function tokenize(input: string | null | undefined): string[] {
  return normalizeText(input)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/**
 * True when `phrase` occurs in `haystack` after normalization. A multi-word
 * phrase matches as a normalized substring; a single token matches on word
 * boundaries so "tv" does not hit "atv".
 */
export function phraseMatches(haystack: string, phrase: string): boolean {
  const h = normalizeText(haystack);
  const p = normalizeKeyword(phrase);
  if (!p) return false;
  if (p.includes(" ")) return h.includes(p);
  // Single token: word-boundary match against the normalized haystack.
  return new RegExp(`(^|[^a-z0-9])${escapeRegExp(p)}([^a-z0-9]|$)`).test(h);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
