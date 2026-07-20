/**
 * Reconcile award amendments (ajuste_adjudicacion) into their base award release.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * THE BUG THIS FIXES
 *
 * A contracting process (one `ocid`) is published as several OCDS releases. The
 * award is `adjudicacion-<compraId>` (tag `award`). When the state later corrects
 * that award — almost always a data-entry error in the quantity, e.g. 10000 units
 * of an office rental instead of 1 — it does NOT rewrite the original award release.
 * The correction is published as a SEPARATE release `ajuste_adjudicacion-<ajusteId>`
 * (tag `awardUpdate`), sharing the same `ocid` and the same award id.
 *
 * Every money consumer in this codebase filters `tag: 'award'` (contracts explorer,
 * dashboard stats, anomaly baselines, product/provider analytics, webhooks). None
 * of them sum `awardUpdate`. So the correction is invisible: aggregations keep
 * summing the stale, inflated award, and the single-contract page (keyed on the
 * `adjudicacion-<id>` release) shows the wrong figure.
 *
 * Concrete example — ocds-yfs5dr-1309133:
 *   adjudicacion-1309133      tag award        qty 10000  ->  2,131,147,500 UYU  (WRONG)
 *   ajuste_adjudicacion-27507 tag awardUpdate  qty 1      ->        213,114.75  (the correction)
 * Measured on the live DB (2026-07): ~1,800 award releases carry such corrections,
 * ~1,500 of them inflated, ~655 BILLION UYU of phantom money in the totals.
 *
 * THE FIX
 *
 * For each ocid that has amendment releases, merge the amendments' award data into
 * the base `adjudicacion-*` release and recompute its `amount`. The merge is done
 * at ITEM level within each award id, NOT a whole-award replace, because the
 * `ajuste_adjudicacion` releases carry item-level DELTAS — verified against the
 * government's own detail pages:
 *   - 1309133: amendment restates the single item with qty 1            -> replace it
 *   - 1318822: amendment restates the single USD item (qty error)       -> replace it
 *   - 1118821: amendment restates all items with qty 0 (annulment)      -> zero them
 *   - 1283192: amendment zeroes the old award AND adds a new award       -> both
 *   - 1271755: amendment restates ONLY item 1-26; the award's 11 other   -> keep the
 *              items are unchanged and MUST be preserved                     others
 * A whole-award replace would have wrongly dropped 1271755's other 11 items.
 *
 * The merge is idempotent (item replace is by absolute value) and self-healing: it
 * merges from whatever is currently stored, so if the weekly reconcile ever reverts
 * a base award to its raw upstream state, the next run re-applies the correction.
 * No consumer double-counts, because the amendment releases (tag `awardUpdate`) are
 * still never summed — only the base award is edited in place.
 *
 * PREVENTIVE
 *
 * cronserver runs this after every hourly ingest (incremental, `--since-days`) and
 * a full pass after the weekly reconcile, so future corrections apply automatically.
 *
 * ANOMALY RE-ANALYSIS
 *
 * After correcting, the touched releases are re-scored against the existing price
 * baselines (rescoreReleaseIds), so a contract that was only flagged because of the
 * corrupt quantity stops showing as an anomaly. Disable with --no-rescore.
 *
 * USAGE
 *   npx tsx src/jobs/reconcile-award-amendments.ts               # full pass, apply + rescore
 *   npx tsx src/jobs/reconcile-award-amendments.ts --dry-run     # report only, no writes
 *   npx tsx src/jobs/reconcile-award-amendments.ts --since-days=10   # only recent amendments
 *   npx tsx src/jobs/reconcile-award-amendments.ts --ocid=ocds-yfs5dr-1309133
 *   npx tsx src/jobs/reconcile-award-amendments.ts --limit=50 --verbose
 *   npx tsx src/jobs/reconcile-award-amendments.ts --no-rescore
 */
import { connectToDatabase, disconnectFromDatabase } from "../../shared/connection/database";
import { ReleaseModel } from "../../shared/models";
import { calculateTotalAmounts, fetchCurrencyRates, fetchUYIRate } from "../utils/amount-calculator";
import { hasVerifiedOverride } from "../../shared/utils/verified-override";
import { rescoreReleaseIds } from "./detect-anomalies";

const MARKER_VERSION = 1;
const OCID_CHUNK = 200;
const BULK_BATCH = 500;
const MAX_RECORDED_CHANGES = 200;

interface Options {
  dryRun: boolean;
  sinceDays: number | null;
  ocid: string | null;
  limit: number | null;
  rescore: boolean;
  verbose: boolean;
}

interface ItemChange {
  awardId: string;
  itemId: string;
  from: string; // amendment release id that introduced the change
  beforeQty: number | null;
  afterQty: number | null;
  beforeUnit: number | null;
  afterUnit: number | null;
  currency: string | null;
}

function parseArgs(argv: string[]): Options {
  const o: Options = { dryRun: false, sinceDays: null, ocid: null, limit: null, rescore: true, verbose: false };
  for (const arg of argv) {
    if (arg === "--dry-run") o.dryRun = true;
    else if (arg === "--no-rescore") o.rescore = false;
    else if (arg === "--verbose") o.verbose = true;
    else if (arg.startsWith("--since-days=")) {
      const n = Number.parseInt(arg.slice("--since-days=".length), 10);
      if (!Number.isInteger(n) || n <= 0) throw new Error(`Invalid --since-days: ${arg}`);
      o.sinceDays = n;
    } else if (arg.startsWith("--ocid=")) {
      o.ocid = arg.slice("--ocid=".length).trim() || null;
    } else if (arg.startsWith("--limit=")) {
      const n = Number.parseInt(arg.slice("--limit=".length), 10);
      if (!Number.isInteger(n) || n <= 0) throw new Error(`Invalid --limit: ${arg}`);
      o.limit = n;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return o;
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v ?? null));
// Award/item ids drift in format across years: 2023 exports write "R/215511440015"
// (slash) with item id `1`, while a 2025 amendment references the same award as
// "R215511440015" with item `1-1`. Normalise so a de-adjudication matches its base
// award instead of being mistaken for a new one (which double-counted 923043).
// Award ids: strip separators so "R/215511440015" == "R215511440015". SAFE for award
// ids (they are RUTs / codes, no collision from removing slashes).
const normId = (v: any): string => String(v ?? "").replace(/[^a-z0-9]/gi, "").toUpperCase();
const awardKey = (a: any): string => (a?.id != null ? normId(a.id) : "_noid");
// Item ids: keep the dash. Stripping it made "1-1" collide with the numeric item `11`,
// producing a false overlap that skipped the wholesale-replace and doubled the award
// (1304064: 47 base items + 47 amendment items = 90). Cross-scheme ids (`1` vs `1-1`)
// must simply NOT match, so they take the zero-overlap replace path below.
const itemKey = (i: any): string =>
  i?.id != null ? String(i.id).trim().toUpperCase() : `${i?.description ?? ""}${i?.unit?.value?.amount ?? ""}${i?.unit?.value?.currency ?? ""}`;

function itemVals(i: any): { q: number | null; a: number | null; c: string | null } {
  return {
    q: typeof i?.quantity === "number" ? i.quantity : null,
    a: typeof i?.unit?.value?.amount === "number" ? i.unit.value.amount : null,
    c: i?.unit?.value?.currency ?? null,
  };
}

/**
 * Item-level delta merge of amendment releases (oldest -> newest) into a copy of
 * the base award release's `awards`. Returns the merged awards plus the meaningful
 * item changes (added items, or items whose quantity/unit price/currency moved).
 */
function mergeAwards(baseAwards: any[], amendments: any[]): { merged: any[]; changes: ItemChange[] } {
  const merged: any[] = clone(baseAwards || []);
  const byAward = new Map<string, any>();
  for (const a of merged) byAward.set(awardKey(a), a);
  const changes: ItemChange[] = [];

  for (const rel of amendments) {
    for (const amAward of rel.awards || []) {
      const ak = awardKey(amAward);
      let target = byAward.get(ak);
      if (!target) {
        // A new award id introduced by the amendment (e.g. the award moved to a
        // different supplier). Carry the whole award object, its items filled below.
        target = { ...clone(amAward), items: [] };
        byAward.set(ak, target);
        merged.push(target);
      } else {
        // The amendment restates these award-level fields; item money is merged below.
        if (amAward.status !== undefined) target.status = amAward.status;
        if (amAward.suppliers !== undefined) target.suppliers = clone(amAward.suppliers);
        if (amAward.title !== undefined) target.title = amAward.title;
        if (amAward.date !== undefined) target.date = amAward.date;
      }

      // Full de-adjudication: an amendment award whose every item is qty 0 removes
      // that award entirely. Handled at award level (not per item) so it survives
      // item-id format drift between an old base and a newer amendment — otherwise a
      // 2023 award with item id `1` keeps its money while the 2025 ajuste zeroes
      // item `1-1`, double-counting the re-adjudicated supplier (e.g. 923043, 1076123).
      const amItems = Array.isArray(amAward.items) ? amAward.items : [];
      const allZero = amItems.length > 0 && amItems.every((i: any) => itemVals(i).q === 0);
      if (allZero) {
        for (const it of Array.isArray(target.items) ? target.items : []) {
          const bv = itemVals(it);
          changes.push(
            changes.length < MAX_RECORDED_CHANGES
              ? { awardId: ak, itemId: itemKey(it), from: rel.id, beforeQty: bv.q, afterQty: 0, beforeUnit: bv.a, afterUnit: null, currency: bv.c }
              : { awardId: ak, itemId: itemKey(it), from: rel.id, beforeQty: null, afterQty: null, beforeUnit: null, afterUnit: null, currency: null }
          );
        }
        target.items = [];
        continue;
      }

      // Re-key / item-scheme drift: the amendment restates this award with item ids that
      // share NOTHING with the base (`1` -> `1-1`, or `1-2` -> `1-1`). A per-item delta
      // would APPEND the amendment lines on top of the base ones and double the award
      // (1210208, 1242293, 1272837, 1304064, 1196487). With zero id overlap the amendment
      // is the authoritative restatement of the award, so replace its items wholesale
      // (dropping de-adjudicated q0 lines). A same-scheme partial correction (1271755) or a
      // quantity ampliación (1280306) always shares at least one item id and takes the
      // per-item delta path below instead.
      const baseItemIds = new Set((target.items as any[]).map(itemKey));
      const amNonZero = amItems.filter((i: any) => itemVals(i).q !== 0);
      const anyOverlap = amItems.some((i: any) => baseItemIds.has(itemKey(i)));
      if (amItems.length > 0 && !anyOverlap) {
        for (const it of target.items as any[]) {
          const bv = itemVals(it);
          if (changes.length < MAX_RECORDED_CHANGES) changes.push({ awardId: ak, itemId: itemKey(it), from: rel.id, beforeQty: bv.q, afterQty: 0, beforeUnit: bv.a, afterUnit: null, currency: bv.c });
        }
        for (const it of amNonZero) {
          const av = itemVals(it);
          if (changes.length < MAX_RECORDED_CHANGES) changes.push({ awardId: ak, itemId: itemKey(it), from: rel.id, beforeQty: null, afterQty: av.q, beforeUnit: null, afterUnit: av.a, currency: av.c });
        }
        target.items = amNonZero.map((i: any) => clone(i));
        continue;
      }

      const rebuild = (): Map<string, number> => {
        const m = new Map<string, number>();
        (target.items as any[]).forEach((it, i) => m.set(itemKey(it), i));
        return m;
      };
      target.items = Array.isArray(target.items) ? target.items : [];
      let idx = rebuild();

      for (const amItem of amAward.items || []) {
        const ik = itemKey(amItem);
        const next = clone(amItem);
        const at = idx.get(ik);
        const before = at !== undefined ? (target.items as any[])[at] : null;
        const b = before ? itemVals(before) : null;
        const a = itemVals(next);

        // A quantity of 0 in an ajuste means the item was de-adjudicated (the award
        // moved supplier, or the whole award was annulled). Treat it as a REMOVAL, not
        // a qty-0 line — otherwise the amount calculator's `quantity || 1` rule would
        // value it at one unit (which is exactly how 1283192 read as 100M and the
        // annulled 1118821 read as 2,856 instead of 0). Verified against the gov
        // detail pages, which drop de-adjudicated items entirely.
        const removed = a.q === 0;
        const diff = removed ? before !== null : !b || b.q !== a.q || b.a !== a.a || b.c !== a.c;

        if (diff) {
          changes.push(
            changes.length < MAX_RECORDED_CHANGES
              ? { awardId: ak, itemId: ik, from: rel.id, beforeQty: b?.q ?? null, afterQty: removed ? 0 : a.q, beforeUnit: b?.a ?? null, afterUnit: a.a, currency: a.c }
              : { awardId: ak, itemId: ik, from: rel.id, beforeQty: null, afterQty: null, beforeUnit: null, afterUnit: null, currency: null }
          );
        }

        if (removed) {
          if (at !== undefined) {
            (target.items as any[]).splice(at, 1);
            idx = rebuild(); // indices shifted
          }
          continue;
        }
        if (at !== undefined) (target.items as any[])[at] = next;
        else {
          (target.items as any[]).push(next);
          idx.set(ik, (target.items as any[]).length - 1);
        }
      }
    }
  }
  return { merged, changes };
}

/** Money-relevant fingerprint, order-independent, to decide whether a write is needed. */
function fingerprint(awards: any[]): string {
  const norm = (awards || [])
    .map((a) => ({
      id: a?.id ?? null,
      status: a?.status ?? null,
      items: (a?.items || [])
        .map((i: any) => ({ id: i?.id ?? null, ...itemVals(i) }))
        .sort((x: any, y: any) => String(x.id).localeCompare(String(y.id))),
    }))
    .sort((x, y) => String(x.id).localeCompare(String(y.id)));
  return JSON.stringify(norm);
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  console.log("🔧 reconcile-award-amendments", JSON.stringify(opts));

  await connectToDatabase();

  // Exchange rates for the amount recompute (foreign-currency awards -> UYU).
  // Same source the version-migration path uses, so recomputed amounts stay consistent.
  const rates = await fetchCurrencyRates().catch((e) => {
    console.warn("⚠️  fetchCurrencyRates failed, UYU-only conversion:", e?.message ?? e);
    return null;
  });
  const uyi = await fetchUYIRate().catch(() => null);

  // Candidate ocids: those with at least one amendment (awardUpdate) release.
  const amendmentMatch: Record<string, unknown> = { tag: "awardUpdate" };
  if (opts.ocid) {
    amendmentMatch.ocid = opts.ocid;
  } else if (opts.sinceDays) {
    const cutoff = new Date(Date.now() - opts.sinceDays * 24 * 60 * 60 * 1000);
    amendmentMatch.date = { $gte: cutoff };
    console.log(`   incremental: amendments with date >= ${cutoff.toISOString()}`);
  }

  let ocids: string[] = await ReleaseModel.distinct("ocid", amendmentMatch);
  ocids = ocids.filter(Boolean);
  if (opts.limit) ocids = ocids.slice(0, opts.limit);
  console.log(`   candidate ocids with amendments: ${ocids.length}`);

  let basesChecked = 0;
  let corrected = 0;
  let noBase = 0;
  let skippedAmbiguous = 0;
  let skippedVerified = 0;
  let removedOvercount = 0; // sum of (original - corrected) primaryAmount, corrected only
  const correctedIds: string[] = [];
  const top: Array<{ id: string; before: number; after: number }> = [];
  const skipped: Array<{ id: string; base: number; merged: number; introduced: string[] }> = [];

  for (let k = 0; k < ocids.length; k += OCID_CHUNK) {
    const slice = ocids.slice(k, k + OCID_CHUNK);
    const docs = await ReleaseModel.find(
      { ocid: { $in: slice } },
      { _id: 1, id: 1, ocid: 1, tag: 1, date: 1, awards: 1, amount: 1, amendmentReconcile: 1 }
    ).lean();

    const byOcid = new Map<string, any[]>();
    for (const d of docs) {
      const arr = byOcid.get(d.ocid) || [];
      arr.push(d);
      byOcid.set(d.ocid, arr);
    }

    const bulkOps: any[] = [];

    for (const [, group] of byOcid) {
      const bases = group.filter((d) => (d.tag || []).includes("award") && /^adjudicacion-/.test(d.id));
      const amendments = group
        .filter((d) => (d.tag || []).includes("awardUpdate"))
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      if (amendments.length === 0) continue;
      if (bases.length === 0) {
        noBase++;
        continue;
      }

      for (const base of bases) {
        basesChecked++;

        // PRECEDENCE: a government-published amendment is newer ground truth than our
        // page verification, so it is allowed to win — but only by REPLACING the
        // override, never by silently recomputing around it. We skip here and require
        // a deliberate re-run of correct-lumpsum-artifacts to re-verify, because the
        // merged item math is exactly the quantity x lump-sum trap this guards.
        if (hasVerifiedOverride(base)) {
          skippedVerified++;
          continue;
        }

        const { merged, changes } = mergeAwards(base.awards || [], amendments);
        if (fingerprint(merged) === fingerprint(base.awards || [])) continue; // already correct / no-op

        const amountData = calculateTotalAmounts(merged, rates, uyi, { includeVersionInfo: true });

        // Safety guard against re-adjudication double-counts. When an award is moved to
        // a new supplier its id can be re-keyed (base `T/15006` -> amendment
        // `R215725260018`) WITHOUT the old award being zeroed, so the merge would keep
        // both and inflate the total (the residual x2.0 seen on 1069247, 958073). There
        // is no reliable machine signal that the new award supersedes the old one, so:
        // if the merge INCREASES the total AND introduces an award id absent from the
        // base, do not write — leave the base (whose money is already right under the old
        // id) and log it for manual review. Same-award increases (a genuine ampliación
        // like 1310825, or a corrected unit price like 1084935) still apply, because they
        // introduce no new award id. De-adjudications / deflation always apply.
        const freshBaseTotal = calculateTotalAmounts(base.awards || [], rates, uyi).primaryAmount;
        const baseAwardIds = new Set((base.awards || []).map((a: any) => awardKey(a)));
        const introduced = [...new Set(merged.map((a: any) => awardKey(a)))].filter((id) => !baseAwardIds.has(id));
        if (amountData.primaryAmount > freshBaseTotal * 1.0001 && introduced.length > 0) {
          skippedAmbiguous++;
          if (skipped.length < 500) skipped.push({ id: base.id, base: freshBaseTotal, merged: amountData.primaryAmount, introduced });
          continue;
        }
        const existing = (base as any).amendmentReconcile;
        const originalPrimaryAmount =
          existing?.originalPrimaryAmount ?? (typeof base.amount?.primaryAmount === "number" ? base.amount.primaryAmount : null);
        const correctedPrimaryAmount = amountData.primaryAmount;

        const marker = {
          appliedAmendmentIds: amendments.map((a) => a.id),
          appliedAt: new Date(),
          originalPrimaryAmount,
          correctedPrimaryAmount,
          correctedItems: changes.length,
          changes: changes.slice(0, MAX_RECORDED_CHANGES),
          version: MARKER_VERSION,
        };

        corrected++;
        correctedIds.push(base.id);
        if (typeof originalPrimaryAmount === "number") {
          const delta = originalPrimaryAmount - correctedPrimaryAmount;
          if (delta > 0) removedOvercount += delta;
          top.push({ id: base.id, before: originalPrimaryAmount, after: correctedPrimaryAmount });
        }

        if (opts.verbose) {
          console.log(
            `   ✎ ${base.id}  ${Math.round(originalPrimaryAmount ?? 0).toLocaleString()} -> ${Math.round(
              correctedPrimaryAmount
            ).toLocaleString()} UYU  (${changes.length} item change(s), amendments: ${marker.appliedAmendmentIds.join(", ")})`
          );
        }

        if (!opts.dryRun) {
          bulkOps.push({
            updateOne: {
              filter: { _id: base._id },
              update: { $set: { awards: merged, amount: amountData, amendmentReconcile: marker } },
            },
          });
        }
      }
    }

    if (bulkOps.length) {
      for (let i = 0; i < bulkOps.length; i += BULK_BATCH) {
        await ReleaseModel.bulkWrite(bulkOps.slice(i, i + BULK_BATCH), { ordered: false });
      }
    }
  }

  top.sort((a, b) => b.before - b.after - (a.before - a.after));
  console.log("\n────────── summary ──────────");
  console.log(`   bases checked            : ${basesChecked}`);
  console.log(`   ocids w/ amendment,no base: ${noBase}`);
  console.log(`   ${opts.dryRun ? "WOULD correct" : "corrected"}           : ${corrected}`);
  console.log(`   skipped (re-key ambiguous): ${skippedAmbiguous}`);
  if (skippedVerified) console.log(`   skipped (verified override): ${skippedVerified}`);
  console.log(`   phantom UYU removed       : ${Math.round(removedOvercount).toLocaleString()}`);
  console.log(`   top corrections:`);
  for (const t of top.slice(0, 15)) {
    console.log(`     ${t.id}  ${Math.round(t.before).toLocaleString()} -> ${Math.round(t.after).toLocaleString()}`);
  }
  if (skipped.length) {
    console.log(`\n   ⚠️  ${skippedAmbiguous} skipped for manual review (increase via a re-keyed award id; left untouched):`);
    for (const sdoc of skipped.slice(0, 20)) {
      console.log(`     ${sdoc.id}  base ${Math.round(sdoc.base).toLocaleString()} -> merged ${Math.round(sdoc.merged).toLocaleString()}  new award(s): ${sdoc.introduced.join(", ")}`);
    }
  }

  // Machine-readable summary line for the cronserver orchestrator. When corrected>0 the base
  // award amounts changed, so every downstream precompute that summed the old figures is now
  // stale; the parent parses this to decide whether to refresh the monthly organism rollup
  // (its own cron would otherwise leave it wrong for weeks). Keep the `corrected=<n>` token
  // stable — cronserver.ts greps for it.
  console.log(`RECONCILE_SUMMARY corrected=${corrected} skipped=${skippedAmbiguous} removedUYU=${Math.round(removedOvercount)} basesChecked=${basesChecked}`);

  if (!opts.dryRun && opts.rescore && correctedIds.length) {
    console.log(`\n🔁 re-scoring ${correctedIds.length} corrected release(s) against existing anomaly baselines…`);
    try {
      await rescoreReleaseIds(correctedIds);
    } catch (e) {
      console.warn("⚠️  anomaly re-score failed (correction still applied):", e instanceof Error ? e.message : e);
    }
  } else if (opts.dryRun) {
    console.log(`\n🧪 --dry-run: no writes, no re-score.`);
  }

  await disconnectFromDatabase();
  console.log("✅ reconcile-award-amendments done");
}

if (require.main === module) {
  main().catch(async (e) => {
    console.error("❌ reconcile-award-amendments failed:", e);
    await disconnectFromDatabase().catch(() => undefined);
    process.exit(1);
  });
}

export { mergeAwards, fingerprint };
