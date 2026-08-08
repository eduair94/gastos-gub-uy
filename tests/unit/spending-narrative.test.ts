// Run: npx tsx tests/unit/spending-narrative.test.ts
//
// The spending page lets Gemini reword its yearly summaries. The only thing
// standing between that and a fabricated figure on a transparency site is
// `numericFingerprint`: the rewrite is accepted only when its numbers match the
// deterministic text's. These assertions pin what "match" means — in particular
// that a rescale ("$ 179,6 mil millones" -> "179.600 millones"), which reads as
// harmless and is the rewrite the model actually attempted, is a rejection.
import assert from "node:assert/strict";
import { numericFingerprint } from "../../src/jobs/refresh-spending-trend";

const base =
  "En 2025 las compras del Estado sumaron $ 179,6 mil millones, una caída de 16,6% frente a 2024 en pesos corrientes.";

// Same figures, different prose and clause order -> accepted.
assert.equal(
  numericFingerprint(
    "Frente a 2024, en 2025 el Estado compró por $ 179,6 mil millones: una caída de 16,6% en pesos corrientes."
  ),
  numericFingerprint(base),
  "reordering clauses must not change the fingerprint"
);

// Whitespace around a figure is not part of the figure.
assert.equal(
  numericFingerprint("$179,6 mil millones en 2025, -16,6% contra 2024"),
  numericFingerprint("$ 179,6  mil millones en 2025, -16,6% contra 2024"),
  "spacing must not change the fingerprint"
);

// A rescale keeps the meaning but changes the digits -> rejected.
assert.notEqual(
  numericFingerprint(
    "En 2025 las compras del Estado sumaron $ 179.600 millones, una caída de 16,6% frente a 2024 en pesos corrientes."
  ),
  numericFingerprint(base),
  "rescaling a figure must be caught"
);

// Dropping a figure -> rejected.
assert.notEqual(
  numericFingerprint("En 2025 las compras del Estado cayeron 16,6% frente a 2024."),
  numericFingerprint(base),
  "dropping a figure must be caught"
);

// Inventing a figure -> rejected.
assert.notEqual(
  numericFingerprint(`${base} Eso equivale a 4,2% del PIB.`),
  numericFingerprint(base),
  "inventing a figure must be caught"
);

// Rounding -> rejected.
assert.notEqual(
  numericFingerprint(
    "En 2025 las compras del Estado sumaron $ 180 mil millones, una caída de 17% frente a 2024 en pesos corrientes."
  ),
  numericFingerprint(base),
  "rounding must be caught"
);

// Trailing sentence punctuation is not a decimal separator.
assert.equal(
  numericFingerprint("subió 21,2%."),
  numericFingerprint("subió 21,2% y nada más"),
  "a full stop after a figure must not become part of it"
);

console.log("spending-narrative: all assertions passed");
