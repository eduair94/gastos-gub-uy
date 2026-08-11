#!/usr/bin/env tsx
/**
 * Second feasibility probe: the two indicators whose SHAPE decides the design.
 *
 * Not a unit test — needs MONGODB_URI, so `npm test` skips it (`.verify.ts` convention).
 *
 *   npx tsx tests/unit/integrity-signals-feasibility.verify.ts
 */
process.env.MONGO_SOCKET_TIMEOUT_MS ||= String(30 * 60 * 1000);

import { connectToDatabase, disconnectFromDatabase, mongoose } from "../../shared/connection/database";

const SINCE = new Date("2023-01-01");

async function main(): Promise<void> {
  await connectToDatabase();
  const db = mongoose.connection.db!;
  const releases = db.collection("releases");

  // --- bidding window length by method ------------------------------------
  console.log("=== tenderPeriod length (days) by procurement method ===");
  const windows = await releases
    .aggregate(
      [
        {
          $match: {
            "tender.procurementMethodDetails": { $type: "string", $ne: "" },
            "tender.tenderPeriod.startDate": { $type: "date" },
            "tender.tenderPeriod.endDate": { $type: "date" },
            "date": { $gte: SINCE },
          },
        },
        {
          $set: {
            days: {
              $divide: [{ $subtract: ["$tender.tenderPeriod.endDate", "$tender.tenderPeriod.startDate"] }, 86400000],
            },
          },
        },
        { $match: { days: { $gte: 0, $lte: 400 } } },
        {
          $group: {
            _id: "$tender.procurementMethodDetails",
            n: { $sum: 1 },
            avg: { $avg: "$days" },
            min: { $min: "$days" },
            max: { $max: "$days" },
            under1: { $sum: { $cond: [{ $lt: ["$days", 1] }, 1, 0] } },
            under3: { $sum: { $cond: [{ $lt: ["$days", 3] }, 1, 0] } },
          },
        },
        { $match: { n: { $gte: 50 } } },
        { $sort: { n: -1 } },
      ],
      { allowDiskUse: true }
    )
    .toArray();
  for (const w of windows as any[]) {
    console.log(
      `  ${String(w._id).padEnd(34)} n=${String(w.n).padStart(6)} avg=${w.avg.toFixed(1)}d min=${w.min.toFixed(1)} max=${w.max.toFixed(0)} <1d=${w.under1} (${((100 * w.under1) / w.n).toFixed(1)}%) <3d=${w.under3} (${((100 * w.under3) / w.n).toFixed(1)}%)`
    );
  }

  // --- how many distinct buyers carry enough volume for an organism rollup? ---
  console.log("\n=== buyers by contract volume (rollup population) ===");
  const buyers = await releases
    .aggregate(
      [
        { $match: { tag: "award", date: { $gte: SINCE }, "buyer.id": { $type: "string", $ne: "" } } },
        { $group: { _id: "$buyer.id", n: { $sum: 1 }, name: { $first: "$buyer.name" } } },
        {
          $group: {
            _id: null,
            buyers: { $sum: 1 },
            ge20: { $sum: { $cond: [{ $gte: ["$n", 20] }, 1, 0] } },
            ge50: { $sum: { $cond: [{ $gte: ["$n", 50] }, 1, 0] } },
            ge200: { $sum: { $cond: [{ $gte: ["$n", 200] }, 1, 0] } },
          },
        },
      ],
      { allowDiskUse: true }
    )
    .toArray();
  console.dir(buyers[0], { depth: 3 });

  // --- what other collections already exist (do not duplicate a rollup) ----
  console.log("\n=== existing collections ===");
  const names = (await db.listCollections().toArray()).map((c) => c.name).sort();
  console.log("  " + names.join(", "));

  // --- RUPE: is there a registration date to derive supplier age from? ----
  for (const coll of names.filter((n) => /rupe|supplier/i.test(n))) {
    const doc = await db.collection(coll).findOne({});
    console.log(`\n=== ${coll} (${await db.collection(coll).estimatedDocumentCount()} docs) ===`);
    console.log("  keys: " + (doc ? Object.keys(doc).join(", ") : "(empty)"));
  }

  await disconnectFromDatabase();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
