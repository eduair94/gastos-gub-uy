/**
 * OCID → id_compra helpers, shared by the cron jobs (src/) and any server code.
 *
 * The government's `id_compra` is the ocid with its `ocds-<prefix>-` stripped.
 * DERIVE the source link from `ocid`, NEVER from a release `id`: ids diverge
 * from the compra on aclaración/ajuste records and would link to an unrelated
 * contract (see app/DESIGN.md + app/server/utils/query.ts for the verified case).
 */

/** The government's `id_compra`: the ocid with its `ocds-<prefix>-` stripped. */
export function compraIdFromOcid(ocid?: string | null): string | null {
  if (!ocid || typeof ocid !== "string") return null;
  const m = /^ocds-[a-z0-9]+-(.+)$/i.exec(ocid.trim());
  const id = (m?.[1] ?? "").trim();
  return id || null;
}

/** The public "mostrar-llamado" page for a call — what a reader can open. */
export function sourceUrl(ocid?: string | null): string | null {
  const compraId = compraIdFromOcid(ocid);
  if (!compraId) return null;
  return `https://www.comprasestatales.gub.uy/consultas/detalle/mostrar-llamado/1/id/${encodeURIComponent(compraId)}`;
}

/** The award-detail page (distinct from the tender/call page). */
export function awardUrl(ocid?: string | null): string | null {
  const compraId = compraIdFromOcid(ocid);
  if (!compraId) return null;
  return `https://www.comprasestatales.gub.uy/consultas/detalle/id/${encodeURIComponent(compraId)}`;
}

/** Raw OCDS record (all releases for a compra, merged) — used as the sync fallback. */
export function ocdsRecordUrl(compraId: string): string {
  return `https://www.comprasestatales.gub.uy/ocds/record/${encodeURIComponent(compraId)}`;
}
