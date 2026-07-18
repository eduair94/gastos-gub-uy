/**
 * Hourly open-calls pipeline (spawned by the cron server, also runnable directly):
 *   1. project new/updated llamados from `releases` into `open_calls`
 *   2. match newly-opened calls against active watches → enqueue alerts
 *   3. dispatch batched emails to instant-frequency users
 *
 * Run:  npx tsx src/jobs/sync-open-calls.ts
 */
import { connectToDatabase, disconnectFromDatabase } from "../../shared/connection/database";
import { syncOpenCalls } from "./open-calls/sync";
import { runMatching } from "./matching/run";
import { dispatchAlerts } from "./alerts/dispatch";

async function main(): Promise<void> {
  const log = (m: string) => console.log(`[sync-open-calls] ${m}`);
  await connectToDatabase();

  const sync = await syncOpenCalls({ log });
  if (sync.newlyOpenedCompraIds.length) {
    await runMatching(sync.newlyOpenedCompraIds, log);
  }
  const disp = await dispatchAlerts({ frequency: "instant", log });

  log(`done: ${sync.inserted} new calls, ${disp.notificationsSent} alert notifications sent`);
}

main()
  .then(async () => {
    await disconnectFromDatabase();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("[sync-open-calls] failed:", err);
    await disconnectFromDatabase().catch(() => {});
    process.exit(1);
  });
