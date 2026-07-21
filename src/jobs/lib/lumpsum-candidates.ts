/**
 * Which releases might have a contract LUMP SUM stored in `unit.value.amount`.
 *
 * Worked example — adjudicacion-53193 (Dir. Nacional de Catastro, SURYPARK S.A.,
 * 2005): 330.000 "timbres" x a stored unit price of USD 3.316 = USD 1.094.280.000,
 * against a published total of USD 4.201. The government page itself labels the
 * 3.316 a "Precio unitario sin impuestos", so the feed is faithfully reproducing a
 * mislabelled source field; only the official total can settle it.
 *
 * The selection is deliberately structural (no price baseline needed), because
 * detect-anomalies' isLineTotalArtifact() cannot help here: it needs a baseline for
 * {classificationId, currency, unitName} and only runs over a trailing window,
 * while these records are from 2004-2005 and their article is rarely purchased.
 *
 * The band matters: releases above maxPlausibleUyu are already dropped from
 * aggregates by analytics-pipeline's MAX_PLAUSIBLE_RELEASE_UYU, so the ones that
 * actually distort the public totals are the ones sitting just BELOW that ceiling.
 *
 * ---
 *
 * CONTRACT — read this before wiring either export into a job:
 *
 * `candidateMatchStage()` is a cheap, indexed Mongo PRE-FILTER only. It is
 * deliberately LOOSER than `isLumpsumSuspect()` — in particular it has no way to
 * express "at most maxPricedItems priced lines" without an index-hostile $where
 * or $expr, so it can and does pass through documents that `isLumpsumSuspect()`
 * would reject (a live check found 8/150 Mongo-matched releases disagree this
 * way, one with as many as 18 priced items). Every consumer MUST re-check each document
 * the Mongo stage returns with `isLumpsumSuspect()` before acting on it (e.g.
 * before overwriting `amount` with a scraped official total). Skip that
 * re-check and a release with several priced lines will have its total
 * silently overwritten from a single published figure that cannot be
 * attributed to any one line — exactly the multi-line case this module exists
 * to keep out of automatic correction.
 *
 * DELIBERATE LIMITATION — amendments stay excluded: both functions require the
 * release to be tagged `award` (never `awardUpdate`/`awardCancellation`/etc).
 * The official government page publishes one "Monto Total de la Compra" for
 * the whole purchase; an `ajuste_adjudicacion` (amendment) record holds only an
 * adjustment on top of a base award, so writing the purchase's full total onto
 * the amendment record would mis-attribute it to the wrong document. That risk
 * has not been separately investigated, so amendment-tagged releases are
 * excluded rather than guessed at. Known example this excludes today:
 * `ajuste_adjudicacion-28580` (ocid ocds-yfs5dr-1287667): one priced item,
 * 60,000 KG x USD 4,492/kg, `amount.primaryAmount` ~= 10,850,241,558 UYU. It
 * has the exact lump-sum shape this job targets but is intentionally left for
 * a future, separate investigation rather than auto-corrected here.
 *
 * KNOWN LATENT GAP — currency casing: `isLumpsumSuspect()` upper-cases the
 * item currency before comparing against ELIGIBLE_CURRENCIES; the Mongo
 * `$in: ELIGIBLE_CURRENCIES` in `candidateMatchStage()` is case-sensitive and
 * does NOT upper-case. All live data observed so far stores currency codes
 * upper-case, so the two encodings agree in practice, but a future
 * lower-/mixed-case `unit.value.currency` would
 * be picked up by `isLumpsumSuspect()` and silently dropped by the Mongo stage.
 * Left as-is deliberately (not worth an index-hostile $toUpper in the $match).
 */

import { hasVerifiedOverride } from "../../../shared/utils/verified-override";

export const LUMPSUM_DEFAULTS = {
  /** A unit price attached to this many units is implausible for a real unit price. */
  qtyThreshold: Number(process.env.LUMPSUM_QTY_THRESHOLD ?? 1000),
  /** Floor: below this a wrong total is not distorting anything. */
  suspectMinUyu: Number(process.env.LUMPSUM_SUSPECT_MIN_UYU ?? 1e9),
  /** Ceiling: matches analytics-pipeline's MAX_PLAUSIBLE_RELEASE_UYU. */
  maxPlausibleUyu: Number(process.env.MAX_PLAUSIBLE_RELEASE_UYU ?? 50e9),
  /** computed/official must exceed this to count as an artifact rather than a rounding gap. */
  ratioMin: Number(process.env.LUMPSUM_RATIO_MIN ?? 5),
  /** More priced lines than this and one official total cannot be attributed. */
  maxPricedItems: Number(process.env.LUMPSUM_MAX_ITEMS ?? 2),
};

export type LumpsumOptions = Partial<typeof LUMPSUM_DEFAULTS>;

// The currencies a lump-sum-in-unit-price artifact can appear in. USD/EUR were
// the first cases found, but the same mislabel exists in domestic UYU rows
// (adjudicacion-a6005: 66.837 units x 56.672 UYU "unit price" = 3.79B UYU vs an
// official 66.837 UYU total), so UYU is eligible too. This only widens the
// STRUCTURAL suspect pool; whether a suspect is actually inflated is still
// decided downstream by isArtifactConfirmed() against the scraped official total,
// so an ordinary large UYU contract whose total agrees is left untouched.
const ELIGIBLE_CURRENCIES = ["USD", "EUR", "UYU"];

/**
 * The `$match` for stage 1 — a cheap, indexed PRE-FILTER, not the full rule.
 *
 * It is deliberately LOOSER than `isLumpsumSuspect()`: it cannot express the
 * "at most maxPricedItems priced lines" cap (see the module docblock's
 * CONTRACT section above) without an index-hostile $expr, so it can return
 * documents with many priced lines that `isLumpsumSuspect()` would reject.
 * Every consumer MUST re-check each fetched document with `isLumpsumSuspect()`
 * before acting on it — skipping that re-check means a multi-line release can
 * have its total overwritten from a single official figure that cannot be
 * attributed to any one line.
 */
export function candidateMatchStage(o: LumpsumOptions = {}): Record<string, unknown> {
  const opts = { ...LUMPSUM_DEFAULTS, ...o };
  return {
    tag: "award",
    "amount.primaryAmount": { $gte: opts.suspectMinUyu, $lt: opts.maxPlausibleUyu },
    "amount.verifiedOverride": { $exists: false },
    awards: {
      $elemMatch: {
        items: {
          $elemMatch: {
            quantity: { $gte: opts.qtyThreshold },
            "unit.value.currency": { $in: ELIGIBLE_CURRENCIES },
            "unit.value.amount": { $gt: 0 },
          },
        },
      },
    },
  };
}

interface AnyItem {
  quantity?: unknown;
  unit?: { value?: { amount?: unknown; currency?: unknown } };
}
interface AnyAward { items?: AnyItem[] }
interface AnyRelease {
  amount?: { primaryAmount?: unknown; verifiedOverride?: unknown };
  awards?: AnyAward[];
  /** OCDS tag array, e.g. ["award"] or ["awardUpdate"]. May be absent. */
  tag?: unknown;
}

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

/** True when `tag` (an array field in this schema) contains "award". */
const isTaggedAward = (tag: unknown): boolean => Array.isArray(tag) && tag.includes("award");

/**
 * The same rule as candidateMatchStage, applied to a document in hand.
 *
 * This is the FULL rule — the one Mongo's `$match` can only loosely
 * approximate (see the module docblock's CONTRACT section). In particular
 * this is the function that enforces the `maxPricedItems` cap that
 * `candidateMatchStage()` cannot express; callers MUST run every candidate
 * document through this function before treating it as confirmed.
 */
export function isLumpsumSuspect(release: AnyRelease, o: LumpsumOptions = {}): boolean {
  const opts = { ...LUMPSUM_DEFAULTS, ...o };
  if (!isTaggedAward(release?.tag)) return false;
  if (hasVerifiedOverride(release)) return false;
  const primary = num(release?.amount?.primaryAmount);
  if (primary === null || primary < opts.suspectMinUyu || primary >= opts.maxPlausibleUyu) {
    return false;
  }
  const awards = Array.isArray(release?.awards) ? release.awards : [];
  const priced = awards
    .flatMap((a) => (Array.isArray(a?.items) ? a.items : []))
    .filter((i) => (num(i?.unit?.value?.amount) ?? 0) > 0);
  if (priced.length === 0 || priced.length > opts.maxPricedItems) return false;

  return priced.some((i) => {
    const qty = num(i?.quantity);
    const currency = typeof i?.unit?.value?.currency === "string" ? i.unit!.value!.currency : "";
    return qty !== null && qty >= opts.qtyThreshold && ELIGIBLE_CURRENCIES.includes(currency.toUpperCase());
  });
}

/** True when the computed total is so far above the published one that it is an artifact. */
export function isArtifactConfirmed(
  computedTotal: number,
  officialTotal: number,
  o: LumpsumOptions = {},
): boolean {
  const opts = { ...LUMPSUM_DEFAULTS, ...o };
  if (!Number.isFinite(computedTotal) || !Number.isFinite(officialTotal)) return false;
  if (officialTotal <= 0 || computedTotal <= 0) return false;
  return computedTotal / officialTotal >= opts.ratioMin;
}
