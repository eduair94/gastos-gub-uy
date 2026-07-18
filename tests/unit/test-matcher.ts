/**
 * Unit tests for the pure watch↔call matcher (shared/matching/match). No DB. Run:
 *   npx tsx tests/unit/test-matcher.ts
 */
import { watchMatchesCall } from "../../shared/matching/match";
import type { OpenCallMatchView, WatchInput } from "../../shared/matching/match";
import { normalizeText } from "../../shared/utils/text";

let passed = 0;
let failed = 0;
function ok(name: string, cond: boolean): void {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`); }
}

function watch(p: Partial<WatchInput>): WatchInput {
  return { categories: [], keywords: [], keywordMode: "any", buyers: [], ...p };
}
function call(p: Partial<OpenCallMatchView>): OpenCallMatchView {
  return { classificationSet: [], searchText: "", ...p };
}

console.log("🧪 matcher");
console.log("==========");

// Category trigger
ok("category intersection matches", watchMatchesCall(
  watch({ categories: ["4472"] }),
  call({ classificationSet: ["4472", "1010"] }),
) !== null);
ok("category disjoint does not match", watchMatchesCall(
  watch({ categories: ["9999"] }),
  call({ classificationSet: ["4472"] }),
) === null);

// Keyword any/all
const text = normalizeText("Reparación de aire acondicionado split");
ok("keyword any hits one", watchMatchesCall(
  watch({ keywords: ["aire", "toner"], keywordMode: "any" }),
  call({ searchText: text }),
) !== null);
ok("keyword all requires every term", watchMatchesCall(
  watch({ keywords: ["aire", "toner"], keywordMode: "all" }),
  call({ searchText: text }),
) === null);
ok("keyword all passes when all present", watchMatchesCall(
  watch({ keywords: ["aire", "split"], keywordMode: "all" }),
  call({ searchText: text }),
) !== null);
ok("keyword is accent/case insensitive", watchMatchesCall(
  watch({ keywords: [normalizeText("Reparación")] }),
  call({ searchText: text }),
) !== null);

// Buyer refinement
ok("buyer refinement blocks non-matching buyer", watchMatchesCall(
  watch({ categories: ["4472"], buyers: ["B1"] }),
  call({ classificationSet: ["4472"], buyerId: "B2" }),
) === null);
ok("buyer refinement allows matching buyer", watchMatchesCall(
  watch({ categories: ["4472"], buyers: ["B1"] }),
  call({ classificationSet: ["4472"], buyerId: "B1" }),
) !== null);

// Value range only excludes when a value exists
ok("value range excludes out-of-range priced call", watchMatchesCall(
  watch({ categories: ["4472"], maxValue: 1000 }),
  call({ classificationSet: ["4472"], estimatedValue: 5000 }),
) === null);
ok("value range does NOT exclude call without a value", watchMatchesCall(
  watch({ categories: ["4472"], maxValue: 1000 }),
  call({ classificationSet: ["4472"] }),
) !== null);

// Buyer-only watch triggers on the refinement
ok("buyer-only watch matches any call from that buyer", watchMatchesCall(
  watch({ buyers: ["B1"] }),
  call({ buyerId: "B1" }),
) !== null);

// Empty watch matches nothing
ok("empty watch matches nothing", watchMatchesCall(
  watch({}),
  call({ classificationSet: ["4472"], searchText: text }),
) === null);

// Reason payload records what matched
const reason = watchMatchesCall(
  watch({ categories: ["4472"], keywords: ["aire"] }),
  call({ classificationSet: ["4472"], searchText: text }),
);
ok("reason lists matched category + keyword", !!reason && reason.categories.includes("4472") && reason.keywords.includes("aire"));

console.log(`\n${failed === 0 ? "✅" : "❌"} ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
