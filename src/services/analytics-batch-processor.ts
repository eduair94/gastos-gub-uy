import { BuyerPatternModel, IBuyerPattern, ISupplierPattern, SupplierPatternModel } from "../database/analytics-models";
import { ReleaseModel } from "../database/release-model";
import { ILogger } from "./logger-service";

export interface IAnalyticsBatchProcessor {
  processSupplierPatterns(): Promise<void>;
  processBuyerPatterns(): Promise<void>;
  processAllPatterns(): Promise<void>;
  getSupplierPatterns(limit?: number): Promise<ISupplierPattern[]>;
  getBuyerPatterns(limit?: number): Promise<IBuyerPattern[]>;
}

export class AnalyticsBatchProcessor implements IAnalyticsBatchProcessor {
  constructor(private logger: ILogger) {}

  async processSupplierPatterns(): Promise<void> {
    this.logger.info("Starting supplier patterns batch processing...");

    // Debug database connection
    const mongoose = require("mongoose");
    this.logger.info(`Connected to database: ${mongoose.connection.db?.databaseName}`);
    this.logger.info(`ReleaseModel collection name: ${ReleaseModel.collection.name}`);
    this.logger.info(`Connection ready state: ${mongoose.connection.readyState}`);

    // First, let's debug the data structure
    const totalDocs = await ReleaseModel.countDocuments();
    this.logger.info(`Total documents in collection: ${totalDocs}`);

    if (totalDocs === 0) {
      this.logger.info("No documents found. Checking if we're connected to the right database/collection...");

      // Check if documents exist with any query
      const anyDoc = await ReleaseModel.findOne({}).lean();
      this.logger.info(`Any document found: ${anyDoc ? "Yes" : "No"}`);

      // Try to list all collections in the database
      try {
        const collections = await mongoose.connection.db.listCollections().toArray();
        this.logger.info(`Available collections: ${collections.map((c: any) => c.name).join(", ")}`);
      } catch (error: any) {
        this.logger.error("Error listing collections:", error);
      }

      return;
    }

    const sampleDoc = await ReleaseModel.findOne().lean();
    this.logger.info("Sample document keys:", Object.keys(sampleDoc || {}));

    // Check different possible structures
    const checks = [
      { field: "awards", count: await ReleaseModel.countDocuments({ awards: { $exists: true } }) },
      { field: "award", count: await ReleaseModel.countDocuments({ award: { $exists: true } }) },
      { field: "tender", count: await ReleaseModel.countDocuments({ tender: { $exists: true } }) },
      { field: "contracts", count: await ReleaseModel.countDocuments({ contracts: { $exists: true } }) },
      { field: "parties", count: await ReleaseModel.countDocuments({ parties: { $exists: true } }) },
    ];

    this.logger.info("Data structure checks:", checks);

    if (sampleDoc) {
      this.logger.info("Sample document structure (first few fields):");
      const sample = JSON.stringify(sampleDoc, null, 2).substring(0, 1000);
      //this.logger.info(sample);
    }

    // Optimized pipeline to avoid memory issues - split into basic stats first
    const basicStatssPipeline = [
      // First, limit to records that have the required fields
      {
        $match: {
          awards: { $exists: true, $ne: [] },
          parties: { $exists: true, $ne: [] },
        },
      },
      { $unwind: "$awards" },
      { $unwind: "$parties" },
      // Filter to only supplier parties
      {
        $match: {
          "parties.roles": "supplier",
          "awards.items": { $exists: true, $ne: [] },
          "parties.id": { $exists: true, $ne: null },
        },
      },
      { $unwind: "$awards.items" },
      {
        $group: {
          _id: "$parties.id",
          name: { $first: "$parties.name" },
          totalContracts: { $sum: 1 },
          years: { $addToSet: "$sourceYear" },
          buyers: { $addToSet: "$buyer.name" },
          totalValue: { $sum: "$awards.items.unit.value.amount" },
          avgContractValue: { $avg: "$awards.items.unit.value.amount" },
        },
      },
      {
        $addFields: {
          yearCount: { $size: "$years" },
          buyerCount: { $size: "$buyers" },
        },
      },
      {
        $project: {
          _id: 1,
          name: 1,
          totalContracts: 1,
          years: 1,
          yearCount: 1,
          buyers: 1,
          buyerCount: 1,
          totalValue: 1,
          avgContractValue: 1,
        },
      },
    ];

    // Set aggregation options with increased timeout and memory allowance
    const options = {
      maxTimeMS: 300000, // 5 minutes timeout
      allowDiskUse: true, // Allow using disk for large datasets
      batchSize: 1000, // Process in smaller batches
    };

    const results = await ReleaseModel.aggregate(basicStatssPipeline, options);
    this.logger.info(`Found ${results.length} supplier patterns to process`);

    // Process in batches to avoid memory issues
    const batchSize = 50; // Reduced batch size
    for (let i = 0; i < results.length; i += batchSize) {
      try {
        const batch = results.slice(i, i + batchSize);
        const operations = [];

        for (const result of batch) {
          // Get items data separately for each supplier to avoid memory issues
          const itemsData = await this.getSupplierItems(result._id);

          const pattern = {
            updateOne: {
              filter: { supplierId: result._id },
              update: {
                $set: {
                  supplierId: result._id,
                  name: result.name || "Unknown Supplier",
                  totalContracts: result.totalContracts || 0,
                  years: (result.years || []).filter((year: any) => year && typeof year === "number"),
                  yearCount: result.yearCount || 0,
                  buyers: (result.buyers || []).filter((buyer: any) => buyer && typeof buyer === "string" && buyer.trim() !== ""),
                  buyerCount: result.buyerCount || 0,
                  avgContractValue: result.avgContractValue || 0,
                  totalValue: result.totalValue || 0,
                  items: itemsData.items,
                  topCategories: itemsData.categories,
                  lastUpdated: new Date(),
                },
              },
              upsert: true,
            },
          };

          operations.push(pattern);
        }

        if (operations.length > 0) {
          await SupplierPatternModel.bulkWrite(operations);
        }

        this.logger.info(`Processed supplier patterns batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(results.length / batchSize)}`);
      } catch (error) {
        this.logger.error(`Error processing supplier patterns batch ${Math.floor(i / batchSize) + 1}:`, error as Error);
        // Continue with next batch instead of failing completely
      }
    }
    this.logger.info("Supplier patterns batch processing completed");
  }

  // Helper method to get items for a specific supplier without memory issues
  private async getSupplierItems(supplierId: string): Promise<{ items: any[]; categories: any[] }> {
    const itemsPipeline = [
      {
        $match: {
          awards: { $exists: true, $ne: [] },
          parties: { $exists: true, $ne: [] },
        },
      },
      { $unwind: "$awards" },
      { $unwind: "$parties" },
      {
        $match: {
          "parties.roles": "supplier",
          "parties.id": supplierId,
          "awards.items": { $exists: true, $ne: [] },
        },
      },
      { $unwind: "$awards.items" },
      {
        $group: {
          _id: {
            description: "$awards.items.classification.description",
            category: "$awards.items.classification.scheme",
          },
          totalAmount: { $sum: "$awards.items.unit.value.amount" },
          totalQuantity: { $sum: "$awards.items.quantity" },
          contractCount: { $sum: 1 },
          currency: { $first: "$awards.items.unit.value.currency" },
          unitName: { $first: "$awards.items.unit.name" },
        },
      },
      {
        $addFields: {
          avgPrice: {
            $cond: {
              if: { $gt: ["$totalQuantity", 0] },
              then: { $divide: ["$totalAmount", "$totalQuantity"] },
              else: "$totalAmount",
            },
          },
        },
      },
      { $sort: { totalAmount: -1 } },
      { $limit: 50 }, // Top 50 items
    ];

    const categoryPipeline = [
      {
        $match: {
          awards: { $exists: true, $ne: [] },
          parties: { $exists: true, $ne: [] },
        },
      },
      { $unwind: "$awards" },
      { $unwind: "$parties" },
      {
        $match: {
          "parties.roles": "supplier",
          "parties.id": supplierId,
          "awards.items": { $exists: true, $ne: [] },
        },
      },
      { $unwind: "$awards.items" },
      {
        $group: {
          _id: "$awards.items.classification.scheme",
          totalAmount: { $sum: "$awards.items.unit.value.amount" },
          contractCount: { $sum: 1 },
        },
      },
      { $sort: { totalAmount: -1 } },
      { $limit: 20 }, // Top 20 categories
    ];

    try {
      const [itemsResults, categoriesResults] = await Promise.all([ReleaseModel.aggregate(itemsPipeline as any), ReleaseModel.aggregate(categoryPipeline as any)]);

      const items = itemsResults.map((item: any) => ({
        description: item._id.description || "Unknown",
        category: item._id.category || "Uncategorized",
        totalAmount: item.totalAmount || 0,
        totalQuantity: item.totalQuantity || 0,
        contractCount: item.contractCount || 0,
        avgPrice: item.avgPrice || 0,
        currency: item.currency || "UYU",
        unitName: item.unitName || "",
      }));

      const categories = categoriesResults.map((cat: any) => ({
        category: cat._id || "Uncategorized",
        totalAmount: cat.totalAmount || 0,
        contractCount: cat.contractCount || 0,
      }));

      return { items, categories };
    } catch (error) {
      this.logger.error(`Error getting items for supplier ${supplierId}:`, error as Error);
      return { items: [], categories: [] };
    }
  }

  async processBuyerPatterns(): Promise<void> {
    this.logger.info("Starting buyer patterns batch processing...");

    // Optimized pipeline with correct data structure - avoid memory issues
    const basicStatsPipeline = [
      // Filter early to avoid processing records without required fields
      {
        $match: {
          "buyer.id": { $exists: true, $ne: null },
          "awards.items": { $exists: true, $ne: [] },
          parties: { $exists: true, $ne: [] },
        },
      },
      { $unwind: "$awards" },
      {
        $match: {
          "awards.items": { $exists: true, $ne: [] },
        },
      },
      { $unwind: "$awards.items" },
      // Add supplier names from parties array
      {
        $addFields: {
          supplierParties: {
            $filter: {
              input: "$parties",
              cond: { $in: ["supplier", "$$this.roles"] },
            },
          },
        },
      },
      {
        $group: {
          _id: "$buyer.id",
          name: { $first: "$buyer.name" },
          totalContracts: { $sum: 1 },
          years: { $addToSet: "$sourceYear" },
          suppliers: { $addToSet: { $arrayElemAt: ["$supplierParties.name", 0] } },
          totalSpending: { $sum: "$awards.items.unit.value.amount" },
          avgContractValue: { $avg: "$awards.items.unit.value.amount" },
        },
      },
      {
        $addFields: {
          yearCount: { $size: "$years" },
          supplierCount: { $size: "$suppliers" },
        },
      },
      {
        $project: {
          _id: 1,
          name: 1,
          totalContracts: 1,
          years: 1,
          yearCount: 1,
          suppliers: 1,
          supplierCount: 1,
          totalSpending: 1,
          avgContractValue: 1,
        },
      },
    ];

    // Set aggregation options with increased timeout and memory allowance
    const options = {
      maxTimeMS: 300000, // 5 minutes timeout
      allowDiskUse: true, // Allow using disk for large datasets
      batchSize: 1000, // Process in smaller batches
    };

    const results = await ReleaseModel.aggregate(basicStatsPipeline, options);
    this.logger.info(`Found ${results.length} buyer patterns to process`);

    // Process in batches to avoid memory issues
    const batchSize = 50; // Reduced batch size
    for (let i = 0; i < results.length; i += batchSize) {
      try {
        const batch = results.slice(i, i + batchSize);
        const operations = [];

        for (const result of batch) {
          // Get category data separately for each buyer to avoid memory issues
          const categoriesData = await this.getBuyerCategories(result._id);

          const pattern = {
            updateOne: {
              filter: { buyerId: result._id },
              update: {
                $set: {
                  buyerId: result._id,
                  name: result.name || "Unknown Buyer",
                  totalContracts: result.totalContracts || 0,
                  years: (result.years || []).filter((year: any) => year && typeof year === "number"),
                  yearCount: result.yearCount || 0,
                  suppliers: (result.suppliers || []).filter((supplier: any) => supplier && typeof supplier === "string" && supplier.trim() !== ""),
                  supplierCount: result.supplierCount || 0,
                  totalSpending: result.totalSpending || 0,
                  avgContractValue: result.avgContractValue || 0,
                  // No items for buyers to avoid BSON size limit
                  topCategories: categoriesData,
                  lastUpdated: new Date(),
                },
              },
              upsert: true,
            },
          };

          operations.push(pattern);
        }

        if (operations.length > 0) {
          await BuyerPatternModel.bulkWrite(operations);
        }

        this.logger.info(`Processed buyer patterns batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(results.length / batchSize)}`);
      } catch (error) {
        this.logger.error(`Error processing buyer patterns batch ${Math.floor(i / batchSize) + 1}:`, error as Error);
        // Continue with next batch instead of failing completely
      }
    }
    this.logger.info("Buyer patterns batch processing completed");
  }

  // Helper method to get categories for a specific buyer without memory issues
  private async getBuyerCategories(buyerId: string): Promise<any[]> {
    const categoryPipeline = [
      {
        $match: {
          "buyer.id": buyerId,
          "awards.items": { $exists: true, $ne: [] },
        },
      },
      { $unwind: "$awards" },
      {
        $match: {
          "awards.items": { $exists: true, $ne: [] },
        },
      },
      { $unwind: "$awards.items" },
      {
        $group: {
          _id: "$awards.items.classification.scheme",
          totalAmount: { $sum: "$awards.items.unit.value.amount" },
          contractCount: { $sum: 1 },
        },
      },
      { $sort: { totalAmount: -1 } },
      { $limit: 20 }, // Top 20 categories
    ];

    try {
      const categoriesResults = await ReleaseModel.aggregate(categoryPipeline as any);

      const categories = categoriesResults.map((cat: any) => ({
        category: cat._id || "Uncategorized",
        totalAmount: cat.totalAmount || 0,
        contractCount: cat.contractCount || 0,
      }));

      return categories;
    } catch (error) {
      this.logger.error(`Error getting categories for buyer ${buyerId}:`, error as Error);
      return [];
    }
  }

  async processAllPatterns(): Promise<void> {
    this.logger.info("Starting complete analytics batch processing...");

    await this.processSupplierPatterns();
    await this.processBuyerPatterns();

    this.logger.info("Complete analytics batch processing finished");
  }

  async getSupplierPatterns(limit: number = 50): Promise<ISupplierPattern[]> {
    return await SupplierPatternModel.find({}).sort({ totalContracts: -1 }).limit(limit).lean();
  }

  async getBuyerPatterns(limit: number = 50): Promise<IBuyerPattern[]> {
    return await BuyerPatternModel.find({}).sort({ totalSpending: -1 }).limit(limit).lean();
  }
}
