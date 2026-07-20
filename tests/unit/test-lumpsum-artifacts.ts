// tests/unit/test-lumpsum-artifacts.ts
import assert from "node:assert";
import { hasVerifiedOverride } from "../../shared/utils/verified-override";
import { amountPipelineExpr } from "../../src/uploaders/release-uploader";
import {
  isArtifactConfirmed,
  isLumpsumSuspect,
  LUMPSUM_DEFAULTS,
} from "../../src/jobs/lib/lumpsum-candidates";

// hasVerifiedOverride: only true when the audit sub-object is actually present.
assert.equal(hasVerifiedOverride(null), false);
assert.equal(hasVerifiedOverride(undefined), false);
assert.equal(hasVerifiedOverride({}), false);
assert.equal(hasVerifiedOverride({ amount: {} }), false);
assert.equal(hasVerifiedOverride({ amount: { primaryAmount: 100 } }), false);
assert.equal(hasVerifiedOverride({ amount: { verifiedOverride: null } }), false);
assert.equal(
  hasVerifiedOverride({ amount: { verifiedOverride: { source: "comprasestatales" } } }),
  true,
);

// The guard is what protects a correction from a re-sync. Assert the exact shape the
// jobs branch on, including a realistic full override object.
const corrected = {
  id: "adjudicacion-53193",
  amount: {
    primaryAmount: 103_596,
    primaryCurrency: "UYU",
    totalAmounts: { USD: 4201 },
    currencies: ["USD"],
    verifiedOverride: {
      source: "comprasestatales",
      sourceUrl: "https://www.comprasestatales.gub.uy/consultas/detalle/id/53193",
      officialTotal: 4201,
      officialCurrency: "USD",
      rateMonth: "2005-06",
      previousPrimaryAmount: 43_823_788_579.956,
      previousComputedTotal: 1_094_280_000,
      verifiedAt: new Date("2026-07-20T00:00:00Z"),
      reason: "lumpsum-in-unit-price",
    },
  },
};
assert.equal(hasVerifiedOverride(corrected), true);
// An uncorrected release with the same inflated shape must NOT be protected.
assert.equal(
  hasVerifiedOverride({ id: "adjudicacion-31334", amount: { primaryAmount: 40_831_381_689 } }),
  false,
);

// amountPipelineExpr: the hand-authored pipeline decision (release-uploader.ts) for
// whether `amount` is frozen to the stored value or recomputed from the incoming file.
// A protected release must yield the literal "$amount" reference, in full, regardless
// of amountData/incomingAwardsCount — no $cond, no trace of the recomputed value.
const recomputedAmountData = { primaryAmount: 999, primaryCurrency: "UYU" };
assert.deepEqual(amountPipelineExpr(true, recomputedAmountData, 3), "$amount");

// An unprotected release must yield the original $cond, wrapping the recomputed
// amountData verbatim behind $literal, comparing awards-count against the exact
// incomingAwardsCount passed in.
const unprotectedExpr = amountPipelineExpr(false, recomputedAmountData, 3);
assert.deepEqual(unprotectedExpr, {
  $cond: [
    { $gt: [{ $size: { $ifNull: ["$awards", []] } }, 3] },
    "$amount",
    { $literal: recomputedAmountData },
  ],
});

// The real SURYPARK shape must be selected.
const suryparkRelease = {
  id: "adjudicacion-53193",
  tag: ["award"],
  amount: { primaryAmount: 43_823_788_579.956 },
  awards: [{
    items: [{
      quantity: 330000,
      classification: { id: "27050" },
      unit: { name: "UNIDAD", value: { amount: 3316, currency: "USD" } },
    }],
  }],
};
assert.equal(isLumpsumSuspect(suryparkRelease), true);

// A large but ordinary UYU contract must NOT be selected (wrong currency, and the
// mislabel we are hunting is concentrated in foreign-currency rows).
assert.equal(isLumpsumSuspect({
  ...suryparkRelease,
  awards: [{ items: [{ quantity: 330000, unit: { name: "UNIDAD", value: { amount: 3316, currency: "UYU" } } }] }],
}), false);

// Small quantity -> a genuinely expensive unit, not a lump sum.
assert.equal(isLumpsumSuspect({
  ...suryparkRelease,
  awards: [{ items: [{ quantity: 2, unit: { value: { amount: 3316, currency: "USD" } } }] }],
}), false);

// Below the suspect floor -> ordinary spending, leave it alone.
assert.equal(isLumpsumSuspect({ ...suryparkRelease, amount: { primaryAmount: 5_000_000 } }), false);

// Above the plausibility ceiling -> already excluded from aggregates elsewhere.
assert.equal(isLumpsumSuspect({ ...suryparkRelease, amount: { primaryAmount: 60e9 } }), false);

// Many priced lines -> the official single total could not be attributed; skip.
assert.equal(isLumpsumSuspect({
  ...suryparkRelease,
  awards: [{ items: [
    { quantity: 330000, unit: { value: { amount: 3316, currency: "USD" } } },
    { quantity: 330000, unit: { value: { amount: 3316, currency: "USD" } } },
    { quantity: 330000, unit: { value: { amount: 3316, currency: "USD" } } },
  ] }],
}), false);

// Confirmation compares the computed total against the official one.
assert.equal(isArtifactConfirmed(1_094_280_000, 4201), true);  // ~260,000x -> artifact
assert.equal(isArtifactConfirmed(4300, 4201), false);          // agrees -> not an artifact
assert.equal(isArtifactConfirmed(9000, 4201), false);          // ~2x -> below ratioMin, not ours
assert.equal(isArtifactConfirmed(4201, 0), false);             // guard against divide-by-zero
assert.equal(LUMPSUM_DEFAULTS.ratioMin, 5);

console.log("ok: lumpsum artifacts");
