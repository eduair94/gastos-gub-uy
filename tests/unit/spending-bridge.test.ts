// Run: npx tsx tests/unit/spending-bridge.test.ts
//
// The bridge is the whole argument of /analytics/evolucion-gasto: it claims that
// base + inflation + entrants + exits + panelDelta is EXACTLY the year's total,
// and that what it labels "coverage" really is bodies entering or leaving the
// feed rather than money. If that identity slips, the page states a false
// decomposition with total confidence, which is worse than showing nothing.
import assert from "node:assert/strict";
import {
  buildBridge,
  splitPriceQuantity,
  type BuyerYearTotals,
  type CodeUnitTotals,
} from "../../shared/utils/spending-bridge";

const buyers = (rows: Record<string, [number, number]>): Map<string, BuyerYearTotals> =>
  new Map(Object.entries(rows).map(([k, [nominal, real]]) => [k, { nominal, real }]));

const codes = (rows: Record<string, [number, number]>): Map<string, CodeUnitTotals> =>
  new Map(Object.entries(rows).map(([k, [qty, value]]) => [k, { qty, value }]));

/** Floating-point comparison at a relative tolerance. */
function near(actual: number, expected: number, msg: string, rel = 1e-9) {
  const scale = Math.max(1, Math.abs(expected));
  assert.ok(
    Math.abs(actual - expected) / scale < rel,
    `${msg}: got ${actual}, expected ${expected}`
  );
}

// ---------------------------------------------------------------------------
// 1. The identity holds, with entrants, exits and a panel all present.
// ---------------------------------------------------------------------------
{
  // k = 0.5: today's pesos are worth twice the pesos of this year, i.e. this
  // year sits halfway down the UI series from today.
  const out = buildBridge({
    prevNominal: 1000,
    curNominal: 1600,
    prevReal: 2400, // 1000 nominal of last year == 2400 of today's pesos
    k: 0.5,
    prevBuyers: buyers({ a: [600, 1440], b: [400, 960] }),
    curBuyers: buyers({ a: [900, 900], c: [700, 700] }),
  });
  const b = out.bridge;

  near(b.base + b.inflation + b.entrants + b.exits + b.panelDelta, b.total, "five terms sum to total");
  near(b.entrants + b.exits + b.panelDelta, b.realDelta, "real terms sum to realDelta");
  near(b.inflation, 200, "inflation = prevReal*k - prevNominal");
  near(b.entrants, 700, "entrant c contributes its whole nominal");
  near(b.exits, -480, "exit b contributes minus its re-priced spend");
  near(b.panelDelta, 900 - 720, "panel a: 900 now against 1440*0.5 re-priced");
  assert.equal(b.entrantBuyers, 1, "one entrant");
  assert.equal(b.exitBuyers, 1, "one exit");
  assert.equal(b.panelBuyers, 1, "one panel body");
  assert.equal(out.contributions.length, 3, "every body gets a contribution row");
}

// ---------------------------------------------------------------------------
// 2. A year where nothing happened except inflation has zero real change.
//    This is the case the page exists to detect, so it gets its own assertion.
// ---------------------------------------------------------------------------
{
  // Same real basket both years. Prices doubled, so this year's nominal is 2x
  // and k is half of last year's k.
  const out = buildBridge({
    prevNominal: 1000,
    curNominal: 2000,
    prevReal: 4000,
    k: 0.5,
    prevBuyers: buyers({ a: [1000, 4000] }),
    curBuyers: buyers({ a: [2000, 4000] }),
  });
  near(out.bridge.inflation, 1000, "all of the change is the price level");
  near(out.bridge.realDelta, 0, "no real change");
  near(out.bridge.panelDelta, 0, "no panel change");
}

// ---------------------------------------------------------------------------
// 3. A body that only ever reports once is coverage, never panel change.
// ---------------------------------------------------------------------------
{
  const out = buildBridge({
    prevNominal: 0,
    curNominal: 500,
    prevReal: 0,
    k: 1,
    prevBuyers: buyers({}),
    curBuyers: buyers({ newcomer: [500, 500] }),
  });
  near(out.bridge.entrants, 500, "the whole rise is an entrant");
  near(out.bridge.panelDelta, 0, "panel is untouched");
  near(out.bridge.base + out.bridge.inflation + out.bridge.entrants + out.bridge.exits + out.bridge.panelDelta, 500, "identity holds with an empty previous year");
}

// ---------------------------------------------------------------------------
// 4. Price/quantity: a pure price move puts nothing in the quantity term.
// ---------------------------------------------------------------------------
{
  const split = splitPriceQuantity(
    codes({ "1234|unidad": [100, 12000] }), // 100 units at 120
    codes({ "1234|unidad": [100, 10000] }), // 100 units at 100
    { inflationFactor: 1, yearTotal: 12000, qtyRatioCeil: 25, priceRatioCeil: 10, contributionCap: 1e9 }
  );
  assert.ok(split, "a comparable code produces a split");
  near(split!.quantity, 0, "quantity term is zero");
  near(split!.price, 2000, "the whole change is price");
  near(split!.coverage, 1, "the single code is the whole year");
  assert.equal(split!.codes, 1);
  assert.equal(split!.droppedCodes, 0);
}

// ---------------------------------------------------------------------------
// 5. A price that merely tracked inflation is not a real price rise.
// ---------------------------------------------------------------------------
{
  const split = splitPriceQuantity(
    codes({ "1234|unidad": [100, 11000] }), // 100 units at 110
    codes({ "1234|unidad": [100, 10000] }), // 100 units at 100, +10% inflation
    { inflationFactor: 1.1, yearTotal: 11000, qtyRatioCeil: 25, priceRatioCeil: 10, contributionCap: 1e9 }
  );
  near(split!.price, 0, "price net of inflation is flat");
  near(split!.quantity, 0, "quantity is flat");
}

// ---------------------------------------------------------------------------
// 6. A pure quantity move, at last year's re-priced unit price.
// ---------------------------------------------------------------------------
{
  const split = splitPriceQuantity(
    codes({ "1234|unidad": [150, 15000] }), // 150 units at 100
    codes({ "1234|unidad": [100, 10000] }), // 100 units at 100
    { inflationFactor: 1, yearTotal: 15000, qtyRatioCeil: 25, priceRatioCeil: 10, contributionCap: 1e9 }
  );
  near(split!.quantity, 5000, "50 extra units at 100");
  near(split!.price, 0, "no price move");
  near(split!.matchedDelta, 5000, "matchedDelta is the sum of both terms");
}

// ---------------------------------------------------------------------------
// 7. The gates. A lump-sum line ("quantity" 10.000 against a contract total)
//    is exactly what produced a +/-4e15 pair of terms on the live data, so
//    each gate is asserted to reject it and to be counted, not silently kept.
// ---------------------------------------------------------------------------
{
  const opts = { inflationFactor: 1, yearTotal: 1e6, qtyRatioCeil: 25, priceRatioCeil: 10, contributionCap: 5e4 };

  const qtyBlowup = splitPriceQuantity(
    codes({ "bad|unidad": [10000, 1e6], "ok|unidad": [10, 1000] }),
    codes({ "bad|unidad": [1, 1e6], "ok|unidad": [10, 1000] }),
    opts
  );
  assert.equal(qtyBlowup!.droppedCodes, 1, "the 10.000x quantity swing is dropped");
  assert.equal(qtyBlowup!.codes, 1, "the sane code survives");

  const priceBlowup = splitPriceQuantity(
    codes({ "bad|unidad": [10, 1e6] }), // unit price 100.000
    codes({ "bad|unidad": [10, 1000] }), // unit price 100
    opts
  );
  assert.equal(priceBlowup, null, "a 1000x unit-price swing leaves nothing comparable");

  // Within both ratio gates, but the absolute term still dwarfs the year.
  const capped = splitPriceQuantity(
    codes({ "big|unidad": [20, 2e6] }),
    codes({ "big|unidad": [10, 1e6] }),
    opts
  );
  assert.equal(capped, null, "the contribution cap rejects a term larger than the cap");
}

// ---------------------------------------------------------------------------
// 8. Codes present in only one year never enter the split — that difference is
//    a mix effect, and calling it "price" or "quantity" would be a fabrication.
// ---------------------------------------------------------------------------
{
  const split = splitPriceQuantity(
    codes({ "kept|unidad": [10, 1000], "brandnew|unidad": [99, 99000] }),
    codes({ "kept|unidad": [10, 1000], "retired|unidad": [50, 50000] }),
    { inflationFactor: 1, yearTotal: 100000, qtyRatioCeil: 25, priceRatioCeil: 10, contributionCap: 1e9 }
  );
  assert.equal(split!.codes, 1, "only the code in both years is compared");
  near(split!.matchedTotal, 1000, "coverage counts only the matched subtotal");
  near(split!.coverage, 0.01, "coverage is declared, not assumed to be 100%");
}

console.log("spending-bridge: all assertions passed");
