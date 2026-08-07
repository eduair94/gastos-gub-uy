#!/usr/bin/env tsx
/**
 * Live-DB check for the timbre rescore (`--classification=10233 --score-only`).
 *
 * Not a unit test — it needs MONGODB_URI, so `npm test` skips it by the `.verify.ts` convention.
 * It measures what the rescore would change BEFORE it is run for real: how many anomalies currently
 * sit inside the scope the rescore will reconcile, how they break down by catalogue code and year,
 * and specifically which of the `10233` findings are the false positives the official DGI schedule
 * should retire.
 *
 *   npx tsx tests/unit/timbre-rescore-impact.verify.ts
 */
process.env.MONGO_SOCKET_TIMEOUT_MS ||= String(30 * 60 * 1000);

import { connectToDatabase, disconnectFromDatabase, mongoose } from "../../shared/connection/database";
import { officialTimbrePrices } from "../../shared/timbre-values";

const TIMBRE_CODE = "10233";

async function main(): Promise<void> {
  await connectToDatabase();
  const db = mongoose.connection.db!;

  const releaseIds = await db.collection("releases").distinct("id", { tag: "award", "awards.items.classification.id": TIMBRE_CODE });
  console.log(`releases in rescore scope        : ${releaseIds.length}`);

  const inScope = await db.collection("anomalies").countDocuments({ releaseId: { $in: releaseIds } });
  console.log(`anomalies currently in that scope: ${inScope}`);

  const byCode = await db
    .collection("anomalies")
    .aggregate(
      [
        { $match: { releaseId: { $in: releaseIds } } },
        { $group: { _id: "$metadata.itemClassification.id", n: { $sum: 1 } } },
        { $sort: { n: -1 } },
        { $limit: 12 },
      ],
      { allowDiskUse: true }
    )
    .toArray();
  console.log("top classifications inside the scope:");
  for (const row of byCode) {
    console.log(`   ${String(row._id).padEnd(10)} ${row.n}`);
  }

  const byYear = await db
    .collection("anomalies")
    .aggregate(
      [
        { $match: { releaseId: { $in: releaseIds } } },
        { $group: { _id: "$sourceYear", n: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ],
      { allowDiskUse: true }
    )
    .toArray();
  console.log(`years represented in the scope   : ${byYear.map((r) => `${r._id}:${r.n}`).join(" ")}`);

  const timbre = await db
    .collection("anomalies")
    .aggregate(
      [
        { $match: { "metadata.itemClassification.id": TIMBRE_CODE } },
        { $lookup: { from: "releases", localField: "releaseId", foreignField: "id", as: "rel" } },
        { $unwind: { path: "$rel", preserveNullAndEmptyArrays: true } },
        {
          $project: {
            releaseId: 1,
            severity: 1,
            currency: 1,
            detectedValue: 1,
            expectedRange: 1,
            description: 1,
            officialTariff: "$metadata.officialTariff",
            date: "$rel.date",
          },
        },
        { $sort: { detectedValue: -1 } },
      ],
      { allowDiskUse: true }
    )
    .toArray();

  console.log(`\n${TIMBRE_CODE} anomalies: ${timbre.length}`);
  let legal = 0;
  for (const a of timbre as Array<Record<string, any>>) {
    const menu = a.currency === "UYU" ? officialTimbrePrices(a.date) : null;
    const verdict = menu ? (menu.values.has(a.detectedValue) ? "LEGAL -> must disappear" : "off-menu -> stays") : "no table -> unchanged";
    if (menu?.values.has(a.detectedValue)) legal++;
    const range = a.expectedRange ? `${a.expectedRange.min}..${a.expectedRange.max}` : "—";
    const stamped = a.officialTariff ? ` officialTariff{nearest=${a.officialTariff.nearest} aboveMax=${a.officialTariff.aboveLegalMax}}` : "";
    console.log(`  ${a.releaseId.padEnd(22)} ${String(a.date?.toISOString().slice(0, 10)).padEnd(11)} ${String(a.detectedValue).padStart(10)} ${a.currency} [${a.severity}] range=${range} ${verdict}${stamped}`);
  }
  console.log(`\nlegally-priced findings that must be retired: ${legal}`);

  await disconnectFromDatabase();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
