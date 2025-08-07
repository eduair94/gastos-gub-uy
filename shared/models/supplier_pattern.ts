import { Schema } from "mongoose";
import { mongoose } from "../connection/database";
import { ISupplierPattern } from "../types/database";

// Supplier Pattern Schema
const SupplierPatternSchema = new Schema<ISupplierPattern>(
  {
    supplierId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    totalContracts: { type: Number, required: true, default: 0 },
    years: [{ type: Number }],
    yearCount: { type: Number, required: true, default: 0 },
    buyers: [{ type: String }],
    buyerCount: { type: Number, required: true, default: 0 },
    avgContractValue: { type: Number, required: true, default: 0 },
    totalValue: { type: Number, required: true, default: 0 },
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
    collection: "supplier_patterns",
  }
);


SupplierPatternSchema.index({ name: 1 });
SupplierPatternSchema.index({ totalContracts: -1 });
SupplierPatternSchema.index({ totalValue: -1 });
SupplierPatternSchema.index({ lastUpdated: -1 });

export const SupplierPatternModel = mongoose.model<ISupplierPattern>("SupplierPattern", SupplierPatternSchema);
