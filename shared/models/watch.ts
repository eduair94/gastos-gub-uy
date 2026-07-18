import { Schema } from "mongoose";
import type { Model } from "mongoose";
import { mongoose } from "../connection/database";
import { IWatch } from "../types/monitor";

// A rubro subscription / saved search — the unit the matcher evaluates against
// each newly-opened call. `categories` and `keywords` are OR-triggers; `buyers`,
// value range and `procurementMethods` are AND-refinements. Keywords are stored
// pre-normalized (shared/utils/text.normalizeKeyword) so they compare identically
// to the call's `searchText`.
const WatchSchema = new Schema<IWatch>(
  {
    userId: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    active: { type: Boolean, default: true },
    // OCDS classification ids (catalogue codes).
    categories: { type: [String], default: [] },
    keywords: { type: [String], default: [] },
    keywordMode: { type: String, enum: ["any", "all"], default: "any" },
    // Buyer ids — refinement filter, not a sole trigger.
    buyers: { type: [String], default: [] },
    minValue: { type: Number },
    maxValue: { type: Number },
    // procurementMethodDetails values (the Spanish procedure names).
    procurementMethods: { type: [String], default: undefined },
    lastMatchedAt: { type: Date },
  },
  { timestamps: true, collection: "watches" }
);

WatchSchema.index({ userId: 1 });
WatchSchema.index({ active: 1, categories: 1 });
WatchSchema.index({ active: 1 });

export const WatchModel: Model<IWatch> =
  (mongoose.models.Watch as Model<IWatch>) || mongoose.model<IWatch>("Watch", WatchSchema);
