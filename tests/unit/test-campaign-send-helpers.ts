import assert from "node:assert";
import { warmupCap, makeToken } from "../../src/jobs/campaign/send";

// warmupCap: day-0 = 50/day, doubles daily, capped at 5000/day.
assert.equal(warmupCap(0), 50); // day 1 cap
assert.ok(warmupCap(5) > warmupCap(0)); // ramps up
assert.ok(warmupCap(99) <= 5000); // capped ceiling

// makeToken: deterministic hex hash (no Math.random), unique per (supplier,campaign) pair.
assert.equal(makeToken("R/1", "promo1").length >= 16, true);
assert.equal(makeToken("R/1", "promo1"), makeToken("R/1", "promo1")); // deterministic — same inputs, same token
assert.notEqual(makeToken("R/1", "promo1"), makeToken("R/2", "promo1")); // differs per supplier
assert.notEqual(makeToken("R/1", "promo1"), makeToken("R/1", "promo2")); // differs per campaign

console.log("ok: campaign send helpers");
