#!/usr/bin/env tsx
/**
 * Scale check for the acta bidder parser: run it over real actas and eyeball what it produces.
 *
 * Not a unit test — needs MONGODB_URI and hits comprasestatales.gub.uy, so `npm test` skips it by
 * the `.verify.ts` convention. Sample modestly and serially: this is the same host the pliego and
 * reiteración probes use.
 *
 * What matters here is not recall — the coverage ceiling is a property of the actas, measured at
 * roughly 8% in acta-bidders-feasibility.verify.ts. What matters is PRECISION: every row it prints
 * must be a plausible list of firms, because a fabricated bidder on a contract page is far worse
 * than a missing one.
 *
 *   npx tsx tests/unit/acta-bidders-parser.verify.ts [--limit=60]
 */
process.env.MONGO_SOCKET_TIMEOUT_MS ||= String(15 * 60 * 1000);

import { connectToDatabase, disconnectFromDatabase, mongoose } from "../../shared/connection/database";
import { parseActaBidders } from "../../shared/acta-bidders";
import { extractActaText } from "../../shared/acta-pdf-text";

const UA = "gastos-gub research probe (+https://github.com/eduair94)";
const DELAY_MS = 700;
const COMPETITIVE = ["Licitación Abreviada", "Licitación Pública", "Concurso de Precios"];

async function main(): Promise<void> {
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const LIMIT = limitArg ? Number(limitArg.slice("--limit=".length)) : 60;

  await connectToDatabase();
  const db = mongoose.connection.db!;

  const rows = (await db
    .collection("releases")
    .aggregate(
      [
        {
          $match: {
            "tender.procurementMethodDetails": { $in: COMPETITIVE },
            "date": { $gte: new Date("2024-06-01") },
            "ocid": { $type: "string", $ne: "" },
          },
        },
        { $project: { _id: 0, ocid: 1, method: "$tender.procurementMethodDetails" } },
        { $group: { _id: "$ocid", method: { $first: "$method" } } },
        {
          $lookup: {
            from: "releases",
            let: { o: "$_id" },
            pipeline: [
              { $match: { $expr: { $eq: ["$ocid", "$$o"] } } },
              { $match: { tag: "award" } },
              { $limit: 1 },
              { $project: { _id: 0, buyer: "$buyer.name", supplier: { $arrayElemAt: [{ $arrayElemAt: ["$awards.suppliers.name", 0] }, 0] } } },
            ],
            as: "aw",
          },
        },
        { $match: { "aw.0": { $exists: true } } },
        { $limit: LIMIT },
      ],
      { allowDiskUse: true }
    )
    .toArray()) as Array<{ _id: string; method: string; aw: Array<{ buyer: string; supplier: string }> }>;

  let fetched = 0;
  let parsed = 0;
  let soleBidder = 0;
  let winnerListed = 0;
  const byMarker = new Map<string, number>();

  for (const row of rows) {
    const compraId = row._id.split("-").pop()!;
    let text = "";
    try {
      const res = await fetch(`https://www.comprasestatales.gub.uy/Resoluciones/acta_${compraId}.pdf`, { headers: { "User-Agent": UA } });
      if (!res.ok) continue;
      text = extractActaText(Buffer.from(await res.arrayBuffer()));
      fetched++;
    } catch {
      continue;
    }

    const result = parseActaBidders(text);
    if (result) {
      parsed++;
      byMarker.set(result.marker, (byMarker.get(result.marker) ?? 0) + 1);
      if (result.count === 1 && result.bidders.length === 0) soleBidder++;
      // Sanity signal: when the acta enumerates, the WINNER should usually be among the names.
      const winner = (row.aw[0]?.supplier ?? "").toUpperCase();
      const hit = winner && result.bidders.some((b) => b.toUpperCase().includes(winner.slice(0, 12)) || winner.includes(b.toUpperCase().slice(0, 12)));
      if (hit) winnerListed++;
      console.log(`\n  ${compraId} [${row.method}] marker="${result.marker}" count=${result.count}${hit ? "  ✓winner-in-list" : ""}`);
      for (const b of result.bidders) console.log(`      · ${b}`);
      console.log(`      ganador según el feed: ${row.aw[0]?.supplier ?? "—"}`);
    }
    await new Promise((r) => setTimeout(r, DELAY_MS));
  }

  console.log(`\n=== summary ===`);
  console.log(`  actas fetched          : ${fetched}`);
  console.log(`  parsed an enumeration  : ${parsed} (${fetched ? ((100 * parsed) / fetched).toFixed(1) : "0"}%)`);
  console.log(`  of those, sole-bidder  : ${soleBidder}`);
  console.log(`  winner found in the list: ${winnerListed}/${parsed - soleBidder} enumerated`);
  console.log(`  markers:`);
  for (const [k, v] of [...byMarker].sort((a, b) => b[1] - a[1])) console.log(`     ${k.padEnd(28)} ${v}`);

  await disconnectFromDatabase();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
