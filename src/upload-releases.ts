import { config } from 'dotenv';
import * as path from 'path';
import { ReleaseUploader } from './uploaders/release-uploader';
import { FileService } from './services/file-service';
import { DatabaseService } from './services/database-service';
import { Logger } from './services/logger-service';

// Load environment variables
config();

const DATA_DIR = path.join(__dirname, '..', 'db');

async function main(): Promise<void> {
  const mongoUri = process.env.MONGODB_URI;
  
  if (!mongoUri) {
    console.error('MONGODB_URI environment variable is required');
    process.exit(1);
  }

  // Dependency injection - following SOLID principles
  const fileService = new FileService();
  const databaseService = new DatabaseService();
  const logger = new Logger();
  
  const releaseUploader = new ReleaseUploader(
    fileService,
    databaseService,
    logger,
    mongoUri
  );

  try {
    await releaseUploader.uploadReleases(DATA_DIR);
    process.exit(0);
  } catch (error) {
    logger.error('Application failed:', error as Error);
    process.exit(1);
  }
}

// Run the application
if (require.main === module) {
  main();
}
