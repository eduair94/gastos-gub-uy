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

// A UYU lump-sum shape IS now selected: the mislabel is not exclusive to foreign
// currencies (adjudicacion-a6005, 2002: 66.837 units x a stored 56.672 UYU "unit
// price" = 3.79B UYU, against an official 66.837 UYU total). isLumpsumSuspect only
// screens structure; whether it is truly inflated is decided later by
// isArtifactConfirmed against the scraped official total.
assert.equal(isLumpsumSuspect({
  ...suryparkRelease,
  awards: [{ items: [{ quantity: 330000, unit: { name: "UNIDAD", value: { amount: 3316, currency: "UYU" } } }] }],
}), true);

// The real adjudicacion-a6005 shape (UYU, single priced line, in-band) is selected.
assert.equal(isLumpsumSuspect({
  id: "adjudicacion-a6005",
  tag: ["award"],
  amount: { primaryAmount: 3_787_786_464 },
  awards: [{ items: [{ quantity: 66837, unit: { name: "pesos", value: { amount: 56672, currency: "UYU" } } }] }],
}), true);

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

// FIX 1: an amendment (awardUpdate) carrying an otherwise-perfect lump-sum shape
// must NOT be selected. Amendment records only ever hold an adjustment, never the
// full purchase total, so writing the official total onto one would mis-attribute
// it — this is deliberately left excluded (ajuste_adjudicacion-28580 is the known
// live example: 60,000 KG x USD 4,492/kg, primaryAmount ~= 10,850,241,558 UYU).
assert.equal(isLumpsumSuspect({
  ...suryparkRelease,
  id: "ajuste_adjudicacion-28580",
  tag: ["awardUpdate"],
}), false);

// A release with no tag at all must also be excluded (tag is required, not merely
// non-blocking) — the schema always carries it, but the guard must not assume so.
assert.equal(isLumpsumSuspect({
  ...suryparkRelease,
  tag: undefined,
}), false);

// FIX 2: a release already corrected (amount.verifiedOverride present) must not be
// re-selected, mirroring candidateMatchStage's "amount.verifiedOverride": { $exists: false }.
assert.equal(isLumpsumSuspect({
  ...suryparkRelease,
  amount: { primaryAmount: suryparkRelease.amount.primaryAmount, verifiedOverride: { source: "comprasestatales" } },
}), false);

// FIX 3: more than maxPricedItems (default 2) priced lines -> the single official
// total cannot be attributed to any one line; candidateMatchStage cannot express
// this cap, so isLumpsumSuspect is the only place it is enforced. (This differs
// from the existing "many priced lines" test above only in count: 3 is the
// smallest case that exceeds the default cap of 2.)
assert.equal(isLumpsumSuspect({
  ...suryparkRelease,
  awards: [{ items: [
    { quantity: 330000, unit: { value: { amount: 3316, currency: "USD" } } },
    { quantity: 330000, unit: { value: { amount: 3316, currency: "USD" } } },
    { quantity: 5, unit: { value: { amount: 10, currency: "USD" } } },
  ] }],
}), false);

// FIX 5: exact-boundary cases.
// quantity === qtyThreshold (1000) -> included (the bound is >=).
assert.equal(isLumpsumSuspect({
  ...suryparkRelease,
  awards: [{ items: [{ quantity: 1000, unit: { value: { amount: 3316, currency: "USD" } } }] }],
}), true);
// primaryAmount === suspectMinUyu (1e9) -> included (the bound is >=).
assert.equal(isLumpsumSuspect({ ...suryparkRelease, amount: { primaryAmount: 1e9 } }), true);
// primaryAmount === maxPlausibleUyu (50e9) -> EXCLUDED (the bound is strictly <).
assert.equal(isLumpsumSuspect({ ...suryparkRelease, amount: { primaryAmount: 50e9 } }), false);
// isArtifactConfirmed at exactly ratioMin (5) -> counts as confirmed (the bound is >=).
assert.equal(isArtifactConfirmed(5000, 1000), true);

console.log("ok: lumpsum artifacts");
