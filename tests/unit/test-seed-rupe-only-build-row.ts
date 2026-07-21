// tests/unit/test-seed-rupe-only-build-row.ts
import assert from "node:assert";
import { buildRegistryRow, synthesizeSupplierId } from "../../src/jobs/seed-rupe-only/build-row";

assert.equal(synthesizeSupplierId("210002980010"), "R/210002980010");

// Geocoded row: address/locality/lat/lng/placeId all copied.
const geocoded = buildRegistryRow({
  rut: "210002980010",
  denominacionSocial: "ACME S.A.",
  domicilioFiscal: "Av. Italia 1234",
  localidad: "Maldonado",
  departamento: "Maldonado",
  estado: "ACTIVO",
  lat: -34.9, lng: -54.9, placeId: "ChIJ123",
  geocodeStatus: "ok",
});
assert.equal(geocoded.supplierId, "R/210002980010");
assert.equal(geocoded.address, "Av. Italia 1234");
assert.equal(geocoded.locality, "Maldonado, Maldonado");
assert.equal(geocoded.lat, -34.9);
assert.equal(geocoded.lng, -54.9);
assert.equal(geocoded.placeId, "ChIJ123");
assert.equal(geocoded.placeSource, "rupe");
assert.equal(geocoded.rupeEstado, "ACTIVO");
assert.equal(geocoded.neverAwarded, true);

// Not-yet-geocoded row: lat/lng/placeId held back (no wrong pin); address/locality still set.
const pending = buildRegistryRow({
  rut: "210002980020",
  denominacionSocial: "BETA S.A.",
  domicilioFiscal: "Ruta 1",
  localidad: null,
  departamento: "Colonia",
  estado: "EN INGRESO",
  lat: null, lng: null, placeId: null,
  geocodeStatus: "pending",
});
assert.equal(pending.locality, "Colonia", "null localidad is dropped; departamento alone still joins");
assert.equal(pending.lat, null);
assert.equal(pending.lng, null);
assert.equal(pending.rupeEstado, "EN INGRESO");

// Missing address entirely.
const noAddr = buildRegistryRow({
  rut: "210002980030", denominacionSocial: "GAMMA", domicilioFiscal: null,
  localidad: null, departamento: null, estado: "ACTIVO",
});
assert.equal(noAddr.address, null);
assert.equal(noAddr.locality, null);

console.log("ok: seed-rupe-only build-row");
