const MARKUP_OR_STYLESHEET = /<[/!a-z][^>]*>|(?:^|\s)(?:@media|@font-face|body\s*\{|html\s*\{|img:[a-z])/i

/**
 * Keep human-readable contact fields bounded and free of scraped markup.
 *
 * Crawl output is untrusted: a historical `websiteAddress` record contained an
 * entire stylesheet, which then reached both the public table and exports.
 * Rejecting instead of truncating ensures a CSS/HTML fragment is never
 * presented as a plausible address or opening-hours value.
 */
export function cleanContactText(value: unknown, maxLength = 240): string | null {
  if (typeof value !== 'string') return null
  const normalized = value
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!normalized || normalized.length > maxLength || MARKUP_OR_STYLESHEET.test(normalized)) return null
  return normalized
}
