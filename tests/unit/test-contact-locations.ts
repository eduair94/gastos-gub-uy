/**
 * Run: npx tsx tests/unit/test-contact-locations.ts
 */
import assert from "node:assert/strict";
import { geoPoint } from "../../shared/utils/geo-point";
import {
  staleContactLocationFilter,
  validContactCoordinates,
} from "../../src/jobs/sync-contact-locations";

assert.deepEqual(geoPoint(-34.9011, -56.1645), {
  type: "Point",
  coordinates: [-56.1645, -34.9011],
});
assert.equal(geoPoint(91, 0), null);
assert.equal(geoPoint(0, 181), null);
assert.equal(geoPoint(Number.NaN, -56), null);
assert.equal(geoPoint("-34.9", "-56.1"), null);

assert.deepEqual(validContactCoordinates, {
  lat: { $type: "number", $gte: -90, $lte: 90 },
  lng: { $type: "number", $gte: -180, $lte: 180 },
});
assert.ok("$expr" in staleContactLocationFilter);

console.log("ok: contact GeoJSON locations");
