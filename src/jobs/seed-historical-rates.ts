#!/usr/bin/env tsx

/**
 * One-time backfill of the monthly BCU rate table (exchange_rates) for the years
 * the nightly refresh cannot reach.
 *
 * src/jobs/refresh-exchange-rates.ts is fed by cambio-uruguay, whose API rejects
 * period > 60 months, so the table starts at 2022-12. Everything older converted
 * at today's rate, which is exactly the error shared/utils/real-value.ts exists to
 * avoid — it simply had no months to work with. That job never deletes months, so
 * a seed loaded once survives every refresh (by design).
 *
 * Source: the BCU SOAP service (src/jobs/lib/bcu-historical-rates.ts).
 *
 * Usage:
 *   npx tsx src/jobs/seed-historical-rates.ts                 # dry-run, 2000-01..2022-11
 *   npx tsx src/jobs/seed-historical-rates.ts --commit
 *   npx tsx src/jobs/seed-historical-rates.ts --from=2004 --to=2006 --commit
 *
 * IMPORTANT (discovered while testing against the live BCU service, not documented
 * in the SOAP contract anywhere): the service enforces an undocumented range limit
 * that scales down sharply with the number of currencies (`Moneda` items) in one
 * request. A single code can span a full calendar year (~365 days) fine, but 2-3
 * codes together only tolerate roughly 60 days before the service rejects the
 * whole call with a *parameter* error (codigoerror=104, "Rango de fechas excede lo
 * permitido") — confirmed on both a 2005 range and a 2024 control range, so it is
 * not a quirk of old data. Requesting all three codes per calendar year (as a
 * naive reading of the interface suggests) therefore fails for every single year,
 * seeding nothing. So: one fetchBcuRange call per currency per year, not one call
 * for all three. This also isolates BCU's other real error — "No existe
 * cotización" (codigoerror=100) for years before a series existed (UI predates
 * ~2002; see fetchBcuRange docs) — to just that currency instead of losing the
 * other two for the whole year.
 */

import { connectToDatabase, disconnectFromDatabase } from "../../shared/connection/database";
import { ExchangeRateModel } from "../../shared/models";
import { BCU_CODES, fetchBcuRange, monthlyAveragesByCurrency } from "./lib/bcu-historical-rates";

const DEFAULT_FROM_YEAR = 2000;
/** The nightly job owns 2022-12 onward; stop just before it. */
const DEFAULT_TO_YEAR = 2022;
const DEFAULT_TO_MONTH = "2022-11";
/** Be a good citizen: the service is a public bank endpoint. */
const DELAY_MS = 1500;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function arg(name: string): string | null {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}

async function main(): Promise<void> {
  const commit = process.argv.includes("--commit");
  const fromYear = Number(arg("from") ?? DEFAULT_FROM_YEAR);
  const toYear = Number(arg("to") ?? DEFAULT_TO_YEAR);
  const codes = [BCU_CODES.usd, BCU_CODES.eur, BCU_CODES.ui];

  console.log(`💱 Seeding historical BCU rates ${fromYear}..${toYear}${commit ? "" : "  (DRY RUN)"}`);
  await connectToDatabase();

  const before = await ExchangeRateModel.countDocuments();
  console.log(`   exchange_rates currently holds ${before} months`);

  let upserts = 0;
  let fetched = 0;
  const now = new Date();

  // One request per currency per calendar year. BCU rejects a combined multi-currency
  // request once the range exceeds ~60 days (see file header), so codes must be
  // fetched separately to cover a full year each; this also keeps one currency's
  // missing-history error (e.g. UI before it existed) from wiping out the other two.
  for (let year = fromYear; year <= toYear; year++) {
    const from = `${year}-01-01`;
    const to = `${year}-12-31`;
    const rows: Awaited<ReturnType<typeof fetchBcuRange>> = [];
    for (const code of codes) {
      try {
        const codeRows = await fetchBcuRange([code], from, to);
        rows.push(...codeRows);
      } catch (err) {
        console.warn(`   ${year} code=${code}: fetch failed — ${(err as Error).message}`);
      }
      await sleep(DELAY_MS);
    }
    fetched += rows.length;

    const byMonth = monthlyAveragesByCurrency(rows);
    const months = [...byMonth.keys()].sort().filter((m) => m <= DEFAULT_TO_MONTH);
    console.log(`   ${year}: ${rows.length} daily rows -> ${months.length} months`);

    for (const month of months) {
      const rec = byMonth.get(month)!;
      if (rec.usd === undefined && rec.eur === undefined && rec.ui === undefined) continue;
      if (!commit) continue;
      // Only set the fields we actually got, so a missing series never wipes a stored value.
      const $set: Record<string, unknown> = { month, updatedAt: now };
      if (rec.usd !== undefined) $set.usd = rec.usd;
      if (rec.eur !== undefined) $set.eur = rec.eur;
      if (rec.ui !== undefined) $set.ui = rec.ui;
      await ExchangeRateModel.updateOne({ month }, { $set }, { upsert: true });
      upserts += 1;
    }
  }

  const after = await ExchangeRateModel.countDocuments();
  const earliest = await ExchangeRateModel.findOne().sort({ month: 1 }).lean();
  console.log(`   fetched ${fetched} daily rows | upserted ${upserts} months`);
  console.log(`   exchange_rates: ${before} -> ${after} months, earliest now ${earliest?.month}`);
  if (!commit) console.log("   🧪 dry run: nothing written. Re-run with --commit.");
}

if (require.main === module) {
  main()
    .then(async () => {
      await disconnectFromDatabase();
      console.log("✅ Historical rate seed complete");
      process.exit(0);
    })
    .catch(async (error) => {
      console.error("❌ Seed failed:", error);
      await disconnectFromDatabase().catch(() => undefined);
      process.exit(1);
    });
}
