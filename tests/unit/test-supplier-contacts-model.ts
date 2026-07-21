import assert from "node:assert";
import { SupplierContactModel } from "../../shared/models/supplier_contacts";

// Model registers and enforces the documented shape without a DB connection.
const doc = new SupplierContactModel({
  supplierId: "R/214843360014",
  rut: "214843360014",
  name: "MURRY S A",
  emails: [{ email: "a@b.uy", source: "dei", confidence: 0.9, isRoleAccount: false, mxValid: true, status: "valid" }],
  primaryEmail: "a@b.uy",
  rubros: [{ classificationId: "28267", label: "Alcohol", itemCount: 3, share: 0.5 }],
  status: "enriched",
  priorityScore: 123,
});
const err = doc.validateSync();
assert.equal(err, undefined, `unexpected validation error: ${err?.message}`);
assert.equal(doc.emails[0].source, "dei");
assert.equal(doc.collection.name, "supplier_contacts");
console.log("ok: supplier_contacts model");

// A RUPE-only ("registered, never awarded") seed row must also validate.
const registryDoc = new SupplierContactModel({
  supplierId: "R/210002980010",
  rut: "210002980010",
  name: "ACME S.A.",
  address: "Av. Italia 1234",
  locality: "Maldonado, Maldonado",
  placeSource: "rupe",
  rupeEstado: "ACTIVO",
  neverAwarded: true,
  status: "registry",
  priorityScore: 0,
});
const registryErr = registryDoc.validateSync();
assert.equal(registryErr, undefined, `unexpected validation error: ${registryErr?.message}`);
assert.equal(registryDoc.neverAwarded, true);
assert.equal(registryDoc.rupeEstado, "ACTIVO");
assert.equal(registryDoc.status, "registry");
console.log("ok: supplier_contacts model (registry row)");
