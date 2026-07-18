#!/usr/bin/env tsx

/**
 * Populate the monthly BCU rate table (exchange_rates) used to show any price
 * in a comparable value — foreign converted at its own month, and pesos deflated
 * to today via the Unidad Indexada.
 *
 * Source: the public cambio-uruguay API, BCU series (USD, EUR, UI). It serves a
 * daily look-back window (~last 60 months), which we average per calendar month
 * and upsert. Run nightly: each run refreshes recent months and appends the new
 * one, so "today's pesos" stays current on its own. It NEVER deletes months, so
 * a historical seed loaded once (for pre-window years) survives every refresh.
 *
 * Usage:
 *   npx tsx src/jobs/refresh-exchange-rates.ts            # USD, EUR, UI, 60 months
 *   npx tsx src/jobs/refresh-exchange-rates.ts --period=72
 */

import { ExchangeRateModel } from "../../shared/models";
import { connectToDatabase, disconnectFromDatabase } from "../../shared/connection/database";

const API = "https://api.cambio-uruguay.com/evolution/bcu";
const FIELD: Record<string, "usd" | "eur" | "ui"> = { USD: "usd", EUR: "eur", UI: "ui" };

interface RateRow {
  date: string;
  buy: number;
  sell: number;
  type?: string;
}

async function fetchSeries(code: string, period: number): Promise<RateRow[]> {
  const res = await fetch(`${API}/${code}?period=${period}`, {
    headers: { "user-agent": "conlatuya.checkleaked.cc (datos abiertos)" },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`${code}: HTTP ${res.status}`);
  const data = (await res.json()) as { evolution?: RateRow[] };
  return Array.isArray(data.evolution) ? data.evolution : [];
}

/** Average the daily `sell` per calendar month (one value per day — dedupe the type variants). */
function monthlyAverages(rows: RateRow[]): Map<string, number> {
  const perDay = new Map<string, number>(); // day -> sell (last wins; the type variants are ~identical)
  for (const r of rows) {
    const v = typeof r.sell === "number" && Number.isFinite(r.sell) && r.sell > 0 ? r.sell : null;
    if (v === null || !r.date) continue;
    perDay.set(r.date.slice(0, 10), v);
  }
  const sums = new Map<string, { sum: number; n: number }>();
  for (const [day, v] of perDay) {
    const month = day.slice(0, 7);
    const s = sums.get(month) ?? { sum: 0, n: 0 };
    s.sum += v;
    s.n += 1;
    sums.set(month, s);
  }
  const avg = new Map<string, number>();
  for (const [month, s] of sums) avg.set(month, s.sum / s.n);
  return avg;
}

async function main(): Promise<void> {
  const periodArg = process.argv.find((a) => a.startsWith("--period="));
  const period = periodArg ? Math.max(1, Math.min(72, Number.parseInt(periodArg.slice(9), 10) || 60)) : 60;

  console.log(`💱 Refreshing BCU rate table (period=${period} months)`);
  await connectToDatabase();

  // month -> { usd, eur, ui }
  const byMonth = new Map<string, { usd?: number; eur?: number; ui?: number }>();
  for (const code of Object.keys(FIELD)) {
    try {
      const rows = await fetchSeries(code, period);
      const avg = monthlyAverages(rows);
      for (const [month, value] of avg) {
        const rec = byMonth.get(month) ?? {};
        rec[FIELD[code]!] = Number(value.toFixed(6));
        byMonth.set(month, rec);
      }
      console.log(`   ${code.padEnd(4)}: ${avg.size} months (${rows.length} daily points)`);
    } catch (err) {
      console.warn(`   ${code}: fetch failed — ${(err as Error).message}`);
    }
  }

  let upserts = 0;
  const now = new Date();
  for (const [month, rec] of [...byMonth].sort()) {
    // Only set the fields we actually got, so a temporarily-missing series never
    // wipes a previously-stored value.
    const $set: Record<string, unknown> = { month, updatedAt: now };
    if (rec.usd !== undefined) $set.usd = rec.usd;
    if (rec.eur !== undefined) $set.eur = rec.eur;
    if (rec.ui !== undefined) $set.ui = rec.ui;
    await ExchangeRateModel.updateOne({ month }, { $set }, { upsert: true });
    upserts += 1;
  }

  const total = await ExchangeRateModel.countDocuments();
  const latest = await ExchangeRateModel.findOne().sort({ month: -1 }).lean();
  console.log(`   upserted ${upserts} months | table now holds ${total} months`);
  console.log(`   latest: ${latest?.month} → USD ${latest?.usd}, UI ${latest?.ui}`);
}

if (require.main === module) {
  main()
    .then(async () => {
      await disconnectFromDatabase();
      console.log("✅ Rate table refreshed");
      process.exit(0);
    })
    .catch(async (error) => {
      console.error("❌ Rate refresh failed:", error);
      await disconnectFromDatabase().catch(() => undefined);
      process.exit(1);
    });
}
