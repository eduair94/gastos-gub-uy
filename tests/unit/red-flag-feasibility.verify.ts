#!/usr/bin/env tsx
/**
 * Feasibility probe for procurement RED-FLAG indicators over the existing corpus.
 *
 * Not a unit test — needs MONGODB_URI, so `npm test` skips it by the `.verify.ts` convention.
 * One question per block: is the field actually populated often enough to build an indicator on,
 * or is it another feed gap? Run it before designing anything on top.
 *
 * LOAD-BEARING FEED FACT (measured, and already documented at refresh-analytics.ts:166): award
 * releases carry NO `tender` object at all. The tender-phase sibling sharing the same `ocid` does.
 * Every method/bidder question therefore has to be asked of the tender phase and joined by ocid.
 *
 *   npx tsx tests/unit/red-flag-feasibility.verify.ts
 */
process.env.MONGO_SOCKET_TIMEOUT_MS ||= String(30 * 60 * 1000);

import { connectToDatabase, disconnectFromDatabase, mongoose } from "../../shared/connection/database";

const SINCE = new Date("2023-01-01");

function pct(part: number, whole: number): string {
  return whole > 0 ? `${((100 * part) / whole).toFixed(1)}%` : "—";
}

async function main(): Promise<void> {
  await connectToDatabase();
  const db = mongoose.connection.db!;
  const releases = db.collection("releases");

  // --- 1. tender-phase releases: what do THEY carry? -----------------------
  console.log("=== tender-phase releases (tender.procurementMethodDetails present) ===");
  const tenderCov = await releases
    .aggregate(
      [
        { $match: { "tender.procurementMethodDetails": { $type: "string", $ne: "" }, date: { $gte: SINCE } } },
        {
          $group: {
            _id: null,
            n: { $sum: 1 },
            hasTenderers: { $sum: { $cond: [{ $gt: [{ $size: { $ifNull: ["$tender.tenderers", []] } }, 0] }, 1, 0] } },
            hasNumTenderers: { $sum: { $cond: [{ $ifNull: ["$tender.numberOfTenderers", false] }, 1, 0] } },
            hasPeriodEnd: { $sum: { $cond: [{ $ifNull: ["$tender.tenderPeriod.endDate", false] }, 1, 0] } },
            hasPeriodStart: { $sum: { $cond: [{ $ifNull: ["$tender.tenderPeriod.startDate", false] }, 1, 0] } },
            hasValue: { $sum: { $cond: [{ $ifNull: ["$tender.value.amount", false] }, 1, 0] } },
            hasOcid: { $sum: { $cond: [{ $ifNull: ["$ocid", false] }, 1, 0] } },
          },
        },
      ],
      { allowDiskUse: true }
    )
    .toArray();
  const t: any = tenderCov[0] ?? { n: 0 };
  console.log(`  tender-phase releases since ${SINCE.toISOString().slice(0, 10)}: ${t.n}`);
  for (const k of ["hasTenderers", "hasNumTenderers", "hasPeriodStart", "hasPeriodEnd", "hasValue", "hasOcid"]) {
    console.log(`  ${k.padEnd(16)} ${String(t[k]).padStart(7)}  ${pct(t[k], t.n)}`);
  }

  console.log("\n=== methods on the tender phase (top 15) ===");
  const methods = await releases
    .aggregate(
      [
        { $match: { "tender.procurementMethodDetails": { $type: "string", $ne: "" }, date: { $gte: SINCE } } },
        { $group: { _id: "$tender.procurementMethodDetails", n: { $sum: 1 } } },
        { $sort: { n: -1 } },
        { $limit: 15 },
      ],
      { allowDiskUse: true }
    )
    .toArray();
  for (const m of methods as any[]) console.log(`  ${String(m._id).padEnd(46)} ${m.n}`);

  // --- 2. how many AWARDS can be joined to a method via ocid? -------------
  console.log("\n=== award -> method join coverage via ocid ===");
  const joinCov = await releases
    .aggregate(
      [
        { $match: { tag: "award", date: { $gte: SINCE }, ocid: { $type: "string", $ne: "" } } },
        { $project: { ocid: 1 } },
        {
          $lookup: {
            from: "releases",
            let: { o: "$ocid" },
            pipeline: [
              { $match: { $expr: { $eq: ["$ocid", "$$o"] } } },
              { $match: { "tender.procurementMethodDetails": { $type: "string", $ne: "" } } },
              { $limit: 1 },
              { $project: { _id: 0, m: "$tender.procurementMethodDetails" } },
            ],
            as: "t",
          },
        },
        { $group: { _id: null, n: { $sum: 1 }, joined: { $sum: { $cond: [{ $gt: [{ $size: "$t" }, 0] }, 1, 0] } } } },
      ],
      { allowDiskUse: true }
    )
    .toArray();
  const j: any = joinCov[0] ?? { n: 0, joined: 0 };
  console.log(`  awards with an ocid: ${j.n}; of those, ${j.joined} (${pct(j.joined, j.n)}) resolve a procurement method`);

  // --- 3. open_calls: the projected tender collection ---------------------
  console.log("\n=== open_calls collection shape ===");
  const oc = db.collection("open_calls");
  console.log(`  documents: ${await oc.estimatedDocumentCount()}`);
  const sample = await oc.findOne({});
  console.log(`  keys: ${sample ? Object.keys(sample).join(", ") : "(empty)"}`);

  // --- 4. splitting: same buyer+supplier, many awards in one month --------
  // Method-agnostic, because the method only resolves through the ocid sibling. A burst of separate
  // awards to one supplier in one month is the shape of fraccionamiento regardless of its label.
  console.log("\n=== award bursts: buyer+supplier with >=8 separate awards in one calendar month ===");
  const bursts = await releases
    .aggregate(
      [
        { $match: { tag: "award", date: { $gte: SINCE }, "amount.primaryAmount": { $gt: 0, $lt: 50e9 } } },
        { $set: { sup: { $arrayElemAt: [{ $arrayElemAt: ["$awards.suppliers.name", 0] }, 0] } } },
        { $match: { sup: { $ne: null }, "buyer.name": { $ne: null } } },
        {
          $group: {
            _id: { b: "$buyer.name", s: "$sup", y: { $year: "$date" }, m: { $month: "$date" } },
            n: { $sum: 1 },
            uyu: { $sum: "$amount.primaryAmount" },
          },
        },
        { $match: { n: { $gte: 8 } } },
        { $sort: { uyu: -1 } },
        { $limit: 15 },
      ],
      { allowDiskUse: true }
    )
    .toArray();
  for (const s of bursts as any[]) {
    console.log(`  ${s._id.y}-${String(s._id.m).padStart(2, "0")}  ${String(s.n).padStart(3)} adj.  ${(s.uyu / 1e6).toFixed(1)}M UYU  ${String(s._id.b).slice(0, 34)} -> ${String(s._id.s).slice(0, 34)}`);
  }

  // --- 5. buyer x supplier concentration ----------------------------------
  console.log("\n=== buyers whose spend is most concentrated in ONE supplier (>=20 contracts) ===");
  const conc = await releases
    .aggregate(
      [
        { $match: { tag: "award", date: { $gte: SINCE }, "amount.primaryAmount": { $gt: 0, $lt: 50e9 } } },
        { $set: { sup: { $arrayElemAt: [{ $arrayElemAt: ["$awards.suppliers.name", 0] }, 0] } } },
        { $match: { sup: { $ne: null }, "buyer.name": { $ne: null } } },
        { $group: { _id: { b: "$buyer.name", s: "$sup" }, uyu: { $sum: "$amount.primaryAmount" }, n: { $sum: 1 } } },
        { $group: { _id: "$_id.b", total: { $sum: "$uyu" }, contracts: { $sum: "$n" }, top: { $max: "$uyu" }, suppliers: { $sum: 1 } } },
        { $match: { contracts: { $gte: 20 }, total: { $gt: 0 } } },
        { $set: { share: { $divide: ["$top", "$total"] } } },
        { $sort: { share: -1 } },
        { $limit: 12 },
      ],
      { allowDiskUse: true }
    )
    .toArray();
  for (const b of conc as any[]) {
    console.log(`  ${(100 * b.share).toFixed(1)}%  ${String(b.contracts).padStart(5)} contratos  ${String(b.suppliers).padStart(4)} prov.  ${(b.total / 1e6).toFixed(0)}M  ${String(b._id).slice(0, 46)}`);
  }

  await disconnectFromDatabase();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
