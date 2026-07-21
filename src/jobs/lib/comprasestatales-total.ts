/**
 * Fetch a purchase's official total off its comprasestatales page.
 *
 * The pure parser (`parseOfficialTotal`, `parseUyNumber`) now lives in
 * `shared/utils/comprasestatales-total.ts` so the Nuxt contract page can share
 * it — see that file's header for the structural-binding rationale. This module
 * keeps the network fetch and the id/url helpers the offline correction job
 * uses, re-exporting the parser so existing importers are unaffected.
 *
 * (On id 53193 the same page labels 3.316,00 "Precio unitario sin impuestos" for
 * 330.000 units — the very mislabel the correction job fixes.)
 */

import { parseOfficialTotal, parseUyNumber, type OfficialTotal } from "../../../shared/utils/comprasestatales-total";

export { parseOfficialTotal, parseUyNumber, type OfficialTotal };

const BASE = "https://www.comprasestatales.gub.uy/consultas/detalle/id";

/**
 * `ocds-yfs5dr-53193` -> `53193`, `ocds-yfs5dr-a6005` -> `a6005`.
 *
 * The tail is used verbatim as the `/consultas/detalle/id/<tail>` path segment.
 * Older records (mostly pre-2010) carry an alphanumeric purchase id — `a6005`,
 * `a27187`, `i292944` — and those pages resolve on the government site exactly
 * like the numeric ones, so the tail is NOT required to be all digits. The only
 * requirement is that the string actually had the canonical `ocds-<pub>-<tail>`
 * shape with a non-empty alphanumeric tail; anything else (no prefix, empty or
 * hyphenated tail) yields null. A tail that looks valid but points at nothing is
 * still safe: fetchOfficialTotal's parser returns null on any page without the
 * exact "Monto Total de la Compra" sibling-<li>, so a bad id is skipped, never
 * guessed at.
 */
export function idCompraFromOcid(ocid: string): string | null {
  const m = /^ocds-[a-z0-9]+-([a-z0-9]+)$/i.exec(ocid ?? "");
  return m ? m[1]! : null;
}

export function detalleUrl(idCompra: string): string {
  return `${BASE}/${idCompra}`;
}

export async function fetchOfficialTotal(idCompra: string): Promise<OfficialTotal | null> {
  const res = await fetch(detalleUrl(idCompra), {
    headers: { "user-agent": "conlatuya.checkleaked.cc (datos abiertos)" },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`detalle ${idCompra}: HTTP ${res.status}`);
  return parseOfficialTotal(await res.text());
}
