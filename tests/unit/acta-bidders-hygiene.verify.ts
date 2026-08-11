#!/usr/bin/env tsx
/**
 * Hygiene sweep over the stored `acta_bidders` rows.
 *
 * Not a unit test — needs MONGODB_URI, so `npm test` skips it (`.verify.ts` convention).
 *
 * The parser has tightened several times while extraction runs were already in flight — Node holds
 * the old module in memory, so rows written after a fix can still carry pre-fix names. This
 * validates every STORED name against the parser's current rules and, with `--fix`, clears the ones
 * that no longer pass. A name today's parser would not produce has no business on a contract page.
 *
 *   npx tsx tests/unit/acta-bidders-hygiene.verify.ts [--fix]
 */
process.env.MONGO_SOCKET_TIMEOUT_MS ||= String(10 * 60 * 1000);

import { connectToDatabase, disconnectFromDatabase, mongoose } from "../../shared/connection/database";
import { isPlausibleBidderName } from "../../shared/acta-bidders";

/** Last-resort net; the real check is isPlausibleBidderName, which stays in sync with the parser. */
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
    excerpt: string | null;
  }>;

  // Validate each stored NAME on its own, with the parser's own rules.
  //
  // Do NOT re-parse the stored excerpt instead. The excerpt is a truncated window, so a re-parse
  // legitimately yields fewer names than the original full text did, and every missing one then
  // reads as corruption: that check flagged three perfectly good rows — one of them already
  // verified rendering in production — and with `--fix` would have deleted them.
  const bad: typeof rows = [];
  for (const row of rows) {
    const names = row.bidders ?? [];
    // An explicit sole-bidder statement names nobody. That is a valid row, not an empty one.
    if (!names.length) continue;
    if (names.some((b) => MOJIBAKE.test(b) || !isPlausibleBidderName(b))) bad.push(row);
  }

  console.log(`\nrows carrying a name the current parser rejects: ${bad.length}`);
  for (const row of bad) {
    const offenders = row.bidders.filter((b) => MOJIBAKE.test(b) || !isPlausibleBidderName(b));
    console.log(`  ${row.compraId}: ${offenders.join(" · ").slice(0, 200)}`);
  }

  if (bad.length && fix) {
    // Clear the parse rather than deleting the row: the probe DID happen, and keeping probedAt is
    // what stops the job re-fetching the same PDF every night.
    const result = await col.updateMany(
      { ocid: { $in: bad.map((r) => r.ocid) } },
      { $set: { found: false, count: null, bidders: [], marker: null, excerpt: null } }
    );
    console.log(`\ncleared ${result.modifiedCount} rows (probe kept, parse dropped)`);
  }
  else if (bad.length) {
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
