/**
 * Read a purchase's real total off its official comprasestatales page.
 *
 * Ground truth for the lump-sum-in-unit-price correction: the OCDS feed's
 * `unit.value.amount` sometimes holds a contract total, and multiplying it by
 * quantity inflates our stored figure. The government page publishes the actual
 * total, so we take it verbatim rather than trying to infer one.
 *
 * The markup is stable and flat:
 *   <li ...>Monto Total de la Compra:</li><li ...><strong>U$S 4.201,00</strong></li>
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

export function parseOfficialTotal(html: string): OfficialTotal | null {
  const at = html.indexOf(LABEL);
  if (at === -1) return null;
  // The value is the first <strong> after the label.
  const window = html.slice(at, at + 400);
  const strong = /<strong>\s*([^<]+?)\s*<\/strong>/.exec(window);
  if (!strong) return null;
  const text = strong[1]!;
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
