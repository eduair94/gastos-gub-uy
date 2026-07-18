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
import type { OpenCallStatus } from "../../../shared/types/monitor";
import { projectOpenCall } from "./project";
import type { ReleaseLike } from "./project";

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

    const ops: Parameters<typeof OpenCallModel.bulkWrite>[0] = [];
    const meta: Array<{ compraId: string; status: OpenCallStatus }> = [];

    for (const group of byOcid.values()) {
      const proj = projectOpenCall(group, now);
      if (!proj) continue;
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
