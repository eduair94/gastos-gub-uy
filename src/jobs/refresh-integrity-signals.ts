#!/usr/bin/env tsx
/**
 * Señales de gestión — per-organism procurement risk indicators.
 *
 * One document per `buyer.id` over a trailing window, written to `integrity_signals` by
 * compute-then-swap. Read by /api/analytics/integrity-signals with a plain indexed find: every
 * measurement here is a COLLSCAN (`releases.buyer.id` has no index) and must never touch a request
 * path.
 *
 * ## The five signals
 *
 *   1. concentration      Σ UYU of the largest supplier / Σ UYU of the organism
 *   2. bursts             (supplier, calendar month) pairs with >= BURST_MIN_AWARDS separate awards
 *   3. directAward        non-competitive share of the METHOD-RESOLVED awards
 *   4. expressWindow      calls whose bidding window is under the 5th percentile OF THEIR OWN METHOD
 *   5. unexplainedPrices  anomalies that survived the detector AND the AI triage
 *
 * Thresholds, their corpus justification, and the indicators that are impossible on this feed
 * (single bidding, estimated-vs-awarded value, December dumping) live in shared/integrity-signals.ts.
 *
 * ## Feed facts this job is built around — do not "simplify" past them
 *
 *   - Award releases carry NO `tender` object (0%, measured). The procurement method and the
 *     bidding window only exist on the TENDER-PHASE sibling sharing the same `ocid`, and resolve for
 *     ~27% of awards. Both denominators are stored so the page can disclose them.
 *   - `amount.primaryAmount` is the only money field (never re-sum award item unit prices), capped
 *     at PLAUSIBILITY_CEIL exactly like organism_group_stats / dept_indicators.
 *   - The release amount is NOT apportioned per supplier, so concentration is an UPPER BOUND.
 *
 * Usage:
 *   npx tsx src/jobs/refresh-integrity-signals.ts
 *   npx tsx src/jobs/refresh-integrity-signals.ts --dry-run
 *   npx tsx src/jobs/refresh-integrity-signals.ts --months=60
 */
import type { PipelineStage } from "mongoose";
import { connectToDatabase, disconnectFromDatabase } from "../../shared/connection/database";
import { AnomalyModel, IntegritySignalModel, ReleaseModel } from "../../shared/models";
import { methodClass } from "../../shared/procurement-method";
import {
  BURST_MIN_AWARDS,
  classifyOrganism,
  deriveCutoffs,
  EXPRESS_PERCENTILE,
  measureOrganism,
  MIN_CALLS_FOR_METHOD_BASELINE,
  MIN_CONTRACTS_FOR_SIGNALS,
  OrganismMeasurement,
  percentile,
  SIGNAL_KEYS,
  SignalKey,
  signalWeight,
} from "../../shared/integrity-signals";

/** Same plausibility ceiling as organism_group_stats / dept_indicators / analytics-pipeline. */
const PLAUSIBILITY_CEIL = 5e10;
const DEFAULT_WINDOW_MONTHS = 36;
const BULK_BATCH = 500;
const AGG = { allowDiskUse: true } as const;

interface Options {
  dryRun: boolean;
  months: number;
}

function parseArgs(argv: string[]): Options {
  const options: Options = { dryRun: false, months: DEFAULT_WINDOW_MONTHS };
  for (const arg of argv) {
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg.startsWith("--months=")) {
      const months = Number.parseInt(arg.slice("--months=".length), 10);
      if (!Number.isInteger(months) || months < 1 || months > 300) {
        throw new Error(`Invalid --months value: ${arg}`);
      }
      options.months = months;
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function monthsAgo(from: Date, months: number): Date {
  return new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() - months, from.getUTCDate()));
}

/**
 * ocid → procurement method, from the tender-phase releases.
 *
 * Built once for the whole run and held in memory: ~155k tender-phase releases since 2023 collapse
 * to one string per ocid, which is a few MB — far cheaper than a $lookup per award, and Mongo 4.4
 * has no way to hash-join this at scale inside the 100MB per-stage budget.
 */
async function loadMethodsByOcid(windowStart: Date): Promise<Map<string, string>> {
  const rows: Array<{ _id: string; method: string }> = await ReleaseModel.aggregate(
    [
      {
        $match: {
          "ocid": { $type: "string", $ne: "" },
          "tender.procurementMethodDetails": { $type: "string", $ne: "" },
          // Tender phase precedes its award, so reach back a year beyond the award window or the
          // oldest awards in scope lose their method.
          "date": { $gte: monthsAgo(windowStart, 12) },
        },
      },
      { $project: { _id: 0, ocid: 1, method: "$tender.procurementMethodDetails", date: 1 } },
      // Latest non-empty method wins when a llamado was updated.
      { $sort: { ocid: 1, date: -1 } },
      { $group: { _id: "$ocid", method: { $first: "$method" } } },
    ],
    AGG
  );
  return new Map(rows.map((r) => [r._id, r.method]));
}

/**
 * ocid → bidding-window length in days, plus the per-method express cutoff.
 *
 * The cutoff is the EXPRESS_PERCENTILE of each method's own distribution, because the methods are
 * not comparable: Licitación Abreviada never runs under 3.5 days while Compra Directa runs a third
 * of its calls under 3. A method with fewer than MIN_CALLS_FOR_METHOD_BASELINE measured windows gets
 * no cutoff at all, so its calls are never called express on a baseline of nothing.
 */
async function loadWindowsByOcid(windowStart: Date): Promise<{
  daysByOcid: Map<string, number>;
  cutoffByMethod: Map<string, number>;
}> {
  const rows: Array<{ _id: string; method: string; days: number }> = await ReleaseModel.aggregate(
    [
      {
        $match: {
          "ocid": { $type: "string", $ne: "" },
          "tender.procurementMethodDetails": { $type: "string", $ne: "" },
          "tender.tenderPeriod.startDate": { $type: "date" },
          "tender.tenderPeriod.endDate": { $type: "date" },
          "date": { $gte: monthsAgo(windowStart, 12) },
        },
      },
      {
        $project: {
          _id: 0,
          ocid: 1,
          date: 1,
          method: "$tender.procurementMethodDetails",
          days: {
            $divide: [{ $subtract: ["$tender.tenderPeriod.endDate", "$tender.tenderPeriod.startDate"] }, 86400000],
          },
        },
      },
      // Negative or year-long spans are data errors, not express calls; excluding them keeps the
      // percentile honest at both ends.
      { $match: { days: { $gte: 0, $lte: 400 } } },
      { $sort: { ocid: 1, date: -1 } },
      { $group: { _id: "$ocid", method: { $first: "$method" }, days: { $first: "$days" } } },
    ],
    AGG
  );

  const daysByOcid = new Map<string, number>();
  const byMethod = new Map<string, number[]>();
  for (const r of rows) {
    daysByOcid.set(r._id, r.days);
    const bucket = byMethod.get(r.method);
    if (bucket) bucket.push(r.days);
    else byMethod.set(r.method, [r.days]);
  }

  const cutoffByMethod = new Map<string, number>();
  for (const [method, values] of byMethod) {
    if (values.length < MIN_CALLS_FOR_METHOD_BASELINE) continue;
    values.sort((a, b) => a - b);
    const cutoff = percentile(values, EXPRESS_PERCENTILE);
    if (cutoff !== null) cutoffByMethod.set(method, cutoff);
  }
  return { daysByOcid, cutoffByMethod };
}

interface AwardRow {
  _id: { b: string; s: string | null; y: number; m: number };
  n: number;
  uyu: number;
  name: string | null;
  ocids: string[];
}

/**
 * One pass over the priced awards in the window, grouped by (buyer, supplier, year, month).
 *
 * That single grain feeds four of the five signals: summing it by buyer gives volume and
 * concentration, the group counts ARE the bursts, and the collected ocids resolve method and window
 * in JS. `$addToSet` on ocid is bounded by the group's award count, which the burst rule already
 * tells us is small; `$push` is banned repo-wide because it does not spill to disk.
 */
async function loadAwardGrain(windowStart: Date, windowEnd: Date): Promise<AwardRow[]> {
  const pipeline: PipelineStage[] = [
    {
      $match: {
        "tag": "award",
        "date": { $gte: windowStart, $lte: windowEnd },
        "buyer.id": { $type: "string", $ne: "" },
        "amount.primaryAmount": { $gt: 0, $lte: PLAUSIBILITY_CEIL },
      },
    },
    {
      $project: {
        _id: 0,
        b: "$buyer.id",
        name: "$buyer.name",
        ocid: 1,
        uyu: "$amount.primaryAmount",
        y: { $year: "$date" },
        m: { $month: "$date" },
        s: { $arrayElemAt: [{ $arrayElemAt: ["$awards.suppliers.name", 0] }, 0] },
      },
    },
    {
      $group: {
        _id: { b: "$b", s: "$s", y: "$y", m: "$m" },
        n: { $sum: 1 },
        uyu: { $sum: "$uyu" },
        name: { $first: "$name" },
        ocids: { $addToSet: "$ocid" },
      },
    },
  ];
  return ReleaseModel.aggregate(pipeline, AGG);
}

/** buyer.id → count of flags the AI triage could not explain. */
async function loadUnexplainedByBuyer(windowStart: Date, windowEnd: Date): Promise<Map<string, number>> {
  const rows: Array<{ _id: string; n: number }> = await AnomalyModel.aggregate(
    [
      { $match: { "aiVerdict.explainable": "no" } },
      { $project: { _id: 0, releaseId: 1 } },
      {
        $lookup: {
          from: "releases",
          localField: "releaseId",
          foreignField: "id",
          as: "r",
        },
      },
      { $set: { b: { $arrayElemAt: ["$r.buyer.id", 0] }, d: { $arrayElemAt: ["$r.date", 0] } } },
      { $match: { b: { $type: "string" }, d: { $gte: windowStart, $lte: windowEnd } } },
      { $group: { _id: "$b", n: { $sum: 1 } } },
    ],
    AGG
  );
  return new Map(rows.map((r) => [r._id, r.n]));
}

/** Per-buyer accumulator, folded from the (buyer, supplier, month) grain. */
interface Accumulator {
  buyerId: string;
  buyerName: string | null;
  contracts: number;
  totalUyu: number;
  supplierUyu: Map<string, number>;
  burstCount: number;
  burstWorstAwards: number;
  burstWorstSupplier: string | null;
  burstWorstMonth: string | null;
  burstWorstUyu: number;
  methodKnown: number;
  directCount: number;
  tenderCount: number;
  otherMethodCount: number;
  callsWithWindow: number;
  expressCalls: number;
  shortestWindowDays: number | null;
  seenOcids: Set<string>;
}

function emptyAccumulator(buyerId: string): Accumulator {
  return {
    buyerId,
    buyerName: null,
    contracts: 0,
    totalUyu: 0,
    supplierUyu: new Map(),
    burstCount: 0,
    burstWorstAwards: 0,
    burstWorstSupplier: null,
    burstWorstMonth: null,
    burstWorstUyu: 0,
    methodKnown: 0,
    directCount: 0,
    tenderCount: 0,
    otherMethodCount: 0,
    callsWithWindow: 0,
    expressCalls: 0,
    shortestWindowDays: null,
    seenOcids: new Set(),
  };
}

async function run(options: Options): Promise<void> {
  const started = Date.now();
  if (!process.env.MONGO_SOCKET_TIMEOUT_MS) {
    process.env.MONGO_SOCKET_TIMEOUT_MS = String(30 * 60 * 1000);
  }
  const dataVersion = `v${Date.now()}`;
  const windowEnd = new Date();
  const windowStart = monthsAgo(windowEnd, options.months);

  console.log(`[integrity-signals] window ${windowStart.toISOString().slice(0, 10)} .. ${windowEnd.toISOString().slice(0, 10)} (${options.months} months)`);
  await connectToDatabase();

  console.log("[integrity-signals] loading tender-phase methods by ocid…");
  const methodByOcid = await loadMethodsByOcid(windowStart);
  console.log(`   methods resolved for ${methodByOcid.size} ocids`);

  console.log("[integrity-signals] loading bidding windows by ocid…");
  const { daysByOcid, cutoffByMethod } = await loadWindowsByOcid(windowStart);
  console.log(`   windows for ${daysByOcid.size} ocids; express cutoffs for ${cutoffByMethod.size} methods:`);
  for (const [method, cutoff] of [...cutoffByMethod].sort((a, b) => a[1] - b[1])) {
    console.log(`     ${method.padEnd(36)} p${(EXPRESS_PERCENTILE * 100).toFixed(0)} = ${cutoff.toFixed(2)} días`);
  }

  console.log("[integrity-signals] loading award grain…");
  const grain = await loadAwardGrain(windowStart, windowEnd);
  console.log(`   ${grain.length} (buyer, supplier, month) groups`);

  console.log("[integrity-signals] loading unexplained flags…");
  const unexplainedByBuyer = await loadUnexplainedByBuyer(windowStart, windowEnd);
  console.log(`   ${unexplainedByBuyer.size} buyers carry at least one`);

  // ---- fold the grain into per-buyer accumulators ----
  const byBuyer = new Map<string, Accumulator>();
  for (const row of grain) {
    const buyerId = row._id.b;
    let acc = byBuyer.get(buyerId);
    if (!acc) {
      acc = emptyAccumulator(buyerId);
      byBuyer.set(buyerId, acc);
    }
    if (!acc.buyerName && row.name) acc.buyerName = row.name;

    acc.contracts += row.n;
    acc.totalUyu += row.uyu;

    const supplier = row._id.s;
    if (supplier) {
      acc.supplierUyu.set(supplier, (acc.supplierUyu.get(supplier) ?? 0) + row.uyu);
      // A burst is many SEPARATE awards to one supplier inside one calendar month.
      if (row.n >= BURST_MIN_AWARDS) {
        acc.burstCount++;
        if (row.n > acc.burstWorstAwards) {
          acc.burstWorstAwards = row.n;
          acc.burstWorstSupplier = supplier;
          acc.burstWorstMonth = `${row._id.y}-${String(row._id.m).padStart(2, "0")}`;
          acc.burstWorstUyu = row.uyu;
        }
      }
    }

    // Method and window are properties of the CALL (ocid), not of the award, so each ocid counts
    // once per buyer however many awards it produced.
    for (const ocid of row.ocids) {
      if (!ocid || acc.seenOcids.has(ocid)) continue;
      acc.seenOcids.add(ocid);

      const method = methodByOcid.get(ocid);
      if (method) {
        const klass = methodClass(method);
        if (klass === "direct") {
          acc.methodKnown++;
          acc.directCount++;
        } else if (klass === "tender") {
          acc.methodKnown++;
          acc.tenderCount++;
        } else if (klass === "other") {
          acc.methodKnown++;
          acc.otherMethodCount++;
        }
      }

      const days = daysByOcid.get(ocid);
      if (days !== undefined && method) {
        const cutoff = cutoffByMethod.get(method);
        if (cutoff !== undefined) {
          acc.callsWithWindow++;
          if (days <= cutoff) acc.expressCalls++;
          if (acc.shortestWindowDays === null || days < acc.shortestWindowDays) {
            acc.shortestWindowDays = days;
          }
        }
      }
    }
  }

  // ---- pass 1: measure every eligible organism ----
  const measurements: Array<{ acc: Accumulator; m: OrganismMeasurement; topSupplierName: string | null; topSupplierUyu: number }> = [];
  for (const acc of byBuyer.values()) {
    if (acc.contracts < MIN_CONTRACTS_FOR_SIGNALS) continue;

    let topSupplierName: string | null = null;
    let topSupplierUyu = 0;
    for (const [name, uyu] of acc.supplierUyu) {
      if (uyu > topSupplierUyu) {
        topSupplierUyu = uyu;
        topSupplierName = name;
      }
    }

    measurements.push({
      acc,
      topSupplierName,
      topSupplierUyu,
      m: {
        buyerId: acc.buyerId,
        buyerName: acc.buyerName,
        contracts: acc.contracts,
        totalUyu: acc.totalUyu,
        supplierCount: acc.supplierUyu.size,
        topSupplierName,
        topSupplierUyu,
        burstCount: acc.burstCount,
        burstWorstAwards: acc.burstWorstAwards,
        methodKnown: acc.methodKnown,
        directCount: acc.directCount,
        callsWithWindow: acc.callsWithWindow,
        expressCalls: acc.expressCalls,
        unexplainedFlags: unexplainedByBuyer.get(acc.buyerId) ?? 0,
      },
    });
  }

  // ---- pass 2: derive the population cutoffs, then classify against them ----
  //
  // A level is a POSITION among the other organisms, not a bar someone invented. The first cut of
  // this job used absolute thresholds and raised a signal on 170 of 268 organisms (63%), because
  // Compra Directa is 66% of all national procurement and a hospital pharmacy legitimately orders in
  // bursts every month. See shared/integrity-signals.ts.
  const allValues = measurements.map((x) => measureOrganism(x.m));
  const cutoffs = deriveCutoffs(allValues);
  const sortedByKey: Partial<Record<SignalKey, number[]>> = {};
  for (const key of SIGNAL_KEYS) {
    sortedByKey[key] = allValues
      .map((v) => v[key])
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v))
      .sort((a, b) => a - b);
  }

  console.log("[integrity-signals] population cutoffs:");
  for (const key of SIGNAL_KEYS) {
    const c = cutoffs[key];
    console.log(
      c
        ? `   ${key.padEnd(18)} p90=${c.watch.toFixed(3)} p97=${c.high.toFixed(3)} (n=${c.population})`
        : `   ${key.padEnd(18)} (population too small — nothing raised)`
    );
  }

  const docs: Record<string, unknown>[] = [];
  for (const { acc, m: measurement, topSupplierName, topSupplierUyu } of measurements) {
    const signals = classifyOrganism(measurement, cutoffs, sortedByKey);
    docs.push({
      buyerId: acc.buyerId,
      buyerName: acc.buyerName,
      windowStart,
      windowEnd,
      contracts: acc.contracts,
      totalUyu: acc.totalUyu,
      supplierCount: acc.supplierUyu.size,
      topSupplierName,
      topSupplierUyu,
      burstCount: acc.burstCount,
      burstWorstAwards: acc.burstWorstAwards,
      burstWorstSupplier: acc.burstWorstSupplier,
      burstWorstMonth: acc.burstWorstMonth,
      burstWorstUyu: acc.burstWorstUyu,
      methodKnown: acc.methodKnown,
      directCount: acc.directCount,
      tenderCount: acc.tenderCount,
      otherMethodCount: acc.otherMethodCount,
      callsWithWindow: acc.callsWithWindow,
      expressCalls: acc.expressCalls,
      shortestWindowDays: acc.shortestWindowDays,
      unexplainedFlags: measurement.unexplainedFlags,
      signals,
      weight: signalWeight(signals),
      cutoffs,
      dataVersion,
      calculatedAt: new Date(),
    });
  }

  docs.sort((a, b) => (b.weight as number) - (a.weight as number) || (b.totalUyu as number) - (a.totalUyu as number));

  console.log(`[integrity-signals] ${docs.length} organisms measured (>= ${MIN_CONTRACTS_FOR_SIGNALS} contratos)`);
  const raised = docs.filter((d) => (d.weight as number) > 0);
  console.log(`   with at least one signal raised: ${raised.length}`);
  for (const d of raised.slice(0, 15)) {
    const flags = (d.signals as Array<{ key: string; level: string }>)
      .filter((s) => s.level !== "none")
      .map((s) => `${s.key}:${s.level}`)
      .join(" ");
    console.log(`   [${d.weight}] ${String(d.buyerName ?? d.buyerId).slice(0, 44).padEnd(44)} ${flags}`);
  }

  if (options.dryRun) {
    console.log("[integrity-signals] 🧪 --dry-run: no writes performed.");
    return;
  }

  // Compute-then-swap. Sweep `$lt`, never `$ne`: two overlapping runs sweeping `$ne` delete each
  // other's freshly written generation — that is what emptied sice_catalog on 2026-07-27. And verify
  // the write landed BEFORE sweeping, so a partial run never replaces a complete previous one.
  if (docs.length === 0) {
    console.warn("[integrity-signals] computed 0 documents — keeping the existing generation");
    return;
  }
  for (let i = 0; i < docs.length; i += BULK_BATCH) {
    const ops = docs.slice(i, i + BULK_BATCH).map((doc) => ({
      replaceOne: { filter: { buyerId: doc.buyerId }, replacement: doc, upsert: true },
    }));
    await IntegritySignalModel.bulkWrite(ops as never, { ordered: false });
  }
  const written = await IntegritySignalModel.countDocuments({ dataVersion });
  if (written !== docs.length) {
    throw new Error(
      `integrity_signals: only ${written}/${docs.length} docs carry ${dataVersion} after the write phase — ` +
        `refusing to sweep the previous generation in favour of a partial one`
    );
  }
  const swept = await IntegritySignalModel.deleteMany({ dataVersion: { $lt: dataVersion } });
  console.log(`[integrity-signals] wrote ${written}, swept ${swept.deletedCount} stale`);
  console.log(`[integrity-signals] done in ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

if (require.main === module) {
  let options: Options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`❌ ${(error as Error).message}`);
    process.exit(1);
  }
  run(options)
    .then(async () => {
      await disconnectFromDatabase();
      process.exit(0);
    })
    .catch(async (error) => {
      console.error("[integrity-signals] failed:", error);
      await disconnectFromDatabase().catch(() => undefined);
      process.exit(1);
    });
}

export { run as refreshIntegritySignals, parseArgs };
