import { Schema } from "mongoose";
import { mongoose } from "../connection/database";
import { IBuyerPattern } from "../types/database";

// Buyer Pattern Schema
const BuyerPatternSchema = new Schema<IBuyerPattern>(
  {
    buyerId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    totalContracts: { type: Number, required: true, default: 0 },
    years: [{ type: Number }],
    yearCount: { type: Number, required: true, default: 0 },
    suppliers: [{ type: String }],
    supplierCount: { type: Number, required: true, default: 0 },
    totalSpending: { type: Number, required: true, default: 0 },
    avgContractValue: { type: Number, required: true, default: 0 },
    items: [
      {
        description: { type: String, required: true },
        category: { type: String },
        totalAmount: { type: Number, required: true, default: 0 },
        totalQuantity: { type: Number, required: true, default: 0 },
        contractCount: { type: Number, required: true, default: 0 },
        avgPrice: { type: Number, required: true, default: 0 },
        currency: { type: String },
        unitName: { type: String },
        date: { type: String },
        sourceFile: { type: String },
        year: { type: Number },
      },
    ],
    topCategories: [
      {
        category: { type: String, required: true },
        totalAmount: { type: Number, required: true, default: 0 },
        contractCount: { type: Number, required: true, default: 0 },
      },
    ],
    lastUpdated: { type: Date, required: true, default: Date.now },
  },
  {
    timestamps: true,
    collection: "buyer_patterns",
  }
);

BuyerPatternSchema.index({ name: 1 });
BuyerPatternSchema.index({ totalSpending: -1 });
BuyerPatternSchema.index({ totalContracts: -1 });
BuyerPatternSchema.index({ lastUpdated: -1 });

export const BuyerPatternModel = mongoose.model<IBuyerPattern>("BuyerPattern", BuyerPatternSchema);
