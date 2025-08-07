import dotenv from "dotenv";
import mongoose from "mongoose";
import { AnalyticsBatchProcessor } from "./services/analytics-batch-processor";
import { Logger } from "./services/logger-service";

// Load environment variables
dotenv.config();

const logger = new Logger();

async function runBatchAnalytics() {
  try {
    logger.info("Starting batch analytics processing...");

    // Use the same connection string from .env that the rest of the app uses
    const mongoUri = process.env.MONGODB_URI || "mongodb://localhost:27017/gastos_gub";
    logger.info(`Connecting to: ${mongoUri}`);

    // Configure mongoose with appropriate timeout settings for large operations
    mongoose.set("bufferCommands", false);

    const mongooseOptions = {
      maxIdleTimeMS: 30000,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 0, // No socket timeout for long operations
      connectTimeoutMS: 10000,
    };

    // Connect using mongoose directly for better timeout control
    await mongoose.connect(mongoUri, mongooseOptions);
    logger.info(`Connected to MongoDB database: ${mongoose.connection.db?.databaseName}`);

    const batchProcessor = new AnalyticsBatchProcessor(logger);

    // Process all analytics patterns
    await batchProcessor.processAllPatterns();

    logger.info("Batch analytics processing completed successfully");

    // Close database connection
    await mongoose.disconnect();
  } catch (error) {
    logger.error("Batch analytics processing failed:", error as Error);
    process.exit(1);
  }
}

// Run batch analytics if this script is executed directly
if (require.main === module) {
  runBatchAnalytics();
}

export { runBatchAnalytics };
