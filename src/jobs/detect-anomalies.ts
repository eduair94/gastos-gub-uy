#!/usr/bin/env tsx

/**
 * Price anomaly detection.
 *
 * Replaces the mean/stddev detector in src/populate-analytics.ts (populateAnomalies),
 * which was statistically broken in four independent ways:
 *   - mean/stddev z-score has breakdown point 0, so one huge contract inflates the
 *     mean and stddev enough to MASK ITSELF;
 *   - currency was hardcoded to the literal "UYU" while unit prices are stored in
 *     mixed currencies, pooling USD/UYU/UYI into a single distribution;
 *   - grouping was on the free-text classification.description, so 'Papel A4',
 *     'PAPEL A4' and 'Papel A-4' fragmented one economic category into several;
 *   - a `$limit: 1000` capped the OUTPUT, so the reported anomaly count was an
 *     artefact of the limit rather than a measurement.
 *
 * Two stages:
 *   1. Build per-{classificationId, currency, unitName} price baselines over a
 *      trailing 36-month window into `item_price_baselines`.
 *   2. Score award item unit prices against those frozen baselines with a
 *      log-space modified z-score, and reconcile the `anomalies` collection.
 *
 * MONGODB 4.4 STANDALONE CONSTRAINTS - do not regress these:
 *   - No $percentile / $median (7.0+), no $sortArray / $topN / $firstN (5.2+).
 *     Percentiles are computed in Node from a histogram the server collapses.
 *   - No multi-document transactions (standalone, no replica set).
 *   - The 100MB per-stage memory limit is hard and there is no
 *     allowDiskUseByDefault in 4.4, so EVERY aggregate here passes allowDiskUse.
 *   - $push does not reliably spill to disk, so no stage in this file uses it.
 *
 * Usage:
 *   npx tsx src/jobs/detect-anomalies.ts                  # trailing 24 months
 *   npx tsx src/jobs/detect-anomalies.ts --year=2024
 *   npx tsx src/jobs/detect-anomalies.ts --since=2023-01-01
 *   npx tsx src/jobs/detect-anomalies.ts --all
 *   npx tsx src/jobs/detect-anomalies.ts --baselines-only  # rebuild stage 1 only
 *   npx tsx src/jobs/detect-anomalies.ts --dry-run         # score, write nothing
 */

import type { PipelineStage } from "mongoose";
import { AnomalyModel, ItemPriceBaselineModel, ReleaseModel } from "../../shared/models";
import { connectToDatabase, disconnectFromDatabase } from "../../shared/connection/database";
import { BaselineInput, computeBaselineStats, HistogramBin, ScoredFinding, scoreUnitPrice } from "./anomaly-stats";

/** The only anomaly type this job produces. */
const ANOMALY_TYPE = "price_spike" as const;

/** Trailing window, in months, used to build the price baselines. */
const BASELINE_WINDOW_MONTHS = 36;

/** Trailing window, in months, scored by default when no scope flag is given. */
const DEFAULT_SCORING_WINDOW_MONTHS = 24;

/**
 * Safety cap on emitted anomalies. This is NOT a correctness bound: findings are
 * sorted by severity DESCENDING before truncation, so the cap keeps the WORST,
 * and a truncation is always logged loudly.
 */
const MAX_ANOMALIES = 50_000;

const BULK_BATCH_SIZE = 500;
const CURSOR_BATCH_SIZE = 1000;

interface CliOptions {
  baselinesOnly: boolean;
  dryRun: boolean;
  all: boolean;
  year: number | null;
  since: Date | null;
}

interface BaselineKey {
  classificationId: string;
  currency: string;
  unitName: string;
}

/**
 * BaselineInput is what the pure scorer needs; p95 is carried alongside purely to
 * report the expected range, so it stays out of the statistics module.
 */
interface LoadedBaseline extends BaselineInput {
  p95: number;
}

interface ScoredRow {
  releaseId: string;
  awardId: string | null;
  sourceYear: number | null;
  buyerName: string | null;
  supplierName: string | null;
  sourceFileName: string | null;
  classificationId: string;
  classificationDescription: string | null;
  classificationScheme: string | null;
  itemDescription: string | null;
  unitId: string | null;
  unitName: string;
  currency: string;
  unitPrice: number;
  quantity: number | null;
}

interface Finding {
  severityRank: number;
  absZ: number;
  doc: Record<string, unknown>;
  releaseId: string;
  awardId: string | null;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    baselinesOnly: false,
    dryRun: false,
    all: false,
    year: null,
    since: null,
  };

  for (const arg of argv) {
    if (arg === "--baselines-only") {
      options.baselinesOnly = true;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--all") {
      options.all = true;
    } else if (arg.startsWith("--year=")) {
      const year = Number.parseInt(arg.slice("--year=".length), 10);
      if (!Number.isInteger(year) || year < 1900 || year > 2200) {
        throw new Error(`Invalid --year value: ${arg}`);
      }
      options.year = year;
    } else if (arg.startsWith("--since=")) {
      const raw = arg.slice("--since=".length);
      const since = new Date(raw);
      if (Number.isNaN(since.getTime())) {
        throw new Error(`Invalid --since value (expected an ISO date): ${arg}`);
      }
      options.since = since;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  const scopeFlags = [options.all, options.year !== null, options.since !== null].filter(Boolean).length;
  if (scopeFlags > 1) {
    throw new Error("--all, --year and --since are mutually exclusive");
  }

  return options;
}

function monthsAgo(from: Date, months: number): Date {
  return new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() - months, from.getUTCDate(), from.getUTCHours(), from.getUTCMinutes(), from.getUTCSeconds()));
}

function baselineMapKey(key: BaselineKey): string {
  return `${key.classificationId}\u0000${key.currency}\u0000${key.unitName}`;
}

function anomalyDedupeKey(releaseId: string, awardId: string | null): string {
  return `${releaseId}\u0000${awardId ?? ""}`;
}

/** Drop undefined values so mongoose does not persist empty keys. */
function compact(input: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined && value !== null) {
      output[key] = value;
    }
  }
  return output;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

class AnomalyDetector {
  private readonly dataVersion: string;
  private readonly runStart: Date;

  constructor() {
    this.runStart = new Date();
    this.dataVersion = `v${this.runStart.getTime()}`;
  }

  /**
   * STAGE 1 - build price baselines.
   *
   * The server collapses raw award items into a PRICE HISTOGRAM: one row per
   * distinct {classificationId, currency, unitName, unitPrice} with a count. That
   * is what keeps this inside 4.4's 100MB per-stage budget - cardinality drops to
   * the number of distinct prices, and the raw rows are never materialised in a
   * $push array (which does not spill) nor pulled into a JS array.
   *
   * The histogram is emitted pre-sorted by group key, so Node can stream it and
   * flush each key's baseline the moment the key changes: only ONE key's bins are
   * ever resident.
   */
  async buildBaselines(): Promise<void> {
    const windowEnd = this.runStart;
    const windowStart = monthsAgo(windowEnd, BASELINE_WINDOW_MONTHS);

    console.log(`📐 Stage 1: building price baselines`);
    console.log(`   window: ${windowStart.toISOString()} .. ${windowEnd.toISOString()} (${BASELINE_WINDOW_MONTHS} months)`);

    const pipeline: PipelineStage[] = [
      // `tag` is an array field, so this matches releases whose tag array contains 'award'.
      { $match: { tag: "award", date: { $gte: windowStart, $lte: windowEnd } } },
      { $unwind: { path: "$awards", preserveNullAndEmptyArrays: false } },
      { $unwind: { path: "$awards.items", preserveNullAndEmptyArrays: false } },
      // Replaces the old `> 100000` prefilter, which silently restricted the whole
      // detector to high-value items and destroyed the baseline for everything else.
      { $match: { "awards.items.unit.value.amount": { $gt: 0 } } },
      {
        $group: {
          _id: {
            c: { $ifNull: ["$awards.items.classification.id", "UNKNOWN"] },
            cur: { $ifNull: ["$awards.items.unit.value.currency", "UYU"] },
            u: { $ifNull: ["$awards.items.unit.name", "unit"] },
            p: "$awards.items.unit.value.amount",
          },
          n: { $sum: 1 },
        },
      },
      // Sorting by the group key makes every key's bins contiguous in the stream.
      { $sort: { "_id.c": 1, "_id.cur": 1, "_id.u": 1, "_id.p": 1 } },
    ];

    const cursor = ReleaseModel.aggregate(pipeline).allowDiskUse(true).cursor({ batchSize: CURSOR_BATCH_SIZE });

    let currentKey: BaselineKey | null = null;
    let bins: HistogramBin[] = [];
    let ops: Record<string, unknown>[] = [];
    let baselinesWritten = 0;
    let baselinesSkipped = 0;
    let histogramRows = 0;
    let maxBinsPerKey = 0;

    const flushOps = async (): Promise<void> => {
      if (ops.length === 0) {
        return;
      }
      await ItemPriceBaselineModel.bulkWrite(ops as never, { ordered: false });
      ops = [];
    };

    const emit = async (key: BaselineKey, keyBins: HistogramBin[]): Promise<void> => {
      maxBinsPerKey = Math.max(maxBinsPerKey, keyBins.length);
      const stats = computeBaselineStats(keyBins);
      if (!stats) {
        baselinesSkipped++;
        return;
      }
      ops.push({
        updateOne: {
          filter: {
            classificationId: key.classificationId,
            currency: key.currency,
            unitName: key.unitName,
          },
          update: {
            $set: {
              classificationId: key.classificationId,
              currency: key.currency,
              unitName: key.unitName,
              n: stats.n,
              medianLn: stats.medianLn,
              madLn: stats.madLn,
              p25: stats.p25,
              p50: stats.p50,
              p75: stats.p75,
              p95: stats.p95,
              min: stats.min,
              max: stats.max,
              distinctPrices: stats.distinctPrices,
              windowStart,
              windowEnd,
              dataVersion: this.dataVersion,
              calculatedAt: this.runStart,
            },
          },
          upsert: true,
        },
      });
      baselinesWritten++;
      if (ops.length >= BULK_BATCH_SIZE) {
        await flushOps();
      }
    };

    for await (const row of cursor) {
      histogramRows++;
      const id = row._id as { c: string; cur: string; u: string; p: number };
      const key: BaselineKey = { classificationId: id.c, currency: id.cur, unitName: id.u };

      if (currentKey === null || currentKey.classificationId !== key.classificationId || currentKey.currency !== key.currency || currentKey.unitName !== key.unitName) {
        if (currentKey !== null) {
          await emit(currentKey, bins);
        }
        currentKey = key;
        bins = [];
      }
      bins.push({ value: id.p, count: row.n as number });
    }

    if (currentKey !== null) {
      await emit(currentKey, bins);
    }
    await flushOps();

    console.log(`   histogram rows streamed : ${histogramRows}`);
    console.log(`   baselines written       : ${baselinesWritten}`);
    console.log(`   baselines skipped       : ${baselinesSkipped} (no usable positive prices)`);
    console.log(`   largest key histogram   : ${maxBinsPerKey} distinct prices`);
  }

  /** The release-side scope filter. Reused verbatim for reconciliation. */
  private buildScopeFilter(options: CliOptions): Record<string, unknown> {
    const filter: Record<string, unknown> = { tag: "award" };

    if (options.all) {
      console.log(`   scope: ALL releases tagged 'award'`);
      return filter;
    }
    if (options.year !== null) {
      filter.sourceYear = options.year;
      console.log(`   scope: sourceYear = ${options.year}`);
      return filter;
    }
    const since = options.since ?? monthsAgo(this.runStart, DEFAULT_SCORING_WINDOW_MONTHS);
    filter.date = { $gte: since };
    console.log(`   scope: date >= ${since.toISOString()}${options.since ? "" : ` (default trailing ${DEFAULT_SCORING_WINDOW_MONTHS} months)`}`);
    return filter;
  }

  private async loadBaselines(): Promise<Map<string, LoadedBaseline>> {
    const baselines = new Map<string, LoadedBaseline>();
    const cursor = ItemPriceBaselineModel.find({}, { classificationId: 1, currency: 1, unitName: 1, n: 1, medianLn: 1, madLn: 1, p25: 1, p75: 1, p95: 1 })
      .lean()
      .cursor({ batchSize: CURSOR_BATCH_SIZE });

    for await (const doc of cursor) {
      baselines.set(
        baselineMapKey({ classificationId: doc.classificationId, currency: doc.currency, unitName: doc.unitName }),
        { n: doc.n, medianLn: doc.medianLn, madLn: doc.madLn, p25: doc.p25, p75: doc.p75, p95: doc.p95 }
      );
    }
    return baselines;
  }

  /**
   * STAGE 2 - score releases against the frozen baselines.
   *
   * Suppliers are deliberately NOT $unwound: awards carry 0 or 1 suppliers corpus
   * wide, so unwinding would multiply nothing while risking silent row loss on
   * supplier-less awards. The name is taken with $arrayElemAt instead.
   */
  async scoreReleases(options: CliOptions): Promise<void> {
    console.log(`🔍 Stage 2: scoring releases against baselines`);
    const scopeFilter = this.buildScopeFilter(options);

    const baselines = await this.loadBaselines();
    console.log(`   baselines loaded        : ${baselines.size}`);
    if (baselines.size === 0) {
      console.warn(`   ⚠️  No baselines found. Run with --baselines-only first.`);
      return;
    }

    const pipeline: PipelineStage[] = [
      { $match: scopeFilter },
      { $unwind: { path: "$awards", preserveNullAndEmptyArrays: false } },
      { $unwind: { path: "$awards.items", preserveNullAndEmptyArrays: false } },
      { $match: { "awards.items.unit.value.amount": { $gt: 0 } } },
      {
        $project: {
          _id: 0,
          releaseId: "$id",
          awardId: "$awards.id",
          sourceYear: "$sourceYear",
          releaseDate: "$date",
          buyerName: "$buyer.name",
          supplierName: { $arrayElemAt: ["$awards.suppliers.name", 0] },
          sourceFileName: "$sourceFileName",
          classificationId: { $ifNull: ["$awards.items.classification.id", "UNKNOWN"] },
          classificationDescription: "$awards.items.classification.description",
          classificationScheme: "$awards.items.classification.scheme",
          itemDescription: "$awards.items.description",
          unitId: "$awards.items.unit.id",
          unitName: { $ifNull: ["$awards.items.unit.name", "unit"] },
          currency: { $ifNull: ["$awards.items.unit.value.currency", "UYU"] },
          unitPrice: "$awards.items.unit.value.amount",
          quantity: "$awards.items.quantity",
        },
      },
    ];

    const cursor = ReleaseModel.aggregate(pipeline).allowDiskUse(true).cursor({ batchSize: CURSOR_BATCH_SIZE });

    let itemsScored = 0;
    let itemsWithoutBaseline = 0;
    let truncated = false;

    // Keyed by {releaseId, awardId} - the anomaly upsert key. Holding only the
    // worst finding per award is what bounds this map: it can never exceed the
    // number of awards in scope, and in practice anomalies are rare.
    let bestByKey = new Map<string, Finding>();

    // Hard backstop in case a pathological baseline flags a large fraction of the
    // corpus. Keeps the most severe findings, so the cap degrades gracefully.
    const pruneIfNeeded = (): void => {
      if (bestByKey.size <= MAX_ANOMALIES * 2) {
        return;
      }
      const kept = [...bestByKey.values()].sort(compareFindings).slice(0, MAX_ANOMALIES);
      bestByKey = new Map(kept.map((finding) => [anomalyDedupeKey(finding.releaseId, finding.awardId), finding]));
      truncated = true;
    };

    for await (const raw of cursor) {
      itemsScored++;
      const row = this.normaliseRow(raw);
      if (!row) {
        continue;
      }

      const baseline = baselines.get(baselineMapKey({ classificationId: row.classificationId, currency: row.currency, unitName: row.unitName }));
      if (!baseline) {
        itemsWithoutBaseline++;
        continue;
      }

      const scored = scoreUnitPrice(row.unitPrice, baseline);
      if (!scored) {
        continue;
      }

      const finding: Finding = {
        severityRank: scored.severityRank,
        absZ: scored.absZ,
        releaseId: row.releaseId,
        awardId: row.awardId,
        doc: this.buildAnomalyDoc(row, scored, baseline),
      };

      // One award can contain several anomalous items, but the anomaly upsert key
      // is {releaseId, awardId, type}. Keep the WORST item per award rather than
      // letting same-key upserts silently overwrite each other.
      const dedupeKey = anomalyDedupeKey(row.releaseId, row.awardId);
      const incumbent = bestByKey.get(dedupeKey);
      if (incumbent && compareFindings(incumbent, finding) <= 0) {
        continue;
      }
      bestByKey.set(dedupeKey, finding);
      pruneIfNeeded();
    }

    let findings = [...bestByKey.values()].sort(compareFindings);
    if (findings.length > MAX_ANOMALIES) {
      findings = findings.slice(0, MAX_ANOMALIES);
      truncated = true;
    }
    if (truncated) {
      console.warn(`   ⚠️  SAFETY CAP HIT: findings truncated to the ${MAX_ANOMALIES} most severe. Raise MAX_ANOMALIES or narrow the scope.`);
    }

    console.log(`   award items scored      : ${itemsScored}`);
    console.log(`   items without baseline  : ${itemsWithoutBaseline}`);
    console.log(`   anomalies found         : ${findings.length}${truncated ? " (capped)" : ""}`);
    this.logSeverityBreakdown(findings);

    if (options.dryRun) {
      console.log(`   🧪 --dry-run: no writes performed.`);
      return;
    }

    await this.persistFindings(findings);
    await this.reconcile(findings, scopeFilter);
  }

  private normaliseRow(raw: Record<string, unknown>): ScoredRow | null {
    const releaseId = asString(raw.releaseId);
    const unitPrice = asNumber(raw.unitPrice);
    if (!releaseId || unitPrice === null || unitPrice <= 0) {
      return null;
    }

    let sourceYear = asNumber(raw.sourceYear);
    if (sourceYear === null && raw.releaseDate instanceof Date && !Number.isNaN(raw.releaseDate.getTime())) {
      sourceYear = raw.releaseDate.getUTCFullYear();
    }

    return {
      releaseId,
      awardId: asString(raw.awardId),
      sourceYear,
      buyerName: asString(raw.buyerName),
      supplierName: asString(raw.supplierName),
      sourceFileName: asString(raw.sourceFileName),
      classificationId: asString(raw.classificationId) ?? "UNKNOWN",
      classificationDescription: asString(raw.classificationDescription),
      classificationScheme: asString(raw.classificationScheme),
      itemDescription: asString(raw.itemDescription),
      unitId: asString(raw.unitId),
      unitName: asString(raw.unitName) ?? "unit",
      currency: asString(raw.currency) ?? "UYU",
      unitPrice,
      quantity: asNumber(raw.quantity),
    };
  }

  private buildAnomalyDoc(row: ScoredRow, scored: ScoredFinding, baseline: LoadedBaseline): Record<string, unknown> {
    const label = row.classificationDescription ?? row.itemDescription ?? row.classificationId;
    const methodWord = scored.method === "iqr_fence" ? "IQR extreme fence" : "robust log z-score";

    const description = `Unit price ${row.unitPrice.toFixed(2)} ${row.currency} for "${label}" (per ${row.unitName}) sits ${scored.absZ.toFixed(1)} robust z ${scored.direction} the ${row.currency} baseline of ${baseline.n} comparable items [${methodWord}]`;

    // expectedRange is reported in the SAME currency as detectedValue. The old
    // detector stamped "UYU" on everything regardless of the actual currency.
    return compact({
      type: ANOMALY_TYPE,
      severity: scored.severity,
      severityRank: scored.severityRank,
      releaseId: row.releaseId,
      description,
      detectedValue: row.unitPrice,
      expectedRange: {
        min: baseline.p25,
        max: baseline.p95,
      },
      confidence: scored.confidence,
      currency: row.currency,
      sourceYear: row.sourceYear,
      dataVersion: this.dataVersion,
      detectedAt: this.runStart,
      metadata: compact({
        supplierName: row.supplierName,
        buyerName: row.buyerName,
        itemDescription: row.itemDescription,
        itemClassification: compact({
          id: row.classificationId,
          description: row.classificationDescription,
          scheme: row.classificationScheme,
        }),
        itemUnit: compact({
          id: row.unitId,
          name: row.unitName,
        }),
        itemQuantity: row.quantity,
        baselineN: baseline.n,
        zScore: scored.zScore,
        year: row.sourceYear,
        amount: row.unitPrice,
        currency: row.currency,
        sourceFileName: row.sourceFileName,
      }),
    });
  }

  private logSeverityBreakdown(findings: Finding[]): void {
    const counts = new Map<number, number>();
    for (const finding of findings) {
      counts.set(finding.severityRank, (counts.get(finding.severityRank) ?? 0) + 1);
    }
    const names: Record<number, string> = { 4: "critical", 3: "high", 2: "medium", 1: "low" };
    for (const rank of [4, 3, 2, 1]) {
      console.log(`     ${names[rank]!.padEnd(8)}: ${counts.get(rank) ?? 0}`);
    }
  }

  private async persistFindings(findings: Finding[]): Promise<void> {
    if (findings.length === 0) {
      console.log(`   nothing to upsert`);
      return;
    }

    let upserted = 0;
    let modified = 0;

    for (let i = 0; i < findings.length; i += BULK_BATCH_SIZE) {
      const batch = findings.slice(i, i + BULK_BATCH_SIZE);
      const ops = batch.map((finding) => ({
        updateOne: {
          // awardId is always part of the key, including when it is null. The old
          // code omitted it when falsy, so a release-level anomaly's filter could
          // match (and clobber) an award-level one.
          filter: {
            releaseId: finding.releaseId,
            awardId: finding.awardId,
            type: ANOMALY_TYPE,
          },
          update: {
            $set: { ...finding.doc, awardId: finding.awardId },
            // Written only when the anomaly is first inserted, never on re-confirmation. A field
            // may not appear in both $set and $setOnInsert — Mongo rejects the update as a
            // conflict — so `doc` must not carry firstDetectedAt.
            $setOnInsert: { firstDetectedAt: this.runStart },
          },
          upsert: true,
        },
      }));

      const result = await AnomalyModel.bulkWrite(ops as never, { ordered: false });
      upserted += result.upsertedCount ?? 0;
      modified += result.modifiedCount ?? 0;
    }

    console.log(`   ✅ anomalies upserted   : ${upserted} new, ${modified} updated`);
  }

  /**
   * SELF-HEALING. The old detector only ever upserted, so a contract later
   * corrected downward kept its price_spike forever.
   *
   * This deletes anomalies that no longer reproduce, but ONLY for releases that
   * were actually inside this run's scope - a global wipe would destroy findings
   * from other scoped runs. Scope membership is confirmed by re-querying the
   * candidate release ids against the SAME filter stage 2 used, which keeps this
   * bounded by the anomaly count rather than the release count.
   */
  private async reconcile(findings: Finding[], scopeFilter: Record<string, unknown>): Promise<void> {
    const reproduced = new Set(findings.map((finding) => anomalyDedupeKey(finding.releaseId, finding.awardId)));

    const existing = await AnomalyModel.find({ type: ANOMALY_TYPE }, { _id: 1, releaseId: 1, awardId: 1 }).lean();
    const staleCandidates = existing.filter((doc) => !reproduced.has(anomalyDedupeKey(doc.releaseId, doc.awardId ?? null)));

    if (staleCandidates.length === 0) {
      console.log(`   🧹 nothing stale to reconcile`);
      return;
    }

    // Only delete anomalies whose release was genuinely rescanned this run.
    const candidateReleaseIds = [...new Set(staleCandidates.map((doc) => doc.releaseId))];
    const inScope = new Set<string>();
    for (let i = 0; i < candidateReleaseIds.length; i += BULK_BATCH_SIZE) {
      const batch = candidateReleaseIds.slice(i, i + BULK_BATCH_SIZE);
      const matched = await ReleaseModel.find({ ...scopeFilter, id: { $in: batch } }, { id: 1 }).lean();
      for (const release of matched) {
        inScope.add(release.id);
      }
    }

    const toDelete = staleCandidates.filter((doc) => inScope.has(doc.releaseId));
    const outOfScope = staleCandidates.length - toDelete.length;

    if (toDelete.length > 0) {
      for (let i = 0; i < toDelete.length; i += BULK_BATCH_SIZE) {
        const batch = toDelete.slice(i, i + BULK_BATCH_SIZE);
        await AnomalyModel.deleteMany({ _id: { $in: batch.map((doc) => doc._id) } });
      }
    }

    console.log(`   🧹 stale anomalies deleted: ${toDelete.length} (kept ${outOfScope} outside this run's scope)`);
  }

  async run(options: CliOptions): Promise<void> {
    const startTime = Date.now();
    console.log(`🚀 Anomaly detection starting (dataVersion=${this.dataVersion})`);

    // The shared default is a 45s idle-socket timeout, which the baseline histogram scan exceeds
    // while the server is still legitimately working. Must be set before the first connect.
    if (!process.env.MONGO_SOCKET_TIMEOUT_MS) {
      process.env.MONGO_SOCKET_TIMEOUT_MS = String(30 * 60 * 1000);
    }

    await connectToDatabase();

    if (options.dryRun) {
      await this.buildBaselinesDryRunNotice();
    } else {
      await this.buildBaselines();
    }

    if (options.baselinesOnly) {
      console.log(`ℹ️  --baselines-only: skipping scoring stage.`);
    } else {
      await this.scoreReleases(options);
      if (!options.dryRun) {
        await this.purgeLegacyAnomalies();
        await this.backfillFirstDetectedAt();
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`🎉 Anomaly detection completed in ${duration}s`);
  }

  /**
   * Drops anomalies left by the pre-rewrite detector.
   *
   * Those were produced by a mean/stdDev estimator with a hardcoded "UYU" currency, a constant
   * confidence of 0.8, and a $limit of 1000 that made the count a cap rather than a measurement.
   * The scoped self-heal in scoreReleases() only revisits releases this run actually rescanned, so
   * anything outside the trailing window would otherwise sit next to the new findings forever,
   * indistinguishable in the UI but built on numbers that no longer mean the same thing.
   *
   * `severityRank` is the marker: it did not exist before the rewrite, and every finding the current
   * detector writes carries one.
   */
  private async purgeLegacyAnomalies(): Promise<void> {
    const result = await AnomalyModel.deleteMany({ severityRank: { $exists: false } });
    if (result.deletedCount) {
      console.log(`   🧹 legacy anomalies purged: ${result.deletedCount} (pre-rewrite estimator)`);
    }
  }

  /**
   * Gives pre-existing anomalies a firstDetectedAt.
   *
   * $setOnInsert only fires for new documents, so anomalies written before that field existed would
   * never acquire one, and "recent anomalies" would read zero forever. Seeds from detectedAt, or
   * createdAt where the finding predates detectedAt too. Idempotent: matches only documents still
   * missing the field, so it is a no-op from the second run onward.
   */
  private async backfillFirstDetectedAt(): Promise<void> {
    const missing = await AnomalyModel.countDocuments({ firstDetectedAt: { $exists: false } });
    if (missing === 0) return;

    const result = await AnomalyModel.updateMany({ firstDetectedAt: { $exists: false } }, [
      { $set: { firstDetectedAt: { $ifNull: ["$detectedAt", "$createdAt"] } } },
    ]);
    console.log(`   🕓 firstDetectedAt backfilled: ${result.modifiedCount} pre-existing anomalies`);
  }

  private async buildBaselinesDryRunNotice(): Promise<void> {
    const count = await ItemPriceBaselineModel.estimatedDocumentCount();
    console.log(`🧪 --dry-run: skipping baseline rebuild, scoring against the ${count} existing baselines.`);
  }
}

/** Sort comparator: most severe first, then most extreme. */
function compareFindings(a: Finding, b: Finding): number {
  if (b.severityRank !== a.severityRank) {
    return b.severityRank - a.severityRank;
  }
  return b.absZ - a.absZ;
}

// Run the script if executed directly
if (require.main === module) {
  let options: CliOptions;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`❌ ${(error as Error).message}`);
    process.exit(1);
  }

  const detector = new AnomalyDetector();
  detector
    .run(options)
    .then(async () => {
      await disconnectFromDatabase();
      console.log("✅ Anomaly detection script completed successfully");
      process.exit(0);
    })
    .catch(async (error) => {
      console.error("❌ Anomaly detection script failed:", error);
      await disconnectFromDatabase().catch(() => undefined);
      process.exit(1);
    });
}

export { AnomalyDetector, parseArgs };
export type { CliOptions };
