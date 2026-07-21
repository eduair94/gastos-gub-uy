/**
 * One-off backfill for the "reiteración del gasto" gap: probes the deterministic
 * resolution URL for existing releases whose feed carried an awardNotice (acta)
 * but no reiteración doc, and attaches the synthesized document when it resolves.
 * Mirrors src/jobs/backfill-pliego-docs.ts for the open-calls pliego gap — this
 * closes the historical backlog for `releases`; the daily/weekly ingest
 * (src/uploaders/release-uploader-new.ts) keeps future awards covered.
 *
 * Idempotent + resumable: every scanned release is stamped `reiteracionProbedAt`,
 * so a re-run skips releases already probed (unless --reprobe).
 *
 * Run:
 *   npx tsx src/jobs/backfill-reiteracion-docs.ts                       # probe the backlog
 *   npx tsx src/jobs/backfill-reiteracion-docs.ts --id adjudicacion-1331990  # one release, by id
 *   npx tsx src/jobs/backfill-reiteracion-docs.ts --compra 1331990       # one release, by compraId
 *   npx tsx src/jobs/backfill-reiteracion-docs.ts --limit 2000 --concurrency 8
 *   npx tsx src/jobs/backfill-reiteracion-docs.ts --reprobe               # ignore reiteracionProbedAt
 *   npx tsx src/jobs/backfill-reiteracion-docs.ts --dry                   # count only, no writes
 *
 * The eligible population (releases with an awardNotice doc) is ~500k — this is
 * a backlog to grind through over many bounded runs, not a one-shot sweep.
 */
import { connectToDatabase, disconnectFromDatabase } from "../../shared/connection/database";
import { ReleaseModel } from "../../shared/models/release";
import { attachProbedReiteraciones, type ReiteracionCandidate } from "./releases/reiteracion-probe";

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}
function opt(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const log = (m: string) => console.log(`[backfill-reiteracion] ${m}`);
  const dry = flag("dry");
  const reprobe = flag("reprobe");
  const id = opt("id"); // exact release id, e.g. adjudicacion-1331990
  const compra = opt("compra"); // compraId — matched via ocid suffix (never release id: ids diverge on aclaración/ajuste records)
  const limit = Number(opt("limit") ?? 2000);
  const concurrency = Number(opt("concurrency") ?? 6);

  await connectToDatabase();

  // A release needs a probe when its feed carried an awardNotice (a resolution acta
  // exists at this compraId) but no reiteración doc yet. Both conditions key on the
  // same dotted path ("awards.documents.documentType"), so they MUST be combined via
  // $and, not object-spread — spreading two objects with an identical key silently
  // drops the first one.
  const eligibleFilter = { "awards.documents.documentType": "awardNotice" };
  const noReiteracion = { "awards.documents.documentType": { $ne: "reiteracionGasto" } };
  const missingReiteracionFilter = { $and: [eligibleFilter, noReiteracion] };
  const filter: Record<string, unknown> = id
    ? { id }
    : compra
      ? { ocid: new RegExp(`-${compra}$`), ...eligibleFilter }
      : {
          ...missingReiteracionFilter,
          ...(reprobe ? {} : { reiteracionProbedAt: { $exists: false } }),
        };

  const totalMissing = await ReleaseModel.countDocuments(missingReiteracionFilter);
  const candidates = (await ReleaseModel.find(filter)
    .select("id ocid awards")
    .limit(id || compra ? 1 : limit)
    .lean()) as ReiteracionCandidate[];

  log(`releases with an acta but no reiteración: ${totalMissing} | probing this run: ${candidates.length}${dry ? " (dry)" : ""}`);
  if (dry || !candidates.length) {
    await disconnectFromDatabase().catch(() => {});
    return;
  }

  const now = new Date();
  const budget = { remaining: candidates.length };
  const attach = await attachProbedReiteraciones(candidates, budget, now, concurrency, { reprobe });

  const bulkOps = candidates
    .filter((c) => c.reiteracionProbedAt)
    .map((c) => ({
      updateOne: {
        filter: { id: c.id },
        update: { $set: { awards: c.awards, reiteracionProbedAt: c.reiteracionProbedAt } },
      },
    }));

  if (bulkOps.length) {
    await ReleaseModel.bulkWrite(bulkOps, { ordered: false });
  }

  log(`probed ${attach.probed} (carried ${attach.carried}): reiteración found ${attach.found}, none ${attach.probed - attach.found}`);
  log(`wrote ${bulkOps.length} release updates`);

  await disconnectFromDatabase().catch(() => {});
}

main()
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error("[backfill-reiteracion] failed:", err);
    await disconnectFromDatabase().catch(() => {});
    process.exit(1);
  });
