/**
 * AI pliego summary entry (spawned/manual). Generates and caches structured
 * Gemini summaries on `open_calls.aiSummary`.
 *
 * Run:  npx tsx src/jobs/pliego-summary.ts <compraId>     # one call
 *       npx tsx src/jobs/pliego-summary.ts --eager        # live calls missing a summary
 */
import { connectToDatabase, disconnectFromDatabase } from "../../shared/connection/database";
import { OpenCallModel } from "../../shared/models/open_call";
import { summarizeOpenCall } from "./pliego/summarize";

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runEager(log: (m: string) => void): Promise<void> {
  const limit = Number(process.env.PLIEGO_EAGER_LIMIT ?? 20);
  const rpm = Number(process.env.AI_TRIAGE_RPM ?? 18);
  const delayMs = Math.ceil(60_000 / Math.max(1, rpm));

  const calls = await OpenCallModel.find({
    status: { $in: ["open", "clarification", "amended"] },
    aiSummary: { $exists: false },
    "documents.0": { $exists: true },
  })
    .select("compraId")
    .limit(limit)
    .lean();

  log(`eager: ${calls.length} calls to summarize`);
  let done = 0;
  for (const c of calls) {
    try {
      const summary = await summarizeOpenCall(c.compraId);
      if (summary) done++;
    } catch (err) {
      log(`  ${c.compraId} failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    await sleep(delayMs);
  }
  log(`eager complete: ${done}/${calls.length} summarized`);
}

async function main(): Promise<void> {
  const log = (m: string) => console.log(`[pliego-summary] ${m}`);
  await connectToDatabase();

  const arg = process.argv[2];
  if (arg && arg !== "--eager") {
    const summary = await summarizeOpenCall(arg);
    log(summary ? `summarized ${arg}` : `no summary produced for ${arg} (no pliego / no API key / no text)`);
  } else {
    await runEager(log);
  }
}

main()
  .then(async () => {
    await disconnectFromDatabase().catch(() => {});
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("[pliego-summary] failed:", err);
    await disconnectFromDatabase().catch(() => {});
    process.exit(1);
  });
