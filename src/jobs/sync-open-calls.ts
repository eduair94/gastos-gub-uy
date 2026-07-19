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
import { dispatchPush } from "./alerts/dispatch-push";
import { dispatchTelegram } from "./alerts/dispatch-telegram";
import { summarizeOpenCall } from "./pliego/summarize";

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Eager pliego summaries for freshly-opened calls — bounded, throttled, non-fatal. */
async function eagerSummaries(compraIds: string[], log: (m: string) => void): Promise<void> {
  if (!compraIds.length || !(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)) return;
  const cap = Number(process.env.SYNC_EAGER_SUMMARY_LIMIT ?? 10);
  const rpm = Number(process.env.AI_TRIAGE_RPM ?? 18);
  const delayMs = Math.ceil(60_000 / Math.max(1, rpm));
  const targets = compraIds.slice(0, cap);
  let done = 0;
  for (const compraId of targets) {
    try {
      if (await summarizeOpenCall(compraId)) done++;
    } catch (err) {
      log(`summary ${compraId} failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    await sleep(delayMs);
  }
  log(`eager summaries: ${done}/${targets.length}`);
}

async function main(): Promise<void> {
  const log = (m: string) => console.log(`[sync-open-calls] ${m}`);
  await connectToDatabase();

  const sync = await syncOpenCalls({ log });
  if (sync.newlyOpenedCompraIds.length) {
    await runMatching(sync.newlyOpenedCompraIds, log);
  }
  // Instant fan-out across every channel. Each is independent and degrades to a
  // no-op when its transport is unconfigured; a failure in one never blocks the
  // others. (The daily digest job handles frequency:'daily' email separately.)
  const disp = await dispatchAlerts({ frequency: "instant", log });
  const push = await dispatchPush({ log }).catch((e) => {
    log(`push dispatch failed: ${e instanceof Error ? e.message : String(e)}`);
    return { pushed: 0 };
  });
  const tg = await dispatchTelegram({ log }).catch((e) => {
    log(`telegram dispatch failed: ${e instanceof Error ? e.message : String(e)}`);
    return { sent: 0 };
  });
  await eagerSummaries(sync.newlyOpenedCompraIds, log);

  log(`done: ${sync.inserted} new calls — ${disp.notificationsSent} email, ${push.pushed} push, ${tg.sent} telegram sent`);
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
