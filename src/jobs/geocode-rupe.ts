#!/usr/bin/env tsx

/**
 * Geocode RUPE fiscal addresses into coordinates, via the Google Maps proxy's
 * /geocode endpoint. Reads `rupe_registry` rows left `geocodeStatus:"pending"`
 * by load-rupe.ts (new rows, or rows whose address changed) and writes back the
 * lat/lng/placeId/confidence block onto the same doc.
 *
 * RESUMABLE: each row is updated the moment it resolves, so a kill/restart just
 * continues from the remaining `pending` rows. Transport errors leave a row
 * `pending` (retried next run); a definitive geocoder answer (ok / zero_results /
 * out_of_country) records `geocodedAddress` so the same address is never
 * re-geocoded until it changes.
 *
 * Runs on a network-capable host (the 167 box). The dev box has unreliable
 * external DNS — a canary geocode aborts early there instead of thrashing.
 *
 * Usage:
 *   npx tsx src/jobs/geocode-rupe.ts                 # geocode all pending (default limit 500)
 *   npx tsx src/jobs/geocode-rupe.ts --limit=5000
 *   npx tsx src/jobs/geocode-rupe.ts --dry-run       # resolve + report, write nothing
 *   npx tsx src/jobs/geocode-rupe.ts --sleep=200     # ms between proxy calls (default 200)
 */

import { connectToDatabase, disconnectFromDatabase } from "../../shared/connection/database";
import { RupeRegistryModel } from "../../shared/models/rupe_registry";
import { geocode } from "./enrich/backends";
import { rupeGeocodeQuery } from "./enrich/rupe-address";

// Uruguay bounding box — coords outside are junk/placeholder (mirrors load-dei).
const UY = { latMin: -35.5, latMax: -29.5, lngMin: -59, lngMax: -52.5 };
const inUruguay = (lat: number | null, lng: number | null): boolean =>
  lat !== null && lng !== null &&
  lat >= UY.latMin && lat <= UY.latMax && lng >= UY.lngMin && lng <= UY.lngMax;

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const dryRun = flag("dry-run");
  const limit = Number(arg("limit") ?? "500");
  const pause = Number(arg("sleep") ?? "200");

  // Canary: prove the proxy is reachable before touching the DB, so we don't
  // spin marking transient errors when the box simply has no route out.
  const canary = await geocode("Avenida 18 de Julio 1234, Montevideo, Uruguay");
  if (canary.status === "ERROR" || canary.lat === null) {
    console.error("❌ Geocode proxy unreachable (canary failed); aborting. Run on a network-capable host.");
    process.exit(1);
  }

  await connectToDatabase();

  const cursor = RupeRegistryModel
    .find({ geocodeStatus: "pending" }, { rut: 1, domicilioFiscal: 1, localidad: 1, departamento: 1, pais: 1 })
    .limit(limit)
    .lean()
    .cursor();

  let processed = 0, ok = 0, zero = 0, outOfCountry = 0, noAddr = 0, errors = 0, consecutiveErrors = 0;
  for await (const d of cursor) {
    const query = rupeGeocodeQuery(d);
    if (!query) {
      // Nothing to geocode — record a terminal state so it isn't re-picked.
      noAddr++;
      if (!dryRun) await RupeRegistryModel.updateOne({ rut: d.rut }, { $set: { geocodeStatus: "error", geocodedAddress: null, geocodedAt: new Date() } });
      continue;
    }

    const g = await geocode(query);
    processed++;

    if (g.status === "ERROR") {
      // Transient transport failure — leave the row `pending` for the next run.
      errors++;
      if (++consecutiveErrors >= 20) {
        console.error(`⛔ ${consecutiveErrors} consecutive transport errors — proxy likely down; stopping (rows stay pending).`);
        break;
      }
      continue;
    }
    consecutiveErrors = 0;

    let set: Record<string, unknown>;
    if (g.status === "OK" && g.countryCode === "UY" && inUruguay(g.lat, g.lng)) {
      ok++;
      set = {
        lat: g.lat, lng: g.lng, placeId: g.placeId, geocodeConfidence: g.confidence,
        geocodeStatus: "ok", geocodedAddress: query, geocodedAt: new Date(),
      };
    } else if (g.status === "OK" && g.countryCode && g.countryCode !== "UY") {
      // Geocoder placed it abroad — don't store a foreign pin; record so we skip it.
      outOfCountry++;
      set = { lat: null, lng: null, placeId: null, geocodeConfidence: null, geocodeStatus: "out_of_country", geocodedAddress: query, geocodedAt: new Date() };
    } else {
      // ZERO_RESULTS, or OK-but-outside-UY-bbox → no usable point.
      zero++;
      set = { lat: null, lng: null, placeId: null, geocodeConfidence: null, geocodeStatus: "zero_results", geocodedAddress: query, geocodedAt: new Date() };
    }
    if (!dryRun) await RupeRegistryModel.updateOne({ rut: d.rut }, { $set: set });
    if (processed % 100 === 0) console.log(`   …${processed} geocoded (ok ${ok}, zero ${zero}, abroad ${outOfCountry}, err ${errors})`);
    if (pause) await sleep(pause);
  }

  console.log(
    `✅ geocode-rupe: processed ${processed} — ok ${ok}, zero_results ${zero}, out_of_country ${outOfCountry}, `
    + `no_address ${noAddr}, transport_errors ${errors}.${dryRun ? " (--dry-run, no writes)" : ""}`,
  );
  await disconnectFromDatabase();
}

main().catch((e) => {
  console.error("❌ geocode-rupe failed:", e);
  process.exit(1);
});
