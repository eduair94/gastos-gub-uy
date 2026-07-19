// tests/unit/test-contact-resolvers.ts
import assert from "node:assert";
import { createDeiResolver } from "../../src/jobs/enrich/resolvers/dei";

// Minimal fake of the mongodb Db surface the resolver uses.
function fakeDb(rows: any[]) {
  return {
    collection: () => ({
      findOne: async (q: any) => rows.find(r => r.rut === q.rut) ?? null,
    }),
  } as any;
}

(async () => {
  const db = fakeDb([{ rut: "214843360014", email: "admin@murry.uy", sitioWeb: "https://murry.uy", telefono: "099..." }]);
  const r = createDeiResolver(db);
  assert.equal(r.name, "dei");
  const out = await r.resolve({ supplierId: "R/214843360014", rut: "214843360014", name: "MURRY S A" });
  assert.equal(out.emails.length, 1);
  assert.equal(out.emails[0].email, "admin@murry.uy");
  assert.equal(out.emails[0].source, "dei");
  assert.ok(out.emails[0].confidence >= 0.85);
  assert.equal(out.website, "https://murry.uy");

  // No DEI row → empty result, no throw.
  const empty = await createDeiResolver(fakeDb([])).resolve({ supplierId: "R/x", rut: "999", name: "x" });
  assert.deepEqual(empty.emails, []);
  console.log("ok: dei resolver");
})();
