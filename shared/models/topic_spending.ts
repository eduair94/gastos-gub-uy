import type { Model } from "mongoose";
import { Schema } from "mongoose";
import { mongoose } from "../connection/database";

/**
 * The read model for a spending topic: one document per topic, rebuilt weekly by
 * src/jobs/refresh-topic-spending.ts from `topic_contracts`. Every read endpoint
 * only `findOne()`s by index — nothing aggregates on the request path.
 *
 * Compute-then-swap by `dataVersion`: the new generation is written first, then the
 * PREVIOUSLY OBSERVED generations are deleted by their exact `dataVersion`. Never
 * `{ dataVersion: { $ne: fresh } }` — two overlapping runs each delete the other's
 * generation and leave the collection empty (the bug that emptied `sice_catalog`).
 *
 * Amounts are `amount.primaryAmount` (UYU-normalised). `coverage` is the honesty
 * number: the share of matched contracts the feed actually gives an amount for.
 */
export interface ITopicYearStat {
  year: number;
  total: number;
  contracts: number;
  /** Contracts matched but with no amount in the feed. */
  withoutAmount: number;
}

export interface ITopicBuyerStat {
  buyerId: string;
  buyerName: string;
  total: number;
  contracts: number;
  /** Everything this buyer spent (capped), so the page can show a share, not a rank. */
  buyerTotalSpend: number;
  /** total / buyerTotalSpend in basis points — the topic is a fraction of a percent. */
  shareBp: number;
  party?: string | undefined;
  partyLabel?: string | undefined;
  jurisdiction?: string | undefined;
  minYear: number | null;
  maxYear: number | null;
}

export interface ITopicSupplierStat {
  supplierId: string;
  name: string;
  total: number;
  contracts: number;
  buyers: number;
}

export interface ITopicCategoryStat {
  category: string;
  total: number;
  contracts: number;
}

export interface ITopicPartyStat {
  party: string;
  partyLabel: string;
  total: number;
  contracts: number;
  organisms: number;
  /** Size-weighted share of those organisms' own spending, in basis points. */
  weightedShareBp: number;
  /** Median of the per-organism shares — resistant to one huge buyer. */
  medianShareBp: number;
}

export interface ITopicContractRef {
  ocid: string;
  releaseId?: string | undefined;
  compraId?: string | undefined;
  title?: string | undefined;
  description?: string | undefined;
  buyerId?: string | undefined;
  buyerName?: string | undefined;
  supplierName?: string | undefined;
  sourceYear?: number | undefined;
  date?: Date | undefined;
  amount: number;
  hasAmount: boolean;
  category: string;
  procurementMethod?: string | undefined;
  party?: string | undefined;
  partyLabel?: string | undefined;
  firstSeenAt?: Date | undefined;
}

export interface ITopicOpenCall {
  compraId: string;
  title?: string | undefined;
  buyerName?: string | undefined;
  status?: string | undefined;
  endDate?: Date | undefined;
}

export interface ITopicSpending {
  topicKey: string;
  slug: string;
  /** Total of `inTopic` contracts that carry an amount. */
  total: number;
  contracts: number;
  contractsWithAmount: number;
  contractsWithoutAmount: number;
  /** contractsWithAmount / contracts, 0–1. The page leads with this. */
  coverage: number;
  /** Candidates the rules produced, before the second stage. */
  candidates: number;
  /** Candidates rejected as false positives (kept in `topic_contracts`). */
  discarded: number;
  buyers: number;
  suppliers: number;
  /** Everything the topic's own buyers spent, on everything — the honest denominator. */
  buyersTotalSpend: number;
  /** total / buyersTotalSpend in basis points. "X of every 10.000 pesos they spent." */
  overallShareBp: number;
  minYear: number | null;
  maxYear: number | null;
  byYear: ITopicYearStat[];
  byBuyer: ITopicBuyerStat[];
  bySupplier: ITopicSupplierStat[];
  byCategory: ITopicCategoryStat[];
  byParty: ITopicPartyStat[];
  topContracts: ITopicContractRef[];
  /** Contracts first seen inside the last 7 days — "novedades de la semana". */
  recent: ITopicContractRef[];
  openCalls: ITopicOpenCall[];
  /** Model that adjudicated, and how many verdicts it produced this run. */
  aiModel: string;
  aiVerdicts: number;
  rulesVersion: string;
  dataVersion: string;
  calculatedAt: Date;
}

const YearSchema = new Schema<ITopicYearStat>(
  {
    year: { type: Number, required: true },
    total: { type: Number, default: 0 },
    contracts: { type: Number, default: 0 },
    withoutAmount: { type: Number, default: 0 },
  },
  { _id: false },
);

const BuyerSchema = new Schema<ITopicBuyerStat>(
  {
    buyerId: { type: String, required: true },
    buyerName: { type: String, default: "" },
    total: { type: Number, default: 0 },
    contracts: { type: Number, default: 0 },
    buyerTotalSpend: { type: Number, default: 0 },
    shareBp: { type: Number, default: 0 },
    party: { type: String },
    partyLabel: { type: String },
    jurisdiction: { type: String },
    minYear: { type: Number, default: null },
    maxYear: { type: Number, default: null },
  },
  { _id: false },
);

const SupplierSchema = new Schema<ITopicSupplierStat>(
  {
    supplierId: { type: String, required: true },
    name: { type: String, default: "" },
    total: { type: Number, default: 0 },
    contracts: { type: Number, default: 0 },
    buyers: { type: Number, default: 0 },
  },
  { _id: false },
);

const CategorySchema = new Schema<ITopicCategoryStat>(
  {
    category: { type: String, required: true },
    total: { type: Number, default: 0 },
    contracts: { type: Number, default: 0 },
  },
  { _id: false },
);

const PartySchema = new Schema<ITopicPartyStat>(
  {
    party: { type: String, required: true },
    partyLabel: { type: String, default: "" },
    total: { type: Number, default: 0 },
    contracts: { type: Number, default: 0 },
    organisms: { type: Number, default: 0 },
    weightedShareBp: { type: Number, default: 0 },
    medianShareBp: { type: Number, default: 0 },
  },
  { _id: false },
);

const ContractRefSchema = new Schema<ITopicContractRef>(
  {
    ocid: { type: String, required: true },
    releaseId: { type: String },
    compraId: { type: String },
    title: { type: String },
    description: { type: String },
    buyerId: { type: String },
    buyerName: { type: String },
    supplierName: { type: String },
    sourceYear: { type: Number },
    date: { type: Date },
    amount: { type: Number, default: 0 },
    hasAmount: { type: Boolean, default: false },
    category: { type: String, default: "" },
    procurementMethod: { type: String },
    party: { type: String },
    partyLabel: { type: String },
    firstSeenAt: { type: Date },
  },
  { _id: false },
);

const OpenCallSchema = new Schema<ITopicOpenCall>(
  {
    compraId: { type: String, required: true },
    title: { type: String },
    buyerName: { type: String },
    status: { type: String },
    endDate: { type: Date },
  },
  { _id: false },
);

const TopicSpendingSchema = new Schema<ITopicSpending>(
  {
    topicKey: { type: String, required: true },
    slug: { type: String, required: true },
    total: { type: Number, default: 0 },
    contracts: { type: Number, default: 0 },
    contractsWithAmount: { type: Number, default: 0 },
    contractsWithoutAmount: { type: Number, default: 0 },
    coverage: { type: Number, default: 0 },
    candidates: { type: Number, default: 0 },
    discarded: { type: Number, default: 0 },
    buyers: { type: Number, default: 0 },
    suppliers: { type: Number, default: 0 },
    buyersTotalSpend: { type: Number, default: 0 },
    overallShareBp: { type: Number, default: 0 },
    minYear: { type: Number, default: null },
    maxYear: { type: Number, default: null },
    byYear: { type: [YearSchema], default: [] },
    byBuyer: { type: [BuyerSchema], default: [] },
    bySupplier: { type: [SupplierSchema], default: [] },
    byCategory: { type: [CategorySchema], default: [] },
    byParty: { type: [PartySchema], default: [] },
    topContracts: { type: [ContractRefSchema], default: [] },
    recent: { type: [ContractRefSchema], default: [] },
    openCalls: { type: [OpenCallSchema], default: [] },
    aiModel: { type: String, default: "" },
    aiVerdicts: { type: Number, default: 0 },
    rulesVersion: { type: String, default: "" },
    dataVersion: { type: String, required: true },
    calculatedAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true, collection: "topic_spending" },
);

TopicSpendingSchema.index({ topicKey: 1, dataVersion: 1 });
TopicSpendingSchema.index({ slug: 1 });

export const TopicSpendingModel: Model<ITopicSpending> =
  (mongoose.models.TopicSpending as Model<ITopicSpending>)
  || mongoose.model<ITopicSpending>("TopicSpending", TopicSpendingSchema);
