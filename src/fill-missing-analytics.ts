import mongoose from "mongoose";
import { MONGO_CONFIG } from "./config/config";
import { BuyerPatternModel, SupplierPatternModel } from "./database/analytics-models";
import { ReleaseModel } from "./database/release-model";
import { Logger } from "./services/logger-service";

class FinalOptimizedFiller {
  private logger: Logger;
  private readonly CURRENT_DATA_VERSION = 3;

  constructor() {
    this.logger = new Logger();
  }

  async connectToDatabase(): Promise<void> {
    try {
      const mongoUri = `${MONGO_CONFIG.uri}/${MONGO_CONFIG.database}`;
      await mongoose.connect(mongoUri, {
        maxPoolSize: 50,
        serverSelectionTimeoutMS: 30000,
        socketTimeoutMS: 300000,
        maxIdleTimeMS: 30000,
      });
      this.logger.info("Connected to MongoDB for final optimization");
    } catch (error) {
      this.logger.error("Failed to connect to MongoDB", error as Error);
      throw error;
    }
  }

  async fillSupplierMissingData(): Promise<void> {
    this.logger.info("🚀 Starting FINAL optimized supplier data filling...");
    const startTime = Date.now();

    const suppliersNeedingUpdate = await SupplierPatternModel.find({
      $or: [{ avgContractValue: { $exists: false } }, { avgContractValue: 0 }, { items: { $size: 0 } }, { items: { $exists: false } }, { topCategories: { $size: 0 } }, { topCategories: { $exists: false } }, { __v: { $lt: this.CURRENT_DATA_VERSION } }, { __v: { $exists: false } }],
    })
      .select("supplierId")
      .lean();

    this.logger.info(`Found ${suppliersNeedingUpdate.length} suppliers needing updates`);

    const batchSize = 1; // Single item batches for maximum accuracy and speed
    const maxConcurrent = 100; // Increased concurrency for faster processing
    const totalBatches = Math.ceil(suppliersNeedingUpdate.length / batchSize);

    this.logger.info(`Processing ${totalBatches} ultra-micro-batches with ${maxConcurrent} concurrent workers`);

    let processed = 0;
    let successful = 0;
    let failed = 0;
    let batchIndex = 0;

    const processBatch = async (): Promise<void> => {
      while (batchIndex < totalBatches) {
        const currentBatch = batchIndex++;
        const startIdx = currentBatch * batchSize;
        const endIdx = Math.min(startIdx + batchSize, suppliersNeedingUpdate.length);
        const batch = suppliersNeedingUpdate.slice(startIdx, endIdx);

        if (batch.length === 0) continue;

        try {
          await this.processSupplierBatchFinal(batch);
          successful++;
        } catch (error) {
          failed++;
          // Only log errors occasionally to reduce output
          if (failed % 100 === 1) {
            this.logger.error(`❌ Supplier batch ${currentBatch + 1} failed (showing every 100th error)`, error as Error);
          }
        } finally {
          processed++;
          if (processed % 50 === 0 || processed === totalBatches) {
            const progress = ((processed / totalBatches) * 100).toFixed(1);
            this.logger.info(`⚡ Suppliers: ${processed}/${totalBatches} (${progress}%) | ✅ ${successful} | ❌ ${failed}`);
          }
        }
      }
    };

    const workers = Array(maxConcurrent)
      .fill(null)
      .map(() => processBatch());
    await Promise.all(workers);

    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);
    this.logger.info(`🎯 FINAL supplier optimization completed in ${duration}s | ✅ ${successful} | ❌ ${failed}`);
  }

  async fillBuyerMissingData(): Promise<void> {
    this.logger.info("🚀 Starting FINAL optimized buyer data filling...");
    const startTime = Date.now();

    const buyersNeedingUpdate = await BuyerPatternModel.find({
      $or: [{ avgContractValue: { $exists: false } }, { avgContractValue: 0 }, { items: { $size: 0 } }, { items: { $exists: false } }, { topCategories: { $size: 0 } }, { topCategories: { $exists: false } }, { __v: { $lt: this.CURRENT_DATA_VERSION } }, { __v: { $exists: false } }],
    })
      .select("buyerId")
      .lean();

    this.logger.info(`Found ${buyersNeedingUpdate.length} buyers needing updates`);

    const batchSize = 1; // Single item batches for maximum accuracy and speed
    const maxConcurrent = 100; // Increased concurrency for faster processing
    const totalBatches = Math.ceil(buyersNeedingUpdate.length / batchSize);

    this.logger.info(`Processing ${totalBatches} ultra-micro-batches with ${maxConcurrent} concurrent workers`);

    let processed = 0;
    let successful = 0;
    let failed = 0;
    let batchIndex = 0;

    const processBatch = async (): Promise<void> => {
      while (batchIndex < totalBatches) {
        const currentBatch = batchIndex++;
        const startIdx = currentBatch * batchSize;
        const endIdx = Math.min(startIdx + batchSize, buyersNeedingUpdate.length);
        const batch = buyersNeedingUpdate.slice(startIdx, endIdx);

        if (batch.length === 0) continue;

        try {
          await this.processBuyerBatchFinal(batch);
          successful++;
        } catch (error) {
          failed++;
          // Only log errors occasionally to reduce output
          if (failed % 50 === 1) {
            this.logger.error(`❌ Buyer batch ${currentBatch + 1} failed (showing every 50th error)`, error as Error);
          }
        } finally {
          processed++;
          if (processed % 25 === 0 || processed === totalBatches) {
            const progress = ((processed / totalBatches) * 100).toFixed(1);
            this.logger.info(`⚡ Buyers: ${processed}/${totalBatches} (${progress}%) | ✅ ${successful} | ❌ ${failed}`);
          }
        }
      }
    };

    const workers = Array(maxConcurrent)
      .fill(null)
      .map(() => processBatch());
    await Promise.all(workers);

    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);
    this.logger.info(`🎯 FINAL buyer optimization completed in ${duration}s | ✅ ${successful} | ❌ ${failed}`);
  }

  private async processSupplierBatchFinal(batch: any[]): Promise<void> {
    const supplierIds = batch.map((s) => s.supplierId);

    // Fixed aggregation with proper value calculations
    const results = await ReleaseModel.aggregate([
      {
        $match: {
          "parties.id": { $in: supplierIds },
          "parties.roles": "supplier",
          "awards.items.unit.value.amount": { $gt: 0 },
        },
      },
      { $unwind: "$awards" },
      { $unwind: "$parties" },
      { $unwind: "$awards.items" },
      {
        $match: {
          "parties.roles": "supplier",
          "parties.id": { $in: supplierIds },
          "awards.items.unit.value.amount": { $type: "number", $gt: 0 },
        },
      },
      {
        $group: {
          _id: "$parties.id",
          totalValue: { $sum: "$awards.items.unit.value.amount" },
          totalContracts: { $sum: 1 },
          // Collect all items with their actual values
          itemsData: {
            $push: {
              description: { $ifNull: ["$awards.items.classification.description", "Unknown"] },
              category: { $ifNull: ["$awards.items.classification.scheme", "Other"] },
              amount: "$awards.items.unit.value.amount",
              quantity: { $ifNull: ["$awards.items.quantity", 1] },
            },
          },
          // Collect categories with amounts
          categoriesData: {
            $push: {
              category: { $ifNull: ["$awards.items.classification.scheme", "Other"] },
              amount: "$awards.items.unit.value.amount",
            },
          },
        },
      },
      {
        $addFields: {
          avgContractValue: { $divide: ["$totalValue", "$totalContracts"] },
          // Process items with proper aggregation
          items: {
            $slice: [
              {
                $map: {
                  input: {
                    $reduce: {
                      input: "$itemsData",
                      initialValue: [],
                      in: {
                        $let: {
                          vars: {
                            currentItem: "$$this",
                            existingIndex: {
                              $indexOfArray: [{ $map: { input: "$$value", as: "item", in: "$$item.description" } }, "$$this.description"],
                            },
                          },
                          in: {
                            $cond: {
                              if: { $eq: ["$$existingIndex", -1] },
                              then: {
                                $concatArrays: [
                                  "$$value",
                                  [
                                    {
                                      description: "$$currentItem.description",
                                      category: "$$currentItem.category",
                                      totalAmount: "$$currentItem.amount",
                                      totalQuantity: "$$currentItem.quantity",
                                      contractCount: 1,
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
                                      if: { $eq: ["$$item.description", "$$currentItem.description"] },
                                      then: {
                                        description: "$$item.description",
                                        category: "$$item.category",
                                        totalAmount: { $add: ["$$item.totalAmount", "$$currentItem.amount"] },
                                        totalQuantity: { $add: ["$$item.totalQuantity", "$$currentItem.quantity"] },
                                        contractCount: { $add: ["$$item.contractCount", 1] },
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
                  as: "item",
                  in: {
                    description: "$$item.description",
                    category: "$$item.category",
                    totalAmount: "$$item.totalAmount",
                    totalQuantity: "$$item.totalQuantity",
                    contractCount: "$$item.contractCount",
                    avgPrice: {
                      $cond: {
                        if: { $gt: ["$$item.totalQuantity", 0] },
                        then: { $divide: ["$$item.totalAmount", "$$item.totalQuantity"] },
                        else: "$$item.totalAmount",
                      },
                    },
                  },
                },
              },
              10, // Top 10 items
            ],
          },
          // Process categories with proper aggregation
          topCategories: {
            $slice: [
              {
                $reduce: {
                  input: "$categoriesData",
                  initialValue: [],
                  in: {
                    $let: {
                      vars: {
                        currentCat: "$$this",
                        existingIndex: {
                          $indexOfArray: [{ $map: { input: "$$value", as: "cat", in: "$$cat.category" } }, "$$this.category"],
                        },
                      },
                      in: {
                        $cond: {
                          if: { $eq: ["$$existingIndex", -1] },
                          then: {
                            $concatArrays: [
                              "$$value",
                              [
                                {
                                  category: "$$currentCat.category",
                                  totalAmount: "$$currentCat.amount",
                                  contractCount: 1,
                                },
                              ],
                            ],
                          },
                          else: {
                            $map: {
                              input: "$$value",
                              as: "cat",
                              in: {
                                $cond: {
                                  if: { $eq: ["$$cat.category", "$$currentCat.category"] },
                                  then: {
                                    category: "$$cat.category",
                                    totalAmount: { $add: ["$$cat.totalAmount", "$$currentCat.amount"] },
                                    contractCount: { $add: ["$$cat.contractCount", 1] },
                                  },
                                  else: "$$cat",
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
              5, // Top 5 categories
            ],
          },
        },
      },
      {
        $project: {
          _id: 1,
          avgContractValue: 1,
          items: 1,
          topCategories: 1,
        },
      },
    ])
      .allowDiskUse(true)
      .exec();

    if (results.length > 0) {
      const bulkOps = results.map((result: any) => ({
        updateOne: {
          filter: { supplierId: result._id },
          update: {
            $set: {
              avgContractValue: result.avgContractValue || 0,
              items: result.items || [],
              topCategories: result.topCategories || [],
              lastUpdated: new Date(),
            },
            $inc: { __v: 1 },
          },
          upsert: false,
        },
      }));

      await SupplierPatternModel.bulkWrite(bulkOps, {
        ordered: false,
        bypassDocumentValidation: true,
      });
    }
  }

  private async processBuyerBatchFinal(batch: any[]): Promise<void> {
    const buyerIds = batch.map((b) => b.buyerId);

    // Fixed aggregation with proper value calculations
    const results = await ReleaseModel.aggregate([
      {
        $match: {
          "buyer.id": { $in: buyerIds },
          "awards.items.unit.value.amount": { $gt: 0 },
        },
      },
      { $unwind: "$awards" },
      { $unwind: "$awards.items" },
      {
        $match: {
          "awards.items.unit.value.amount": { $type: "number", $gt: 0 },
        },
      },
      {
        $group: {
          _id: "$buyer.id",
          totalSpending: { $sum: "$awards.items.unit.value.amount" },
          totalContracts: { $sum: 1 },
          // Collect all items with their actual values
          itemsData: {
            $push: {
              description: { $ifNull: ["$awards.items.classification.description", "Unknown"] },
              category: { $ifNull: ["$awards.items.classification.scheme", "Other"] },
              amount: "$awards.items.unit.value.amount",
              quantity: { $ifNull: ["$awards.items.quantity", 1] },
            },
          },
          // Collect categories with amounts
          categoriesData: {
            $push: {
              category: { $ifNull: ["$awards.items.classification.scheme", "Other"] },
              amount: "$awards.items.unit.value.amount",
            },
          },
        },
      },
      {
        $addFields: {
          avgContractValue: { $divide: ["$totalSpending", "$totalContracts"] },
          // Process items with proper aggregation
          items: {
            $slice: [
              {
                $map: {
                  input: {
                    $reduce: {
                      input: "$itemsData",
                      initialValue: [],
                      in: {
                        $let: {
                          vars: {
                            currentItem: "$$this",
                            existingIndex: {
                              $indexOfArray: [{ $map: { input: "$$value", as: "item", in: "$$item.description" } }, "$$this.description"],
                            },
                          },
                          in: {
                            $cond: {
                              if: { $eq: ["$$existingIndex", -1] },
                              then: {
                                $concatArrays: [
                                  "$$value",
                                  [
                                    {
                                      description: "$$currentItem.description",
                                      category: "$$currentItem.category",
                                      totalAmount: "$$currentItem.amount",
                                      totalQuantity: "$$currentItem.quantity",
                                      contractCount: 1,
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
                                      if: { $eq: ["$$item.description", "$$currentItem.description"] },
                                      then: {
                                        description: "$$item.description",
                                        category: "$$item.category",
                                        totalAmount: { $add: ["$$item.totalAmount", "$$currentItem.amount"] },
                                        totalQuantity: { $add: ["$$item.totalQuantity", "$$currentItem.quantity"] },
                                        contractCount: { $add: ["$$item.contractCount", 1] },
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
                  as: "item",
                  in: {
                    description: "$$item.description",
                    category: "$$item.category",
                    totalAmount: "$$item.totalAmount",
                    totalQuantity: "$$item.totalQuantity",
                    contractCount: "$$item.contractCount",
                    avgPrice: {
                      $cond: {
                        if: { $gt: ["$$item.totalQuantity", 0] },
                        then: { $divide: ["$$item.totalAmount", "$$item.totalQuantity"] },
                        else: "$$item.totalAmount",
                      },
                    },
                  },
                },
              },
              10, // Top 10 items
            ],
          },
          // Process categories with proper aggregation
          topCategories: {
            $slice: [
              {
                $reduce: {
                  input: "$categoriesData",
                  initialValue: [],
                  in: {
                    $let: {
                      vars: {
                        currentCat: "$$this",
                        existingIndex: {
                          $indexOfArray: [{ $map: { input: "$$value", as: "cat", in: "$$cat.category" } }, "$$this.category"],
                        },
                      },
                      in: {
                        $cond: {
                          if: { $eq: ["$$existingIndex", -1] },
                          then: {
                            $concatArrays: [
                              "$$value",
                              [
                                {
                                  category: "$$currentCat.category",
                                  totalAmount: "$$currentCat.amount",
                                  contractCount: 1,
                                },
                              ],
                            ],
                          },
                          else: {
                            $map: {
                              input: "$$value",
                              as: "cat",
                              in: {
                                $cond: {
                                  if: { $eq: ["$$cat.category", "$$currentCat.category"] },
                                  then: {
                                    category: "$$cat.category",
                                    totalAmount: { $add: ["$$cat.totalAmount", "$$currentCat.amount"] },
                                    contractCount: { $add: ["$$cat.contractCount", 1] },
                                  },
                                  else: "$$cat",
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
              5, // Top 5 categories
            ],
          },
        },
      },
      {
        $project: {
          _id: 1,
          avgContractValue: 1,
          items: 1,
          topCategories: 1,
        },
      },
    ])
      .allowDiskUse(true)
      .exec();

    if (results.length > 0) {
      const bulkOps = results.map((result: any) => ({
        updateOne: {
          filter: { buyerId: result._id },
          update: {
            $set: {
              avgContractValue: result.avgContractValue || 0,
              items: result.items || [],
              topCategories: result.topCategories || [],
              lastUpdated: new Date(),
            },
            $inc: { __v: 1 },
          },
          upsert: false,
        },
      }));

      await BuyerPatternModel.bulkWrite(bulkOps, {
        ordered: false,
        bypassDocumentValidation: true,
      });
    }
  }

  async fillAllMissingData(): Promise<void> {
    const startTime = Date.now();
    this.logger.info("🔥 Starting ULTIMATE-SPEED missing data filling...");

    await Promise.all([this.fillSupplierMissingData(), this.fillBuyerMissingData()]);

    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);
    this.logger.info(`🚀 ULTIMATE-SPEED filling completed in ${duration} seconds!`);
  }

  async checkDataCompleteness(): Promise<void> {
    this.logger.info("📊 Checking final data completeness...");

    const [totalSuppliers, suppliersIncomplete, totalBuyers, buyersIncomplete] = await Promise.all([
      SupplierPatternModel.countDocuments(),
      SupplierPatternModel.countDocuments({
        $or: [{ avgContractValue: { $exists: false } }, { avgContractValue: 0 }, { items: { $size: 0 } }, { items: { $exists: false } }, { __v: { $lt: this.CURRENT_DATA_VERSION } }, { __v: { $exists: false } }],
      }),
      BuyerPatternModel.countDocuments(),
      BuyerPatternModel.countDocuments({
        $or: [{ avgContractValue: { $exists: false } }, { avgContractValue: 0 }, { items: { $size: 0 } }, { items: { $exists: false } }, { __v: { $lt: this.CURRENT_DATA_VERSION } }, { __v: { $exists: false } }],
      }),
    ]);

    const supplierCompletion = (((totalSuppliers - suppliersIncomplete) / totalSuppliers) * 100).toFixed(1);
    const buyerCompletion = (((totalBuyers - buyersIncomplete) / totalBuyers) * 100).toFixed(1);

    this.logger.info(`
🎯 FINAL Completeness Report (v${this.CURRENT_DATA_VERSION}):
Suppliers: ${totalSuppliers - suppliersIncomplete}/${totalSuppliers} complete (${supplierCompletion}%)
Buyers: ${totalBuyers - buyersIncomplete}/${totalBuyers} complete (${buyerCompletion}%)
    `);
  }
}

async function main() {
  const filler = new FinalOptimizedFiller();

  try {
    await filler.connectToDatabase();
    await filler.checkDataCompleteness();
    await filler.fillAllMissingData();
    await filler.checkDataCompleteness();
  } catch (error) {
    console.error("Error in final optimization process:", error);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

if (require.main === module) {
  main();
}
