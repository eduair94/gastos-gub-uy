import * as dotenv from "dotenv";
import mongoose from "mongoose";
import { BuyerPatternModel, SupplierPatternModel } from "./database/analytics-models";
import { ReleaseModel } from "./database/release-model";
import { Logger } from "./services/logger-service";

// Load environment variables
dotenv.config();

const logger = new Logger();

async function runBasicFastAnalytics() {
  const startTime = Date.now();

  try {
    logger.info("🚀 Starting BASIC FAST analytics processing...");

    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || "mongodb://localhost:27017/gastos_gub";
    logger.info(`Connecting to: ${mongoUri}`);

    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 600000,
    });

    logger.info(`✅ Connected to MongoDB: ${mongoose.connection.db?.databaseName}`);

    // Ultra-simple supplier aggregation - no fancy operations
    logger.info("Processing suppliers...");
    const supplierResults = await ReleaseModel.aggregate(
      [
        {
          $match: {
            "awards.0": { $exists: true },
            "parties.0": { $exists: true },
          },
        },
        { $unwind: "$awards" },
        { $unwind: "$parties" },
        {
          $match: {
            "parties.roles": "supplier",
            "parties.id": { $exists: true, $ne: null },
          },
        },
        {
          $group: {
            _id: "$parties.id",
            name: { $first: "$parties.name" },
            totalContracts: { $sum: 1 },
            totalValue: { $sum: { $ifNull: ["$awards.value.amount", 0] } },
            years: { $addToSet: "$sourceYear" },
            buyers: { $addToSet: "$buyer.name" },
          },
        },
        {
          $addFields: {
            yearCount: { $size: "$years" },
            buyerCount: { $size: "$buyers" },
            avgContractValue: { $divide: ["$totalValue", "$totalContracts"] },
          },
        },
        {
          $project: {
            _id: 1,
            name: 1,
            totalContracts: 1,
            totalValue: 1,
            avgContractValue: 1,
            years: 1,
            yearCount: 1,
            buyers: 1,
            buyerCount: 1,
          },
        },
      ],
      {
        maxTimeMS: 600000,
        allowDiskUse: true,
      }
    );

    logger.info(`Found ${supplierResults.length} suppliers`);

    // Bulk insert suppliers
    if (supplierResults.length > 0) {
      const supplierOps = supplierResults.map((result: any) => ({
        updateOne: {
          filter: { supplierId: result._id },
          update: {
            $set: {
              supplierId: result._id,
              name: result.name || "Unknown Supplier",
              totalContracts: result.totalContracts || 0,
              years: (result.years || []).filter(Boolean),
              yearCount: result.yearCount || 0,
              buyers: (result.buyers || []).filter(Boolean),
              buyerCount: result.buyerCount || 0,
              avgContractValue: result.avgContractValue || 0,
              totalValue: result.totalValue || 0,
              items: [], // Empty for basic version
              topCategories: [], // Empty for basic version
              lastUpdated: new Date(),
            },
          },
          upsert: true,
        },
      }));

      await SupplierPatternModel.bulkWrite(supplierOps, { ordered: false });
      logger.info(`✅ Inserted ${supplierResults.length} supplier patterns`);
    }

    // Ultra-simple buyer aggregation
    logger.info("Processing buyers...");
    const buyerResults = await ReleaseModel.aggregate(
      [
        {
          $match: {
            "buyer.id": { $exists: true, $ne: null },
            "awards.0": { $exists: true },
          },
        },
        { $unwind: "$awards" },
        {
          $group: {
            _id: "$buyer.id",
            name: { $first: "$buyer.name" },
            totalContracts: { $sum: 1 },
            totalSpending: { $sum: { $ifNull: ["$awards.value.amount", 0] } },
            years: { $addToSet: "$sourceYear" },
          },
        },
        {
          $addFields: {
            yearCount: { $size: "$years" },
            avgContractValue: { $divide: ["$totalSpending", "$totalContracts"] },
          },
        },
        {
          $project: {
            _id: 1,
            name: 1,
            totalContracts: 1,
            totalSpending: 1,
            avgContractValue: 1,
            years: 1,
            yearCount: 1,
          },
        },
      ],
      {
        maxTimeMS: 600000,
        allowDiskUse: true,
      }
    );

    logger.info(`Found ${buyerResults.length} buyers`);

    // Bulk insert buyers
    if (buyerResults.length > 0) {
      const buyerOps = buyerResults.map((result: any) => ({
        updateOne: {
          filter: { buyerId: result._id },
          update: {
            $set: {
              buyerId: result._id,
              name: result.name || "Unknown Buyer",
              totalContracts: result.totalContracts || 0,
              years: (result.years || []).filter(Boolean),
              yearCount: result.yearCount || 0,
              suppliers: [], // Empty for basic version
              supplierCount: 0,
              totalSpending: result.totalSpending || 0,
              avgContractValue: result.avgContractValue || 0,
              topCategories: [], // Empty for basic version
              lastUpdated: new Date(),
            },
          },
          upsert: true,
        },
      }));

      await BuyerPatternModel.bulkWrite(buyerOps, { ordered: false });
      logger.info(`✅ Inserted ${buyerResults.length} buyer patterns`);
    }

    const endTime = Date.now();
    const totalDuration = (endTime - startTime) / 1000;
    logger.info(`🎉 BASIC FAST analytics completed in ${totalDuration.toFixed(2)} seconds!`);
  } catch (error) {
    logger.error("❌ Basic fast analytics failed:", error as Error);
  } finally {
    if (mongoose.connection.readyState === 1) {
      await mongoose.disconnect();
      logger.info("📤 Disconnected from MongoDB");
    }
    process.exit(0);
  }
}

runBasicFastAnalytics();
