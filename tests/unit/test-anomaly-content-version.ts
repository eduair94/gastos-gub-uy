/**
 * Unit tests for anomalyContentVersion (src/jobs/detect-anomalies.ts) — the fix that makes an
 * anomaly's `dataVersion` derive from the flag's immutable content instead of the run timestamp.
 * The AI-triage gate re-scores only flags whose dataVersion moved; a per-run timestamp moved EVERY
 * surviving flag every night and forced a full ~6h re-triage, during which /analytics/unexplained
 * under-reported. A content hash keeps unchanged flags stable, so only new/changed flags re-triage.
 * Pure function, no DB/network. Run:
 *   npx tsx tests/unit/test-anomaly-content-version.ts
 */

import { anomalyContentVersion } from "../../src/jobs/detect-anomalies";

let passed = 0;
let failed = 0;
function ok(name: string, cond: boolean): void {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`); }
}

const base = { releaseId: "adjudicacion-1", awardId: "R/1", classificationId: "26058", currency: "UYU", unitName: "ampolla", unitPrice: 1833.5 };
const v = (o: Partial<typeof base>) => anomalyContentVersion({ ...base, ...o });

console.log("🧪 anomalyContentVersion");
console.log("========================");

// Format: content scheme prefix, so a first run after deploy is trivially told from legacy `v<ts>`.
ok("prefixed with 'c'", v({}).startsWith("c"));

// Stability: identical material fields → identical version (this is the whole point — no churn).
ok("stable across identical inputs", v({}) === v({}));

// null awardId and "" awardId collapse to the same key (matches anomalyDedupeKey semantics).
ok("null awardId == empty-string awardId", v({ awardId: null }) === v({ awardId: "" }));

// Price rounding to cents: sub-cent jitter must NOT move the version…
ok("sub-cent jitter is stable", v({ unitPrice: 1833.5 }) === v({ unitPrice: 1833.504 }));
// …but a real price change must.
ok("cent-level change moves version", v({ unitPrice: 1833.5 }) !== v({ unitPrice: 1833.51 }));

// Every identity field is load-bearing: changing any one yields a different version.
ok("releaseId change moves version", v({}) !== v({ releaseId: "adjudicacion-2" }));
ok("awardId change moves version", v({}) !== v({ awardId: "R/2" }));
ok("classificationId change moves version", v({}) !== v({ classificationId: "26059" }));
ok("currency change moves version", v({}) !== v({ currency: "USD" }));
ok("unitName change moves version", v({}) !== v({ unitName: "comprimido" }));

console.log(`\n${failed === 0 ? "✅" : "❌"} ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
