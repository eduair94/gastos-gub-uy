import { Schema } from "mongoose";
import { mongoose } from "../connection/database";
import { IItemPriceBaseline } from "../types/database";

// Item Price Baseline Schema
//
// One document per {classificationId, currency, unitName} bucket, computed by
// src/jobs/detect-anomalies.ts over a trailing window of award item unit prices.
//
// `currency` is part of the key on purpose: award item unit prices are stored in
// mixed currencies (UYU/USD/UYI), so pooling them into one distribution produces
// nonsense. `classificationId` (not the free-text classification description) is
// the group key because the description is unnormalised - 'Papel A4', 'PAPEL A4'
// and 'Papel A-4' all fragment a single economic category.
const ItemPriceBaselineSchema = new Schema<IItemPriceBaseline>(
  {
    classificationId: { type: String, required: true },
    currency: { type: String, required: true },
    // Canonical unit (shared/utils/units.canonicalUnit): Unidad/UNIDAD/u/un/unid all
    // fold to "unidad" so one unit stops fragmenting into thin baselines. Older
    // raw-unit baselines are swept by dataVersion on each detect-anomalies run.
    unitName: { type: String, required: true },
    n: { type: Number, required: true, default: 0 },
    // Log-space location/scale. MAD has a breakdown point of 0.5, so a single
    // 100x contract cannot drag the centre far enough to hide itself.
    medianLn: { type: Number, required: true },
    madLn: { type: Number, required: true, default: 0 },
    // Raw-currency percentiles. Used for the reported expected range and as the
    // IQR fence fallback when madLn === 0 (a single dominant commodity price).
    p25: { type: Number, required: true },
    p50: { type: Number, required: true },
    p75: { type: Number, required: true },
    p95: { type: Number, required: true },
    min: { type: Number, required: true },
    max: { type: Number, required: true },
    distinctPrices: { type: Number, required: true, default: 0 },
    // Distinct prices seen >= RECURRING_PRICE_MIN_COUNT times and above p50: the tariff/list
    // prices of this bucket (e.g. every legal timbre profesional denomination). The scorer
    // never flags an exact match. Absent on pre-rule baselines, which simply skip the rule.
    recurringPrices: { type: [Number], default: undefined },
    // Mode (tallest histogram bin) + its share of n. Drives deviation-from-mode scoring, which
    // catches a gross overprice against a single dominant list price where MAD and IQR are both 0.
    // Absent on pre-heuristic baselines, which simply skip that rule.
    modePrice: { type: Number },
    modeShare: { type: Number },
    windowStart: { type: Date, required: true },
    windowEnd: { type: Date, required: true },
    dataVersion: { type: String, required: true },
    calculatedAt: { type: Date, required: true, default: Date.now },
  },
  {
    timestamps: true,
    collection: "item_price_baselines",
  }
);

ItemPriceBaselineSchema.index({ classificationId: 1, currency: 1, unitName: 1 }, { unique: true });
ItemPriceBaselineSchema.index({ n: -1 });
ItemPriceBaselineSchema.index({ calculatedAt: -1 });

export const ItemPriceBaselineModel = mongoose.model<IItemPriceBaseline>("ItemPriceBaseline", ItemPriceBaselineSchema);
