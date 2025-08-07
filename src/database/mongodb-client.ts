import { Collection, Db, MongoClient } from "mongodb";
import mongoose from "mongoose";
import { MONGO_CONFIG } from "../config/config";
import { DatabaseClient, Logger, MongoConfig } from "../types/interfaces";

/**
 * MongoDB client implementation following Dependency Inversion Principle
 * Provides abstraction over MongoDB operations
 */

// Global connection function for API server
export async function connectToDatabase(): Promise<void> {
  try {
    const mongoUri = `${MONGO_CONFIG.uri}/${MONGO_CONFIG.database}`;
    await mongoose.connect(mongoUri, {
      maxPoolSize: 50,
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 300000,
      maxIdleTimeMS: 30000,
    });
    console.log('✓ Connected to MongoDB');
  } catch (error) {
    console.error('Failed to connect to MongoDB:', error);
    throw error;
  }
}
export class MongoDbClient implements DatabaseClient {
  private client: MongoClient | null = null;
  private db: Db | null = null;
  private collection: Collection | null = null;
  private readonly config: MongoConfig;
  private readonly logger: Logger;

  constructor(config: MongoConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
  }

  /**
   * Establishes connection to MongoDB
   */
  async connect(): Promise<void> {
    try {
      this.logger.info(`Connecting to MongoDB at ${this.config.uri}`);

      // MongoDB connection options with increased timeouts for large operations
      const options = {
        bufferMaxEntries: 0,
        useNewUrlParser: true,
        useUnifiedTopology: true,
        maxIdleTimeMS: 30000,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 0, // No timeout for socket operations
        connectTimeoutMS: 10000,
        bufferCommands: false, // Disable mongoose buffering
      };

      this.client = new MongoClient(this.config.uri, options);
      await this.client.connect();

      this.db = this.client.db(this.config.database);
      this.collection = this.db.collection(this.config.collection);

      this.logger.info(`Connected to MongoDB database: ${this.config.database}`);
      this.logger.info(`Using collection: ${this.config.collection}`);

      // Test the connection
      await this.db.admin().ping();
      this.logger.info("MongoDB connection verified");
    } catch (error) {
      this.logger.error("Failed to connect to MongoDB:", error as Error);
      throw new Error(`MongoDB connection failed: ${(error as Error).message}`);
    }
  }

  /**
   * Closes the MongoDB connection
   */
  async disconnect(): Promise<void> {
    try {
      if (this.client) {
        await this.client.close();
        this.client = null;
        this.db = null;
        this.collection = null;
        this.logger.info("Disconnected from MongoDB");
      }
    } catch (error) {
      this.logger.error("Error disconnecting from MongoDB:", error as Error);
      throw error;
    }
  }

  /**
   * Inserts multiple documents into the collection
   */
  async insertMany(documents: any[]): Promise<void> {
    if (!this.collection) {
      throw new Error("Database not connected. Call connect() first.");
    }

    if (documents.length === 0) {
      return;
    }

    try {
      const result = await this.collection.insertMany(documents, {
        ordered: false, // Continue inserting even if some documents fail
      });

      this.logger.info(`Inserted ${result.insertedCount} documents`);

      if (result.insertedCount !== documents.length) {
        this.logger.warn(`Expected to insert ${documents.length} documents, but only inserted ${result.insertedCount}`);
      }
    } catch (error) {
      this.logger.error("Error inserting documents:", error as Error);
      throw error;
    }
  }

  /**
   * Creates an index on the collection
   */
  async createIndex(indexSpec: any): Promise<void> {
    if (!this.collection) {
      throw new Error("Database not connected. Call connect() first.");
    }

    try {
      const indexName = await this.collection.createIndex(indexSpec);
      this.logger.info(`Created index: ${indexName}`);
    } catch (error) {
      this.logger.error("Error creating index:", error as Error);
      throw error;
    }
  }

  /**
   * Returns the count of documents in the collection
   */
  async count(): Promise<number> {
    if (!this.collection) {
      throw new Error("Database not connected. Call connect() first.");
    }

    try {
      const count = await this.collection.countDocuments();
      this.logger.info(`Collection contains ${count} documents`);
      return count;
    } catch (error) {
      this.logger.error("Error counting documents:", error as Error);
      throw error;
    }
  }

  /**
   * Creates recommended indexes for government purchase data
   */
  async createRecommendedIndexes(): Promise<void> {
    this.logger.info("Creating recommended indexes for government purchase data...");

    const indexes = [
      { ocid: 1 }, // OCID (Open Contracting ID)
      { date: -1 }, // Date descending
      { "buyer.name": 1 }, // Buyer name
      { "tender.title": "text" }, // Text search on tender title
      { "tender.value.amount": -1 }, // Amount descending
      { "awards.suppliers.name": 1 }, // Supplier name
      { "tender.procurementMethod": 1 }, // Procurement method
      { "tender.mainProcurementCategory": 1 }, // Procurement category
      { "awards.date": -1 }, // Award date
      { "contracts.dateSigned": -1 }, // Contract signing date
    ];

    for (const indexSpec of indexes) {
      try {
        await this.createIndex(indexSpec);
      } catch (error) {
        // Continue with other indexes even if one fails
        this.logger.warn(`Failed to create index ${JSON.stringify(indexSpec)}: ${(error as Error).message}`);
      }
    }

    this.logger.info("Finished creating recommended indexes");
  }

  /**
   * Gets database statistics
   */
  async getStats(): Promise<any> {
    if (!this.db || !this.collection) {
      throw new Error("Database not connected. Call connect() first.");
    }

    try {
      const dbStats = await this.db.stats();
      const collectionCount = await this.collection.countDocuments();

      // Get collection stats using aggregation
      const collectionStats = await this.collection
        .aggregate([
          {
            $group: {
              _id: null,
              count: { $sum: 1 },
              avgSize: { $avg: { $bsonSize: "$$ROOT" } },
            },
          },
        ])
        .toArray();

      const stats = collectionStats[0] || { count: 0, avgSize: 0 };

      return {
        database: {
          name: this.config.database,
          sizeOnDisk: dbStats.fsUsedSize || dbStats.storageSize,
          collections: dbStats.collections,
        },
        collection: {
          name: this.config.collection,
          documentCount: collectionCount,
          avgDocumentSize: stats.avgSize,
          totalSize: dbStats.dataSize,
          indexes: await this.collection.listIndexes().toArray(),
        },
      };
    } catch (error) {
      this.logger.error("Error getting database stats:", error as Error);
      throw error;
    }
  }
}
