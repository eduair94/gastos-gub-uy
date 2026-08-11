import type { Model } from "mongoose";
import { Schema } from "mongoose";
import { mongoose } from "../connection/database";

/**
 * One document per contract that a spending topic (shared/spending-topics.ts) has
 * *considered* — including the ones it rejected. Written by
 * src/jobs/refresh-topic-spending.ts.
 *
 * Three reasons this collection exists instead of recomputing on the fly:
 *   1. `firstSeenAt` is what powers "novedades de la semana"; a recomputed set has
 *      no memory of when a contract entered the topic.
 *   2. The LLM verdict is expensive to produce and cheap to keep. A contract whose
 *      `rulesVersion` has not changed is never re-charged.
 *   3. The rejected candidates are evidence. The page reports how many it discarded
 *      and why, which is what makes the surviving total auditable.
 *
 * Unlike the rollup, this collection is ACCUMULATIVE — never swapped, never emptied.
 * Amounts are `amount.primaryAmount` (UYU-normalised), copied at classification time.
 */
export interface ITopicContractHit {
  term: string;
  strength: "strong" | "weak";
  snippet: string;
}

export interface ITopicContractSupplier {
  id?: string | undefined;
  name?: string | undefined;
}

export interface ITopicContractAi {
  inTopic: "yes" | "no" | "uncertain";
  category: string;
  confidence: number;
  reason: string;
  model: string;
  at: Date;
}

export interface ITopicContract {
  topicKey: string;
  /** OCDS ocid — the stable handle. Gov links are ALWAYS derived from it. */
  ocid: string;
  /** The release `id`, which is what /contracts/[id] resolves. NEVER used for gov links. */
  releaseId?: string | undefined;
  /** `id_compra`: the ocid minus its `ocds-<prefix>-`. */
  compraId?: string | undefined;
  buyerId?: string | undefined;
  buyerName?: string | undefined;
  sourceYear?: number | undefined;
  date?: Date | undefined;
  title?: string | undefined;
  description?: string | undefined;
  procurementMethod?: string | undefined;
  /** `amount.primaryAmount`, 0 when the feed carries no amount. */
  amount: number;
  hasAmount: boolean;
  suppliers: ITopicContractSupplier[];
  /** Which terms fired, with the text around them — the page's evidence column. */
  hits: ITopicContractHit[];
  /** A `strong` term fired: the rules qualify it without a model. */
  ruleStrong: boolean;
  ai?: ITopicContractAi | undefined;
  /** Final verdict: rules + model. Only `true` counts towards the totals. */
  inTopic: boolean;
  category: string;
  /** Governing mandate at `sourceYear` — CONTEXT, never attribution. */
  party?: string | undefined;
  partyLabel?: string | undefined;
  mandateHolder?: string | undefined;
  isTransition?: boolean | undefined;
  /** Hash of the topic's term list; a change re-runs classification. */
  rulesVersion: string;
  firstSeenAt: Date;
  lastSeenAt: Date;
}

const HitSchema = new Schema<ITopicContractHit>(
  {
    term: { type: String, required: true },
    strength: { type: String, required: true },
    snippet: { type: String, default: "" },
  },
  { _id: false },
);

const SupplierSchema = new Schema<ITopicContractSupplier>(
  { id: { type: String }, name: { type: String } },
  { _id: false },
);

const AiSchema = new Schema<ITopicContractAi>(
  {
    inTopic: { type: String, required: true },
    category: { type: String, required: true },
    confidence: { type: Number, default: 0 },
    reason: { type: String, default: "" },
    model: { type: String, default: "" },
    at: { type: Date, default: Date.now },
  },
  { _id: false },
);

const TopicContractSchema = new Schema<ITopicContract>(
  {
    topicKey: { type: String, required: true },
    ocid: { type: String, required: true },
    releaseId: { type: String },
    compraId: { type: String },
    buyerId: { type: String },
    buyerName: { type: String },
    sourceYear: { type: Number },
    date: { type: Date },
    title: { type: String },
    description: { type: String },
    procurementMethod: { type: String },
    amount: { type: Number, default: 0 },
    hasAmount: { type: Boolean, default: false },
    suppliers: { type: [SupplierSchema], default: [] },
    hits: { type: [HitSchema], default: [] },
    ruleStrong: { type: Boolean, default: false },
    ai: { type: AiSchema },
    inTopic: { type: Boolean, default: false },
    category: { type: String, default: "" },
    party: { type: String },
    partyLabel: { type: String },
    mandateHolder: { type: String },
    isTransition: { type: Boolean },
    rulesVersion: { type: String, required: true },
    firstSeenAt: { type: Date, required: true, default: Date.now },
    lastSeenAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true, collection: "topic_contracts" },
);

// Declared for parity; built by scripts/ensure-indexes.ts (autoIndex is off).
TopicContractSchema.index({ topicKey: 1, ocid: 1 }, { unique: true });
TopicContractSchema.index({ topicKey: 1, inTopic: 1, amount: -1 });
TopicContractSchema.index({ topicKey: 1, inTopic: 1, firstSeenAt: -1 });
TopicContractSchema.index({ topicKey: 1, inTopic: 1, sourceYear: -1 });
TopicContractSchema.index({ topicKey: 1, inTopic: 1, category: 1 });
TopicContractSchema.index({ topicKey: 1, inTopic: 1, buyerId: 1 });
TopicContractSchema.index({ topicKey: 1, rulesVersion: 1 });

export const TopicContractModel: Model<ITopicContract> =
  (mongoose.models.TopicContract as Model<ITopicContract>)
  || mongoose.model<ITopicContract>("TopicContract", TopicContractSchema);
