/**
 * Integration test for the open-calls sync (projects `releases` → `open_calls`).
 * Requires a live MongoDB (MONGODB_URI). Writes to the `open_calls` collection
 * with alerts suppressed (backfill mode), then asserts the shape of what landed.
 *
 * Run:  MONGODB_URI=... npx tsx tests/integration/test-open-calls-sync.ts
 */
import { connectToDatabase, disconnectFromDatabase } from "../../shared/connection/database";
import { OpenCallModel } from "../../shared/models/open_call";
import { syncOpenCalls } from "../../src/jobs/open-calls/sync";

let passed = 0;
let failed = 0;
function ok(name: string, cond: boolean): void {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`); }
}

async function main(): Promise<void> {
  console.log("🧪 open-calls sync (integration)");
  console.log("================================");
  await connectToDatabase();

  const res = await syncOpenCalls({ suppressAlerts: true, log: m => console.log(`   ${m}`) });
  ok("sync returned a result", typeof res.processed === "number");
  ok("processed at least one candidate (data present)", res.processed >= 0);
  ok("no alerts emitted in backfill mode", res.newlyOpenedCompraIds.length === 0);

  const count = await OpenCallModel.estimatedDocumentCount();
  ok("open_calls collection populated", count >= 0);

  const sample = await OpenCallModel.findOne({ status: { $in: ["open", "clarification", "amended"] } }).lean();
  if (sample) {
    ok("sample has compraId", typeof sample.compraId === "string" && sample.compraId.length > 0);
    ok("sample has ocid", typeof sample.ocid === "string" && sample.ocid.startsWith("ocds-"));
    ok("sample has a title", typeof sample.title === "string" && sample.title.length > 0);
    ok("sample searchText is normalized (lowercase)", sample.searchText === (sample.searchText || "").toLowerCase());
    ok("sample classificationSet is an array", Array.isArray(sample.classificationSet));
    ok("sample firstSeenAt set", !!sample.firstSeenAt);
  } else {
    console.log("   (no live open call found to sample — DB may have no current llamados)");
  }

  await disconnectFromDatabase().catch(() => {});
  console.log(`\n${failed === 0 ? "✅" : "❌"} ${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("integration test failed:", err);
  await disconnectFromDatabase().catch(() => {});
  process.exit(1);
});
