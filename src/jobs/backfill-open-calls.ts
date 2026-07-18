/**
 * One-time backfill so the browser isn't empty on day 1: project every currently-
 * open llamado already in `releases` into `open_calls`. Alerts are SUPPRESSED — a
 * backfill must not blast every user with historical calls; only forward-going new
 * calls (via sync-open-calls) alert. Idempotent — safe to re-run.
 *
 * Run:  npx tsx src/jobs/backfill-open-calls.ts
 */
import { connectToDatabase, disconnectFromDatabase } from "../../shared/connection/database";
import { syncOpenCalls } from "./open-calls/sync";

async function main(): Promise<void> {
  const log = (m: string) => console.log(`[backfill-open-calls] ${m}`);
  await connectToDatabase();
  const res = await syncOpenCalls({ suppressAlerts: true, log });
  log(`backfill complete: ${res.processed} processed, ${res.inserted} inserted, ${res.upserted} upserted`);
}

main()
  .then(async () => {
    await disconnectFromDatabase();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("[backfill-open-calls] failed:", err);
    await disconnectFromDatabase().catch(() => {});
    process.exit(1);
  });
