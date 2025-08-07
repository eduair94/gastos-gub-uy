import { Schema } from "mongoose";
import { mongoose } from "../connection/database";
import { IFilterData } from "../types/database";

// Filter Data Schema for pre-computed filter options
const FilterDataSchema = new Schema<IFilterData>(
  {
    type: {
      type: String,
      required: true,
      enum: ["years", "statuses", "procurementMethods", "suppliers", "buyers"],
      unique: true,
    },
    data: [
      {
        value: { type: Schema.Types.Mixed, required: true },
        label: { type: String, required: true },
        count: { type: Number, required: true, default: 0 },
      },
    ],
    lastUpdated: { type: Date, required: true, default: Date.now },
    generatedFromReleases: { type: Number, required: true, default: 0 },
  },
  {
    timestamps: true,
    collection: "filter_data",
  }
);

FilterDataSchema.index({ lastUpdated: -1 });




export const FilterDataModel = mongoose.model<IFilterData>("FilterData", FilterDataSchema);