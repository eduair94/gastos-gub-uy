import mongoose from "mongoose";
import { MONGO_CONFIG } from "./config/config";
import { ReleaseModel } from "./database/release-model";
import { Logger } from "./services/logger-service";

class IndexCreator {
  private logger: Logger;

  constructor() {
    this.logger = new Logger();
  }

  async connectToDatabase(): Promise<void> {
    try {
      const mongoUri = `${MONGO_CONFIG.uri}/${MONGO_CONFIG.database}`;
      await mongoose.connect(mongoUri, {
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 30000,
        socketTimeoutMS: 120000,
        maxIdleTimeMS: 30000,
      });
      this.logger.info("Connected to MongoDB for index creation");
    } catch (error) {
      this.logger.error("Failed to connect to MongoDB", error as Error);
      throw error;
    }
  }

  async createOptimizedIndexes(): Promise<void> {
    this.logger.info("Creating optimized indexes for Release collection...");

    try {
      const collection = ReleaseModel.collection;

      // 1. Separate indexes for supplier queries (cannot combine arrays)
      this.logger.info("Creating parties ID index...");
      await collection.createIndex(
        {
          "parties.id": 1,
        },
        {
          name: "parties_id_idx",
          background: true,
        }
      );

      this.logger.info("Creating parties roles index...");
      await collection.createIndex(
        {
          "parties.roles": 1,
        },
        {
          name: "parties_roles_idx",
          background: true,
        }
      );

      // 2. Index for buyer queries
      this.logger.info("Creating buyer ID index...");
      await collection.createIndex(
        {
          "buyer.id": 1,
        },
        {
          name: "buyer_id_idx",
          background: true,
        }
      );

      // 3. Awards array indexes
      this.logger.info("Creating awards existence index...");
      await collection.createIndex(
        {
          "awards.0": 1,
        },
        {
          name: "awards_exists_idx",
          background: true,
        }
      );

      // 4. Items array indexes
      this.logger.info("Creating awards items existence index...");
      await collection.createIndex(
        {
          "awards.items.0": 1,
        },
        {
          name: "awards_items_exists_idx",
          background: true,
        }
      );

      // 5. Critical index for amount queries - most important for performance
      this.logger.info("Creating item amount index...");
      await collection.createIndex(
        {
          "awards.items.unit.value.amount": 1,
        },
        {
          name: "items_amount_idx",
          background: true,
          sparse: true, // Only index documents that have this field
        }
      );

      // 6. Index for item classifications
      this.logger.info("Creating item classification scheme index...");
      await collection.createIndex(
        {
          "awards.items.classification.scheme": 1,
        },
        {
          name: "items_classification_scheme_idx",
          background: true,
        }
      );

      this.logger.info("Creating item classification description index...");
      await collection.createIndex(
        {
          "awards.items.classification.description": 1,
        },
        {
          name: "items_classification_desc_idx",
          background: true,
        }
      );

      // 7. Index for temporal data
      this.logger.info("Creating awards date index...");
      await collection.createIndex(
        {
          "awards.date": 1,
        },
        {
          name: "awards_date_idx",
          background: true,
        }
      );

      this.logger.info("Creating document date index...");
      await collection.createIndex(
        {
          date: 1,
        },
        {
          name: "document_date_idx",
          background: true,
        }
      );

      // 8. Index for source file tracking
      this.logger.info("Creating source file name index...");
      await collection.createIndex(
        {
          sourceFileName: 1,
        },
        {
          name: "source_file_name_idx",
          background: true,
        }
      );

      this.logger.info("Creating source year index...");
      await collection.createIndex(
        {
          sourceYear: 1,
        },
        {
          name: "source_year_idx",
          background: true,
        }
      );

      // 9. Unit information indexes
      this.logger.info("Creating unit name index...");
      await collection.createIndex(
        {
          "awards.items.unit.name": 1,
        },
        {
          name: "items_unit_name_idx",
          background: true,
        }
      );

      this.logger.info("Creating unit currency index...");
      await collection.createIndex(
        {
          "awards.items.unit.value.currency": 1,
        },
        {
          name: "items_currency_idx",
          background: true,
        }
      );

      this.logger.info("Creating quantity index...");
      await collection.createIndex(
        {
          "awards.items.quantity": 1,
        },
        {
          name: "items_quantity_idx",
          background: true,
        }
      );

      // 10. Compound indexes that don't involve parallel arrays
      this.logger.info("Creating buyer and amount compound index...");
      await collection.createIndex(
        {
          "buyer.id": 1,
          "awards.items.unit.value.amount": 1,
        },
        {
          name: "buyer_amount_compound_idx",
          background: true,
        }
      );

      this.logger.info("Creating temporal compound index...");
      await collection.createIndex(
        {
          sourceYear: 1,
          "awards.date": 1,
        },
        {
          name: "temporal_compound_idx",
          background: true,
        }
      );

      this.logger.info("Creating classification compound index...");
      await collection.createIndex(
        {
          "awards.items.classification.scheme": 1,
          "awards.items.unit.value.amount": 1,
        },
        {
          name: "classification_amount_compound_idx",
          background: true,
        }
      );

      this.logger.info("✅ All optimized indexes created successfully!");

      // Create indexes for analytics collections too
      await this.createAnalyticsIndexes();
    } catch (error) {
      this.logger.error("Error creating indexes:", error as Error);
      throw error;
    }
  }

  async createAnalyticsIndexes(): Promise<void> {
    this.logger.info("Creating optimized indexes for analytics collections...");

    try {
      const { SupplierPatternModel, BuyerPatternModel } = await import("./database/analytics-models");

      // Create indexes for SupplierPattern collection
      this.logger.info("Creating supplier pattern indexes...");
      await SupplierPatternModel.collection.createIndex({ __v: 1 }, { name: "supplier_version_idx", background: true });
      await SupplierPatternModel.collection.createIndex({ avgContractValue: 1 }, { name: "supplier_avg_value_idx", background: true, sparse: true });
      await SupplierPatternModel.collection.createIndex({ "items.0": 1 }, { name: "supplier_items_exists_idx", background: true });

      // Create indexes for BuyerPattern collection
      this.logger.info("Creating buyer pattern indexes...");
      await BuyerPatternModel.collection.createIndex({ __v: 1 }, { name: "buyer_version_idx", background: true });
      await BuyerPatternModel.collection.createIndex({ avgContractValue: 1 }, { name: "buyer_avg_value_idx", background: true, sparse: true });
      await BuyerPatternModel.collection.createIndex({ "items.0": 1 }, { name: "buyer_items_exists_idx", background: true });

      this.logger.info("✅ Analytics indexes created successfully!");
    } catch (error) {
      this.logger.error("Error creating indexes:", error as Error);
      throw error;
    }
  }

  async listExistingIndexes(): Promise<void> {
    this.logger.info("Listing existing indexes...");

    try {
      const collection = ReleaseModel.collection;
      const indexes = await collection.listIndexes().toArray();

      this.logger.info(`Found ${indexes.length} existing indexes:`);
      for (const index of indexes) {
        this.logger.info(`- ${index.name}: ${JSON.stringify(index.key)}`);
      }
    } catch (error) {
      this.logger.error("Error listing indexes:", error as Error);
      throw error;
    }
  }

  async getIndexStats(): Promise<void> {
    this.logger.info("Getting index usage statistics...");

    try {
      const collection = ReleaseModel.collection;
      const stats = await collection.aggregate([{ $indexStats: {} }]).toArray();

      this.logger.info("Index usage statistics:");
      for (const stat of stats) {
        this.logger.info(`- ${stat.name}: ${stat.accesses.ops} operations, last used: ${stat.accesses.since || "Never"}`);
      }
    } catch (error) {
      this.logger.error("Error getting index stats:", error as Error);
      throw error;
    }
  }

  async dropUnusedIndexes(): Promise<void> {
    this.logger.info("Analyzing and dropping unused indexes...");

    try {
      const collection = ReleaseModel.collection;
      const indexes = await collection.listIndexes().toArray();

      // Never drop the _id index
      const droppableIndexes = indexes.filter((index) => index.name !== "_id_" && !index.name.includes("optimized") && !index.name.includes("supplier") && !index.name.includes("buyer") && !index.name.includes("awards") && !index.name.includes("items"));

      for (const index of droppableIndexes) {
        this.logger.info(`Dropping potentially unused index: ${index.name}`);
        await collection.dropIndex(index.name);
      }

      this.logger.info("✅ Cleanup completed!");
    } catch (error) {
      this.logger.error("Error dropping indexes:", error as Error);
      throw error;
    }
  }

  async explainQuery(): Promise<void> {
    this.logger.info("Testing query performance with new indexes...");

    try {
      // Test supplier query
      const supplierExplain = await ReleaseModel.collection
        .aggregate([
          {
            $match: {
              "parties.id": "test-supplier-id",
              "parties.roles": "supplier",
              "awards.0": { $exists: true },
            },
          },
        ])
        .explain("executionStats");

      this.logger.info("Supplier query execution stats:");
      this.logger.info(`- Execution time: ${supplierExplain.executionStats?.executionTimeMillis || "N/A"}ms`);
      this.logger.info(`- Documents examined: ${supplierExplain.executionStats?.totalDocsExamined || "N/A"}`);
      this.logger.info(`- Index used: ${supplierExplain.executionStats?.winningPlan?.inputStage?.indexName || "None"}`);

      // Test buyer query
      const buyerExplain = await ReleaseModel.collection
        .aggregate([
          {
            $match: {
              "buyer.id": "test-buyer-id",
              "awards.0": { $exists: true },
            },
          },
        ])
        .explain("executionStats");

      this.logger.info("Buyer query execution stats:");
      this.logger.info(`- Execution time: ${buyerExplain.executionStats?.executionTimeMillis || "N/A"}ms`);
      this.logger.info(`- Documents examined: ${buyerExplain.executionStats?.totalDocsExamined || "N/A"}`);
      this.logger.info(`- Index used: ${buyerExplain.executionStats?.winningPlan?.inputStage?.indexName || "None"}`);
    } catch (error) {
      this.logger.error("Error explaining queries:", error as Error);
      throw error;
    }
  }
}

async function main() {
  const creator = new IndexCreator();

  try {
    await creator.connectToDatabase();

    // List existing indexes first
    await creator.listExistingIndexes();

    // Create optimized indexes
    await creator.createOptimizedIndexes();

    // Test query performance
    await creator.explainQuery();

    // Show final index list
    await creator.listExistingIndexes();

    // Get usage stats
    await creator.getIndexStats();
  } catch (error) {
    console.error("Error in index creation process:", error);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

if (require.main === module) {
  main();
}
