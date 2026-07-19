// tests/unit/test-contact-hygiene.ts
import assert from "node:assert";
import {
  normalizeEmail, isRoleAccount, isJunkEmail, mergeCandidates, pickPrimary,
} from "../../src/jobs/enrich/hygiene";

// normalizeEmail lowercases, trims, strips mailto:, rejects garbage.
assert.equal(normalizeEmail("  Info@Empresa.COM.UY "), "info@empresa.com.uy");
assert.equal(normalizeEmail("mailto:ventas@x.uy"), "ventas@x.uy");
assert.equal(normalizeEmail("not-an-email"), null);
assert.equal(normalizeEmail("a@@b"), null);

// role + junk detection
assert.equal(isRoleAccount("info@x.uy"), true);
assert.equal(isRoleAccount("juan.perez@x.uy"), false);
assert.equal(isJunkEmail("test@example.com"), true);
assert.equal(isJunkEmail("real@empresa.uy"), false);

// merge: dedupe, keep best confidence, MX injected as a stub; primary prefers non-role MX-valid.
const stubMx = async (d: string) => d !== "dead.uy";
(async () => {
  const merged = await mergeCandidates([
    { email: "info@empresa.uy", source: "website", confidence: 0.7 },
    { email: "juan@empresa.uy", source: "dei", confidence: 0.9 },
    { email: "juan@empresa.uy", source: "website", confidence: 0.6 }, // dup, lower conf
    { email: "x@dead.uy", source: "webSearch", confidence: 0.8 },     // MX fails
    { email: "test@example.com", source: "impo", confidence: 0.3 },   // junk, dropped
  ], stubMx);

  const emails = merged.map(e => e.email).sort();
  assert.deepEqual(emails, ["info@empresa.uy", "juan@empresa.uy", "x@dead.uy"]);
  const juan = merged.find(e => e.email === "juan@empresa.uy")!;
  assert.equal(juan.confidence, 0.9);        // best of the two
  assert.equal(juan.isRoleAccount, false);
  assert.equal(juan.mxValid, true);
  const dead = merged.find(e => e.email === "x@dead.uy")!;
  assert.equal(dead.mxValid, false);

  // primary = non-role, mx-valid, highest confidence → juan
  assert.equal(pickPrimary(merged), "juan@empresa.uy");
  console.log("ok: contact hygiene");
})();
