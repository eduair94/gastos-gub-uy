/**
 * Fills a systemic gap in the OCDS feed: the government structured feed frequently
 * carries NO `tender.documents`, even though the human-facing detail page links a
 * real pliego PDF. Confirmed on compra 1302292 — every release has
 * `tender.documents: []`, yet https://www.comprasestatales.gub.uy/Pliegos/pliego_1302292.pdf
 * is a live 1.1 MB PDF. Without this, `open_calls.documents` stays empty and the
 * pliego summarizer can never run.
 *
 * The pliego URL is deterministic: `/Pliegos/pliego_{compraId}.pdf`. This module
 * HEAD-probes it and, when it resolves to a real PDF, synthesizes the document the
 * feed should have provided. Kept out of `project.ts` (which is pure / no network)
 * — the probe is a side-effect the sync orchestrator and the backfill script run.
 */
import { OpenCallModel } from "../../../shared/models/open_call";
import type { IOpenCallDocument, OpenCallStatus } from "../../../shared/types/monitor";
import type { OpenCallProjection } from "./project";

const PLIEGO_BASE = "https://www.comprasestatales.gub.uy/Pliegos";

// Only active calls are worth a pliego (and worth the network). Mirrors the
// ALERTABLE set used by the sync + the eager summarizer.
const PROBEABLE_STATUSES = new Set<OpenCallStatus>(["open", "clarification", "amended"]);

const SYNTHETIC_DOC: Omit<IOpenCallDocument, "url"> = {
  title: "Pliego de condiciones",
  format: "application/pdf",
  documentType: "biddingDocuments",
};

/**
 * Deterministic public URL of a compra's pliego PDF.
 *
 * Casing matters: the capital `/Pliegos/` path serves the PDF; the lowercase
 * `/pliegos/` path 301-redirects to an HTML page. A missing pliego 404s to HTML.
 * So a caller must verify the response is actually a PDF, never trust status 200.
 */
export function pliegoUrl(compraId: string): string {
  return `${PLIEGO_BASE}/pliego_${encodeURIComponent(compraId)}.pdf`;
}

/**
 * HEAD-probes the deterministic pliego URL. Returns a synthesized OpenCall
 * document when it resolves to a real PDF, else null. HEAD only — no body is
 * downloaded here; the summarizer fetches the bytes later, on demand.
 */
export async function probePliegoDoc(compraId: string, timeoutMs = 12_000): Promise<IOpenCallDocument | null> {
  const url = pliegoUrl(compraId);
  try {
    const res = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
    if (!contentType.includes("pdf")) return null; // 404/301 land on text/html
    return { ...SYNTHETIC_DOC, url };
  } catch {
    return null; // unreachable / timeout — treat as "no pliego", retried later
  }
}

/** Runs `fn` over `items` with at most `limit` in flight. Order-preserving. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) break;
      out[i] = await fn(items[i]!, i);
    }
  });
  await Promise.all(workers);
  return out;
}

/** Mutable probe budget for one sync run, so it never hammers the gov site. */
export interface ProbeBudget {
  remaining: number;
}

export interface AttachResult {
  /** URLs newly resolved to a live pliego this call. */
  found: number;
  /** Calls whose stored documents were carried forward (re-sync no-wipe). */
  carried: number;
  /** Calls actually HEAD-probed this call (bounded by budget). */
  probed: number;
}

/**
 * For freshly-projected calls whose feed carried NO documents, fill the pliego
 * gap in place (mutates the projections):
 *
 *  1. Carry forward — if the stored `open_call` already has documents, reuse them,
 *     so the projection's `documents: []` does not `$set` over a previously probed
 *     synthetic pliego (or any feed doc that arrived on an earlier run).
 *  2. Skip already-probed — `documentsProbedAt` set + still no stored docs means we
 *     probed before and found nothing; don't probe again.
 *  3. Probe once — otherwise HEAD the deterministic URL; on a hit, attach the
 *     synthesized document. Stamp `documentsProbedAt` either way so it's one-shot.
 *
 * Only active calls are considered, and probing is capped by `budget`: calls left
 * over (budget exhausted) get no marker and are simply retried on the next sync.
 */
export async function attachProbedPliegos(
  projections: OpenCallProjection[],
  budget: ProbeBudget,
  now: Date,
  concurrency = 5,
): Promise<AttachResult> {
  const result: AttachResult = { found: 0, carried: 0, probed: 0 };

  const targets = projections.filter(
    p => (p.documents?.length ?? 0) === 0 && PROBEABLE_STATUSES.has(p.status),
  );
  if (!targets.length) return result;

  const existing = (await OpenCallModel.find({ compraId: { $in: targets.map(t => t.compraId) } })
    .select("compraId documents documentsProbedAt")
    .lean()) as Array<{ compraId: string; documents?: IOpenCallDocument[]; documentsProbedAt?: Date }>;
  const stored = new Map(existing.map(e => [e.compraId, e]));

  const toProbe: OpenCallProjection[] = [];
  for (const p of targets) {
    const prev = stored.get(p.compraId);
    if (prev?.documents?.length) {
      p.documents = prev.documents; // (1) carry forward — do not wipe
      result.carried++;
      continue;
    }
    if (prev?.documentsProbedAt) continue; // (2) probed before, no pliego
    toProbe.push(p);
  }

  if (budget.remaining <= 0 || !toProbe.length) return result;
  const slice = toProbe.slice(0, budget.remaining);
  budget.remaining -= slice.length;
  result.probed = slice.length;

  await mapLimit(slice, concurrency, async (p) => {
    const doc = await probePliegoDoc(p.compraId);
    p.documentsProbedAt = now; // one-shot marker (success or miss)
    if (doc) {
      p.documents = [doc];
      result.found++;
    }
  });

  return result;
}
