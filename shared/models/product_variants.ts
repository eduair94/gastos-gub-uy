import { Schema, type Model } from "mongoose";
import { mongoose } from "../connection/database";

// Per catalogue-code distribution of the SCRAPED item características (Marca,
// Concentración, Presentación, Nombre comercial/modelo, Variación).
//
// OCDS omits these and the SICE catalog does not carry them per article — they
// exist only in `contract_item_features` (scraped per compra, keyed by compraId,
// joined to award items by `nro`). This precomputes, for the codes that carry an
// UNEXPLAINED anomaly (`anomalies.aiVerdict.explainable === 'no'`), "does the
// physical product behind this code actually vary, and how" — the question a
// price spike raises (the bicarbonate at 10.184 vs ~181/frasco). The lazy batch
// endpoint fills the same shape on demand for every other code.
//
// Populated by src/jobs/refresh-product-variants.ts (compute-then-swap by
// dataVersion); read non-fatally by the product API alongside item_price_baselines.
export interface IVariantValue {
  value: string;
  count: number;
}

export interface IVariantAttr {
  /** Display label, e.g. "Marca" / "Nombre comercial/modelo". */
  name: string;
  /** Distinct values seen, most frequent first. */
  values: IVariantValue[];
  distinct: number;
}

export interface IProductVariants {
  /** classification.id. */
  code: string;
  /** How many contracts (matched items) fed the aggregate. */
  sampledContracts: number;
  attributes: IVariantAttr[];
  /** True when a key axis (Marca / Presentación / Nombre comercial) has >1 distinct value. */
  varies: boolean;
  calculatedAt: Date;
  dataVersion: string;
}

const ValueSchema = new Schema<IVariantValue>(
  {
    value: { type: String, required: true },
    count: { type: Number, required: true },
  },
  { _id: false }
);

const AttrSchema = new Schema<IVariantAttr>(
  {
    name: { type: String, required: true },
    values: { type: [ValueSchema], default: [] },
    distinct: { type: Number, required: true },
  },
  { _id: false }
);

const ProductVariantsSchema = new Schema<IProductVariants>(
  {
    code: { type: String, required: true },
    sampledContracts: { type: Number, required: true, default: 0 },
    attributes: { type: [AttrSchema], default: [] },
    varies: { type: Boolean, required: true, default: false },
    calculatedAt: { type: Date, required: true, default: Date.now },
    dataVersion: { type: String, required: true },
  },
  { timestamps: true, collection: "product_variants" }
);

ProductVariantsSchema.index({ code: 1 }, { unique: true });
ProductVariantsSchema.index({ dataVersion: 1 });

export const ProductVariantsModel: Model<IProductVariants> =
  mongoose.model<IProductVariants>("ProductVariants", ProductVariantsSchema);
