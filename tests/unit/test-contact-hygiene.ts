// tests/unit/test-contact-hygiene.ts
import assert from "node:assert";
import {
  normalizeEmail, isRoleAccount, isJunkEmail, existingEmailCandidates, mergeCandidates, pickPrimary,
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
assert.equal(isJunkEmail("contact@databasesets.com"), true);
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

  // Re-enrichment adds newly observed addresses without deleting previously
  // validated ones. Invalid and suppressed legacy rows are not revived.
  const carried = existingEmailCandidates([
    { email: "mariano.y@gmail.com", source: "webSearch", sourceUrl: "https://uy.todosnegocios.com/entre-lagos-s-a-2622-6123", confidence: 0.5, isRoleAccount: false, mxValid: true, status: "valid" },
    { email: "entrelagosbienesraices@gmail.com", source: "webSearch", sourceUrl: "https://entrelagosbienesraices.com/contacto.aspx", confidence: 0.5, isRoleAccount: false, mxValid: true, status: "valid" },
    { email: "old@dead.uy", source: "webSearch", sourceUrl: null, confidence: 0.5, isRoleAccount: false, mxValid: false, status: "invalid" },
    { email: "blocked@example.net", source: "manual", sourceUrl: null, confidence: 1, isRoleAccount: false, mxValid: true, status: "suppressed" },
  ]);
  assert.deepEqual(carried.map(entry => entry.email), [
    "mariano.y@gmail.com",
    "entrelagosbienesraices@gmail.com",
  ]);
  assert.equal(carried[0]?.sourceUrl, "https://uy.todosnegocios.com/entre-lagos-s-a-2622-6123");
  const additive = await mergeCandidates([
    ...carried,
    { email: "nuevo@entrelagos.uy", source: "website", confidence: 0.8, sourceUrl: "https://entrelagos.uy/contacto" },
  ], stubMx);
  assert.deepEqual(additive.map(entry => entry.email).sort(), [
    "entrelagosbienesraices@gmail.com",
    "mariano.y@gmail.com",
    "nuevo@entrelagos.uy",
  ]);

  // primary = non-role, mx-valid, highest confidence → juan
  assert.equal(pickPrimary(merged), "juan@empresa.uy");
  console.log("ok: contact hygiene");
})();
