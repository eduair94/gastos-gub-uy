/**
 * Parse a purchase's official "Monto Total de la Compra" off its
 * comprasestatales detail page.
 *
 * The OCDS feed publishes per-item `unit.value.amount` WITHOUT taxes and no
 * grand total; the government HTML page is the only place the tax-inclusive
 * total ("Monto Total de la Compra") is stated. Two callers need this parser —
 * the offline lump-sum correction job (ground truth for a wrong stored figure)
 * and the contract detail page (showing the tax-inclusive total) — so it lives
 * in `shared/` where both the root jobs and the Nuxt server route can import it.
 *
 * The markup is a flat <li> label/value pair, and the value we return is ALWAYS
 * the label's own sibling <li> — never merely "the first <strong> somewhere near
 * the label":
 *   <li ...>Monto Total de la Compra:</li><li ...><strong>U$S 4.201,00</strong></li>
 *
 * That structural binding matters: for the correction job this parser is the
 * only defense against a wrong number reaching the database as "verified against
 * the official source." On any structural mismatch we return null rather than
 * guess.
 */

const LABEL = "Monto Total de la Compra";

export interface OfficialTotal {
  amount: number;
  currency: string;
}

/** `4.201,00` -> 4201. Dot groups thousands, comma is the decimal separator. */
export function parseUyNumber(raw: string): number | null {
  if (!raw) return null;
  const digits = raw.replace(/[^0-9.,]/g, "");
  if (!/[0-9]/.test(digits)) return null;
  const normalised = digits.replace(/\./g, "").replace(",", ".");
  const n = Number(normalised);
  return Number.isFinite(n) ? n : null;
}

/** The currency a gov-printed amount is in: `$` -> UYU, `U$S` -> USD, `€`/`EUR` -> EUR. */
export function parseUyCurrency(text: string): string {
  return /U\$S/i.test(text) ? "USD" : /€|EUR/i.test(text) ? "EUR" : "UYU";
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Extract the value of a flat `<li>label:</li><li><strong>value</strong></li>`
 * pair, anchored to the label so no other bolded field on the page can stand in.
 * Returns the raw inner text (still needs parseUyNumber), or null on any
 * structural mismatch. The label may end with an optional `:`.
 */
export function siblingStrongValue(html: string, label: string): string | null {
  const at = html.indexOf(label);
  if (at === -1) return null;
  const re = new RegExp(
    `^${escapeRegExp(label)}[^<]*<\\/li>\\s*<li[^>]*>\\s*<strong>\\s*([^<]+?)\\s*<\\/strong>`,
  );
  const match = re.exec(html.slice(at));
  return match ? match[1]! : null;
}

export function parseOfficialTotal(html: string): OfficialTotal | null {
  const text = siblingStrongValue(html, LABEL);
  if (text === null) return null;
  const amount = parseUyNumber(text);
  if (amount === null) return null;
  return { amount, currency: parseUyCurrency(text) };
}
