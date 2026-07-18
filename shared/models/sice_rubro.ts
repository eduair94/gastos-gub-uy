import { Schema } from "mongoose";
import type { Model } from "mongoose";
import { mongoose } from "../connection/database";
import type { RubroLevel } from "../utils/rubro-tokens";

/**
 * One document per rubro tree node (familia/subfamilia/clase/subclase) — the
 * lightweight ~2,170-node tree that powers the alerts picker cascader and the
 * product-page breadcrumbs, so the UI never scans the 91k-article catalog to
 * draw a level. Built from the four hierarchy tables (FAMILIAS/SUBFLIAS/CLASES/
 * SUBCLASES) by src/jobs/import-sice-catalog.ts (compute-then-swap).
 */
export interface ISiceRubro {
  /** "F2" | "SF2.6" | "C2.6.5" | "SC2.6.5.3" — unique (shared/utils/rubro-tokens) */
  token: string;
  level: RubroLevel;
  /** node DESCRIPCION */
  name: string;
  /** numeric dotted, e.g. "2.6.5" */
  path: string;
  /** parent node token; absent for a familia */
  parentToken?: string;
  /** # non-retired articles at/under this node — a picker hint */
  articleCount: number;
  /** FAMILIAS.COMPRABLE propagated; default true below familia */
  purchasable: boolean;
  dataVersion: string;
}

const SiceRubroSchema = new Schema<ISiceRubro>(
  {
    token: { type: String, required: true },
    level: { type: String, required: true, enum: ["familia", "subfamilia", "clase", "subclase"] },
    name: { type: String, required: true, default: "" },
    path: { type: String, required: true, default: "" },
    parentToken: { type: String },
    articleCount: { type: Number, default: 0 },
    purchasable: { type: Boolean, default: true },
    dataVersion: { type: String, required: true },
  },
  { timestamps: true, collection: "sice_rubro" }
);

SiceRubroSchema.index({ token: 1 }, { unique: true });
SiceRubroSchema.index({ parentToken: 1 });
SiceRubroSchema.index({ level: 1 });
SiceRubroSchema.index({ dataVersion: 1 });

export const SiceRubroModel: Model<ISiceRubro> =
  (mongoose.models.SiceRubro as Model<ISiceRubro>) ||
  mongoose.model<ISiceRubro>("SiceRubro", SiceRubroSchema);
