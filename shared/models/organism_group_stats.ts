import type { Model } from "mongoose";
import { Schema } from "mongoose";
import { mongoose } from "../connection/database";

/**
 * Precomputed spending rollups for the organism groups (Intendencias, Ministerios,
 * Salud, Entes, Educación). One document per group, rebuilt monthly by
 * src/jobs/refresh-organism-groups.ts (compute-then-swap by dataVersion). The read
 * endpoints (/api/analytics/organism-groups, /api/analytics/intendencias) only
 * `.findOne()` by index — nothing is aggregated on the request path.
 *
 * Amounts are `amount.primaryAmount` (UYU), capped: single releases above `cap` are
 * excluded as data artefacts and counted in `excludedRecords`. Per-capita is NOT
 * stored (population is not in the procurement data) — the page joins it client-side.
 */
export interface IOrganismYearStat {
  year: number
  total: number
  contracts: number
}

export interface IOrganismMemberStat {
  key: string
  label: string
  buyerId?: string
  inciso?: string
  total: number
  contracts: number
  minYear: number | null
  maxYear: number | null
  excludedRecords: number
  /** Capped spend for THIS member, per year — the interannual series the
   *  Intendencias page reads to compare one year against the previous. */
  byYear: IOrganismYearStat[]
}

export interface IOrganismGroupStats {
  groupKey: string
  label: string
  labelEn: string
  metric: "perCapita" | "total"
  blurbEs: string
  blurbEn: string
  members: IOrganismMemberStat[]
  byYear: IOrganismYearStat[]
  total: number
  contracts: number
  memberCount: number
  cap: number
  excludedRecords: number
  dataVersion: string
  calculatedAt: Date
}

const YearStatSchema = new Schema<IOrganismYearStat>(
  {
    year: { type: Number, required: true },
    total: { type: Number, required: true },
    contracts: { type: Number, required: true },
  },
  { _id: false }
);

const MemberStatSchema = new Schema<IOrganismMemberStat>(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    buyerId: { type: String },
    inciso: { type: String },
    total: { type: Number, required: true },
    contracts: { type: Number, required: true },
    minYear: { type: Number, default: null },
    maxYear: { type: Number, default: null },
    excludedRecords: { type: Number, default: 0 },
    byYear: { type: [YearStatSchema], default: [] },
  },
  { _id: false }
);

const OrganismGroupStatsSchema = new Schema<IOrganismGroupStats>(
  {
    groupKey: { type: String, required: true },
    label: { type: String, required: true },
    labelEn: { type: String, required: true },
    metric: { type: String, required: true },
    blurbEs: { type: String, default: "" },
    blurbEn: { type: String, default: "" },
    members: { type: [MemberStatSchema], default: [] },
    byYear: { type: [YearStatSchema], default: [] },
    total: { type: Number, required: true },
    contracts: { type: Number, required: true },
    memberCount: { type: Number, required: true },
    cap: { type: Number, required: true },
    excludedRecords: { type: Number, default: 0 },
    dataVersion: { type: String, required: true },
    calculatedAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true, collection: "organism_group_stats" }
);

OrganismGroupStatsSchema.index({ groupKey: 1 }, { unique: true });
OrganismGroupStatsSchema.index({ dataVersion: 1 });

// HMR-safe registration (the Nuxt dev server re-imports models on hot reload).
export const OrganismGroupStatsModel =
  (mongoose.models.OrganismGroupStats as Model<IOrganismGroupStats>)
  || mongoose.model<IOrganismGroupStats>("OrganismGroupStats", OrganismGroupStatsSchema);
