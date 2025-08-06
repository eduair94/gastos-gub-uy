import { config } from 'dotenv';
import { DatabaseService } from './services/database-service';
import { Logger } from './services/logger-service';
import { ReleaseModel } from './database/release-model';

// Load environment variables
config();

async function clearDatabase(): Promise<void> {
  const mongoUri = process.env.MONGODB_URI;
  
  if (!mongoUri) {
    console.error('MONGODB_URI environment variable is required');
    process.exit(1);
  }

  const databaseService = new DatabaseService();
  const logger = new Logger();

  try {
    await databaseService.connect(mongoUri);
    logger.info('Connected to MongoDB');
    
    const deleteResult = await ReleaseModel.deleteMany({});
    logger.info(`Deleted ${deleteResult.deletedCount} releases from database`);
    
    await databaseService.disconnect();
    logger.info('Database cleared successfully');
    process.exit(0);
  } catch (error) {
    logger.error('Failed to clear database:', error as Error);
    process.exit(1);
  }
}

// Run the application
if (require.main === module) {
  clearDatabase();
}
