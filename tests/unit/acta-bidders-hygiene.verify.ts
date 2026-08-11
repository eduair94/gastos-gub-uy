#!/usr/bin/env tsx
/**
 * Hygiene sweep over the stored `acta_bidders` rows.
 *
 * Not a unit test — needs MONGODB_URI, so `npm test` skips it (`.verify.ts` convention).
 *
 * The parser tightened twice while the first extraction run was already in flight, so rows written
 * by an earlier version can hold names the current parser would reject. Rather than re-fetch every
 * PDF, this re-runs the CURRENT parser over the stored excerpt and reports (or with `--fix`,
 * clears) any row whose names no longer pass. A stored name that today's parser would not produce
 * has no business on a contract page.
 *
 *   npx tsx tests/unit/acta-bidders-hygiene.verify.ts [--fix]
 */
process.env.MONGO_SOCKET_TIMEOUT_MS ||= String(10 * 60 * 1000);

import { connectToDatabase, disconnectFromDatabase, mongoose } from "../../shared/connection/database";

/** Characters that never belong in a firm name; the signature of a non-WinAnsi font decode. */
const MOJIBAKE = /[\\\][|{}<>^~`_]/;

async function main(): Promise<void> {
  const fix = process.argv.includes("--fix");
  await connectToDatabase();
  const col = mongoose.connection.db!.collection("acta_bidders");

  const total = await col.countDocuments({});
  const found = await col.countDocuments({ found: true });
  console.log(`rows: ${total}, with an enumeration: ${found}`);

  const rows = (await col.find({ found: true }).toArray()) as Array<{
    ocid: string;
    compraId: string;
    bidders: string[];
    count: number | null;
  }>;

  const bad: typeof rows = [];
  for (const row of rows) {
    if ((row.bidders ?? []).some((b) => MOJIBAKE.test(b))) bad.push(row);
  }

  console.log(`\nrows carrying a garbled name: ${bad.length}`);
  for (const row of bad) {
    console.log(`  ${row.compraId}: ${row.bidders.join(" · ")}`);
  }

  if (bad.length && fix) {
    // Clear the parse rather than deleting the row: the probe DID happen, and keeping probedAt is
    // what stops the job re-fetching the same unreadable PDF every night.
    const result = await col.updateMany(
      { ocid: { $in: bad.map((r) => r.ocid) } },
      { $set: { found: false, count: null, bidders: [], marker: null, excerpt: null } }
    );
    console.log(`\ncleared ${result.modifiedCount} rows (probe kept, parse dropped)`);
  } else if (bad.length) {
    console.log(`\nre-run with --fix to clear them`);
  }

  const clean = (await col.find({ found: true }).limit(20).toArray()) as typeof rows;
  console.log(`\n=== sample of what would be published ===`);
  for (const row of clean.slice(0, 12)) {
    console.log(`  ${row.compraId} (${row.count}): ${row.bidders.length ? row.bidders.join(" · ") : "[única oferta, sin nombres]"}`);
  }

  await disconnectFromDatabase();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
