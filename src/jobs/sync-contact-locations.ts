#!/usr/bin/env tsx

/**
 * Materialize supplier_contacts.lat/lng as GeoJSON points for indexed map
 * queries. The job is resumable and idempotent: it only rewrites rows whose
 * point is missing or no longer matches the source coordinates.
 *
 * Usage:
 *   npm run sync-contact-locations -- --dry-run
 *   npm run sync-contact-locations
 */

import type { Filter, Document } from "mongodb";
import { connectToDatabase, disconnectFromDatabase, mongoose } from "../../shared/connection/database";

export const validContactCoordinates: Filter<Document> = {
  lat: { $type: "number", $gte: -90, $lte: 90 },
  lng: { $type: "number", $gte: -180, $lte: 180 },
};

export const staleContactLocationFilter: Filter<Document> = {
  ...validContactCoordinates,
  $expr: {
    $ne: [
      { $ifNull: ["$location.coordinates", null] },
      ["$lng", "$lat"],
    ],
  },
};

export async function syncContactLocations(dryRun = false): Promise<{
  pending: number;
  matched: number;
  modified: number;
}> {
  await connectToDatabase();
  const contacts = mongoose.connection.db!.collection("supplier_contacts");
  const pending = await contacts.countDocuments(staleContactLocationFilter);

  if (dryRun || pending === 0) {
    return { pending, matched: 0, modified: 0 };
  }

  const result = await contacts.updateMany(
    staleContactLocationFilter,
    [{
      $set: {
        location: {
          type: "Point",
          coordinates: ["$lng", "$lat"],
        },
      },
    }],
  );

  return {
    pending,
    matched: result.matchedCount,
    modified: result.modifiedCount,
  };
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  try {
    const result = await syncContactLocations(dryRun);
    console.log(
      `CONTACT_LOCATION_SYNC pending=${result.pending} matched=${result.matched} modified=${result.modified}`
      + (dryRun ? " dryRun=true" : ""),
    );
  }
  finally {
    await disconnectFromDatabase();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error("❌ sync-contact-locations failed:", error);
    process.exit(1);
  });
}
