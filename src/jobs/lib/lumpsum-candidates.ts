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
 */

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

const FOREIGN = ["USD", "EUR"];

/** The `$match` for stage 1. Kept in step with isLumpsumSuspect below. */
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
            "unit.value.currency": { $in: FOREIGN },
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
interface AnyRelease { amount?: { primaryAmount?: unknown }; awards?: AnyAward[] }

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

/** The same rule as candidateMatchStage, applied to a document in hand. */
export function isLumpsumSuspect(release: AnyRelease, o: LumpsumOptions = {}): boolean {
  const opts = { ...LUMPSUM_DEFAULTS, ...o };
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
    return qty !== null && qty >= opts.qtyThreshold && FOREIGN.includes(currency.toUpperCase());
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
