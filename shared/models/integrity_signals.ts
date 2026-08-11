import { Schema } from "mongoose";
import { mongoose } from "../connection/database";
import type { SignalKey, SignalLevel } from "../integrity-signals";

/**
 * Señales de gestión — one precomputed document per buying organism (`buyer.id`) over a trailing
 * window. Written by src/jobs/refresh-integrity-signals.ts (compute-then-swap by dataVersion) and
 * read by /api/analytics/integrity-signals with a plain indexed find.
 *
 * NOTHING here is aggregated on a request path: `releases.buyer.id` carries no index, so every
 * measurement behind these numbers is a COLLSCAN and belongs in a scheduled job.
 *
 * These are DESCRIPTIVE measurements of published records, never findings of wrongdoing. The
 * thresholds, their corpus justification, and the feed gaps that rule other indicators out live in
 * shared/integrity-signals.ts.
 */
export interface IIntegritySignal {
  buyerId: string;
  buyerName: string | null;
  /** Inclusive bounds of the measured window, so a stale document is self-describing. */
  windowStart: Date;
  windowEnd: Date;

  // --- volume ---
  contracts: number;
  totalUyu: number;
  supplierCount: number;

  // --- 1. concentration (UPPER BOUND: the release amount is not apportioned per supplier) ---
  topSupplierName: string | null;
  topSupplierUyu: number;

  // --- 2. award bursts ---
  burstCount: number;
  burstWorstAwards: number;
  burstWorstSupplier: string | null;
  burstWorstMonth: string | null;
  burstWorstUyu: number;

  // --- 3. non-competitive share (denominator is method-RESOLVED awards, ~27% of all) ---
  methodKnown: number;
  directCount: number;
  tenderCount: number;
  otherMethodCount: number;

  // --- 4. express bidding windows (cutoff is per-method, see EXPRESS_PERCENTILE) ---
  callsWithWindow: number;
  expressCalls: number;
  shortestWindowDays: number | null;

  // --- 5. price flags no explanation covers ---
  unexplainedFlags: number;

  /** Classified signals, in SIGNAL_KEYS order. */
  signals: Array<{
    key: SignalKey;
    level: SignalLevel;
    value: number | null;
    basis: number;
    populationPercentile: number | null;
  }>;
  /** Ordering weight only — never a corruption score. See signalWeight. */
  weight: number;
  /**
   * The p90/p97 cutoffs this run's levels were drawn from, copied onto every document so a reader
   * can check any single organism without fetching a separate baseline. Identical across the
   * generation by construction.
   */
  cutoffs: Record<string, { watch: number; high: number; population: number }>;

  dataVersion: string;
  calculatedAt: Date;
}

const SignalSchema = new Schema(
  {
    key: { type: String, required: true },
    level: { type: String, required: true, enum: ["none", "watch", "high"] },
    // Nullable ON PURPOSE: null means "denominator too thin to say", which must never render the
    // same as a measured zero.
    value: { type: Number, default: null },
    basis: { type: Number, default: 0 },
    populationPercentile: { type: Number, default: null },
  },
  { _id: false }
);

const IntegritySignalSchema = new Schema<IIntegritySignal>(
  {
    buyerId: { type: String, required: true },
    buyerName: { type: String, default: null },
    windowStart: { type: Date, required: true },
    windowEnd: { type: Date, required: true },

    contracts: { type: Number, required: true, default: 0 },
    totalUyu: { type: Number, required: true, default: 0 },
    supplierCount: { type: Number, required: true, default: 0 },

    topSupplierName: { type: String, default: null },
    topSupplierUyu: { type: Number, default: 0 },

    burstCount: { type: Number, default: 0 },
    burstWorstAwards: { type: Number, default: 0 },
    burstWorstSupplier: { type: String, default: null },
    burstWorstMonth: { type: String, default: null },
    burstWorstUyu: { type: Number, default: 0 },

    methodKnown: { type: Number, default: 0 },
    directCount: { type: Number, default: 0 },
    tenderCount: { type: Number, default: 0 },
    otherMethodCount: { type: Number, default: 0 },

    callsWithWindow: { type: Number, default: 0 },
    expressCalls: { type: Number, default: 0 },
    shortestWindowDays: { type: Number, default: null },

    unexplainedFlags: { type: Number, default: 0 },

    signals: { type: [SignalSchema], default: [] },
    weight: { type: Number, default: 0 },
    cutoffs: { type: Schema.Types.Mixed, default: {} },

    dataVersion: { type: String, required: true },
    calculatedAt: { type: Date, required: true },
  },
  { collection: "integrity_signals" }
);

// Built by scripts/ensure-indexes.ts only — autoIndex is off, so a Schema.index() alone does nothing.
IntegritySignalSchema.index({ buyerId: 1 }, { unique: true });
IntegritySignalSchema.index({ weight: -1, totalUyu: -1 });
IntegritySignalSchema.index({ dataVersion: 1 });

export const IntegritySignalModel =
  mongoose.models.IntegritySignal || mongoose.model<IIntegritySignal>("IntegritySignal", IntegritySignalSchema);
