#!/usr/bin/env tsx
/**
 * Audits and optionally refreshes cached pliego summaries that were generated
 * by the old partial/truncating pipeline. Existing summaries are overwritten
 * only after a complete new model response, so a provider failure is harmless.
 *
 * Dry run: npx tsx scripts/refresh-pliego-summaries.ts --limit=12
 * Targeted: npx tsx scripts/refresh-pliego-summaries.ts --ids=1349474,1350881
 * Write:   npx tsx scripts/refresh-pliego-summaries.ts --ids=... --commit
 * Dates:   npx tsx scripts/refresh-pliego-summaries.ts --ids=... --dates-only --commit
 */
import { connectToDatabase, disconnectFromDatabase } from "../shared/connection/database";
import { buildPliegoRotator, summarizeOpenCall } from "../shared/pliego/summarize";
import { formatOfficialPliegoDate } from "../shared/pliego/verified-facts";
import { OpenCallModel } from "../shared/models/open_call";
import { isSupportedPliegoDocument, isWordDocument } from "../shared/services/pliego-extractor";

function argument(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find(value => value.startsWith(prefix))?.slice(prefix.length);
}

function positiveInt(value: string | undefined, fallback: number, maximum: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  const commit = process.argv.includes("--commit");
  const datesOnly = process.argv.includes("--dates-only");
  const limit = positiveInt(argument("limit"), 12, 15);
  const explicitIds = (argument("ids") ?? "").split(",").map(value => value.trim()).filter(Boolean);
  await connectToDatabase();

  const query = explicitIds.length
    ? { compraId: { $in: explicitIds } }
    : {
        status: { $in: ["open", "clarification", "amended"] },
        "tenderPeriod.endDate": { $gte: new Date() },
        aiSummary: { $exists: true },
        "documents.0": { $exists: true },
      };
  const calls = await OpenCallModel.find(query)
    .select("compraId title status tenderPeriod.endDate enquiryPeriod.endDate documents aiSummary")
    .limit(explicitIds.length ? 15 : 120)
    .lean();

  const ranked = calls
    .map(call => {
      const documents = (call.documents ?? []).filter(isSupportedPliegoDocument);
      const analyzed = call.aiSummary?.sourceDocs?.length ?? 0;
      const deficit = Math.max(0, documents.length - analyzed);
      const legacy = call.aiSummary?.docsSignature ? 0 : 1;
      const word = documents.some(isWordDocument) ? 1 : 0;
      return { call, documents, analyzed, score: deficit * 100 + legacy * 30 + word * 20 + documents.length };
    })
    .filter(item => item.documents.length > 0)
    .sort((a, b) => {
      if (explicitIds.length) return explicitIds.indexOf(a.call.compraId) - explicitIds.indexOf(b.call.compraId);
      return b.score - a.score;
    })
    .slice(0, limit);

  console.log(`[pliego-refresh] ${commit ? "WRITE" : "DRY RUN"}: ${ranked.length} summaries selected`);
  for (const item of ranked) {
    console.log(
      `  ${item.call.compraId}: ${item.analyzed}/${item.documents.length} analyzed, `
      + `${item.call.aiSummary?.docsSignature ? "signed" : "legacy"}, ${item.call.title}`,
    );
  }
  if (!commit) {
    console.log("[pliego-refresh] No writes performed. Add --commit to regenerate this exact selection.");
    return;
  }

  if (datesOnly) {
    let repaired = 0;
    for (const item of ranked) {
      const reception = formatOfficialPliegoDate(item.call.tenderPeriod?.endDate);
      const enquiries = formatOfficialPliegoDate(item.call.enquiryPeriod?.endDate);
      const set: Record<string, string> = {};
      if (reception) set["aiSummary.plazos.recepcionOfertas"] = reception;
      if (enquiries) set["aiSummary.plazos.consultas"] = enquiries;
      if (!Object.keys(set).length) continue;
      await OpenCallModel.updateOne({ compraId: item.call.compraId, aiSummary: { $exists: true } }, { $set: set });
      repaired++;
      console.log(`  OK ${item.call.compraId}: official dates repaired`);
    }
    console.log(`[pliego-refresh] date repair complete: ${repaired}/${ranked.length}`);
    return;
  }

  const rotator = buildPliegoRotator();
  if (!rotator.available) throw new Error("No free AI provider is configured");
  let refreshed = 0;
  for (const item of ranked) {
    try {
      const summary = await summarizeOpenCall(item.call.compraId, rotator, {
        force: true,
        stream: true,
        throwOnFailure: true,
        maxRetriesPerModel: 0,
        timeoutMs: 60_000,
        totalTimeoutMs: 3 * 60_000,
      });
      if (!summary) throw new Error("No summary returned");
      refreshed++;
      const total = summary.sourceDocs.length + (summary.unreadableDocs?.length ?? 0);
      console.log(
        `  OK ${item.call.compraId}: ${summary.sourceDocs.length}/${total} documents, model ${summary.model}`,
      );
    } catch (error) {
      console.error(`  FAIL ${item.call.compraId}: ${error instanceof Error ? error.message : String(error)}`);
    }
    await sleep(2_000);
  }
  console.log(`[pliego-refresh] complete: ${refreshed}/${ranked.length} refreshed; benched: ${rotator.benched.join(", ") || "none"}`);
}

void main()
  .then(() => disconnectFromDatabase())
  .catch(async error => {
    console.error(`[pliego-refresh] failed: ${error instanceof Error ? error.stack : String(error)}`);
    await disconnectFromDatabase().catch(() => {});
    process.exitCode = 1;
  });
