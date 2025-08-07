import { config } from "dotenv";
import { mongoUri } from "../shared/config";
import { ReleaseModel } from "../shared/models";
import { DatabaseService } from "./services/database-service";
import { Logger } from "./services/logger-service";

// Load environment variables
config();

async function clearDatabase(): Promise<void> {

  if (!mongoUri) {
    console.error("MONGODB_URI environment variable is required");
    process.exit(1);
  }

  const databaseService = new DatabaseService();
  const logger = new Logger();

  try {
    await databaseService.connect(mongoUri);
    logger.info("Connected to MongoDB");

    const deleteResult = await ReleaseModel.deleteMany({});
    logger.info(`Deleted ${deleteResult.deletedCount} releases from database`);

    await databaseService.disconnect();
    logger.info("Database cleared successfully");
    process.exit(0);
  } catch (error) {
    logger.error("Failed to clear database:", error as Error);
    process.exit(1);
  }
}

// Run the application
if (require.main === module) {
  clearDatabase();
}
