import assert from "node:assert";
import { buildRegistryRow } from "../../src/jobs/seed-rupe-only/build-row";
import {
  buildAwardedReconciliation,
  buildRegistryUpsert,
  normalizeRupeRut,
  seedableRupeRut,
} from "../../src/jobs/seed-rupe-only/operations";

const rut = "210002980010";
assert.equal(normalizeRupeRut("R/21.000.298-0010"), rut);
assert.equal(seedableRupeRut("21.000.298-0010", new Set()), rut);
assert.equal(seedableRupeRut("R/21.000.298-0010", new Set([rut])), null);
assert.equal(seedableRupeRut("R/", new Set()), null);

const row = buildRegistryRow({
  rut,
  denominacionSocial: "ACME S.A.",
  domicilioFiscal: "Av. Italia 1234",
  localidad: "Maldonado",
  departamento: "Maldonado",
  estado: "ACTIVO",
  lat: -34.9,
  lng: -54.9,
  placeId: "ChIJ123",
  geocodeStatus: "ok",
});
const upsert = buildRegistryUpsert(row);
assert.deepEqual(upsert.updateOne.filter, { supplierId: `R/${rut}` });
assert.strictEqual(upsert.updateOne.update.$set, row);
assert.equal(upsert.updateOne.upsert, true);
assert.deepEqual(upsert.updateOne.update.$setOnInsert, {
  status: "registry",
  priorityScore: 0,
  emails: [],
  primaryEmail: null,
  website: null,
  websiteSource: null,
  phone: null,
  phoneSource: null,
  hours: null,
  mapsUrl: null,
  rubros: [],
  enrichedAt: null,
});
for (const protectedField of ["status", "emails", "primaryEmail", "website", "phone", "hours", "mapsUrl", "rubros", "enrichedAt"]) {
  assert.equal(protectedField in upsert.updateOne.update.$set, false, `${protectedField} must not be overwritten on match`);
}

assert.deepEqual(buildAwardedReconciliation([rut]), {
  filter: { neverAwarded: true, rut: { $in: [rut] } },
  update: { $set: { neverAwarded: false } },
});

console.log("ok: seed-rupe-only operations");
