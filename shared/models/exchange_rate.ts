import { Schema } from "mongoose";
import { mongoose } from "../connection/database";

/**
 * Monthly BCU rates, the basis for showing any price in a COMPARABLE value.
 *
 * Two problems make a raw amount misleading over time:
 *   1. Currency — a USD or EUR price is not comparable to a UYU one, and the
 *      ingest pipeline converted foreign amounts at the *current* rate, so a
 *      2010 USD contract was valued at today's exchange rate. Wrong: use the
 *      rate of the contract's OWN month.
 *   2. Inflation — Uruguayan pesos lose value every year, so $1.000 in 2015 is
 *      not $1.000 today. The fix is the Unidad Indexada (UI): a UYU-denominated
 *      unit the BCU adjusts daily with the CPI. Dividing an amount by the UI of
 *      its month gives an inflation-constant value; multiplying by TODAY's UI
 *      re-expresses it in today's pesos. This stays correct on its own as new
 *      months are appended — there is no base year to go stale.
 *
 * `usd`/`eur` are UYU per unit of foreign currency; `ui` is UYU per Unidad
 * Indexada. One document per calendar month (`YYYY-MM`), the monthly average of
 * the BCU daily series (see src/jobs/refresh-exchange-rates.ts).
 */
export interface IExchangeRate {
  /** Calendar month, `YYYY-MM`. */
  month: string;
  /** UYU per USD (BCU), monthly average. */
  usd?: number;
  /** UYU per EUR (BCU), monthly average. */
  eur?: number;
  /** UYU per Unidad Indexada (BCU), monthly average — the inflation index. */
  ui?: number;
  updatedAt: Date;
}

const ExchangeRateSchema = new Schema<IExchangeRate>(
  {
    month: { type: String, required: true, unique: true },
    usd: { type: Number },
    eur: { type: Number },
    ui: { type: Number },
    updatedAt: { type: Date, required: true, default: Date.now },
  },
  { collection: "exchange_rates" }
);

ExchangeRateSchema.index({ month: 1 }, { unique: true });

export const ExchangeRateModel = mongoose.model<IExchangeRate>(
  "ExchangeRate",
  ExchangeRateSchema
);
