/**
 * Unit tests for normalizeVerdict (src/jobs/score-anomalies-ai.ts) — the guard that keeps a stored
 * verdict's explainable/category pair internally consistent. Pure function, no DB/network/env. Run:
 *   npx tsx tests/unit/test-verdict-normalize.ts
 */

import { normalizeVerdict } from "../../src/jobs/score-anomalies-ai";

let passed = 0;
let failed = 0;

function eq(name: string, got: { explainable: string; category: string }, wantE: string, wantC: string): void {
  const ok = got.explainable === wantE && got.category === wantC;
  if (ok) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name} -> got ${got.explainable}/${got.category}, want ${wantE}/${wantC}`);
  }
}

console.log("🧪 normalizeVerdict");
console.log("===================");

// Contradiction #1: a named explanation flagged as unexplained -> uncertain, keep the reason.
eq("no/producto-distinto -> uncertain/producto-distinto", normalizeVerdict("no", "producto-distinto"), "uncertain", "producto-distinto");
eq("no/cantidad-baja -> uncertain/cantidad-baja", normalizeVerdict("no", "cantidad-baja"), "uncertain", "cantidad-baja");
eq("no/error-carga -> uncertain/error-carga", normalizeVerdict("no", "error-carga"), "uncertain", "error-carga");
eq("no/moneda-erronea -> uncertain/moneda-erronea", normalizeVerdict("no", "moneda-erronea"), "uncertain", "moneda-erronea");

// Contradiction #2: 'sin-explicacion' only means 'no'; with yes/uncertain it is the wrong bucket.
eq("yes/sin-explicacion -> yes/otro", normalizeVerdict("yes", "sin-explicacion"), "yes", "otro");
eq("uncertain/sin-explicacion -> uncertain/otro", normalizeVerdict("uncertain", "sin-explicacion"), "uncertain", "otro");

// Valid combinations pass through untouched.
eq("no/sin-explicacion unchanged", normalizeVerdict("no", "sin-explicacion"), "no", "sin-explicacion");
eq("yes/producto-distinto unchanged", normalizeVerdict("yes", "producto-distinto"), "yes", "producto-distinto");
eq("yes/otro unchanged", normalizeVerdict("yes", "otro"), "yes", "otro");
eq("uncertain/otro unchanged", normalizeVerdict("uncertain", "otro"), "uncertain", "otro");
eq("yes/cantidad-baja unchanged", normalizeVerdict("yes", "cantidad-baja"), "yes", "cantidad-baja");

// Invariant: after normalize, explainable='no' <=> category='sin-explicacion'.
{
  const cats = ["cantidad-baja", "producto-distinto", "marca-especializado", "urgencia", "servicio-incluido", "error-carga", "moneda-erronea", "sin-explicacion", "otro"] as const;
  const exps = ["yes", "no", "uncertain"] as const;
  let invariantOk = true;
  for (const e of exps) for (const c of cats) {
    const r = normalizeVerdict(e, c);
    const noXorSin = (r.explainable === "no") === (r.category === "sin-explicacion");
    if (!noXorSin) { invariantOk = false; console.error(`    invariant broken: ${e}/${c} -> ${r.explainable}/${r.category}`); }
  }
  eq("invariant no<=>sin-explicacion over all 27 combos", { explainable: invariantOk ? "no" : "x", category: invariantOk ? "sin-explicacion" : "y" }, "no", "sin-explicacion");
}

console.log(`\n${failed === 0 ? "✅" : "❌"} ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
