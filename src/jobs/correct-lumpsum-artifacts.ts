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
import { candidateMatchStage, isArtifactConfirmed, isLumpsumSuspect, LUMPSUM_DEFAULTS } from "./lib/lumpsum-candidates";

const DELAY_MS = 1200;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function arg(name: string): string | null {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}

/**
 * Usage errors (bad/missing CLI flags) exit non-zero with a clean one-line
 * message — never a thrown Error, which the top-level `.catch()` would print
 * with a 10-line stack trace that has nothing to do with the actual mistake
 * (a typo'd flag). Always called before `connectToDatabase()`.
 */
function usageError(message: string): never {
  console.error(`❌ Usage error: ${message}`);
  process.exit(1);
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

/**
 * Cheap, read-only re-derivation of *why* `isLumpsumSuspect()` rejected a
 * release, for diagnostics only — this never gates behavior, `isLumpsumSuspect()`
 * itself stays the single source of truth. Mirrors its checks (see
 * ./lib/lumpsum-candidates.ts) because a hard-coded "too many priced lines"
 * message is wrong for the other four ways the check can fail (wrong tag,
 * amount out of band, zero priced items, no qty>=threshold foreign line) —
 * which matters because `--release=<id>` bypasses candidateMatchStage()
 * entirely, so a mistyped or plain ineligible id lands here too.
 */
function describeNotSuspectReason(release: any): string {
  const o = LUMPSUM_DEFAULTS;
  const tag = release?.tag;
  if (!(Array.isArray(tag) && tag.includes("award"))) {
    return `tag is ${JSON.stringify(tag ?? null)}, not an "award" release`;
  }
  const primary = release?.amount?.primaryAmount;
  if (typeof primary !== "number" || !Number.isFinite(primary)) {
    return "amount.primaryAmount is missing or not a number";
  }
  if (primary < o.suspectMinUyu) {
    return `primaryAmount ${Math.round(primary).toLocaleString()} UYU is below the ${o.suspectMinUyu.toLocaleString()} suspect floor`;
  }
  if (primary >= o.maxPlausibleUyu) {
    return `primaryAmount ${Math.round(primary).toLocaleString()} UYU is at/above the ${o.maxPlausibleUyu.toLocaleString()} plausible ceiling (already excluded from aggregates)`;
  }
  const awards = Array.isArray(release?.awards) ? release.awards : [];
  const priced = awards
    .flatMap((a: any) => (Array.isArray(a?.items) ? a.items : []))
    .filter((i: any) => (typeof i?.unit?.value?.amount === "number" ? i.unit.value.amount : 0) > 0);
  if (priced.length === 0) return "no priced line items";
  if (priced.length > o.maxPricedItems) {
    return `${priced.length} priced line items — more than ${o.maxPricedItems}, so one official total cannot be attributed to a single line`;
  }
  const hasBulkLine = priced.some((i: any) => {
    const qty = typeof i?.quantity === "number" ? i.quantity : null;
    const currency = typeof i?.unit?.value?.currency === "string" ? i.unit.value.currency : "";
    return qty !== null && qty >= o.qtyThreshold && ["USD", "EUR", "UYU"].includes(currency.toUpperCase());
  });
  if (!hasBulkLine) {
    return `no priced line with quantity >= ${o.qtyThreshold} in an eligible currency (USD/EUR/UYU)`;
  }
  return "does not match the lump-sum profile";
}

/**
 * The month whose BCU rate `toNominalUyu()` (shared/utils/real-value.ts)
 * ACTUALLY applied — mirrors that module's private `rateForMonth()` fallback
 * (nearest earlier month present in the table) so `verifiedOverride.rateMonth`
 * always records the month whose rate was truly used, never just the
 * release's own month. The rate table has zero gaps today (2000-01..2026-07),
 * so this is currently always `=== month`, but the field is public-facing and
 * must stay correct the day a gap exists. Only called after `toNominalUyu()`
 * has already returned non-null for the same (month, table), so a `null`
 * result here would mean the two disagree — treated as a fresh "no rate" case
 * rather than trusted.
 */
function effectiveRateMonth(table: RateTable, month: string): string | null {
  if (table.byMonth[month]) return month;
  const months = Object.keys(table.byMonth).filter((m) => m <= month).sort();
  const prev = months[months.length - 1];
  return prev ?? null;
}

async function main(): Promise<void> {
  const commit = process.argv.includes("--commit");
  const force = process.argv.includes("--force");

  // An explicitly-passed-but-empty --release= (e.g. `--release=$ID` with an
  // unset shell variable) must NEVER fall through to
  // `only ? { id: only } : candidateMatchStage()` below — that ternary treats
  // "" the same as "not passed" and silently turns one intended release into
  // a ~141-release pool-wide run. Reject before touching the DB.
  const releaseArg = arg("release");
  if (releaseArg === "") {
    usageError(
      "--release= was given an empty value. Pass an id (--release=adjudicacion-53193) " +
        'or omit the flag entirely for a pool-wide run — an empty value must never be treated as "no filter".',
    );
  }
  const only = releaseArg;

  // A non-numeric --limit= (e.g. --limit=abc -> NaN) must not silently disable
  // the limit — the same "typo turns into a bigger run than intended" failure
  // mode as the --release= case above (`if (limit > 0)` below would just skip
  // applying any cap).
  const limitArg = arg("limit");
  let limit = 0;
  if (limitArg !== null) {
    const parsed = Number(limitArg);
    if (limitArg === "" || !Number.isFinite(parsed)) {
      usageError(`--limit=${limitArg} is not a valid number.`);
    }
    limit = parsed;
  }

  // A blanket forced run would let a routine re-sync silently restore the
  // inflated figure across the whole pool — the exact failure mode
  // verifiedOverride exists to prevent. --force is only meaningful pointed at
  // one release an operator has decided, by hand, needs re-verifying.
  if (force && !only) {
    usageError(
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

  let corrected = 0, notSuspect = 0, notArtifact = 0, noIdCompra = 0, unverified = 0, noRate = 0, skipped = 0;

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
      console.warn(`   ? ${id}: does not match the lump-sum profile (${describeNotSuspectReason(suspectSubject)}) — skipping`);
      notSuspect++;
      continue;
    }

    const idCompra = idCompraFromOcid(release.ocid ?? "");
    if (!idCompra) {
      // Distinct from `unverified` below: this release has no usable purchase id
      // at all (the ocid never had the canonical `ocds-<pub>-<tail>` shape), as
      // opposed to one that HAS an id_compra but whose page fetch/parse failed.
      // Alphanumeric tails (a6005, i292944) ARE scrapeable now and no longer land
      // here — only a genuinely malformed ocid does.
      console.warn(`   ? ${id}: ocid ${release.ocid} has no usable purchase id — not scrapeable`);
      noIdCompra++;
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
      // Auditability-first: log agreement too, not just corrections — an
      // operator reviewing the run needs to see which ids were checked and
      // left alone, not just which ones changed.
      console.log(
        `   ✓ ${id}  official total agrees, left alone` +
        `   (${official.currency} ${computed.toLocaleString()} vs official ${official.amount.toLocaleString()})`
      );
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

    // The month whose rate was ACTUALLY applied — toNominalUyu() falls back to
    // the nearest earlier month when release.date's own month is missing from
    // the table, so `rateMonth` above (the release's own month) is not always
    // the one that produced `primaryAmount`. Re-derive and store THAT month.
    const effectiveMonth = effectiveRateMonth(rateTable, rateMonth!);
    if (effectiveMonth === null) {
      // Should be unreachable — toNominalUyu() already found a rate for this
      // (month, table) above. Defensive: never record a rateMonth we can't back up.
      console.warn(`   ? ${id}: could not re-derive the effective rate month for ${rateMonth} — skipping`);
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
      rateMonth: effectiveMonth,
      previousPrimaryAmount,
      previousComputedTotal,
      verifiedAt: new Date(),
      reason: "lumpsum-in-unit-price",
    };

    // Built EXPLICITLY, never via `{...release.amount, ...}` — a blind spread
    // would carry over stale conversion metadata describing the OLD, wrong
    // conversion (exchangeRateDate/uyiExchangeRate stamped by whatever
    // amount-calculator.ts run last, unrelated to the BCU rate actually used
    // here). A "verified against the official source" record must not display
    // a contradictory rate date (app/pages/contracts/[id].vue renders
    // `amount.exchangeRateDate` under the "Tipo de cambio al" label).
    //   - REMOVED (describe the superseded conversion, not this one):
    //     exchangeRateDate, uyiExchangeRate, wasVersionUpdate, previousAmount
    //   - RESTAMPED: updatedAt — the record genuinely is being updated now
    //   - KEPT as-is (still accurate, unrelated to the currency conversion):
    //     totalItems, originalUYUAmount, hasConvertedAmounts, version
    // Built as one complete object and written in a single $set below — never
    // incrementally. A partially-written override would still satisfy
    // hasVerifiedOverride()'s presence check and permanently mask the release
    // from every future recomputation.
    const amount = {
      totalItems: release.amount?.totalItems,
      originalUYUAmount: release.amount?.originalUYUAmount,
      hasConvertedAmounts: release.amount?.hasConvertedAmounts,
      version: release.amount?.version,
      updatedAt: new Date().toISOString(),
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
      `   (${official.currency} ${computed.toLocaleString()} -> ${official.amount.toLocaleString()} @ ${effectiveMonth})`
    );

    if (commit) {
      await ReleaseModel.updateOne({ _id: release._id }, { $set: { amount } });
    }
    corrected++;
    await sleep(DELAY_MS);
  }

  console.log(`\n   corrected     : ${corrected}`);
  console.log(`   not suspect   : ${notSuspect} (does not match the lump-sum profile — see per-release reasons above; candidateMatchStage is only a pre-filter)`);
  console.log(`   not artifact  : ${notArtifact} (official total agrees — left alone; see the ✓ lines above)`);
  console.log(`   no id_compra  : ${noIdCompra} (ocid has no numeric purchase id — never scrapeable, distinct from a scrape failure below)`);
  console.log(`   unverified    : ${unverified} (has an id_compra, but its page fetch/parse failed)`);
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
