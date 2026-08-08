import type { Model } from "mongoose";
import { Schema } from "mongoose";
import { mongoose } from "../connection/database";
import type { PriceQuantitySplit, SpendingBridge } from "../utils/spending-bridge";

/**
 * Year-over-year procurement spending, decomposed into WHY it moved.
 *
 * One document per calendar year, rebuilt by src/jobs/refresh-spending-trend.ts.
 * The write is an upsert keyed on `year` plus a sweep of years no longer
 * produced — deliberately NOT the `deleteMany({ dataVersion: { $ne } })` swap
 * the other rollups use, because two overlapping runs of that pattern delete
 * each other's generation and empty the collection. The read endpoint only does
 * a `find().sort({ year: 1 })` — nothing is aggregated on the request path.
 *
 * Three things make the raw yearly sum a lie, and each has a field here:
 *
 *  1. **Currency.** `amount.primaryAmount` was written by the ingest at the
 *     exchange rate of the day it ran, so a 2003 USD contract is valued at
 *     today's peso. Every figure below is instead rebuilt from
 *     `amount.totalAmounts` (a currency->amount map) at the rate of the
 *     contract's OWN month (shared/utils/real-value.ts).
 *  2. **Inflation.** `nominalUyu` is pesos of its own year and is NOT
 *     comparable across years; `realUyu` divides by the Unidad Indexada of each
 *     contract's month and multiplies by the latest UI, i.e. today's pesos.
 *  3. **Artefacts.** A handful of releases carry a contract lump sum in the
 *     unit price, so quantity x unit inflates them by orders of magnitude — in
 *     2003 and 2024 a SINGLE release is ~64% of the year. Those are excluded
 *     and listed, one by one with a link, in `exclusions`; `rawNominalUyu`
 *     keeps the unsanitised figure so the page can show both.
 *
 * `bridge` is the exact, additive decomposition of the change from the previous
 * year (see the job for the algebra). `priceQuantity` is a SEPARATE, partial
 * lens over comparable article codes — it deliberately does not sum to the
 * bridge, and carries its own coverage share.
 */

/** One release removed from the series, with the reason, for public audit. */
export interface ISpendingExclusion {
  releaseId: string;
  ocid: string;
  buyerName: string;
  title: string;
  /** Own-month-FX value that was removed, UYU of its year. */
  nominalUyu: number;
  reason: "artifact-ceiling" | "unconvertible-currency";
  /** Currencies we could not convert, when reason is unconvertible-currency. */
  currencies?: string[] | undefined;
}

/**
 * The additive bridge from year-1 to year, every term in pesos of `year`.
 *
 *   base + inflation + entrants + exits + panelDelta === total
 *
 * `inflation` re-prices last year's spend at this year's price level;
 * `entrants`/`exits` isolate buyers that only report in one of the two years
 * (more coverage is not more spending); `panelDelta` is what the buyers present
 * in BOTH years actually changed.
 */
export type ISpendingBridge = SpendingBridge;

/**
 * Price-vs-quantity within article codes present in both years, over comparable
 * units. Partial by construction: `coverage` is the share of the year's value
 * that the matched codes represent. Quantities in the feed are integer-floored,
 * so this is a direction-of-travel signal, not an accounting identity.
 */
export type ISpendingPriceQuantity = PriceQuantitySplit;

/** A named line in the "who moved the number" tables. */
export interface ISpendingContributor {
  key: string;
  label: string;
  /** Change vs the previous year, pesos of `year` (previous year re-priced). */
  delta: number;
  /** delta / |realDelta| of the year. */
  share: number;
  /** This year's spend for the entity, pesos of year. */
  current: number;
  /** Previous year's spend, re-priced to this year. */
  previous: number;
}

/** A single contract big enough to move the yearly total on its own. */
export interface ISpendingEvent {
  releaseId: string;
  ocid: string;
  title: string;
  buyerName: string;
  supplierName: string;
  nominalUyu: number;
  /** nominalUyu / |realDelta| of the year. */
  share: number;
}

export interface ISpendingTrendYear {
  year: number;
  /** True while the year is still running — totals are not annualised. */
  partial: boolean;

  // ---- Series (all rebuilt at own-month FX; artefacts removed) ----
  /** Pesos of the year itself. */
  nominalUyu: number;
  /** Today's pesos (deflated by the UI of each contract's month). */
  realUyu: number;
  /** USD at each contract's own-month rate. */
  usd: number;
  /** With artefacts and unconvertibles left IN — the "as reported" toggle. */
  rawNominalUyu: number;

  releases: number;
  buyers: number;
  suppliers: number;

  /** Average UI of the year — the deflator used for the bridge. */
  uiAvg: number | null;
  /** Average UYU/USD of the year. */
  usdAvg: number | null;

  // ---- Macro lenses (joined at compute time from shared/macro-uruguay) ----
  gdpNominalUyu: number | null;
  pctOfGdp: number | null;
  centralGovExpenseUyu: number | null;
  pctOfCentralGovExpense: number | null;
  population: number | null;
  /** Today's pesos per inhabitant. */
  realPerCapita: number | null;
  /** Own-year USD per inhabitant. */
  usdPerCapita: number | null;

  // ---- Data quality ----
  exclusions: ISpendingExclusion[];
  excludedCount: number;
  excludedNominalUyu: number;
  unconvertibleCount: number;

  // ---- Why it moved ----
  bridge: ISpendingBridge | null;
  priceQuantity: ISpendingPriceQuantity | null;
  topBuyers: ISpendingContributor[];
  topCategories: ISpendingContributor[];
  events: ISpendingEvent[];

  /** Deterministic sentence, optionally rewritten by Gemini (numbers are ours). */
  narrativeEs: string;
  narrativeEn: string;
  /** "template" or "gemini" — which produced the stored text. */
  narrativeSource: "template" | "gemini";

  dataVersion: string;
  calculatedAt: Date;
}

const ExclusionSchema = new Schema<ISpendingExclusion>(
  {
    releaseId: { type: String, required: true },
    ocid: { type: String, default: "" },
    buyerName: { type: String, default: "" },
    title: { type: String, default: "" },
    nominalUyu: { type: Number, required: true },
    reason: { type: String, required: true },
    currencies: { type: [String] },
  },
  { _id: false }
);

const BridgeSchema = new Schema<ISpendingBridge>(
  {
    base: { type: Number, required: true },
    inflation: { type: Number, required: true },
    entrants: { type: Number, required: true },
    exits: { type: Number, required: true },
    panelDelta: { type: Number, required: true },
    total: { type: Number, required: true },
    realDelta: { type: Number, required: true },
    panelBuyers: { type: Number, required: true },
    entrantBuyers: { type: Number, required: true },
    exitBuyers: { type: Number, required: true },
  },
  { _id: false }
);

const PriceQuantitySchema = new Schema<ISpendingPriceQuantity>(
  {
    quantity: { type: Number, required: true },
    price: { type: Number, required: true },
    matchedDelta: { type: Number, required: true },
    matchedTotal: { type: Number, required: true },
    coverage: { type: Number, required: true },
    codes: { type: Number, required: true },
    droppedCodes: { type: Number, default: 0 },
  },
  { _id: false }
);

const ContributorSchema = new Schema<ISpendingContributor>(
  {
    key: { type: String, required: true },
    label: { type: String, default: "" },
    delta: { type: Number, required: true },
    share: { type: Number, required: true },
    current: { type: Number, required: true },
    previous: { type: Number, required: true },
  },
  { _id: false }
);

const EventSchema = new Schema<ISpendingEvent>(
  {
    releaseId: { type: String, required: true },
    ocid: { type: String, default: "" },
    title: { type: String, default: "" },
    buyerName: { type: String, default: "" },
    supplierName: { type: String, default: "" },
    nominalUyu: { type: Number, required: true },
    share: { type: Number, required: true },
  },
  { _id: false }
);

const SpendingTrendYearSchema = new Schema<ISpendingTrendYear>(
  {
    year: { type: Number, required: true },
    partial: { type: Boolean, default: false },

    nominalUyu: { type: Number, required: true },
    realUyu: { type: Number, required: true },
    usd: { type: Number, required: true },
    rawNominalUyu: { type: Number, required: true },

    releases: { type: Number, required: true },
    buyers: { type: Number, required: true },
    suppliers: { type: Number, default: 0 },

    uiAvg: { type: Number, default: null },
    usdAvg: { type: Number, default: null },

    gdpNominalUyu: { type: Number, default: null },
    pctOfGdp: { type: Number, default: null },
    centralGovExpenseUyu: { type: Number, default: null },
    pctOfCentralGovExpense: { type: Number, default: null },
    population: { type: Number, default: null },
    realPerCapita: { type: Number, default: null },
    usdPerCapita: { type: Number, default: null },

    exclusions: { type: [ExclusionSchema], default: [] },
    excludedCount: { type: Number, default: 0 },
    excludedNominalUyu: { type: Number, default: 0 },
    unconvertibleCount: { type: Number, default: 0 },

    bridge: { type: BridgeSchema, default: null },
    priceQuantity: { type: PriceQuantitySchema, default: null },
    topBuyers: { type: [ContributorSchema], default: [] },
    topCategories: { type: [ContributorSchema], default: [] },
    events: { type: [EventSchema], default: [] },

    narrativeEs: { type: String, default: "" },
    narrativeEn: { type: String, default: "" },
    narrativeSource: { type: String, default: "template" },

    dataVersion: { type: String, required: true },
    calculatedAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true, collection: "spending_trend" }
);

// Declared here for parity; built by scripts/ensure-indexes.ts (autoIndex is off).
SpendingTrendYearSchema.index({ year: 1 }, { unique: true });
SpendingTrendYearSchema.index({ dataVersion: 1 });

// HMR-safe registration (the Nuxt dev server re-imports models on hot reload).
export const SpendingTrendModel: Model<ISpendingTrendYear> =
  (mongoose.models.SpendingTrend as Model<ISpendingTrendYear>)
  || mongoose.model<ISpendingTrendYear>("SpendingTrend", SpendingTrendYearSchema);
