/**
 * Projects a set of `releases` docs for ONE compra into the merged OpenCall view.
 *
 * Pure and dependency-light (no DB, no network) so it is exhaustively unit
 * testable. The sync job groups releases by compra and hands each group here.
 *
 * Merge rule (spike-confirmed the full tender object is inline in `releases`):
 * the LATEST tender-phase release (llamado / aclar_llamado / ajuste_llamado) is
 * the authoritative snapshot; pliego documents are UNIONed across all of them so
 * an aclaración that adds a document is not lost.
 */
import { normalizeText } from "../../../shared/utils/text";
import { compraIdFromOcid } from "../../../shared/utils/ocid";
import type { IOpenCallDocument, IOpenCallItem, OpenCallStatus } from "../../../shared/types/monitor";

export type ReleaseKind =
  | "llamado"
  | "aclar_llamado"
  | "ajuste_llamado"
  | "adjudicacion"
  | "ajuste_adjudicacion"
  | "other";

export function releaseKind(id: string | undefined | null): ReleaseKind {
  if (!id) return "other";
  if (id.startsWith("ajuste_adjudicacion-")) return "ajuste_adjudicacion";
  if (id.startsWith("adjudicacion-")) return "adjudicacion";
  if (id.startsWith("aclar_llamado-")) return "aclar_llamado";
  if (id.startsWith("ajuste_llamado-")) return "ajuste_llamado";
  if (id.startsWith("llamado-")) return "llamado";
  return "other";
}

const TENDER_KINDS: ReleaseKind[] = ["llamado", "aclar_llamado", "ajuste_llamado"];
const AWARD_KINDS: ReleaseKind[] = ["adjudicacion", "ajuste_adjudicacion"];

export interface ReleaseLike {
  id: string;
  ocid: string;
  date?: Date | string | null;
  tag?: string[];
  buyer?: { id?: string; name?: string } | null;
  tender?: {
    id?: string;
    title?: string;
    description?: string;
    status?: string;
    procurementMethod?: string;
    procurementMethodDetails?: string;
    tenderPeriod?: { startDate?: Date | string | null; endDate?: Date | string | null } | null;
    enquiryPeriod?: { startDate?: Date | string | null; endDate?: Date | string | null } | null;
    procuringEntity?: { id?: string; name?: string } | null;
    items?: Array<{
      description?: string;
      quantity?: number;
      classification?: { id?: string; description?: string } | null;
      unit?: { id?: string; name?: string } | null;
    }> | null;
    documents?: Array<{
      title?: string;
      description?: string;
      url?: string;
      format?: string;
      datePublished?: Date | string | null;
      documentType?: string;
    }> | null;
  } | null;
  awards?: Array<{ id?: string; date?: Date | string | null }> | null;
}

export interface OpenCallProjection {
  compraId: string;
  ocid: string;
  latestReleaseId: string;
  sourceReleaseIds: string[];
  title: string;
  description?: string | undefined;
  buyer: { id?: string | undefined; name?: string | undefined };
  procuringEntity: { id?: string | undefined; name?: string | undefined };
  procurementMethod?: string | undefined;
  procurementMethodDetails?: string | undefined;
  status: OpenCallStatus;
  publishDate?: Date | undefined;
  tenderPeriod?: { startDate?: Date | undefined; endDate?: Date | undefined } | undefined;
  enquiryPeriod?: { startDate?: Date | undefined; endDate?: Date | undefined } | undefined;
  items: IOpenCallItem[];
  classificationSet: string[];
  searchText: string;
  documents: IOpenCallDocument[];
  awardRef?: { releaseId: string; ocid: string; awardedAt?: Date | undefined } | undefined;
}

function toDate(v: Date | string | null | undefined): Date | undefined {
  if (!v) return undefined;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export interface DeriveStatusInput {
  latestTenderKind: ReleaseKind;
  tenderStatus?: string | undefined;
  endDate?: Date | undefined;
  hasAward: boolean;
  hasCancellationTag?: boolean | undefined;
}

/**
 * Spike-simplified: the only `tender.status` values that occur in the data are
 * `active` and `cancelled`. Everything else is derived from the deadline, the
 * presence of an award, and which tender event is most recent.
 */
export function deriveStatus(input: DeriveStatusInput, now: Date): OpenCallStatus {
  if (input.hasAward) return "awarded";
  if (input.tenderStatus === "cancelled" || input.hasCancellationTag) return "cancelled";
  if (input.endDate && input.endDate.getTime() < now.getTime()) return "closed";
  if (input.latestTenderKind === "ajuste_llamado") return "amended";
  if (input.latestTenderKind === "aclar_llamado") return "clarification";
  return "open";
}

export function buildSearchText(
  title: string | undefined,
  description: string | undefined,
  items: IOpenCallItem[],
): string {
  const parts: string[] = [];
  if (title) parts.push(title);
  if (description) parts.push(description);
  for (const it of items) {
    if (it.description) parts.push(it.description);
    if (it.classificationLabel) parts.push(it.classificationLabel);
  }
  return normalizeText(parts.join(" "));
}

/** Sort key that tolerates missing dates (undated releases sort earliest). */
function dateMs(r: ReleaseLike): number {
  const d = toDate(r.date);
  return d ? d.getTime() : 0;
}

/**
 * Build the OpenCall projection for one compra's releases, or null when the
 * group carries no tender-phase (llamado) release at all.
 */
export function projectOpenCall(releases: ReleaseLike[], now: Date = new Date()): OpenCallProjection | null {
  if (!releases.length) return null;

  const ocid = releases.find(r => r.ocid)?.ocid;
  if (!ocid) return null;
  const compraId = compraIdFromOcid(ocid);
  if (!compraId) return null;

  const tenderReleases = releases
    .filter(r => TENDER_KINDS.includes(releaseKind(r.id)) && r.tender)
    .sort((a, b) => dateMs(a) - dateMs(b));

  if (!tenderReleases.length) return null;

  const authoritative = tenderReleases[tenderReleases.length - 1]!;
  const tender = authoritative.tender!;

  // Union documents across every tender release, deduped by url.
  const docMap = new Map<string, IOpenCallDocument>();
  for (const tr of tenderReleases) {
    for (const d of tr.tender?.documents ?? []) {
      if (!d?.url || docMap.has(d.url)) continue;
      docMap.set(d.url, {
        title: d.title ?? d.description,
        url: d.url,
        format: d.format,
        datePublished: toDate(d.datePublished),
        documentType: d.documentType,
      });
    }
  }

  const items: IOpenCallItem[] = (tender.items ?? []).map(it => ({
    description: it.description,
    classificationId: it.classification?.id,
    classificationLabel: it.classification?.description,
    quantity: it.quantity,
    unit: it.unit ? { id: it.unit.id, name: it.unit.name } : undefined,
  }));

  const classificationSet = Array.from(
    new Set(items.map(it => it.classificationId).filter((x): x is string => Boolean(x))),
  );

  const title = tender.title || items.find(it => it.description)?.description || `Llamado ${compraId}`;
  const description = tender.description || undefined;

  const buyer = authoritative.buyer || releases.find(r => r.buyer)?.buyer || {};
  const procuringEntity = tender.procuringEntity || {};

  const awardRelease = releases.find(r => AWARD_KINDS.includes(releaseKind(r.id)));
  const awardRef = awardRelease
    ? {
        releaseId: awardRelease.id,
        ocid: awardRelease.ocid || ocid,
        awardedAt: toDate(awardRelease.awards?.[0]?.date) ?? toDate(awardRelease.date),
      }
    : undefined;

  const endDate = toDate(tender.tenderPeriod?.endDate);
  const startDate = toDate(tender.tenderPeriod?.startDate);
  const enquiryStart = toDate(tender.enquiryPeriod?.startDate);
  const enquiryEnd = toDate(tender.enquiryPeriod?.endDate);

  const hasCancellationTag = releases.some(r => (r.tag ?? []).includes("tenderCancellation"));

  const status = deriveStatus(
    {
      latestTenderKind: releaseKind(authoritative.id),
      tenderStatus: tender.status,
      endDate,
      hasAward: Boolean(awardRef),
      hasCancellationTag,
    },
    now,
  );

  return {
    compraId,
    ocid,
    latestReleaseId: authoritative.id,
    sourceReleaseIds: releases.map(r => r.id),
    title,
    description,
    buyer: { id: buyer.id, name: buyer.name },
    procuringEntity: { id: procuringEntity.id, name: procuringEntity.name },
    procurementMethod: tender.procurementMethod,
    procurementMethodDetails: tender.procurementMethodDetails,
    status,
    publishDate: toDate(tenderReleases[0]!.date),
    tenderPeriod: { startDate, endDate },
    enquiryPeriod: enquiryStart || enquiryEnd ? { startDate: enquiryStart, endDate: enquiryEnd } : undefined,
    items,
    classificationSet,
    searchText: buildSearchText(title, description, items),
    documents: Array.from(docMap.values()),
    awardRef,
  };
}
