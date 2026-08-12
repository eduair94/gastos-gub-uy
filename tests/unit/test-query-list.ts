/**
 * Unit tests for comma-safe list query params (shared/utils/query-list) and the
 * name-candidate helper the contract API uses. No DB. Run:
 *   npx tsx tests/unit/test-query-list.ts
 *
 * Regression: "Administración Nacional de Combustible, Alcohol y Portland" —
 * the biggest buyer in the corpus — has a comma in its name, so `?buyers=<name>`
 * split into two fragments and matched nothing.
 */
import {
  collapseSplitValues,
  decodeQueryListItem,
  encodeQueryList,
  encodeQueryListItem,
  parseQueryList,
  rawQueryListValues,
  toQueryListParam,
} from "../../shared/utils/query-list";
import { toArray, toNameCandidates } from "../../app/server/utils/query";

let passed = 0;
let failed = 0;
function ok(name: string, cond: boolean): void {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`); }
}
function eq(name: string, actual: unknown, expected: unknown): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}\n      expected ${e}\n      actual   ${a}`); }
}

const ANCAP = "Administración Nacional de Combustible, Alcohol y Portland";
const UTE = "Administración Nacional de Usinas y Trasmisiones Eléctricas";

console.log("🧪 query-list");
console.log("=============");

// --- Escaping ---------------------------------------------------------------
eq("comma escaped inside a value", encodeQueryListItem(ANCAP),
  "Administración Nacional de Combustible%2C Alcohol y Portland");
eq("value without a comma is untouched", encodeQueryListItem(UTE), UTE);
eq("percent escaped first so the round-trip is exact", encodeQueryListItem("50%2C off"), "50%252C off");
eq("decode undoes encode (comma)", decodeQueryListItem(encodeQueryListItem(ANCAP)), ANCAP);
eq("decode undoes encode (literal %2C)", decodeQueryListItem(encodeQueryListItem("50%2C off")), "50%2C off");
eq("decode undoes encode (bare percent)", decodeQueryListItem(encodeQueryListItem("100% algodón")), "100% algodón");
eq("lowercase escape decodes too", decodeQueryListItem("a%2cb"), "a,b");

// --- Round-trips through the joined param -----------------------------------
eq("single comma value survives the join/split", parseQueryList(encodeQueryList([ANCAP])), [ANCAP]);
eq("multi-select survives, commas intact", parseQueryList(encodeQueryList([ANCAP, UTE])), [ANCAP, UTE]);
eq("separator still separates", parseQueryList("a,b"), ["a", "b"]);
eq("repeated key form", parseQueryList([encodeQueryListItem(ANCAP), UTE]), [ANCAP, UTE]);
eq("empty param is no filter", parseQueryList(""), []);
eq("undefined param is no filter", parseQueryList(undefined), []);

// A URL-ready param survives ONE decode by the router/Nitro and then parses back.
const href = toQueryListParam([ANCAP, UTE]);
ok("url param carries no bare comma inside the value", !decodeURIComponent(href).replace(/%2C/gi, "").includes(`Combustible,`));
eq("url param -> router decode -> parse", parseQueryList(decodeURIComponent(href)), [ANCAP, UTE]);

// --- Server helpers ----------------------------------------------------------
eq("toArray trims and decodes", toArray(` ${encodeQueryListItem(ANCAP)} , ${UTE}`), [ANCAP, UTE]);

// Legacy links still carry a bare comma; the whole value is offered as an extra
// exact candidate so those links keep matching.
eq("legacy bare-comma link keeps the full name as a candidate",
  toNameCandidates(ANCAP),
  ["Administración Nacional de Combustible", "Alcohol y Portland", ANCAP]);
eq("no duplicate candidate when nothing was split", toNameCandidates(UTE), [UTE]);
eq("escaped param needs no fallback", toNameCandidates(encodeQueryListItem(ANCAP)), [ANCAP]);
eq("legacy multi-select still yields both names",
  toNameCandidates(`${UTE},${UTE}x`).slice(0, 2), [UTE, `${UTE}x`]);
eq("empty stays empty", toNameCandidates(undefined), []);

// --- Healing a legacy link's fragments back into real names -------------------
const facet = new Set([ANCAP, UTE, "A, B, C S.R.L."]);
eq("fragments of one name collapse back",
  collapseSplitValues(parseQueryList(ANCAP), facet), [ANCAP]);
eq("a name with two commas collapses whole",
  collapseSplitValues(parseQueryList("A, B, C S.R.L."), facet), ["A, B, C S.R.L."]);
eq("a real multi-select is left alone",
  collapseSplitValues([UTE, "Intendencia de Montevideo"], facet), [UTE, "Intendencia de Montevideo"]);
eq("collapse plus a separate selection",
  collapseSplitValues([...parseQueryList(ANCAP), "Intendencia de Montevideo"], facet),
  [ANCAP, "Intendencia de Montevideo"]);
eq("unknown fragments survive untouched", collapseSplitValues(["x", "y"], facet), ["x", "y"]);
eq("single value is a no-op", collapseSplitValues([UTE], facet), [UTE]);

// --- Raw values --------------------------------------------------------------
eq("rawQueryListValues does not split", rawQueryListValues(ANCAP), [ANCAP]);
eq("rawQueryListValues decodes", rawQueryListValues(encodeQueryListItem(ANCAP)), [ANCAP]);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
