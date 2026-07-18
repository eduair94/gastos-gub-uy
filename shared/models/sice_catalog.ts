import { Schema } from "mongoose";
import type { Model } from "mongoose";
import { mongoose } from "../connection/database";

/**
 * One document per SICE/CUBS article, imported from ACCE's open-data catalog
 * (`imp_catalogo.tgz`, table ART_SERV_OBRA). Keyed by `code`, which is the SAME
 * string as OCDS `classification.id` in `releases`/`open_calls` — verified
 * end-to-end against the live DB. This is the single source of truth the alerts
 * picker, the product pages, and the anomaly detector all read from.
 *
 * Rebuilt (compute-then-swap by `dataVersion`) by src/jobs/import-sice-catalog.ts.
 */
export interface ISiceCatalog {
  /** ART_SERV_OBRA.COD as string, e.g. "28267" — unique, == classification.id */
  code: string;
  /** ART_SERV_OBRA.DESCRIPCION — the canonical name (kills the description-mode noise). */
  canonicalName: string;
  /** IND_ART_SERV === 'S' */
  isService: boolean;
  // Rubro path: numeric codes + denormalized names so a read needs no join.
  famiCode: string;
  famiName: string;
  subfCode: string;
  subfName: string;
  clasCode: string;
  clasName: string;
  subcCode: string;
  subcName: string;
  /** numeric dotted, e.g. "2.6.5.3" */
  rubroPath: string;
  /** the four ancestor tokens: ["F2","SF2.6","C2.6.5","SC2.6.5.3"] (shared/utils/rubro-tokens) */
  rubroTokens: string[];
  /** UNME_COD */
  unitCode?: string;
  /** UNIDADES_MED.DESCRIPCION — the article's default unit of measure */
  unitName?: string;
  /** objeto del gasto code (ODG) */
  odg?: string;
  /** SINONIMOS.DESCRIPCION for this article — a keyword-search aid */
  synonyms: string[];
  /** FECHA_BAJA present — kept but flagged and excluded from pickers */
  retired: boolean;
  /** compute-then-swap tag */
  dataVersion: string;
  updatedAt?: Date;
}

const SiceCatalogSchema = new Schema<ISiceCatalog>(
  {
    code: { type: String, required: true },
    canonicalName: { type: String, required: true, default: "" },
    isService: { type: Boolean, default: false },
    famiCode: { type: String, default: "" },
    famiName: { type: String, default: "" },
    subfCode: { type: String, default: "" },
    subfName: { type: String, default: "" },
    clasCode: { type: String, default: "" },
    clasName: { type: String, default: "" },
    subcCode: { type: String, default: "" },
    subcName: { type: String, default: "" },
    rubroPath: { type: String, default: "" },
    rubroTokens: { type: [String], default: [] },
    unitCode: { type: String },
    unitName: { type: String },
    odg: { type: String },
    synonyms: { type: [String], default: [] },
    retired: { type: Boolean, default: false },
    dataVersion: { type: String, required: true },
  },
  { timestamps: true, collection: "sice_catalog" }
);

// Declared here for parity, but built by scripts/ensure-indexes.ts (autoIndex is off).
SiceCatalogSchema.index({ code: 1 }, { unique: true });
SiceCatalogSchema.index({ rubroPath: 1 });
SiceCatalogSchema.index({ rubroTokens: 1 });
SiceCatalogSchema.index({ dataVersion: 1 });

export const SiceCatalogModel: Model<ISiceCatalog> =
  (mongoose.models.SiceCatalog as Model<ISiceCatalog>) ||
  mongoose.model<ISiceCatalog>("SiceCatalog", SiceCatalogSchema);
