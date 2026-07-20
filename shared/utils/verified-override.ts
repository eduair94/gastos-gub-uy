/**
 * A release amount that was corrected against the official government record.
 *
 * Some OCDS items carry a contract LUMP SUM in `unit.value.amount`; multiplying
 * it by quantity (src/utils/amount-calculator.ts) inflates the stored total by
 * orders of magnitude. When a correction job has verified the real figure on
 * comprasestatales, it stamps this object on `amount` so that:
 *   1. every path that recomputes `amount` leaves the release alone, and
 *   2. the UI can show where the number came from.
 */
export interface VerifiedOverride {
  source: "comprasestatales";
  /** The government page the total was read from. */
  sourceUrl: string;
  /** "Monto Total de la Compra" as published, in its own currency. */
  officialTotal: number;
  officialCurrency: string;
  /** `YYYY-MM` whose BCU rate converted officialTotal to UYU. */
  rateMonth: string;
  /** What we replaced, for audit/rollback. */
  previousPrimaryAmount: number | null;
  previousComputedTotal: number | null;
  verifiedAt: Date;
  reason: "lumpsum-in-unit-price";
}

/**
 * True when a release carries a verified override. Every job that writes
 * `amount` MUST check this and skip, or a routine re-sync silently restores the
 * inflated figure.
 */
export function hasVerifiedOverride(doc: unknown): boolean {
  if (!doc || typeof doc !== "object") return false;
  const amount = (doc as { amount?: unknown }).amount;
  if (!amount || typeof amount !== "object") return false;
  const override = (amount as { verifiedOverride?: unknown }).verifiedOverride;
  return !!override && typeof override === "object";
}
