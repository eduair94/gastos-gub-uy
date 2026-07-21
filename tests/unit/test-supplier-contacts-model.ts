import assert from "node:assert";
import { SupplierContactModel } from "../../shared/models/supplier_contacts";

// Model registers and enforces the documented shape without a DB connection.
const doc = new SupplierContactModel({
  supplierId: "R/214843360014",
  rut: "214843360014",
  name: "MURRY S A",
  emails: [{ email: "a@b.uy", source: "dei", sourceUrl: "https://example.uy/contacto", confidence: 0.9, isRoleAccount: false, mxValid: true, status: "valid" }],
  primaryEmail: "a@b.uy",
  rubros: [{ classificationId: "28267", label: "Alcohol", itemCount: 3, share: 0.5 }],
  status: "enriched",
  priorityScore: 123,
  websitePhone: "2407 0000",
  phones: [
    { phone: "2407 0000", source: "website", sourceUrl: "https://example.uy/contacto", confidence: 0.8 },
    { phone: "2900 0000", source: "dei", sourceUrl: null, confidence: 0.9 },
  ],
  websiteAddress: "Cnel. Brandzen 1956",
  contactFormUrl: "https://example.uy/#contact",
  socialLinks: [{ platform: "instagram", url: "https://instagram.com/example/", label: "@example", source: "website", sourceUrl: "https://example.uy/contacto" }],
  enrichmentMethods: ["crawl4ai", "googleMaps"],
  enrichmentVersion: 4,
});
const err = doc.validateSync();
assert.equal(err, undefined, `unexpected validation error: ${err?.message}`);
assert.equal(doc.emails[0].source, "dei");
assert.equal(doc.collection.name, "supplier_contacts");
assert.equal(doc.socialLinks[0].platform, "instagram");
assert.equal(doc.emails[0].sourceUrl, "https://example.uy/contacto");
assert.equal(doc.phones.length, 2);
assert.deepEqual(doc.enrichmentMethods, ["crawl4ai", "googleMaps"]);
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
