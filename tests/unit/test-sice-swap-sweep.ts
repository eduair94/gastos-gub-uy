/**
 * Regression test for the 2026-07-27 catalog truncation.
 *
 * Two `import-sice-catalog` runs overlapped. Each swap ended with
 * `deleteMany({ dataVersion: { $ne: mine } })`, so each deleted the other's
 * freshly-written generation; `sice_catalog` went from 90,330 articles to 9,483,
 * `product_analytics` lost `clasName` on 97% of codes, and `/pauta` — which
 * matches `clasName: "PUBLICIDAD Y PROPAGANDA"` — returned zeros.
 *
 * The sweep must therefore drop OLDER generations only, never a newer one.
 */

import assert from "node:assert";
import { staleVersionFilter } from "../../src/jobs/import-sice-catalog";

function version(at: number): string {
  return `v${at}`;
}

const older = version(1785132000992); // the run that logged its version
const newer = version(1785132003046); // the run whose docs actually survived

// The filter is a plain `$lt`, which Mongo evaluates as a string compare.
assert.deepStrictEqual(staleVersionFilter(newer), { dataVersion: { $lt: newer } });

// `v<epoch-ms>` is fixed width, so a string compare IS a time compare.
assert.ok(older < newer, "older version must sort before newer");
assert.ok(!(newer < newer), "a run must not sweep its own generation");

// The 2026-07-27 pairing: the older run's sweep must spare the newer run's docs,
// while the newer run's sweep still clears the older generation.
const matches = (filter: { dataVersion: { $lt: string } }, docVersion: string) => docVersion < filter.dataVersion.$lt;
assert.ok(!matches(staleVersionFilter(older), newer), "older run must NOT delete the newer run's docs");
assert.ok(matches(staleVersionFilter(newer), older), "newer run must still clear the older generation");

// Epoch-ms stays 13 digits until 2286, so the ordering holds across the range
// the importer will ever stamp.
const ordered = [1000000000000, 1785132000992, 1785132003046, 2000000000000, 9999999999999].map(version);
for (let i = 1; i < ordered.length; i++) {
  assert.ok(ordered[i - 1] < ordered[i], `${ordered[i - 1]} must sort before ${ordered[i]}`);
}

console.log("✅ sice swap sweeps older generations only");
