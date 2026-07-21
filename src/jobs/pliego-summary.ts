/**
 * AI pliego summary entry (spawned/manual). Generates and caches structured
 * summaries on `open_calls.aiSummary` using the free-tier model ladder
 * (Gemini → Groq, see shared/ai/rotator).
 *
 * Run:  npx tsx src/jobs/pliego-summary.ts <compraId>     # one call
 *       npx tsx src/jobs/pliego-summary.ts --eager        # prioritized backlog
 *
 * Priority (eager): only calls still biddable (status open/clarification/amended
 * AND deadline in the future), soonest deadline first, that either have NO summary
 * or whose pliego was MODIFIED since the summary was made (signature changed).
 * Free caps are per-model-per-project, so the ladder + a shared cooldown keep the
 * run moving when one model hits its daily wall. Paced under the RPM ceiling.
 */
import { connectToDatabase, disconnectFromDatabase } from "../../shared/connection/database";
import { OpenCallModel } from "../../shared/models/open_call";
import { summarizeOpenCall, buildPliegoRotator } from "./pliego/summarize";

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runEager(log: (m: string) => void): Promise<void> {
  const limit = Number(process.env.PLIEGO_EAGER_LIMIT ?? 60);
  // Keep under the free 15 RPM per-model ceiling; also bounds tokens/min.
  const rpm = Number(process.env.PLIEGO_RPM ?? process.env.AI_TRIAGE_RPM ?? 10);
  const delayMs = Math.ceil(60_000 / Math.max(1, rpm));
  const now = new Date();

  const calls = await OpenCallModel.find({
    status: { $in: ["open", "clarification", "amended"] },
    "documents.0": { $exists: true },
    // Only still-biddable calls — never spend the budget on already-closed ones.
    "tenderPeriod.endDate": { $gte: now },
    $or: [
      // No summary yet.
      { aiSummary: { $exists: false } },
      // Pliego modified since the summary was built (both signatures present and differ).
      {
        $and: [
          { "aiSummary.docsSignature": { $exists: true } },
          { $expr: { $ne: ["$aiSummary.docsSignature", "$pliegoDocsSignature"] } },
        ],
      },
    ],
  })
    .select("compraId")
    .sort({ "tenderPeriod.endDate": 1 }) // soonest-closing first (most urgent, still open)
    .limit(limit)
    .lean();

  log(`eager: ${calls.length} calls to summarize (limit ${limit}, ${rpm} rpm)`);

  // One rotator for the whole run so a model benched on its daily wall stays
  // benched across the remaining calls instead of being retried each time.
  const rotator = buildPliegoRotator();
  if (!rotator.available) {
    log("eager: no AI provider configured (set FREE_GEMINI_API_KEY / FREE_GROQ_API_KEY) — nothing to do");
    return;
  }

  let done = 0;
  for (const c of calls) {
    try {
      const summary = await summarizeOpenCall(c.compraId, rotator);
      if (summary) done++;
    } catch (err) {
      log(`  ${c.compraId} failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    await sleep(delayMs);
  }
  log(`eager complete: ${done}/${calls.length} summarized. benched models: ${rotator.benched.join(", ") || "none"}`);
}

async function main(): Promise<void> {
  const log = (m: string) => console.log(`[pliego-summary] ${m}`);
  await connectToDatabase();

  const arg = process.argv[2];
  if (arg && arg !== "--eager") {
    const summary = await summarizeOpenCall(arg);
    log(summary ? `summarized ${arg} (model ${summary.model})` : `no summary produced for ${arg} (no pliego / no API key / no text)`);
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
