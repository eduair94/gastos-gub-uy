/**
 * Shared aggregation building blocks for the analytics rebuild.
 *
 * MONEY RULE — read this before touching any pipeline in here.
 *
 * `awards.items.unit.value.amount` is a UNIT PRICE in the item's own currency. Summing it bare
 * (as the old pipeline did) is wrong three times over: it ignores `quantity`, it adds UYU to USD
 * to UYI as if they were the same unit, and it counts once per item rather than per contract.
 *
 * The canonical figure is `amount.primaryAmount`: the release total in UYU, already
 * quantity-multiplied and currency-converted by src/utils/amount-calculator.ts. Every release
 * tagged `award` has it populated, so release-level sums need no $unwind at all.
 *
 * Item- and award-level breakdowns (per supplier, per category) still need per-item numbers, and
 * those carry no converted value of their own. We derive one by scaling each item's raw
 * contribution by the release's own conversion ratio:
 *
 *     fx        = amount.primaryAmount / (sum of unit.value.amount * quantity over all items)
 *     itemUYU   = unit.value.amount * quantity * fx
 *
 * For single-currency releases fx is exactly 1 and itemUYU is exact — verified against production:
 * for releases with `hasConvertedAmounts: false`, primaryAmount equals the raw total to the cent.
 * For mixed-currency releases it apportions the converted total across items in proportion to
 * their raw share, so per-item figures always sum back to primaryAmount.
 */

/**
 * Plausibility ceiling for a single release, in UYU. Releases at or above this are left out of
 * aggregate totals. Override with ANALYTICS_MAX_RELEASE_UYU; set to 0 to disable entirely.
 *
 * WHY THIS EXISTS. A small number of upstream records carry a line total in `unit.value.amount`
 * rather than a unit price. Multiplying that by `quantity` — which is what the amount calculator
 * correctly does for well-formed records — produces impossible figures. The offenders are obvious
 * on inspection: 498,000 "FORMULARIO" at 360B UYU, 100,000 "Almanaque" at 219B, 100,000 plastic
 * cups at 102B. The worst is a 2026 equipment rental with quantity 1,200,007 at USD 519,788 each,
 * totalling USD 623B — on its own, 99.6% of everything recorded for 2026.
 *
 * At 50B (~USD 1.25B, larger than any plausible single Uruguayan public contract) this excludes
 * 16 of 1,395,132 awarded releases — 0.001% — and yearly totals become coherent instead of absurd:
 * 2022 193B, 2023 193B, 2024 217B, 2025 175B, against a national GDP near 3,000B UYU. Unfiltered,
 * 2026 alone reads 24,415B.
 *
 * This is a presentation guard, not a deletion: excluded releases stay fully queryable through the
 * contracts API, every run logs exactly which ones it dropped, and the anomaly detector is what
 * surfaces them as suspect. Retune the constant rather than working around it.
 */
export const MAX_PLAUSIBLE_RELEASE_UYU = Number(
  process.env.ANALYTICS_MAX_RELEASE_UYU ?? 50_000_000_000,
)

/** Matches releases that represent actual awarded money, within the plausibility ceiling. */
export const AWARD_MATCH: Record<string, unknown> = {
  tag: 'award',
  'amount.primaryAmount':
    MAX_PLAUSIBLE_RELEASE_UYU > 0
      ? { $gt: 0, $lt: MAX_PLAUSIBLE_RELEASE_UYU, $type: 'number' }
      : { $gt: 0, $type: 'number' },
}

/** Releases excluded by the ceiling — reported each run so the guard never operates silently. */
export const IMPLAUSIBLE_MATCH: Record<string, unknown> = {
  tag: 'award',
  'amount.primaryAmount': { $gte: MAX_PLAUSIBLE_RELEASE_UYU, $type: 'number' },
}

/** An item's raw value in its own currency: unit price x quantity. */
const itemRawValue = (item: string) => ({
  $multiply: [
    { $ifNull: [`${item}.unit.value.amount`, 0] },
    { $ifNull: [`${item}.quantity`, 1] },
  ],
})

/** Raw value of the item currently in scope after `$unwind: '$awards.items'`. */
export const UNWOUND_ITEM_RAW = itemRawValue('$awards.items')

/** Sum of every item's raw value across every award on the release. */
const RELEASE_RAW_TOTAL = {
  $reduce: {
    input: {
      $reduce: {
        input: { $ifNull: ['$awards', []] },
        initialValue: [],
        in: { $concatArrays: ['$$value', { $ifNull: ['$$this.items', []] }] },
      },
    },
    initialValue: 0,
    in: {
      $add: [
        '$$value',
        {
          $multiply: [
            { $ifNull: ['$$this.unit.value.amount', 0] },
            { $ifNull: ['$$this.quantity', 1] },
          ],
        },
      ],
    },
  },
}

/**
 * Ratio that converts a raw item value into UYU. Zero when the release carries no priced items,
 * which drops those items from money sums rather than dividing by zero.
 */
export const FX_SCALE = {
  $cond: [
    { $gt: [RELEASE_RAW_TOTAL, 0] },
    { $divide: ['$amount.primaryAmount', RELEASE_RAW_TOTAL] },
    0,
  ],
}

/** UYU value of the unwound item. Requires `_fx` to have been added by `$addFields`. */
export const UNWOUND_ITEM_UYU = { $multiply: [UNWOUND_ITEM_RAW, '$_fx'] }

/** The single supplier on the unwound award, or null. Awards carry 0 or 1 suppliers. */
export const AWARD_SUPPLIER_ID = { $arrayElemAt: ['$awards.suppliers.id', 0] }
export const AWARD_SUPPLIER_NAME = { $arrayElemAt: ['$awards.suppliers.name', 0] }
