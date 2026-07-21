/**
 * Fills a systemic gap in the OCDS feed: `awards[].documents` never carries the
 * "reiteración del gasto" resolution (TOCAF art. 114 — an expense the Tribunal de
 * Cuentas observed and the buyer reiterated), even when the human-facing detail
 * page links a real .doc. Confirmed on compra 1331990: the feed's only award
 * document is the awardNotice (acta_1331990.doc), yet
 * https://www.comprasestatales.gub.uy/Resoluciones/reiter_1331990.doc is a live
 * 30KB Word doc sitting right next to it — same folder, same government-assigned
 * numeric id, different prefix.
 *
 * The government later migrated resolution exports from Word to PDF, so the file
 * may be `.doc` OR `.pdf` depending on the compra's vintage (e.g. compra 1332455
 * publishes reiter_1332455.pdf, not .doc). The probe derives the right extension
 * from the acta's own URL — the acta and reiteración are exported together and
 * share it — and falls back to trying both. See reiteracionUrl / actaExtension.
 *
 * Same gap class as the open-calls pliego probe (src/jobs/open-calls/pliego-probe.ts):
 * a deterministic sibling URL, HEAD-probed and synthesized into the document the
 * feed should have provided. The reiteración is not universal — only compras where
 * an expense was observed and reiterated have one — so most probes are a 404 miss,
 * which is why this only fires for releases whose feed *did* carry an awardNotice
 * (the resolution acta), the one reliable signal that a resolution file exists at
 * this compraId at all.
 */
import type { IAward, IAwardDocument } from "../../../shared/types/database";
import { ReleaseModel } from "../../../shared/models/release";
import { compraIdFromOcid } from "../../../shared/utils/ocid";
import { mapLimit } from "../open-calls/pliego-probe";

const RESOLUCIONES_BASE = "https://www.comprasestatales.gub.uy/Resoluciones";
const REITERACION_DOC_TYPE = "reiteracionGasto";

/**
 * Extensions the government serves resolution files under. The site migrated its
 * resolution export from Word to PDF at some point, so BOTH exist in the wild:
 * older compras publish `reiter_{id}.doc`, newer ones `reiter_{id}.pdf` (compra
 * 1332455). PDF is listed first because it is the current default.
 */
const REITERACION_EXTENSIONS = ["pdf", "doc"] as const;

/**
 * Deterministic public URL of a compra's "reiteración del gasto" resolution for
 * a given file extension.
 *
 * Casing matters, same trap as the pliego probe: the capital `/Resoluciones/`
 * path (what the feed's own awardNotice URL already uses) serves the file; the
 * lowercase `/resoluciones/` path 301-redirects off-site entirely. A missing
 * file 404s to an HTML error page, so a caller must verify the response is not
 * HTML, never trust status 200 alone.
 */
export function reiteracionUrl(compraId: string, ext: string = REITERACION_EXTENSIONS[0]): string {
  return `${RESOLUCIONES_BASE}/reiter_${encodeURIComponent(compraId)}.${ext}`;
}

/**
 * The file extension of the feed's awardNotice (acta) URL. The acta and the
 * reiteración are generated together by the same government export, in the same
 * folder, under the same numeric id — so they share an extension (both `.doc` on
 * compra 1331990, both `.pdf` on 1332455). Deriving the reiteración extension
 * from the acta keeps the probe a single HEAD in the common case instead of
 * trying every extension. Returns null when it can't be read (→ probe them all).
 */
function actaExtension(awards: IAward[] | undefined): string | null {
  for (const award of awards ?? []) {
    const notice = award.documents?.find((d) => d.documentType === "awardNotice");
    const m = notice?.url ? /\.([a-z0-9]{2,5})(?:$|[?#])/i.exec(notice.url) : null;
    if (m) return m[1].toLowerCase();
  }
  return null;
}

/**
 * HEAD-probes the deterministic reiteración URL. Returns a synthesized award
 * document when it resolves to a real file, else null. HEAD only — nothing is
 * downloaded here, matching the pliego probe's pattern.
 *
 * `preferExt` is the acta's extension (see actaExtension): when known we probe
 * exactly that one, since the reiteración mirrors it — one request, so the
 * dominant "no reiteración exists" case stays a single HEAD. When it's unknown
 * we fall back to trying every known extension in turn.
 */
export async function probeReiteracionDoc(
  compraId: string,
  preferExt?: string | null,
  timeoutMs = 12_000,
): Promise<IAwardDocument | null> {
  const extensions = preferExt ? [preferExt] : [...REITERACION_EXTENSIONS];
  for (const ext of extensions) {
    const url = reiteracionUrl(compraId, ext);
    try {
      const res = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(timeoutMs) });
      if (!res.ok) continue;
      const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
      if (!contentType || contentType.includes("html")) continue; // 404/301 land on text/html
      const lastModified = res.headers.get("last-modified");
      return {
        id: `reiter-${compraId}`,
        documentType: REITERACION_DOC_TYPE,
        url,
        language: "es",
        datePublished: lastModified ? new Date(lastModified) : new Date(),
        format: contentType,
      };
    } catch {
      // unreachable / timeout — try the next extension, else treat as "no reiteración"
    }
  }
  return null; // no extension resolved — retried on a later run
}

/** Mutable probe budget shared across an entire upload run, so it never hammers the gov site. */
export interface ReiteracionBudget {
  remaining: number;
}

/** The subset of a release's shape this module needs. Mutates `awards` in place. */
export interface ReiteracionCandidate {
  id: string;
  ocid?: string | null;
  awards?: IAward[];
  reiteracionProbedAt?: Date;
}

export interface AttachReiteracionResult {
  /** Reiteración docs newly resolved and attached this call. */
  found: number;
  /** Releases actually HEAD-probed this call (bounded by budget). */
  probed: number;
  /** Releases carried forward from a prior probe hit (re-sync no-wipe). */
  carried: number;
}

function hasAwardNotice(awards: IAward[] | undefined): boolean {
  return !!awards?.some((a) => a.documents?.some((d) => d.documentType === "awardNotice"));
}

function findExistingReiteracion(awards: IAward[] | undefined): IAwardDocument | undefined {
  for (const award of awards ?? []) {
    const doc = award.documents?.find((d) => d.documentType === REITERACION_DOC_TYPE);
    if (doc) return doc;
  }
  return undefined;
}

/**
 * Pushes `doc` onto the first awardNotice-bearing award. Releases overwhelmingly
 * carry exactly one award (confirmed on the eligible population); a release with
 * several just gets the reiteración attached to the first, same as the acta it
 * mirrors is scoped to.
 */
function attachToFirstAwardNotice(awards: IAward[], doc: IAwardDocument): void {
  const target = awards.find((a) => hasAwardNotice([a]));
  if (!target) return;
  target.documents = [...(target.documents ?? []), doc];
}

/**
 * For a batch of freshly-fetched releases, fills the reiteración gap in place
 * (mutates `awards`):
 *
 *  1. Carry forward — if the stored release already has a reiteración doc, reuse
 *     it so a feed re-fetch (`$set: { awards }`) doesn't wipe out a previously
 *     probed synthetic document the feed never provided in the first place.
 *  2. Skip already-probed — `reiteracionProbedAt` set on the stored release +
 *     still no reiteración doc means we probed before and found nothing.
 *  3. Probe once — otherwise, if this release's feed carried an awardNotice
 *     (the resolution acta), HEAD the deterministic sibling URL; on a hit,
 *     attach the synthesized document. Stamp `reiteracionProbedAt` either way.
 *
 * Only releases with an awardNotice document are considered eligible at all —
 * releases without one have no resolution file to be sibling to. Probing is
 * capped by `budget`; releases left over (budget exhausted) get no marker and
 * are simply retried on the next run.
 *
 * `opts.reprobe` forces step (3) even for releases already stamped
 * `reiteracionProbedAt` (step 2) — needed to re-probe records marked a miss
 * under an older probe (e.g. before `.pdf` resolutions were handled). Carry-
 * forward (step 1) still wins, so a real doc is never re-fetched or wiped.
 */
export async function attachProbedReiteraciones(
  releases: ReiteracionCandidate[],
  budget: ReiteracionBudget,
  now: Date,
  concurrency = 5,
  opts: { reprobe?: boolean } = {},
): Promise<AttachReiteracionResult> {
  const result: AttachReiteracionResult = { found: 0, probed: 0, carried: 0 };

  const eligible = releases.filter((r) => hasAwardNotice(r.awards) && !findExistingReiteracion(r.awards));
  if (!eligible.length) return result;

  const existing = (await ReleaseModel.find({ id: { $in: eligible.map((r) => r.id) } })
    .select("id awards.id awards.documents reiteracionProbedAt")
    .lean()) as Array<{ id: string; awards?: IAward[]; reiteracionProbedAt?: Date }>;
  const stored = new Map(existing.map((e) => [e.id, e]));

  const toProbe: Array<{ release: ReiteracionCandidate; compraId: string }> = [];
  for (const release of eligible) {
    const prev = stored.get(release.id);
    const prevDoc = findExistingReiteracion(prev?.awards);
    if (prevDoc) {
      attachToFirstAwardNotice(release.awards!, prevDoc); // (1) carry forward — do not re-probe or wipe
      release.reiteracionProbedAt = prev!.reiteracionProbedAt ?? now;
      result.carried++;
      continue;
    }
    if (prev?.reiteracionProbedAt && !opts.reprobe) {
      release.reiteracionProbedAt = prev.reiteracionProbedAt; // (2) probed before, no reiteración — don't repeat
      continue;
    }

    const compraId = compraIdFromOcid(release.ocid);
    if (!compraId) continue;
    toProbe.push({ release, compraId });
  }

  if (budget.remaining <= 0 || !toProbe.length) return result;
  const slice = toProbe.slice(0, budget.remaining);
  budget.remaining -= slice.length;
  result.probed = slice.length;

  await mapLimit(slice, concurrency, async ({ release, compraId }) => {
    const doc = await probeReiteracionDoc(compraId, actaExtension(release.awards));
    release.reiteracionProbedAt = now; // one-shot marker (success or miss)
    if (doc) {
      attachToFirstAwardNotice(release.awards!, doc);
      result.found++;
    }
  });

  return result;
}
