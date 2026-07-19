/**
 * Unit tests for findTargetItemIndex (src/jobs/score-anomalies-ai.ts) — the fix that re-attaches
 * scraped características to the flagged line. The anomaly's metadata unit is CANONICAL (lowercased/
 * folded), the raw award item keeps its casing, so the old case-sensitive `unit.name === unit`
 * matched NOTHING corpus-wide (usedFeatures=0 for every flag). Pure function, no DB/network. Run:
 *   npx tsx tests/unit/test-target-item-match.ts
 */

import { findTargetItemIndex } from "../../src/jobs/score-anomalies-ai";

let passed = 0;
let failed = 0;
function eq(name: string, got: number, want: number): void {
  if (got === want) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name} -> got ${got}, want ${want}`); }
}

const item = (id: number | string, cls: string, unit: string, amount: number) => ({ id, classification: { id: cls }, unit: { name: unit, value: { amount } } });

console.log("🧪 findTargetItemIndex");
console.log("======================");

// THE regression: raw "PAR" vs canonical "par" must still match.
eq("case-insensitive unit: PAR vs par", findTargetItemIndex([item(1, "342", "PAR", 525500)], "342", "par", 525500), 0);
eq("case-insensitive unit: UNIDAD vs unidad", findTargetItemIndex([item(1, "279", "UNIDAD", 29393)], "279", "unidad", 29393), 0);
// unidad-family folding: raw "u" folds to canonical "unidad".
eq("unidad-family folding: u vs unidad", findTargetItemIndex([item(1, "279", "u", 100)], "279", "unidad", 100), 0);

// Exact price wins among same-code siblings (distinct presentations under one code).
const paclitaxel = [item("31", "16966", "unidad", 201.02), item("99-1", "16966", "unidad", 569.56)];
eq("same-code siblings: pick exact-price line 569.56", findTargetItemIndex(paclitaxel, "16966", "unidad", 569.56), 1);
eq("same-code siblings: pick exact-price line 201.02", findTargetItemIndex(paclitaxel, "16966", "unidad", 201.02), 0);

// Price-drift fallback: no exact price, but exactly ONE same-(code,unit) line → that line.
eq("price drift, single candidate -> fallback", findTargetItemIndex([item(1, "342", "PAR", 520000)], "342", "par", 525500), 0);

// Ambiguity guard: two same-(code,unit) lines, neither price matches → -1 (never guess).
eq("price drift, two candidates -> ambiguous -1", findTargetItemIndex([item(1, "342", "par", 100), item(2, "342", "par", 200)], "342", "par", 999), -1);

// No matching code / unit → -1.
eq("no matching code -> -1", findTargetItemIndex([item(1, "999", "par", 100)], "342", "par", 100), -1);
eq("code matches but unit differs -> -1", findTargetItemIndex([item(1, "342", "kg", 100)], "342", "par", 100), -1);

// Target sits past a display window (function scans the FULL list).
const many = [
  ...Array.from({ length: 20 }, (_, i) => item(i + 1, "111", "unidad", 10 + i)),
  item(21, "342", "par", 525500),
];
eq("target past index 15 still found", findTargetItemIndex(many, "342", "par", 525500), 20);

// Empty items → -1.
eq("empty items -> -1", findTargetItemIndex([], "342", "par", 100), -1);

console.log(`\n${failed === 0 ? "✅" : "❌"} ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
