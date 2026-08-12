/**
 * Unit test for the UDECO × supplier RUT join (src/jobs/refresh-udeco-crossref.ts).
 *
 * Pure function only — no database, no network. Run with:
 *   npx tsx tests/unit/test-udeco-crossref.ts
 *
 * Every id shape below was taken from the live corpus. The join looked trivial and was not: an
 * `$in` of exact strings matched 379 of the 530 supplier documents that actually resolve to a
 * sanctioned firm — a 28% miss — because the same RUT is stored four different ways.
 */

import { rutFromSupplierId } from "../../src/jobs/refresh-udeco-crossref";

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail = ""): void {
  if (condition) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}${detail ? ` -> ${detail}` : ""}`);
  }
}

console.log("🧪 UDECO × supplier RUT join");
console.log("============================");

console.log("\n📊 every id shape in the corpus resolves to the same RUT");
{
  const RUT = "214803890012";
  for (const id of ["R/214803890012", "R/214803890012 ", " R/214803890012", "R214803890012", "214803890012", "r/214803890012"]) {
    check(`"${id}" -> ${RUT}`, rutFromSupplierId(id) === RUT, String(rutFromSupplierId(id)));
  }
}

console.log("\n📊 non-RUT identifiers resolve to null");
{
  // A cédula is 8 digits: a person, not a company RUT, and it must never collide with one.
  check("cédula 'C/25093646' -> null", rutFromSupplierId("C/25093646") === null);
  // A foreign registration carries letters and a different digit count.
  check("foreign 'X/USA351167154' -> null", rutFromSupplierId("X/USA351167154") === null, String(rutFromSupplierId("X/USA351167154")));
  check("empty -> null", rutFromSupplierId("") === null);
  check("null -> null", rutFromSupplierId(null) === null);
  check("undefined -> null", rutFromSupplierId(undefined) === null);
  check("13 digits -> null", rutFromSupplierId("R/2148038900123") === null);
  check("11 digits -> null", rutFromSupplierId("R/21480389001") === null);
  check("letters only -> null", rutFromSupplierId("SIN RUT") === null);
}

console.log("\n📊 formatting inside the id is normalised away");
{
  // Not observed in the corpus today, but a dotted RUT is how humans write it and the loader must
  // not start missing firms the day someone pastes one in.
  check("dotted '21.480.389.0012' -> 214803890012", rutFromSupplierId("21.480.389.0012") === "214803890012");
  check("dashed 'R/214803890-012' -> 214803890012", rutFromSupplierId("R/214803890-012") === "214803890012");
}

console.log("\n============================");
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
