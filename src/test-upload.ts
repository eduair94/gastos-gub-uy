import { config } from 'dotenv';
import * as path from 'path';
import { ReleaseUploader } from './uploaders/release-uploader';
import { FileService } from './services/file-service';
import { DatabaseService } from './services/database-service';
import { Logger } from './services/logger-service';
import { ReleaseModel } from './database/release-model';

// Load environment variables
config();

const DATA_DIR = path.join(__dirname, '..', 'db');

async function testUploadAndVerification(): Promise<void> {
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
    // Upload all releases
    await releaseUploader.uploadReleases(DATA_DIR);
    
    // Verification: Connect to verify data was saved correctly
    await databaseService.connect(mongoUri);
    
    // Test: Find a specific release and verify it has all expected fields
    const sampleRelease = await ReleaseModel.findOne({ id: 'adjudicacion-11363' });
    
    if (sampleRelease) {
      logger.info('Sample release found:');
      logger.info(`- ID: ${sampleRelease.id}`);
      logger.info(`- Date: ${sampleRelease.date}`);
      logger.info(`- Source File: ${sampleRelease.sourceFileName || 'N/A'}`);
      logger.info(`- Source Year: ${sampleRelease.sourceYear || 'N/A'}`);
      logger.info(`- Has parties: ${sampleRelease.parties ? sampleRelease.parties.length : 0}`);
      logger.info(`- Has buyer: ${sampleRelease.buyer ? 'Yes' : 'No'}`);
      logger.info(`- Has tender: ${sampleRelease.tender ? 'Yes' : 'No'}`);
      logger.info(`- Has awards: ${sampleRelease.awards ? sampleRelease.awards.length : 0}`);
      
      if (sampleRelease.awards && sampleRelease.awards.length > 0) {
        const award = sampleRelease.awards[0];
        logger.info(`- First award ID: ${award.id}`);
        logger.info(`- Award items: ${award.items ? award.items.length : 0}`);
        logger.info(`- Award suppliers: ${award.suppliers ? award.suppliers.length : 0}`);
        
        if (award.items && award.items.length > 0) {
          const item = award.items[0];
          logger.info(`- First item description: ${item.description || 'N/A'}`);
          logger.info(`- First item quantity: ${item.quantity}`);
          logger.info(`- First item value: ${item.unit?.value?.amount || 'N/A'} ${item.unit?.value?.currency || ''}`);
        }
      }
    } else {
      logger.warn('Sample release not found - this indicates an issue with the upload');
    }
    
    // Count total releases
    const totalCount = await ReleaseModel.countDocuments();
    logger.info(`Total releases in database: ${totalCount}`);
    
    // Show distribution by year
    const yearDistribution = await ReleaseModel.aggregate([
      { $group: { _id: '$sourceYear', count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);
    
    logger.info('Distribution by source year:');
    yearDistribution.forEach(item => {
      logger.info(`  ${item._id || 'Unknown'}: ${item.count} releases`);
    });
    
    // Show some sample source files
    const sampleSources = await ReleaseModel.aggregate([
      { $group: { _id: '$sourceFileName', count: { $sum: 1 } } },
      { $limit: 10 }
    ]);
    
    logger.info('Sample source files:');
    sampleSources.forEach(item => {
      logger.info(`  ${item._id || 'Unknown'}: ${item.count} releases`);
    });
    
    await databaseService.disconnect();
    process.exit(0);
  } catch (error) {
    logger.error('Application failed:', error as Error);
    process.exit(1);
  }
}

// Run the application
if (require.main === module) {
  testUploadAndVerification();
}
