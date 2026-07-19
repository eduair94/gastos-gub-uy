/**
 * One-off backfill for the pliego gap: probes the deterministic pliego URL for
 * existing active `open_calls` whose OCDS feed carried NO documents, and attaches
 * the synthesized document when it resolves. This closes the historical backlog;
 * the sync job (src/jobs/open-calls/pliego-probe.ts) keeps future calls covered.
 *
 * Idempotent + resumable: every scanned call is stamped `documentsProbedAt`, so a
 * re-run skips calls already probed (unless --reprobe). Once a call gets a
 * document, the pliego summarizer picks it up (cron `--eager`, or run it here with
 * --summarize).
 *
 * Run:
 *   npx tsx src/jobs/backfill-pliego-docs.ts                 # probe the backlog
 *   npx tsx src/jobs/backfill-pliego-docs.ts --compra 1302292  # one call (smoke test)
 *   npx tsx src/jobs/backfill-pliego-docs.ts --limit 500 --concurrency 8
 *   npx tsx src/jobs/backfill-pliego-docs.ts --summarize     # also AI-summarize hits
 *   npx tsx src/jobs/backfill-pliego-docs.ts --reprobe       # ignore documentsProbedAt
 *   npx tsx src/jobs/backfill-pliego-docs.ts --dry           # count only, no writes
 */
import { connectToDatabase, disconnectFromDatabase } from "../../shared/connection/database";
import { OpenCallModel } from "../../shared/models/open_call";
import { mapLimit, probePliegoDoc } from "./open-calls/pliego-probe";
import { summarizeOpenCall } from "./pliego/summarize";

const ALERTABLE = ["open", "clarification", "amended"] as const;

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}
function opt(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  const log = (m: string) => console.log(`[backfill-pliego] ${m}`);
  const dry = flag("dry");
  const reprobe = flag("reprobe");
  const doSummarize = flag("summarize");
  const compra = opt("compra");
  const limit = Number(opt("limit") ?? 5000);
  const concurrency = Number(opt("concurrency") ?? 6);

  await connectToDatabase();

  // A call needs a probe when its feed left it document-less. --reprobe ignores
  // the one-shot marker; a single --compra targets exactly one call.
  const docsEmpty = { $or: [{ documents: { $size: 0 } }, { documents: { $exists: false } }] };
  const filter: Record<string, unknown> = compra
    ? { compraId: compra }
    : {
        status: { $in: ALERTABLE },
        ...docsEmpty,
        ...(reprobe ? {} : { documentsProbedAt: { $exists: false } }),
      };

  const totalMissing = await OpenCallModel.countDocuments({ status: { $in: ALERTABLE }, ...docsEmpty });
  const candidates = (await OpenCallModel.find(filter)
    .select("compraId")
    .limit(compra ? 1 : limit)
    .lean()) as Array<{ compraId: string }>;

  log(`active calls with no documents: ${totalMissing} | probing this run: ${candidates.length}${dry ? " (dry)" : ""}`);
  if (dry || !candidates.length) {
    await disconnectFromDatabase().catch(() => {});
    return;
  }

  const now = new Date();
  let found = 0;
  let miss = 0;
  const foundIds: string[] = [];

  await mapLimit(candidates, concurrency, async (c) => {
    const doc = await probePliegoDoc(c.compraId);
    if (doc) {
      await OpenCallModel.updateOne(
        { compraId: c.compraId },
        { $set: { documents: [doc], documentsProbedAt: now } },
      );
      found++;
      foundIds.push(c.compraId);
    } else {
      await OpenCallModel.updateOne({ compraId: c.compraId }, { $set: { documentsProbedAt: now } });
      miss++;
    }
  });

  log(`probed ${candidates.length}: pliego found ${found}, none ${miss}`);
  if (foundIds.length) log(`newly documented (sample): ${foundIds.slice(0, 10).join(", ")}${foundIds.length > 10 ? " …" : ""}`);

  if (doSummarize && foundIds.length) {
    const rpm = Number(process.env.AI_TRIAGE_RPM ?? 18);
    const delayMs = Math.ceil(60_000 / Math.max(1, rpm));
    let summarized = 0;
    for (const id of foundIds) {
      try {
        if (await summarizeOpenCall(id)) summarized++;
      } catch (err) {
        log(`  summary ${id} failed: ${err instanceof Error ? err.message : String(err)}`);
      }
      await sleep(delayMs);
    }
    log(`summarized ${summarized}/${foundIds.length}`);
  } else if (found) {
    log(`${found} calls now have a pliego and are summarizable — run \`npx tsx src/jobs/pliego-summary.ts --eager\` (or the cron picks them up).`);
  }

  await disconnectFromDatabase().catch(() => {});
}

main()
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error("[backfill-pliego] failed:", err);
    await disconnectFromDatabase().catch(() => {});
    process.exit(1);
  });
