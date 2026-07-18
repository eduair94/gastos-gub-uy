/**
 * Projects the already-ingested `releases` into the `open_calls` collection.
 *
 * Spike-confirmed: llamado-* / aclar_llamado-* / ajuste_llamado-* are already in
 * `releases` with the full tender object inline, so this reads Mongo — no RSS or
 * record round-trip in the common path. All releases for one contracting process
 * share an `ocid`, which is how a call's full lifecycle is gathered.
 */
import { ReleaseModel } from "../../../shared/models/release";
import { OpenCallModel } from "../../../shared/models/open_call";
import { SiceCatalogModel } from "../../../shared/models/sice_catalog";
import type { OpenCallStatus } from "../../../shared/types/monitor";
import { enrichProjectionWithCatalog, projectOpenCall } from "./project";
import type { CatalogLookupEntry, OpenCallProjection, ReleaseLike } from "./project";

const TENDER_ID_REGEX = /^(llamado|aclar_llamado|ajuste_llamado)-/;
const LLAMADO_ID_REGEX = /^llamado-/;
const ALERTABLE: OpenCallStatus[] = ["open", "clarification", "amended"];

const DAY_MS = 86_400_000;

export interface SyncOptions {
  /** Look-back window (days) for recently updated tender releases. Default 2. */
  sinceDays?: number;
  /** Backfill mode: seed firstSeenAt but never report calls as "new" (no alerts). */
  suppressAlerts?: boolean;
  now?: Date;
  log?: (msg: string) => void;
}

export interface SyncResult {
  candidateOcids: number;
  processed: number;
  upserted: number;
  inserted: number;
  newlyOpenedCompraIds: string[];
}

const RELEASE_FIELDS = "id ocid date tag buyer tender awards";
const OCID_BATCH = 500;

/**
 * Enrich a batch of freshly-projected calls with SICE catalog data in place. One
 * `sice_catalog` query for the codes in this batch; missing codes fall through.
 * Pre-enrichment `classificationSet` holds only bare article codes.
 */
async function enrichBatch(projections: OpenCallProjection[]): Promise<void> {
  const codes = new Set<string>();
  for (const p of projections) for (const c of p.classificationSet) codes.add(c);
  if (!codes.size) return;
  const docs = (await SiceCatalogModel.find({ code: { $in: [...codes] } })
    .select("code rubroTokens canonicalName synonyms unitName")
    .lean()) as Array<{ code: string } & CatalogLookupEntry>;
  const lookup = new Map<string, CatalogLookupEntry>(docs.map((d) => [d.code, d]));
  for (const p of projections) enrichProjectionWithCatalog(p, (code) => lookup.get(code));
}

export async function syncOpenCalls(options: SyncOptions = {}): Promise<SyncResult> {
  const now = options.now ?? new Date();
  const log = options.log ?? (() => {});
  const since = new Date(now.getTime() - (options.sinceDays ?? 2) * DAY_MS);

  // Candidate contracting processes to (re)project.
  const filter = options.suppressAlerts
    ? { id: LLAMADO_ID_REGEX, "tender.tenderPeriod.endDate": { $gte: now } }
    : {
        id: TENDER_ID_REGEX,
        $or: [{ date: { $gte: since } }, { "tender.tenderPeriod.endDate": { $gte: now } }],
      };

  const candidateOcids: string[] = await ReleaseModel.distinct("ocid", filter);
  log(`sync-open-calls: ${candidateOcids.length} candidate ocids`);

  const newlyOpenedCompraIds: string[] = [];
  let processed = 0;
  let upserted = 0;
  let inserted = 0;

  for (let i = 0; i < candidateOcids.length; i += OCID_BATCH) {
    const batch = candidateOcids.slice(i, i + OCID_BATCH);
    const releases = (await ReleaseModel.find({ ocid: { $in: batch } })
      .select(RELEASE_FIELDS)
      .lean()) as unknown as ReleaseLike[];

    // Group all releases by ocid → one contracting process each.
    const byOcid = new Map<string, ReleaseLike[]>();
    for (const r of releases) {
      if (!r.ocid) continue;
      const arr = byOcid.get(r.ocid) ?? [];
      arr.push(r);
      byOcid.set(r.ocid, arr);
    }

    // Project every group first, then enrich all of them with one catalog query
    // for just the codes present in this batch (a few thousand, not all 90k).
    const projections: OpenCallProjection[] = [];
    for (const group of byOcid.values()) {
      const proj = projectOpenCall(group, now);
      if (proj) projections.push(proj);
    }
    await enrichBatch(projections);

    const ops: Parameters<typeof OpenCallModel.bulkWrite>[0] = [];
    const meta: Array<{ compraId: string; status: OpenCallStatus }> = [];

    for (const proj of projections) {
      processed++;

      const { compraId, ...rest } = proj;
      ops.push({
        updateOne: {
          filter: { compraId },
          update: {
            $setOnInsert: { firstSeenAt: now },
            $set: { ...rest, lastSyncedAt: now },
          },
          upsert: true,
        },
      });
      meta.push({ compraId, status: proj.status });
    }

    if (!ops.length) continue;
    const res = await OpenCallModel.bulkWrite(ops, { ordered: false });
    upserted += (res.modifiedCount ?? 0) + (res.upsertedCount ?? 0);
    inserted += res.upsertedCount ?? 0;

    // upsertedIds keys are indices into `ops` (== `meta`). A newly-INSERTED call
    // in an alertable state is a genuine new opportunity → hand to the matcher.
    if (!options.suppressAlerts) {
      for (const idxStr of Object.keys(res.upsertedIds ?? {})) {
        const m = meta[Number(idxStr)];
        if (m && ALERTABLE.includes(m.status)) newlyOpenedCompraIds.push(m.compraId);
      }
    }
  }

  log(`sync-open-calls: processed ${processed}, upserted ${upserted} (inserted ${inserted}), newly-open ${newlyOpenedCompraIds.length}`);
  return { candidateOcids: candidateOcids.length, processed, upserted, inserted, newlyOpenedCompraIds };
}
