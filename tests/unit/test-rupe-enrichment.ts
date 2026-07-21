// tests/unit/test-rupe-enrichment.ts
// RUPE geocode-query composer + rupe resolver (fake Db). No network, no DB —
// mirrors the node:assert convention of the repo.
import assert from "node:assert";
import { rupeGeocodeQuery } from "../../src/jobs/enrich/rupe-address";
import { createRupeResolver } from "../../src/jobs/enrich/resolvers/rupe";
import { normalizeText } from "../../shared/utils/text";

// --- rupeGeocodeQuery -------------------------------------------------------
(async () => {
  assert.equal(
    rupeGeocodeQuery({ domicilioFiscal: "CARAGUATAY 2080", localidad: "Montevideo", departamento: "Montevideo" }),
    "CARAGUATAY 2080, Montevideo, Montevideo, Uruguay",
  );
  // Missing parts are skipped, ", Uruguay" always appended.
  assert.equal(rupeGeocodeQuery({ domicilioFiscal: "RUTA 5 KM 100", localidad: null, departamento: "Canelones" }), "RUTA 5 KM 100, Canelones, Uruguay");
  // Nothing to geocode → null (never a bare ", Uruguay").
  assert.equal(rupeGeocodeQuery({ domicilioFiscal: null, localidad: null, departamento: null }), null);
  assert.equal(rupeGeocodeQuery({ domicilioFiscal: "   ", localidad: "", departamento: undefined }), null);
  console.log("ok: rupeGeocodeQuery");
})();

// --- rupe resolver (fake Db) ------------------------------------------------
type Row = Record<string, unknown>;
function fakeDb(rows: Row[]): any {
  const matches = (r: Row, filter: Row) => Object.entries(filter).every(([k, v]) => r[k] === v);
  const coll = {
    findOne: async (filter: Row) => rows.find((r) => matches(r, filter)) ?? null,
    find: (filter: Row) => ({
      limit: (n: number) => ({ toArray: async () => rows.filter((r) => matches(r, filter)).slice(0, n) }),
    }),
  };
  return { collection: (_name: string) => coll };
}

(async () => {
  const base = {
    rut: "216684990015",
    denominacionSocial: "PACHECO TROISI MARIANGEL",
    normalizedName: normalizeText("PACHECO TROISI MARIANGEL"),
    domicilioFiscal: "CARAGUATAY 2080",
    localidad: "Montevideo",
    departamento: "Montevideo",
    lat: -34.9, lng: -56.18, placeId: "px", estado: "ACTIVO",
  };

  // 1. RUT-exact hit.
  const r = createRupeResolver(fakeDb([base]));
  assert.equal(r.name, "rupe");
  const out = await r.resolve({ supplierId: "R/216684990015", rut: "216684990015", name: "irrelevant name" });
  assert.equal(out.emails.length, 0, "RUPE supplies no emails");
  assert.ok(out.place);
  assert.equal(out.place!.source, "rupe");
  assert.equal(out.place!.address, "CARAGUATAY 2080");
  assert.equal(out.place!.locality, "Montevideo, Montevideo");
  assert.equal(out.place!.lat, -34.9);
  assert.equal(out.place!.placeId, "px");
  assert.equal(out.rupeEstado, "ACTIVO");

  // 2. Name-fallback, unique match (RUT misses).
  const nameOnly = createRupeResolver(fakeDb([base]));
  const outN = await nameOnly.resolve({ supplierId: "R/999", rut: "999", name: "Pacheco Troisi Mariangel" });
  assert.ok(outN.place, "unique normalized-name match should resolve");
  assert.equal(outN.place!.address, "CARAGUATAY 2080");

  // 3. Name-fallback, AMBIGUOUS (two rows share the normalized name) → rejected.
  const twin = { ...base, rut: "111111111111", domicilioFiscal: "OTRA CALLE 1" };
  const ambiguous = createRupeResolver(fakeDb([base, twin]));
  const outA = await ambiguous.resolve({ supplierId: "R/999", rut: "999", name: "Pacheco Troisi Mariangel" });
  assert.equal(outA.place ?? null, null, "ambiguous name must not pin a wrong address");

  // 4. Miss (no RUT, no name) → empty.
  const miss = createRupeResolver(fakeDb([base]));
  const outM = await miss.resolve({ supplierId: "R/0", rut: "000", name: "Totally Different Co" });
  assert.equal(outM.place ?? null, null);
  assert.equal(outM.emails.length, 0);

  // 5. Row with no address and no coords → no place block.
  const empty = { rut: "222222222222", denominacionSocial: "X", normalizedName: "x", domicilioFiscal: null, localidad: null, departamento: null, lat: null, lng: null, placeId: null, estado: "BAJA DGI" };
  const noPlace = createRupeResolver(fakeDb([empty]));
  const outE = await noPlace.resolve({ supplierId: "R/222222222222", rut: "222222222222", name: "X" });
  assert.equal(outE.rupeEstado, "BAJA DGI", "registry state survives even without a place");
  assert.equal(outE.place ?? null, null, "no address + no coords → nothing to add");

  // 6. Not-yet-geocoded row still returns the address (coords null).
  const notGeo = { ...base, rut: "333333333333", normalizedName: "solo addr", lat: null, lng: null, placeId: null };
  const g = createRupeResolver(fakeDb([notGeo]));
  const outG = await g.resolve({ supplierId: "R/333333333333", rut: "333333333333", name: "solo addr" });
  assert.ok(outG.place, "address alone is worth returning before geocoding");
  assert.equal(outG.place!.lat, null);
  assert.equal(outG.place!.address, "CARAGUATAY 2080");

  console.log("ok: rupe resolver");
})();
