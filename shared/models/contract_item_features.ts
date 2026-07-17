import { Schema } from "mongoose";
import { mongoose } from "../connection/database";

// Scraped "Características del Ítem" cache.
//
// ARCE's OCDS feed omits the per-item characteristics table ("Tipo:
// SOMBRILLA DE CALOR", "Presentación: ENVASE / 250 G") and the
// "Variación" note that its own HTML pages show. Those fields change the
// meaning of an item — a unit price "per G" can really be per 250 G
// envase — so the detail page scrapes them from the government page on
// first view and caches the result here, one document per compra.
//
// The data is static once published (an adjudicación's characteristics
// never change), so there is no TTL; `fetchedAt` exists for manual
// invalidation and debugging. An empty `items` array is cached too — it
// records "we looked and the page has none", which stops every later
// view from re-scraping.
export interface IContractItemFeature {
  /** Gov item number ("Ítem Nº 1" -> 1). Matches the OCDS item id prefix. */
  nro: number;
  /** Rows of the características table, in page order. */
  features: { name: string; value: string }[];
  /** The "Variación" free-text note, when present. */
  variation?: string;
}

export interface IContractItemFeatures {
  /** The gov `id_compra` (ocid without its `ocds-yfs5dr-` prefix). */
  compraId: string;
  items: IContractItemFeature[];
  /** Which page yielded the data: the adjudicación or the llamado. */
  source: "adjudicacion" | "llamado";
  fetchedAt: Date;
}

const ContractItemFeaturesSchema = new Schema<IContractItemFeatures>(
  {
    compraId: { type: String, required: true },
    items: {
      type: [
        new Schema<IContractItemFeature>(
          {
            nro: { type: Number, required: true },
            features: {
              type: [
                new Schema(
                  {
                    name: { type: String, required: true },
                    value: { type: String, required: true },
                  },
                  { _id: false }
                ),
              ],
              default: [],
            },
            variation: { type: String },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
    source: { type: String, required: true, enum: ["adjudicacion", "llamado"] },
    fetchedAt: { type: Date, required: true, default: Date.now },
  },
  {
    timestamps: true,
    collection: "contract_item_features",
  }
);

ContractItemFeaturesSchema.index({ compraId: 1 }, { unique: true });

export const ContractItemFeaturesModel = mongoose.model<IContractItemFeatures>(
  "ContractItemFeatures",
  ContractItemFeaturesSchema
);
