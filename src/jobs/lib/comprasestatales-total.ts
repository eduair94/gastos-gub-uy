/**
 * Read a purchase's real total off its official comprasestatales page.
 *
 * Ground truth for the lump-sum-in-unit-price correction: the OCDS feed's
 * `unit.value.amount` sometimes holds a contract total, and multiplying it by
 * quantity inflates our stored figure. The government page publishes the actual
 * total, so we take it verbatim rather than trying to infer one.
 *
 * The markup is a flat <li> label/value pair, and the value we return is
 * ALWAYS the label's own sibling <li> — never merely "the first <strong>
 * somewhere near the label":
 *   <li ...>Monto Total de la Compra:</li><li ...><strong>U$S 4.201,00</strong></li>
 *
 * That structural binding matters: this parser is the only defense against a
 * wrong number reaching the database as "verified against the official
 * source." A spuriously small parse is the dangerous failure direction (the
 * downstream job corrects when computedTotal/officialTotal >= 5, so a bogus
 * small denominator only makes the gate *more* confident), so on any
 * structural mismatch we return null rather than guess — a skipped, logged
 * purchase is always better than a silently wrong ground truth.
 *
 * (On id 53193 the same page labels 3.316,00 "Precio unitario sin impuestos" for
 * 330.000 units — the very mislabel this job corrects.)
 */

const LABEL = "Monto Total de la Compra";
const BASE = "https://www.comprasestatales.gub.uy/consultas/detalle/id";

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

/** `ocds-yfs5dr-53193` -> `53193`. */
export function idCompraFromOcid(ocid: string): string | null {
  if (!ocid) return null;
  const stripped = ocid.replace(/^ocds-[a-z0-9]+-/i, "");
  return /^\d+$/.test(stripped) ? stripped : null;
}

export function detalleUrl(idCompra: string): string {
  return `${BASE}/${idCompra}`;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Anchored (`^`) against the slice starting at the label: the label's own
// <li> must close, and the very next <li> — whatever its class — must hold
// the <strong> value. Whitespace/newlines between tags are tolerated; the
// exact class attribute is not required (`<li[^>]*>`). No alternative
// occurrence of the label elsewhere in the page can satisfy this pattern
// instead, because the match is anchored to the first `indexOf(LABEL)` hit.
const SIBLING_STRONG = new RegExp(
  `^${escapeRegExp(LABEL)}[^<]*<\\/li>\\s*<li[^>]*>\\s*<strong>\\s*([^<]+?)\\s*<\\/strong>`,
);

export function parseOfficialTotal(html: string): OfficialTotal | null {
  const at = html.indexOf(LABEL);
  if (at === -1) return null;
  // The value must be in the label's own sibling <li> — no other bolded
  // field on the page, however close, is an acceptable substitute.
  const match = SIBLING_STRONG.exec(html.slice(at));
  if (!match) return null;
  const text = match[1]!;
  const amount = parseUyNumber(text);
  if (amount === null) return null;
  const currency = /U\$S/i.test(text) ? "USD" : /€|EUR/i.test(text) ? "EUR" : "UYU";
  return { amount, currency };
}

export async function fetchOfficialTotal(idCompra: string): Promise<OfficialTotal | null> {
  const res = await fetch(detalleUrl(idCompra), {
    headers: { "user-agent": "conlatuya.checkleaked.cc (datos abiertos)" },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`detalle ${idCompra}: HTTP ${res.status}`);
  return parseOfficialTotal(await res.text());
}
