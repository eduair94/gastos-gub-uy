import { Schema } from "mongoose";
import { mongoose } from "../connection/database";
import { IExpenseInsight } from "../types/database";

// Expense Insights Schema
const ExpenseInsightSchema = new Schema<IExpenseInsight>(
  {
    year: { type: Number, required: true },
    month: { type: Number },
    totalAmount: { type: Number, required: true },
    totalTransactions: { type: Number, required: true },
    averageAmount: { type: Number, required: true },
    currency: { type: String, required: true },
    topSuppliers: [
      {
        id: { type: String, required: true },
        name: { type: String, required: true },
        totalAmount: { type: Number, required: true },
        transactionCount: { type: Number, required: true },
      },
    ],
    topBuyers: [
      {
        id: { type: String, required: true },
        name: { type: String, required: true },
        totalAmount: { type: Number, required: true },
        transactionCount: { type: Number, required: true },
      },
    ],
    topCategories: [
      {
        description: { type: String, required: true },
        totalAmount: { type: Number, required: true },
        transactionCount: { type: Number, required: true },
      },
    ],
  },
  {
    timestamps: true,
    collection: "expense_insights",
  }
);

// Create indexes for better query performance
ExpenseInsightSchema.index({ year: 1, month: 1 });
ExpenseInsightSchema.index({ currency: 1 });
ExpenseInsightSchema.index({ totalAmount: -1 });

export const ExpenseInsightModel = mongoose.model<IExpenseInsight>("ExpenseInsight", ExpenseInsightSchema);
