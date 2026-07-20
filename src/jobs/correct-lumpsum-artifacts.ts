#!/usr/bin/env tsx

/**
 * Correct releases whose stored total was inflated by multiplying a contract LUMP
 * SUM by a quantity (see src/jobs/lib/lumpsum-candidates.ts for the worked case).
 *
 * For each structural candidate we read the real "Monto Total de la Compra" off the
 * government page and, only when it is smaller by a wide margin, rewrite `amount`
 * from that verified figure — converted at the BCU rate of the release's OWN month
 * via shared/utils/real-value.ts, never today's.
 *
 * The raw `awards[].items[]` are left untouched: they faithfully mirror the feed,
 * and the UI badge explains why the line figures overstate the header total.
 *
 * Anything uncertain is SKIPPED and logged. Nothing is ever estimated.
 *
 * TWO-STAGE CANDIDATE CHECK
 *
 * `candidateMatchStage()` is a loose, indexed Mongo pre-filter; it cannot express
 * "at most maxPricedItems priced lines" without an index-hostile $expr, so it can
 * (and does — 8/150 on a live check, one with 18 priced items) return releases
 * `isLumpsumSuspect()` would reject. Every fetched candidate is re-checked with
 * `isLumpsumSuspect()` before we spend an HTTP request on it: a single published
 * total cannot be attributed across several priced lines, so those are skipped
 * (counted separately as `notSuspect`) and never corrected.
 *
 * --force
 *
 * `--release=<id>` alone still respects an existing `verifiedOverride` (skipped,
 * counted under `already done`) — routine re-syncs must never be able to silently
 * restore the inflated figure. `--force` (only accepted together with
 * `--release=<id>`; a blanket forced run over the whole pool is refused) bypasses
 * that skip so a single, explicitly named release can be re-verified — e.g. after
 * reconcile-award-amendments.ts reports it deliberately left an overridden release
 * alone because a new amendment arrived for it. When re-forcing, this job restores
 * the PRE-correction shape (this job only ever rewrites `amount`, never `awards`)
 * before re-running `isLumpsumSuspect()`, and carries the ORIGINAL
 * previousPrimaryAmount/previousComputedTotal forward from the existing override
 * into the replacement one — so the audit trail keeps pointing at the figure we
 * first replaced, never at our own previous correction.
 *
 * Usage:
 *   npx tsx src/jobs/correct-lumpsum-artifacts.ts                    # dry run
 *   npx tsx src/jobs/correct-lumpsum-artifacts.ts --commit
 *   npx tsx src/jobs/correct-lumpsum-artifacts.ts --release=adjudicacion-53193 --commit
 *   npx tsx src/jobs/correct-lumpsum-artifacts.ts --release=adjudicacion-53193 --force --commit
 *   npx tsx src/jobs/correct-lumpsum-artifacts.ts --limit=50
 */

import { connectToDatabase, disconnectFromDatabase } from "../../shared/connection/database";
import { ExchangeRateModel, ReleaseModel } from "../../shared/models";
import { monthKey, toNominalUyu, type RateTable } from "../../shared/utils/real-value";
import { hasVerifiedOverride, type VerifiedOverride } from "../../shared/utils/verified-override";
import {
  detalleUrl,
  fetchOfficialTotal,
  idCompraFromOcid,
} from "./lib/comprasestatales-total";
import { candidateMatchStage, isArtifactConfirmed, isLumpsumSuspect } from "./lib/lumpsum-candidates";

const DELAY_MS = 1200;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function arg(name: string): string | null {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}

/** Same shape app/server/utils/rates.ts builds, loaded once for the run. */
async function loadRateTable(): Promise<RateTable> {
  const rows = await ExchangeRateModel.find({}, { month: 1, usd: 1, eur: 1, ui: 1 }).lean();
  const byMonth: RateTable["byMonth"] = {};
  let latestUi: number | null = null;
  let latestUiMonth = "";
  for (const r of rows as Array<{ month: string; usd?: number; eur?: number; ui?: number }>) {
    // exactOptionalPropertyTypes: MonthRate's fields are optional (not `| undefined`),
    // so only set a key when the value is an actual number — never assign `undefined`.
    const rate: RateTable["byMonth"][string] = {};
    if (typeof r.usd === "number") rate.usd = r.usd;
    if (typeof r.eur === "number") rate.eur = r.eur;
    if (typeof r.ui === "number") rate.ui = r.ui;
    byMonth[r.month] = rate;
    if (typeof r.ui === "number" && r.ui > 0 && r.month > latestUiMonth) {
      latestUiMonth = r.month;
      latestUi = r.ui;
    }
  }
  return { byMonth, latestUi };
}

/** The feed-derived total in the item currency — what the inflated figure came from. */
function computedTotalIn(release: any, currency: string): number | null {
  const stored = release?.amount?.totalAmounts;
  // totalAmounts is a Map in Mongoose but a plain object via .lean().
  const value = stored instanceof Map ? stored.get(currency) : stored?.[currency];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * For a --force re-check of an already-overridden release: strip the override
 * and restore the PRE-correction `primaryAmount` (recorded on the override itself)
 * before handing the document to `isLumpsumSuspect()`. This job only ever rewrites
 * `amount` — `awards` is untouched — so without this restoration the structural
 * check would always fail on a re-run: the correction already shrank
 * `primaryAmount` below the suspect floor, and `isLumpsumSuspect()` unconditionally
 * rejects any document still carrying an override.
 */
function pristineForSuspectCheck(release: any, existingOverride: VerifiedOverride): any {
  if (!release?.amount) return release;
  const { verifiedOverride, ...restAmount } = release.amount;
  return { ...release, amount: { ...restAmount, primaryAmount: existingOverride.previousPrimaryAmount } };
}

async function main(): Promise<void> {
  const commit = process.argv.includes("--commit");
  const force = process.argv.includes("--force");
  const only = arg("release");
  const limit = Number(arg("limit") ?? 0);

  // A blanket forced run would let a routine re-sync silently restore the
  // inflated figure across the whole pool — the exact failure mode
  // verifiedOverride exists to prevent. --force is only meaningful pointed at
  // one release an operator has decided, by hand, needs re-verifying.
  if (force && !only) {
    throw new Error(
      "--force requires --release=<id> — refusing a blanket forced re-run over the whole candidate pool. " +
        "Target the specific release you want to re-verify, e.g. --release=adjudicacion-53193 --force.",
    );
  }

  console.log(`🧾 Correcting lump-sum total artifacts${commit ? "" : "  (DRY RUN)"}`);
  await connectToDatabase();

  const filter: Record<string, unknown> = only ? { id: only } : candidateMatchStage();
  let query = ReleaseModel.find(filter).sort({ "amount.primaryAmount": -1 });
  if (limit > 0) query = query.limit(limit);
  const candidates = await query.lean();
  console.log(`   candidates: ${candidates.length}`);

  const rateTable = await loadRateTable();
  console.log(`   rate table: ${Object.keys(rateTable.byMonth).length} months`);

  let corrected = 0, notSuspect = 0, notArtifact = 0, unverified = 0, noRate = 0, skipped = 0;

  for (const release of candidates as any[]) {
    const id = release.id;

    const existingOverride: VerifiedOverride | null = hasVerifiedOverride(release)
      ? ((release.amount as any).verifiedOverride as VerifiedOverride)
      : null;

    if (existingOverride && !force) {
      skipped++;
      continue;
    }

    // isLumpsumSuspect() is the FULL rule — candidateMatchStage() is only a loose
    // pre-filter that cannot express the priced-item cap. Every candidate MUST be
    // re-checked before any HTTP request: a single published total cannot be
    // attributed across several priced lines.
    const suspectSubject = existingOverride ? pristineForSuspectCheck(release, existingOverride) : release;
    if (!isLumpsumSuspect(suspectSubject)) {
      console.warn(`   ? ${id}: fails isLumpsumSuspect (too many priced lines for one total to be attributed) — skipping`);
      notSuspect++;
      continue;
    }

    const idCompra = idCompraFromOcid(release.ocid ?? "");
    if (!idCompra) {
      console.warn(`   ? ${id}: no id_compra from ocid ${release.ocid}`);
      unverified++;
      continue;
    }

    let official;
    try {
      official = await fetchOfficialTotal(idCompra);
    } catch (err) {
      console.warn(`   ? ${id}: ${(err as Error).message}`);
      unverified++;
      await sleep(DELAY_MS);
      continue;
    }
    if (!official) {
      console.warn(`   ? ${id}: no total on the official page`);
      unverified++;
      await sleep(DELAY_MS);
      continue;
    }

    // The "wrong" total to compare/audit against. On a fresh candidate that is
    // whatever the feed computed; on a --force re-check of an already-corrected
    // release it is the ORIGINAL figure carried on the existing override, never
    // our own previous correction (which would already be close to `official`
    // and trivially fail the artifact-ratio gate below).
    const computed = existingOverride ? existingOverride.previousComputedTotal : computedTotalIn(release, official.currency);
    if (computed === null) {
      console.warn(`   ? ${id}: no stored ${official.currency} total to compare`);
      unverified++;
      await sleep(DELAY_MS);
      continue;
    }

    if (!isArtifactConfirmed(computed, official.amount)) {
      notArtifact++;
      await sleep(DELAY_MS);
      continue;
    }

    const rateMonth = monthKey(release.date);
    const primaryAmount = rateMonth
      ? toNominalUyu(official.amount, official.currency, rateMonth, rateTable)
      : null;
    if (primaryAmount === null) {
      console.warn(`   ? ${id}: no BCU rate for ${official.currency} in ${rateMonth} — run seed-historical-rates`);
      noRate++;
      await sleep(DELAY_MS);
      continue;
    }

    // Preserve the ORIGINAL previousPrimaryAmount/previousComputedTotal across a
    // forced re-verify, so the audit trail always points at the figure we first
    // replaced rather than at our own previous correction.
    const previousPrimaryAmount = existingOverride
      ? existingOverride.previousPrimaryAmount
      : typeof release.amount?.primaryAmount === "number"
        ? release.amount.primaryAmount
        : null;
    const previousComputedTotal = computed;

    const override: VerifiedOverride = {
      source: "comprasestatales",
      sourceUrl: detalleUrl(idCompra),
      officialTotal: official.amount,
      officialCurrency: official.currency,
      rateMonth: rateMonth!,
      previousPrimaryAmount,
      previousComputedTotal,
      verifiedAt: new Date(),
      reason: "lumpsum-in-unit-price",
    };

    // Built as one complete object and written in a single $set below — never
    // incrementally. A partially-written override would still satisfy
    // hasVerifiedOverride()'s presence check and permanently mask the release
    // from every future recomputation.
    const amount = {
      ...release.amount,
      totalAmounts: { [official.currency]: official.amount },
      // [id].get.ts derives the native currency from this list; a stale multi-entry
      // list would make it fall back to the nominal figure.
      currencies: [official.currency],
      hasAmounts: true,
      primaryAmount,
      primaryCurrency: "UYU",
      verifiedOverride: override,
    };

    console.log(
      `   ✎ ${id}  ${Math.round(previousPrimaryAmount ?? 0).toLocaleString()} -> ${Math.round(primaryAmount).toLocaleString()} UYU` +
      `   (${official.currency} ${computed.toLocaleString()} -> ${official.amount.toLocaleString()} @ ${rateMonth})`
    );

    if (commit) {
      await ReleaseModel.updateOne({ _id: release._id }, { $set: { amount } });
    }
    corrected++;
    await sleep(DELAY_MS);
  }

  console.log(`\n   corrected     : ${corrected}`);
  console.log(`   not suspect   : ${notSuspect} (fails isLumpsumSuspect's priced-item cap — candidateMatchStage is only a pre-filter)`);
  console.log(`   not artifact  : ${notArtifact} (official total agrees — left alone)`);
  console.log(`   unverified    : ${unverified} (page missing/unparseable)`);
  console.log(`   no rate       : ${noRate} (seed exchange_rates for those months)`);
  console.log(`   already done  : ${skipped}`);
  if (!commit) console.log("   🧪 dry run: nothing written. Re-run with --commit.");
  else if (corrected) console.log("   ➜ run refresh-analytics to propagate into the rollups.");
}

if (require.main === module) {
  main()
    .then(async () => {
      await disconnectFromDatabase();
      console.log("✅ Done");
      process.exit(0);
    })
    .catch(async (error) => {
      console.error("❌ Failed:", error);
      await disconnectFromDatabase().catch(() => undefined);
      process.exit(1);
    });
}
