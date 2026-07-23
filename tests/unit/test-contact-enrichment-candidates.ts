// Run: npx tsx tests/unit/test-contact-enrichment-candidates.ts
import assert from "node:assert/strict";
import {
  mergeStoredPlace,
  registryContactQuery,
  registryContactToSupplier,
} from "../../src/jobs/enrich/candidates";

const staleBefore = new Date("2025-01-01T00:00:00.000Z");
assert.deepEqual(registryContactQuery(staleBefore), {
  neverAwarded: true,
  $or: [
    { enrichmentVersion: { $ne: 6 } },
    { enrichedAt: null },
    { enrichedAt: { $exists: false } },
    { enrichedAt: { $lt: staleBefore } },
  ],
});

assert.deepEqual(
  registryContactToSupplier({ supplierId: "UY-RUT-123", name: "Empresa" }),
  {
    supplierId: "UY-RUT-123",
    name: "Empresa",
    totalValue: 0,
    totalContracts: 0,
  },
);

assert.deepEqual(
  mergeStoredPlace(null, {
    address: "18 de Julio 123",
    locality: "Montevideo",
    lat: -34.9,
    lng: -56.2,
    placeSource: "rupe",
  }),
  {
    address: "18 de Julio 123",
    locality: "Montevideo",
    lat: -34.9,
    lng: -56.2,
    hours: null,
    mapsUrl: null,
    placeId: null,
    placeSource: "rupe",
  },
);

assert.deepEqual(
  mergeStoredPlace(
    {
      address: "Nueva 456",
      locality: "Canelones",
      lat: -34.5,
      lng: -56.3,
      hours: "9-18",
      mapsUrl: "https://maps.example/place",
      placeId: "place-1",
      source: "googleMaps",
    },
    { address: "Vieja 123", placeSource: "rupe" },
  ),
  {
    address: "Nueva 456",
    locality: "Canelones",
    lat: -34.5,
    lng: -56.3,
    hours: "9-18",
    mapsUrl: "https://maps.example/place",
    placeId: "place-1",
    placeSource: "googleMaps",
  },
);

assert.deepEqual(
  mergeStoredPlace(
    {
      address: "3, PLACES DES BERGUES, 1211 GENEVA",
      locality: null,
      lat: -32.522779,
      lng: -55.765835,
      hours: null,
      mapsUrl: null,
      placeId: "rupe-geocode",
      source: "rupe",
    },
    {},
    {
      address: "Quai des Bergues 3, Genève, Suiza",
      locality: null,
      lat: 46.2070348,
      lng: 6.145815,
      hours: "lunes: 8:00–18:00",
      mapsUrl: "https://maps.google.com/?cid=vitol",
      placeId: "google-vitol",
      source: "googleMaps",
    },
  ),
  {
    address: "3, PLACES DES BERGUES, 1211 GENEVA",
    locality: null,
    lat: 46.2070348,
    lng: 6.145815,
    hours: "lunes: 8:00–18:00",
    mapsUrl: "https://maps.google.com/?cid=vitol",
    placeId: "google-vitol",
    placeSource: "rupe",
  },
);

console.log("contact enrichment candidate helpers: ok");
