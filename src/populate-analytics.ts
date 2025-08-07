#!/usr/bin/env node

import { connectToDatabase, mongoose } from "../shared/connection/database";
import { AnomalyModel, BuyerPatternModel, ExpenseInsightModel, ReleaseModel, SupplierPatternModel } from "../shared/models";
import { Logger } from "./services/logger-service";

class EfficientAnalyticsPopulator {
  /**
   * 0. RELEASES POPULATION - Check the releases collection using ReleaseModel
   */
  async populateReleasesCollection(): Promise<void> {
    this.logger.info("🚀 Starting releases collection check...");
    const startTime = Date.now();

    try {
      // Count existing releases in the collection
      const existingCount = await ReleaseModel.countDocuments();
      this.logger.info(`Found ${existingCount.toLocaleString()} existing releases in collection`);

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      this.logger.info(`✅ Releases collection check completed in ${duration}s - ${existingCount} releases exist`);
    } catch (error) {
      this.logger.error("Error checking releases collection:", error as Error);
      throw error;
    }
  }

  private logger: Logger;
  private readonly DATA_VERSION = 4; // New version for this population
  private readonly BATCH_SIZE = 1000;

  constructor() {
    this.logger = new Logger();
  }

  async connectToDatabase(): Promise<void> {
    await connectToDatabase();
  }

  /**
   * 1. SUPPLIERS POPULATION - Using ReleaseModel aggregation
   */
  async populateSuppliers(): Promise<void> {
    this.logger.info("🚀 Starting efficient supplier population...");
    const startTime = Date.now();

    try {
      // Get all suppliers with their complete analytics from releases collection
      const suppliers = await ReleaseModel.aggregate([
        // Unwind awards to process each award separately
        { $unwind: { path: "$awards", preserveNullAndEmptyArrays: false } },

        // Unwind suppliers from each award
        { $unwind: { path: "$awards.suppliers", preserveNullAndEmptyArrays: false } },

        // Unwind items from each award for detailed analysis
        { $unwind: { path: "$awards.items", preserveNullAndEmptyArrays: false } },

        // Match valid suppliers and award items with amounts
        {
          $match: {
            "awards.suppliers.id": { $exists: true, $ne: null },
            "awards.items.unit.value.amount": { $gt: 0, $type: "number" },
            sourceYear: { $exists: true, $ne: null },
          },
        },

        // Group by supplier to calculate all metrics
        {
          $group: {
            _id: "$awards.suppliers.id",
            name: { $first: "$awards.suppliers.name" },
            totalContracts: { $addToSet: "$id" }, // Count unique releases/contracts
            totalValue: { $sum: "$awards.items.unit.value.amount" },
            years: { $addToSet: "$sourceYear" },
            buyers: { $addToSet: "$buyer.id" },

            // Collect items for analysis
            items: {
              $push: {
                description: { $ifNull: ["$awards.items.classification.description", "Unknown"] },
                amount: "$awards.items.unit.value.amount",
                quantity: { $ifNull: ["$awards.items.quantity", 1] },
                currency: { $ifNull: ["$awards.items.unit.value.currency", "UYU"] },
                unitName: { $ifNull: ["$awards.items.unit.name", "unit"] },
                year: "$sourceYear",
              },
            },
          },
        },

        // Calculate final metrics and aggregate items
        {
          $project: {
            _id: 1,
            name: 1,
            totalContracts: { $size: "$totalContracts" },
            totalValue: 1,
            avgContractValue: {
              $cond: {
                if: { $gt: [{ $size: "$totalContracts" }, 0] },
                then: { $divide: ["$totalValue", { $size: "$totalContracts" }] },
                else: 0,
              },
            },
            years: 1,
            yearCount: { $size: "$years" },
            buyers: 1,
            buyerCount: { $size: "$buyers" },

            // Aggregate items by description (top 15)
            items: {
              $slice: [
                {
                  $reduce: {
                    input: "$items",
                    initialValue: [],
                    in: {
                      $let: {
                        vars: {
                          existing: {
                            $filter: {
                              input: "$$value",
                              cond: { $eq: ["$$this.description", "$$this.description"] },
                            },
                          },
                        },
                        in: {
                          $cond: {
                            if: { $eq: [{ $size: "$$existing" }, 0] },
                            then: {
                              $concatArrays: [
                                "$$value",
                                [
                                  {
                                    description: "$$this.description",
                                    totalAmount: "$$this.amount",
                                    totalQuantity: "$$this.quantity",
                                    contractCount: 1,
                                    avgPrice: {
                                      $cond: {
                                        if: { $gt: ["$$this.quantity", 0] },
                                        then: { $divide: ["$$this.amount", "$$this.quantity"] },
                                        else: 0,
                                      },
                                    },
                                    currency: "$$this.currency",
                                    unitName: "$$this.unitName",
                                  },
                                ],
                              ],
                            },
                            else: {
                              $map: {
                                input: "$$value",
                                as: "item",
                                in: {
                                  $cond: {
                                    if: { $eq: ["$$item.description", "$$this.description"] },
                                    then: {
                                      description: "$$item.description",
                                      totalAmount: { $add: ["$$item.totalAmount", "$$this.amount"] },
                                      totalQuantity: { $add: ["$$item.totalQuantity", "$$this.quantity"] },
                                      contractCount: { $add: ["$$item.contractCount", 1] },
                                      avgPrice: {
                                        $cond: {
                                          if: { $and: [{ $gt: ["$$item.totalQuantity", 0] }, { $gt: [{ $add: ["$$item.totalQuantity", "$$this.quantity"] }, 0] }] },
                                          then: {
                                            $divide: [{ $add: ["$$item.totalAmount", "$$this.amount"] }, { $add: ["$$item.totalQuantity", "$$this.quantity"] }],
                                          },
                                          else: 0,
                                        },
                                      },
                                      currency: "$$item.currency",
                                      unitName: "$$item.unitName",
                                    },
                                    else: "$$item",
                                  },
                                },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
                15, // Top 15 items
              ],
            },
          },
        },

        // Sort by total value for processing largest first
        { $sort: { totalValue: -1 } },
      ]).allowDiskUse(true);

      this.logger.info(`Found ${suppliers.length} suppliers to populate`);

      // Bulk insert/update suppliers
      if (suppliers.length > 0) {
        const bulkOps = suppliers.map((supplier: any) => ({
          updateOne: {
            filter: { supplierId: supplier._id },
            update: {
              $set: {
                supplierId: supplier._id,
                name: supplier.name,
                totalContracts: supplier.totalContracts,
                totalValue: supplier.totalValue,
                avgContractValue: supplier.avgContractValue,
                years: supplier.years,
                yearCount: supplier.yearCount,
                buyers: supplier.buyers,
                buyerCount: supplier.buyerCount,
                items: supplier.items || [],
                lastUpdated: new Date(),
                __v: this.DATA_VERSION,
              },
            },
            upsert: true,
          },
        }));

        // Process in batches
        for (let i = 0; i < bulkOps.length; i += this.BATCH_SIZE) {
          const batch = bulkOps.slice(i, i + this.BATCH_SIZE);
          await SupplierPatternModel.bulkWrite(batch, {
            ordered: false,
            bypassDocumentValidation: true,
          });

          const progress = (((i + batch.length) / bulkOps.length) * 100).toFixed(1);
          this.logger.info(`📊 Suppliers: ${i + batch.length}/${bulkOps.length} (${progress}%)`);
        }
      }

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      this.logger.info(`✅ Supplier population completed in ${duration}s - ${suppliers.length} suppliers`);
    } catch (error) {
      this.logger.error("Error populating suppliers:", error as Error);
      throw error;
    }
  }

  /**
   * 2. BUYERS POPULATION - Using ReleaseModel aggregation
   */
  async populateBuyers(): Promise<void> {
    this.logger.info("🚀 Starting efficient buyer population...");
    const startTime = Date.now();

    try {
      const buyers = await ReleaseModel.aggregate([
        // Unwind awards to process each award separately
        { $unwind: { path: "$awards", preserveNullAndEmptyArrays: false } },

        // Unwind items from each award for detailed analysis
        { $unwind: { path: "$awards.items", preserveNullAndEmptyArrays: false } },

        // Match valid buyers and award items with amounts
        {
          $match: {
            "buyer.id": { $exists: true, $ne: null },
            "awards.items.unit.value.amount": { $gt: 0, $type: "number" },
            sourceYear: { $exists: true, $ne: null },
          },
        },

        // Group by buyer
        {
          $group: {
            _id: "$buyer.id",
            name: { $first: "$buyer.name" },
            totalContracts: { $addToSet: "$id" },
            totalSpending: { $sum: "$awards.items.unit.value.amount" },
            years: { $addToSet: "$sourceYear" },
            suppliers: { $addToSet: { $arrayElemAt: ["$awards.suppliers.id", 0] } }, // Get first supplier from awards.suppliers array

            items: {
              $push: {
                description: { $ifNull: ["$awards.items.classification.description", "Unknown"] },
                amount: "$awards.items.unit.value.amount",
                quantity: { $ifNull: ["$awards.items.quantity", 1] },
                currency: { $ifNull: ["$awards.items.unit.value.currency", "UYU"] },
                unitName: { $ifNull: ["$awards.items.unit.name", "unit"] },
              },
            },
          },
        },

        {
          $project: {
            _id: 1,
            name: 1,
            totalContracts: { $size: "$totalContracts" },
            totalSpending: 1,
            avgContractValue: {
              $cond: {
                if: { $gt: [{ $size: "$totalContracts" }, 0] },
                then: { $divide: ["$totalSpending", { $size: "$totalContracts" }] },
                else: 0,
              },
            },
            years: 1,
            yearCount: { $size: "$years" },
            suppliers: { $filter: { input: "$suppliers", cond: { $ne: ["$$this", null] } } }, // Remove null suppliers
            supplierCount: { $size: { $filter: { input: "$suppliers", cond: { $ne: ["$$this", null] } } } },

            // Top items by spending
            items: {
              $slice: [
                {
                  $reduce: {
                    input: "$items",
                    initialValue: [],
                    in: {
                      $let: {
                        vars: {
                          existing: {
                            $filter: {
                              input: "$$value",
                              cond: { $eq: ["$$this.description", "$$this.description"] },
                            },
                          },
                        },
                        in: {
                          $cond: {
                            if: { $eq: [{ $size: "$$existing" }, 0] },
                            then: {
                              $concatArrays: [
                                "$$value",
                                [
                                  {
                                    description: "$$this.description",
                                    totalAmount: "$$this.amount",
                                    totalQuantity: "$$this.quantity",
                                    contractCount: 1,
                                    avgPrice: {
                                      $cond: {
                                        if: { $gt: ["$$this.quantity", 0] },
                                        then: { $divide: ["$$this.amount", "$$this.quantity"] },
                                        else: 0,
                                      },
                                    },
                                  },
                                ],
                              ],
                            },
                            else: {
                              $map: {
                                input: "$$value",
                                as: "item",
                                in: {
                                  $cond: {
                                    if: { $eq: ["$$item.description", "$$this.description"] },
                                    then: {
                                      description: "$$item.description",
                                      totalAmount: { $add: ["$$item.totalAmount", "$$this.amount"] },
                                      totalQuantity: { $add: ["$$item.totalQuantity", "$$this.quantity"] },
                                      contractCount: { $add: ["$$item.contractCount", 1] },
                                      avgPrice: {
                                        $cond: {
                                          if: { $gt: [{ $add: ["$$item.totalQuantity", "$$this.quantity"] }, 0] },
                                          then: {
                                            $divide: [{ $add: ["$$item.totalAmount", "$$this.amount"] }, { $add: ["$$item.totalQuantity", "$$this.quantity"] }],
                                          },
                                          else: 0,
                                        },
                                      },
                                    },
                                    else: "$$item",
                                  },
                                },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
                15,
              ],
            },
          },
        },

        { $sort: { totalSpending: -1 } },
      ]).allowDiskUse(true);

      this.logger.info(`Found ${buyers.length} buyers to populate`);

      if (buyers.length > 0) {
        const bulkOps = buyers.map((buyer: any) => ({
          updateOne: {
            filter: { buyerId: buyer._id },
            update: {
              $set: {
                buyerId: buyer._id,
                name: buyer.name,
                totalContracts: buyer.totalContracts,
                totalSpending: buyer.totalSpending,
                avgContractValue: buyer.avgContractValue,
                years: buyer.years,
                yearCount: buyer.yearCount,
                suppliers: buyer.suppliers,
                supplierCount: buyer.supplierCount,
                items: buyer.items || [],
                lastUpdated: new Date(),
                __v: this.DATA_VERSION,
              },
            },
            upsert: true,
          },
        }));

        for (let i = 0; i < bulkOps.length; i += this.BATCH_SIZE) {
          const batch = bulkOps.slice(i, i + this.BATCH_SIZE);
          await BuyerPatternModel.bulkWrite(batch, {
            ordered: false,
            bypassDocumentValidation: true,
          });

          const progress = (((i + batch.length) / bulkOps.length) * 100).toFixed(1);
          this.logger.info(`📊 Buyers: ${i + batch.length}/${bulkOps.length} (${progress}%)`);
        }
      }

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      this.logger.info(`✅ Buyer population completed in ${duration}s - ${buyers.length} buyers`);
    } catch (error) {
      this.logger.error("Error populating buyers:", error as Error);
      throw error;
    }
  }

  /**
   * 3. EXPENSE INSIGHTS POPULATION - Using ReleaseModel aggregation
   */
  async populateExpenseInsights(): Promise<void> {
    this.logger.info("🚀 Starting expense insights population...");
    const startTime = Date.now();

    try {
      // Get yearly insights from releases collection with optimized memory usage
      const yearlyInsights = await ReleaseModel.aggregate([
        // Unwind awards to process each award separately
        { $unwind: { path: "$awards", preserveNullAndEmptyArrays: false } },

        // Unwind items from each award
        { $unwind: { path: "$awards.items", preserveNullAndEmptyArrays: false } },

        // Match valid items and group early to reduce data size
        {
          $match: {
            "awards.items.unit.value.amount": { $gt: 0, $type: "number" },
            sourceYear: { $exists: true, $ne: null },
          },
        },

        // First aggregation - basic yearly metrics
        {
          $group: {
            _id: "$sourceYear",
            totalAmount: { $sum: "$awards.items.unit.value.amount" },
            totalTransactions: { $sum: 1 },
            currency: { $first: { $ifNull: ["$awards.items.unit.value.currency", "UYU"] } },
          },
        },

        // Calculate average amount
        {
          $addFields: {
            year: "$_id",
            averageAmount: {
              $cond: {
                if: { $gt: ["$totalTransactions", 0] },
                then: { $divide: ["$totalAmount", "$totalTransactions"] },
                else: 0,
              },
            },
          },
        },

        { $sort: { year: -1 } },
      ]).allowDiskUse(true);

      this.logger.info(`Found ${yearlyInsights.length} yearly insights to populate (basic metrics)`);

      // Now get top suppliers and buyers separately to avoid memory issues
      for (const yearData of yearlyInsights) {
        const year = yearData.year;

        // Get top suppliers for this year
        const topSuppliers = await ReleaseModel.aggregate([
          { $unwind: { path: "$awards", preserveNullAndEmptyArrays: false } },
          { $unwind: { path: "$awards.items", preserveNullAndEmptyArrays: false } },
          { $unwind: { path: "$awards.suppliers", preserveNullAndEmptyArrays: false } },
          {
            $match: {
              sourceYear: year,
              "awards.items.unit.value.amount": { $gt: 0, $type: "number" },
              "awards.suppliers.id": { $exists: true, $ne: null },
            },
          },
          {
            $group: {
              _id: "$awards.suppliers.id",
              name: { $first: "$awards.suppliers.name" },
              totalAmount: { $sum: "$awards.items.unit.value.amount" },
              transactionCount: { $sum: 1 },
            },
          },
          { $sort: { totalAmount: -1 } },
          { $limit: 10 },
          {
            $project: {
              id: "$_id",
              name: 1,
              totalAmount: 1,
              transactionCount: 1,
              _id: 0,
            },
          },
        ]).allowDiskUse(true);

        // Get top buyers for this year
        const topBuyers = await ReleaseModel.aggregate([
          { $unwind: { path: "$awards", preserveNullAndEmptyArrays: false } },
          { $unwind: { path: "$awards.items", preserveNullAndEmptyArrays: false } },
          {
            $match: {
              sourceYear: year,
              "awards.items.unit.value.amount": { $gt: 0, $type: "number" },
              "buyer.id": { $exists: true, $ne: null },
            },
          },
          {
            $group: {
              _id: "$buyer.id",
              name: { $first: "$buyer.name" },
              totalAmount: { $sum: "$awards.items.unit.value.amount" },
              transactionCount: { $sum: 1 },
            },
          },
          { $sort: { totalAmount: -1 } },
          { $limit: 10 },
          {
            $project: {
              id: "$_id",
              name: 1,
              totalAmount: 1,
              transactionCount: 1,
              _id: 0,
            },
          },
        ]).allowDiskUse(true);

        // Combine the data
        yearData.topSuppliers = topSuppliers;
        yearData.topBuyers = topBuyers;

        this.logger.info(`Year ${year}: ${topSuppliers.length} suppliers, ${topBuyers.length} buyers`);
      }

      if (yearlyInsights.length > 0) {
        const bulkOps = yearlyInsights.map((insight: any) => ({
          updateOne: {
            filter: { year: insight.year, month: { $exists: false } },
            update: {
              $set: {
                year: insight.year,
                totalAmount: insight.totalAmount,
                totalTransactions: insight.totalTransactions,
                averageAmount: insight.averageAmount,
                currency: insight.currency,
                topSuppliers: insight.topSuppliers || [],
                topBuyers: insight.topBuyers || [],
              },
            },
            upsert: true,
          },
        }));

        await ExpenseInsightModel.bulkWrite(bulkOps, {
          ordered: false,
          bypassDocumentValidation: true,
        });
      }

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      this.logger.info(`✅ Expense insights completed in ${duration}s - ${yearlyInsights.length} years`);
    } catch (error) {
      this.logger.error("Error populating expense insights:", error as Error);
      throw error;
    }
  }

  /**
   * 4. ANOMALY DETECTION - Using ReleaseModel for anomaly detection
   */
  async populateAnomalies(): Promise<void> {
    this.logger.info("🚀 Starting anomaly detection and population...");
    const startTime = Date.now();

    try {
      // Detect price spikes from releases collection
      const priceSpikes = await ReleaseModel.aggregate([
        // Unwind awards to process each award separately
        { $unwind: { path: "$awards", preserveNullAndEmptyArrays: false } },

        // Unwind items from each award
        { $unwind: { path: "$awards.items", preserveNullAndEmptyArrays: false } },

        // Unwind suppliers from each award for supplier information
        { $unwind: { path: "$awards.suppliers", preserveNullAndEmptyArrays: false } },

        {
          $match: {
            "awards.items.unit.value.amount": { $gt: 100000 }, // Only check high-value items
            id: { $exists: true, $ne: null }, // Ensure release id exists
          },
        },
        {
          $group: {
            _id: {
              description: "$awards.items.classification.description",
              scheme: "$awards.items.classification.scheme",
            },
            avgAmount: { $avg: "$awards.items.unit.value.amount" },
            maxAmount: { $max: "$awards.items.unit.value.amount" },
            minAmount: { $min: "$awards.items.unit.value.amount" },
            count: { $sum: 1 },
            samples: {
              $push: {
                releaseId: "$id",
                awardId: { $ifNull: ["$awards.id", null] },
                amount: "$awards.items.unit.value.amount",
                supplierName: { $ifNull: ["$awards.suppliers.name", "Unknown"] },
                buyerName: { $ifNull: ["$buyer.name", "Unknown"] },
                year: { $ifNull: ["$sourceYear", 2024] },
                itemClassification: {
                  description: { $ifNull: ["$awards.items.classification.description", "Unknown"] },
                  scheme: { $ifNull: ["$awards.items.classification.scheme", "Unknown"] },
                  id: { $ifNull: ["$awards.items.classification.id", "Unknown"] },
                },
                itemDescription: { $ifNull: ["$awards.items.description", "Unknown"] },
                itemUnit: {
                  name: { $ifNull: ["$awards.items.unit.name", "unit"] },
                  value: {
                    currency: { $ifNull: ["$awards.items.unit.value.currency", "UYU"] },
                  },
                },
                itemQuantity: { $ifNull: ["$awards.items.quantity", 1] },
              },
            },
          },
        },
        {
          $match: {
            count: { $gte: 5 }, // At least 5 similar items
            $expr: { $gt: ["$maxAmount", { $multiply: ["$avgAmount", 10] }] }, // Max > 10x average
          },
        },
        {
          $project: {
            description: "$_id.description",
            scheme: "$_id.scheme",
            avgAmount: 1,
            maxAmount: 1,
            outliers: {
              $filter: {
                input: "$samples",
                cond: { $gt: ["$$this.amount", { $multiply: ["$avgAmount", 5] }] },
              },
            },
          },
        },
        { $unwind: "$outliers" },
        {
          $project: {
            // Remove _id to avoid conflicts
            _id: 0,
            type: "price_spike",
            severity: {
              $switch: {
                branches: [
                  { case: { $gt: ["$outliers.amount", { $multiply: ["$avgAmount", 20] }] }, then: "critical" },
                  { case: { $gt: ["$outliers.amount", { $multiply: ["$avgAmount", 15] }] }, then: "high" },
                  { case: { $gt: ["$outliers.amount", { $multiply: ["$avgAmount", 10] }] }, then: "medium" },
                ],
                default: "low",
              },
            },
            releaseId: "$outliers.releaseId",
            awardId: "$outliers.awardId",
            description: {
              $concat: ["Unusual price detected for ", { $ifNull: ["$outliers.itemClassification.description", "Unknown Item"] }, ": ", { $toString: "$outliers.amount" }, " ", { $ifNull: ["$outliers.itemUnit.value.currency", "UYU"] }, " (avg: ", { $toString: { $round: ["$avgAmount", 2] } }, " ", { $ifNull: ["$outliers.itemUnit.value.currency", "UYU"] }, ")"],
            },
            detectedValue: "$outliers.amount",
            expectedRange: {
              min: { $multiply: ["$avgAmount", 0.5] },
              max: { $multiply: ["$avgAmount", 2] },
            },
            confidence: 0.8,
            detectedAt: new Date(),
            metadata: {
              supplierName: "$outliers.supplierName",
              buyerName: "$outliers.buyerName",
              itemDescription: "$outliers.itemDescription",
              itemClassification: {
                description: "$outliers.itemClassification.description",
                scheme: "$outliers.itemClassification.scheme",
                id: "$outliers.itemClassification.id",
              },
              itemUnit: {
                name: "$outliers.itemUnit.name",
                currency: "$outliers.itemUnit.value.currency",
              },
              itemQuantity: "$outliers.itemQuantity",
              year: "$outliers.year",
              amount: "$outliers.amount",
              currency: "UYU",
            },
          },
        },
        { $limit: 1000 }, // Limit to prevent overwhelming
      ]).allowDiskUse(true);

      this.logger.info(`Detected ${priceSpikes.length} price spike anomalies`);

      // Debug: Log a sample anomaly to see the structure
      if (priceSpikes.length > 0) {
        this.logger.info("=== SAMPLE ANOMALY STRUCTURE ===");
        this.logger.info(JSON.stringify(priceSpikes[0], null, 2));
        this.logger.info("================================");
      }

      if (priceSpikes.length > 0) {
        // Clean and validate anomaly data before insertion
        const anomalyOps = priceSpikes.map((anomaly: any) => {
          // Ensure all required fields are present and valid
          const cleanAnomaly: any = {
            type: anomaly.type,
            severity: anomaly.severity,
            releaseId: String(anomaly.releaseId || ""), // Ensure string
            description: String(anomaly.description || ""),
            detectedValue: Number(anomaly.detectedValue || 0),
            expectedRange: {
              min: Number(anomaly.expectedRange?.min || 0),
              max: Number(anomaly.expectedRange?.max || 0),
            },
            confidence: Number(anomaly.confidence || 0.8),
            detectedAt: new Date(),
            metadata: {
              supplierName: anomaly.metadata?.supplierName ? String(anomaly.metadata.supplierName) : undefined,
              buyerName: anomaly.metadata?.buyerName ? String(anomaly.metadata.buyerName) : undefined,
              itemDescription: anomaly.metadata?.itemDescription ? String(anomaly.metadata.itemDescription) : undefined,
              itemClassification: anomaly.metadata?.itemClassification
                ? {
                    description: anomaly.metadata.itemClassification.description ? String(anomaly.metadata.itemClassification.description) : undefined,
                    scheme: anomaly.metadata.itemClassification.scheme ? String(anomaly.metadata.itemClassification.scheme) : undefined,
                    id: anomaly.metadata.itemClassification.id ? String(anomaly.metadata.itemClassification.id) : undefined,
                  }
                : undefined,
              itemUnit: anomaly.metadata?.itemUnit
                ? {
                    name: anomaly.metadata.itemUnit.name ? String(anomaly.metadata.itemUnit.name) : undefined,
                    currency: anomaly.metadata.itemUnit.currency ? String(anomaly.metadata.itemUnit.currency) : undefined,
                  }
                : undefined,
              itemQuantity: anomaly.metadata?.itemQuantity ? Number(anomaly.metadata.itemQuantity) : undefined,
              year: anomaly.metadata?.year ? Number(anomaly.metadata.year) : undefined,
              amount: anomaly.metadata?.amount ? Number(anomaly.metadata.amount) : undefined,
              currency: anomaly.metadata?.currency ? String(anomaly.metadata.currency) : "UYU",
            },
          };

          // Add awardId only if it exists and is valid
          if (anomaly.awardId && String(anomaly.awardId).trim()) {
            cleanAnomaly.awardId = String(anomaly.awardId);
          }

          // Clean metadata - remove undefined values
          const cleanMetadata: any = {};
          Object.keys(cleanAnomaly.metadata).forEach((key) => {
            if (cleanAnomaly.metadata[key] !== undefined) {
              if (key === "itemClassification" || key === "itemUnit") {
                // Handle nested objects
                const nestedObj: any = {};
                Object.keys(cleanAnomaly.metadata[key]).forEach((nestedKey) => {
                  if (cleanAnomaly.metadata[key][nestedKey] !== undefined) {
                    nestedObj[nestedKey] = cleanAnomaly.metadata[key][nestedKey];
                  }
                });
                // Only add if there are valid nested properties
                if (Object.keys(nestedObj).length > 0) {
                  cleanMetadata[key] = nestedObj;
                }
              } else {
                cleanMetadata[key] = cleanAnomaly.metadata[key];
              }
            }
          });
          cleanAnomaly.metadata = cleanMetadata;

          return {
            updateOne: {
              filter: {
                releaseId: cleanAnomaly.releaseId,
                ...(cleanAnomaly.awardId && { awardId: cleanAnomaly.awardId }),
                type: cleanAnomaly.type,
              },
              update: { $set: cleanAnomaly },
              upsert: true,
            },
          };
        });

        try {
          const res = await AnomalyModel.bulkWrite(anomalyOps, {
            ordered: false,
            bypassDocumentValidation: false, // Enable validation to catch issues
          });

          this.logger.info(`✅ Anomalies stored: ${res.upsertedCount} new, ${res.modifiedCount} updated`);

          // Log any validation errors if they exist
          if (res.mongoose?.validationErrors && res.mongoose.validationErrors.length > 0) {
            this.logger.error(`⚠️ Validation errors in anomaly insertion: ${res.mongoose.validationErrors.length}`);
            // Log first few errors for debugging
            res.mongoose.validationErrors.slice(0, 3).forEach((error, index) => {
              this.logger.error(`Error ${index + 1}:`, error);
            });
          }
        } catch (bulkWriteError) {
          this.logger.error("Bulk write error for anomalies:", bulkWriteError as Error);
          throw bulkWriteError;
        }
      }

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      this.logger.info(`✅ Anomaly detection completed in ${duration}s - ${priceSpikes.length} anomalies`);
    } catch (error) {
      this.logger.error("Error detecting anomalies:", error as Error);
      throw error;
    }
  }

  /**
   * 5. DATA QUALITY REPORT
   */
  async generateDataQualityReport(): Promise<void> {
    this.logger.info("📊 Generating data quality report...");

    try {
      const [totalReleases, suppliersCount, buyersCount, expenseInsightsCount, anomaliesCount, sampleSupplier, sampleBuyer] = await Promise.all([ReleaseModel.countDocuments(), SupplierPatternModel.countDocuments(), BuyerPatternModel.countDocuments(), ExpenseInsightModel.countDocuments(), AnomalyModel.countDocuments(), SupplierPatternModel.findOne().sort({ totalValue: -1 }).lean(), BuyerPatternModel.findOne().sort({ totalSpending: -1 }).lean()]);

      this.logger.info(`
📋 DATA QUALITY REPORT
====================
📄 Total Releases: ${totalReleases.toLocaleString()}
👥 Suppliers Analyzed: ${suppliersCount.toLocaleString()}
🏛️  Buyers Analyzed: ${buyersCount.toLocaleString()}
📈 Expense Insights: ${expenseInsightsCount.toLocaleString()}
⚠️  Anomalies Detected: ${anomaliesCount.toLocaleString()}

🎯 TOP PERFORMERS:
Top Supplier: ${sampleSupplier?.name || "N/A"} (${(sampleSupplier?.totalValue || 0).toLocaleString()} UYU)
Top Buyer: ${sampleBuyer?.name || "N/A"} (${(sampleBuyer?.totalSpending || 0).toLocaleString()} UYU)

✅ Population Status: COMPLETE
🕐 Data Version: ${this.DATA_VERSION}
      `);
    } catch (error) {
      this.logger.error("Error generating report:", error as Error);
      throw error;
    }
  }

  /**
   * MAIN EXECUTION - Run all population tasks
   */
  async populateAll(): Promise<void> {
    const totalStartTime = Date.now();
    this.logger.info("🚀 Starting COMPLETE analytics population...");

    try {
      // Run all population tasks in sequence for data consistency
      await this.populateAnomalies();
      await this.populateExpenseInsights();
      await this.populateReleasesCollection();
      await this.populateSuppliers();
      await this.populateBuyers();
      await this.generateDataQualityReport();

      const totalDuration = ((Date.now() - totalStartTime) / 1000).toFixed(2);
      this.logger.info(`
🎉 ANALYTICS POPULATION COMPLETE! 
Total time: ${totalDuration} seconds
Database ready for production use.
      `);
    } catch (error) {
      this.logger.error("Failed to populate analytics data:", error as Error);
      throw error;
    }
  }
}

async function main() {
  const populator = new EfficientAnalyticsPopulator();

  try {
    await populator.connectToDatabase();
    await populator.populateAll();
  } catch (error) {
    console.error("Population failed:", error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

if (require.main === module) {
  main();
}

export default EfficientAnalyticsPopulator;
