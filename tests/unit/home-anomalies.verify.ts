#!/usr/bin/env tsx
/**
 * Live-DB check for what the HOME page's anomaly panel actually shows.
 *
 * Not a unit test — needs MONGODB_URI, so `npm test` skips it by the `.verify.ts` convention.
 *
 *   npx tsx tests/unit/home-anomalies.verify.ts
 */
process.env.MONGO_SOCKET_TIMEOUT_MS ||= String(10 * 60 * 1000);

import { connectToDatabase, disconnectFromDatabase, mongoose } from "../../shared/connection/database";

interface Row {
  releaseId?: string;
  severity?: string;
  confidence?: number;
  detectedValue?: number;
  currency?: string;
  sourceDate?: Date;
  supplier?: string;
  code?: string;
  label?: string;
  n?: number;
  z?: number;
}

function show(title: string, rows: Row[]): void {
  console.log(`\n=== ${title} ===`);
  for (const r of rows) {
    const date = r.sourceDate ? new Date(r.sourceDate).toISOString().slice(0, 10) : "—";
    console.log(
      `  ${date}  ${String(r.releaseId).padEnd(22)} conf=${(r.confidence ?? 0).toFixed(3)} n=${String(r.n).padStart(5)} z=${String(Math.round(r.z ?? 0)).padStart(4)} ${String(r.detectedValue).padStart(10)} ${r.currency} [${r.code}] ${String(r.label).slice(0, 38)}`
    );
  }
}

const PROJECT = {
  _id: 0,
  releaseId: 1,
  severity: 1,
  confidence: 1,
  detectedValue: 1,
  currency: 1,
  supplier: "$metadata.supplierName",
  code: "$metadata.itemClassification.id",
  label: { $ifNull: ["$metadata.itemClassification.canonicalName", "$metadata.itemDescription"] },
  n: "$metadata.baselineN",
  z: "$metadata.zScore",
};

async function main(): Promise<void> {
  await connectToDatabase();
  const anomalies = mongoose.connection.db!.collection("anomalies");

  const withDate = [
    { $lookup: { from: "releases", localField: "releaseId", foreignField: "id", as: "r" } },
    { $set: { sourceDate: { $arrayElemAt: ["$r.date", 0] } } },
    { $project: { ...PROJECT, sourceDate: 1 } },
  ];

  // Exactly what app/pages/index.vue asks for today.
  show(
    "HOME TODAY  severity=critical, sortBy=confidence desc, limit=4",
    (await anomalies
      .aggregate([{ $match: { severity: "critical" } }, { $sort: { confidence: -1, "metadata.zScore": -1, createdAt: -1, _id: -1 } }, { $limit: 4 }, ...withDate])
      .toArray()) as Row[]
  );

  show(
    "SORTED BY SOURCE DATE  severity=critical, limit=8",
    (await anomalies
      .aggregate([{ $match: { severity: "critical" } }, ...withDate, { $sort: { sourceDate: -1, severityRank: -1, "metadata.zScore": -1, _id: -1 } }, { $limit: 8 }], { allowDiskUse: true })
      .toArray()) as Row[]
  );

  show(
    "SORTED BY SOURCE DATE  any severity, limit=8",
    (await anomalies
      .aggregate([...withDate, { $sort: { sourceDate: -1, severityRank: -1, "metadata.zScore": -1, _id: -1 } }, { $limit: 8 }], { allowDiskUse: true })
      .toArray()) as Row[]
  );

  // How concentrated is the top of the confidence ranking?
  const topConf = (await anomalies
    .aggregate([
      { $match: { severity: "critical" } },
      { $sort: { confidence: -1 } },
      { $limit: 40 },
      { $group: { _id: "$metadata.itemClassification.id", n: { $sum: 1 }, label: { $first: "$metadata.itemClassification.canonicalName" } } },
      { $sort: { n: -1 } },
    ])
    .toArray()) as Array<{ _id: string; n: number; label: string }>;
  console.log("\n=== top-40 critical by confidence, grouped by catalogue code ===");
  for (const g of topConf) console.log(`  ${String(g._id).padEnd(8)} ${String(g.n).padStart(3)}  ${g.label ?? ""}`);

  // Triage composition of RECENT criticals: is "newest critical" mostly data-entry noise?
  const composition = (await anomalies
    .aggregate(
      [
        { $match: { severity: "critical" } },
        { $lookup: { from: "releases", localField: "releaseId", foreignField: "id", as: "r" } },
        { $set: { sourceDate: { $arrayElemAt: ["$r.date", 0] } } },
        { $match: { sourceDate: { $gte: new Date("2026-06-01") } } },
        {
          $group: {
            _id: { explainable: { $ifNull: ["$aiVerdict.explainable", "(untriaged)"] }, category: { $ifNull: ["$aiVerdict.category", "—"] } },
            n: { $sum: 1 },
          },
        },
        { $sort: { n: -1 } },
      ],
      { allowDiskUse: true }
    )
    .toArray()) as Array<{ _id: { explainable: string; category: string }; n: number }>;
  console.log("\n=== criticals with source date >= 2026-06-01, by AI verdict ===");
  let recentTotal = 0;
  for (const g of composition) {
    recentTotal += g.n;
    console.log(`  ${g._id.explainable.padEnd(12)} ${g._id.category.padEnd(20)} ${g.n}`);
  }
  console.log(`  TOTAL ${recentTotal}`);

  // Diversity: how many distinct catalogue codes in the newest 20 criticals?
  const newest20 = (await anomalies
    .aggregate([{ $match: { severity: "critical" } }, ...withDate, { $sort: { sourceDate: -1, _id: -1 } }, { $limit: 20 }], { allowDiskUse: true })
    .toArray()) as Row[];
  const codes = new Set(newest20.map((r) => r.code));
  const suppliers = new Set(newest20.map((r) => r.supplier));
  console.log(`\nnewest 20 criticals: ${codes.size} distinct catalogue codes, ${suppliers.size} distinct suppliers`);

  // Option B: newest UNEXPLAINED flags at any severity — the real signal. Is it fresh enough?
  const unexplained = (await anomalies
    .aggregate([{ $match: { "aiVerdict.explainable": "no" } }, ...withDate, { $sort: { sourceDate: -1, severityRank: -1, _id: -1 } }, { $limit: 12 }], { allowDiskUse: true })
    .toArray()) as Row[];
  show("UNEXPLAINED (aiVerdict.explainable = no), any severity, newest first", unexplained);
  console.log(`  total unexplained in corpus: ${await anomalies.countDocuments({ "aiVerdict.explainable": "no" })}`);

  const unexplainedByMonth = (await anomalies
    .aggregate(
      [
        { $match: { "aiVerdict.explainable": "no" } },
        { $lookup: { from: "releases", localField: "releaseId", foreignField: "id", as: "r" } },
        { $set: { sourceDate: { $arrayElemAt: ["$r.date", 0] } } },
        { $group: { _id: { y: { $year: "$sourceDate" }, m: { $month: "$sourceDate" } }, n: { $sum: 1 } } },
        { $sort: { "_id.y": -1, "_id.m": -1 } },
        { $limit: 14 },
      ],
      { allowDiskUse: true }
    )
    .toArray()) as Array<{ _id: { y: number; m: number }; n: number }>;
  console.log(`  unexplained per month: ${unexplainedByMonth.map((r) => `${r._id.y}-${String(r._id.m).padStart(2, "0")}:${r.n}`).join(" ")}`);

  // Freshness: how old is the newest critical flag?
  const newest = (await anomalies.aggregate([{ $match: { severity: "critical" } }, ...withDate, { $sort: { sourceDate: -1 } }, { $limit: 1 }]).toArray()) as Row[];
  const newestAny = (await anomalies.aggregate([...withDate, { $sort: { sourceDate: -1 } }, { $limit: 1 }]).toArray()) as Row[];
  console.log(`\nnewest critical source date : ${newest[0]?.sourceDate ? new Date(newest[0]!.sourceDate!).toISOString().slice(0, 10) : "—"}`);
  console.log(`newest any-severity date    : ${newestAny[0]?.sourceDate ? new Date(newestAny[0]!.sourceDate!).toISOString().slice(0, 10) : "—"}`);
  console.log(`total anomalies             : ${await anomalies.estimatedDocumentCount()}`);

  await disconnectFromDatabase();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
