import mongoose from "mongoose";
import { MONGO_CONFIG } from "./config/config";
import { ReleaseModel } from "./database/release-model";
import { Logger } from "./services/logger-service";

const logger = new Logger();

async function debugDataStructure() {
  try {
    logger.info("Starting data structure analysis...");

    // Connect to MongoDB
    await mongoose.connect(MONGO_CONFIG.uri);
    logger.info(`Connected to MongoDB at ${MONGO_CONFIG.uri}`);

    // Check total count
    const totalCount = await ReleaseModel.countDocuments();
    logger.info(`Total documents in releases collection: ${totalCount}`);

    if (totalCount === 0) {
      logger.info("No data found in releases collection");
      await mongoose.disconnect();
      return;
    }

    // Get a sample document to analyze structure
    const sampleDoc = await ReleaseModel.findOne().lean();
    logger.info("Sample document structure:");
    logger.info(JSON.stringify(sampleDoc, null, 2));

    // Check for awards structure
    const docsWithAwards = await ReleaseModel.countDocuments({ awards: { $exists: true, $ne: [] } });
    logger.info(`Documents with awards: ${docsWithAwards}`);

    // Check for supplier structure
    const docsWithSuppliers = await ReleaseModel.countDocuments({ "awards.suppliers": { $exists: true } });
    logger.info(`Documents with awards.suppliers: ${docsWithSuppliers}`);

    // Check for items structure
    const docsWithItems = await ReleaseModel.countDocuments({ "awards.items": { $exists: true } });
    logger.info(`Documents with awards.items: ${docsWithItems}`);

    // Check for buyer structure
    const docsWithBuyers = await ReleaseModel.countDocuments({ buyer: { $exists: true } });
    logger.info(`Documents with buyer: ${docsWithBuyers}`);

    // Sample some award structures
    const docWithAwards = await ReleaseModel.findOne({ awards: { $exists: true, $ne: [] } }).lean();
    if (docWithAwards && docWithAwards.awards) {
      logger.info("Sample awards structure:");
      logger.info(JSON.stringify(docWithAwards.awards[0], null, 2));
    }

    await mongoose.disconnect();
    logger.info("Data structure analysis completed");
  } catch (error) {
    logger.error("Data structure analysis failed:", error as Error);
    process.exit(1);
  }
}

// Run debug if this script is executed directly
if (require.main === module) {
  debugDataStructure();
}

export { debugDataStructure };
