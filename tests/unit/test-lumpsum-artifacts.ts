// tests/unit/test-lumpsum-artifacts.ts
import assert from "node:assert";
import { hasVerifiedOverride } from "../../shared/utils/verified-override";

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

console.log("ok: lumpsum artifacts");
