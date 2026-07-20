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

/** `ocds-yfs5dr-53193` -> `53193`. */
export function idCompraFromOcid(ocid: string): string | null {
  if (!ocid) return null;
  const stripped = ocid.replace(/^ocds-[a-z0-9]+-/i, "");
  return /^\d+$/.test(stripped) ? stripped : null;
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
