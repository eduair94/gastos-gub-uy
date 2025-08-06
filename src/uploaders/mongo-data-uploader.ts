import * as fs from 'fs';
import * as path from 'path';
import { 
  DataUploader, 
  DatabaseClient, 
  JsonProcessor, 
  UploadStats, 
  Logger 
} from '../types/interfaces';

/**
 * Data uploader implementation following Single Responsibility Principle
 * Handles uploading JSON data to database in an efficient manner
 */
export class MongoDataUploader implements DataUploader {
  private readonly dbClient: DatabaseClient;
  private readonly jsonProcessor: JsonProcessor;
  private readonly logger: Logger;

  constructor(
    dbClient: DatabaseClient,
    jsonProcessor: JsonProcessor,
    logger: Logger
  ) {
    this.dbClient = dbClient;
    this.jsonProcessor = jsonProcessor;
    this.logger = logger;
  }

  /**
   * Uploads a single JSON file to the database
   */
  async uploadFile(filePath: string): Promise<void> {
    this.logger.info(`Starting upload for file: ${filePath}`);
    
    const startTime = Date.now();
    let totalRecords = 0;

    try {
      // Process the file in batches
      await this.jsonProcessor.processFile(filePath, async (batch: any[]) => {
        // Add metadata to each record
        const enrichedBatch = batch.map(record => ({
          ...record,
          _uploadedAt: new Date(),
          _sourceFile: path.basename(filePath),
          _fileProcessedAt: new Date()
        }));

        await this.dbClient.insertMany(enrichedBatch);
        totalRecords += enrichedBatch.length;
      });

      const duration = Date.now() - startTime;
      this.logger.info(`Upload completed for ${filePath}`);
      this.logger.info(`Records uploaded: ${totalRecords}, Duration: ${duration}ms`);

    } catch (error) {
      this.logger.error(`Failed to upload file ${filePath}:`, error as Error);
      throw error;
    }
  }

  /**
   * Uploads all JSON files in a directory to the database
   */
  async uploadDirectory(dirPath: string): Promise<void> {
    this.logger.info(`Starting upload for directory: ${dirPath}`);
    
    if (!fs.existsSync(dirPath)) {
      throw new Error(`Directory not found: ${dirPath}`);
    }

    const stats: UploadStats = {
      totalFiles: 0,
      totalRecords: 0,
      successfulFiles: 0,
      failedFiles: 0,
      duration: 0
    };

    const startTime = Date.now();

    try {
      // Get all JSON files in the directory and subdirectories
      const jsonFiles = this.getJsonFiles(dirPath);
      stats.totalFiles = jsonFiles.length;

      this.logger.info(`Found ${jsonFiles.length} JSON files to upload`);

      // Process each file
      for (const filePath of jsonFiles) {
        try {
          await this.uploadFile(filePath);
          stats.successfulFiles++;
          
          // Get record count for this file
          const recordCount = await this.getRecordCount(filePath);
          stats.totalRecords += recordCount;

        } catch (error) {
          this.logger.error(`Failed to upload ${filePath}:`, error as Error);
          stats.failedFiles++;
          // Continue with other files
        }
      }

      stats.duration = Date.now() - startTime;

      this.logger.info('Upload summary:');
      this.logger.info(`  Total files: ${stats.totalFiles}`);
      this.logger.info(`  Successful uploads: ${stats.successfulFiles}`);
      this.logger.info(`  Failed uploads: ${stats.failedFiles}`);
      this.logger.info(`  Total records: ${stats.totalRecords}`);
      this.logger.info(`  Duration: ${stats.duration}ms`);

    } catch (error) {
      this.logger.error(`Error uploading directory ${dirPath}:`, error as Error);
      throw error;
    }
  }

  /**
   * Uploads files with progress tracking and error recovery
   */
  async uploadDirectoryWithProgress(dirPath: string): Promise<UploadStats> {
    this.logger.info(`Starting progressive upload for directory: ${dirPath}`);
    
    const stats: UploadStats = {
      totalFiles: 0,
      totalRecords: 0,
      successfulFiles: 0,
      failedFiles: 0,
      duration: 0
    };

    const startTime = Date.now();

    try {
      const jsonFiles = this.getJsonFiles(dirPath);
      stats.totalFiles = jsonFiles.length;

      this.logger.info(`Found ${jsonFiles.length} JSON files to upload`);

      for (let i = 0; i < jsonFiles.length; i++) {
        const filePath = jsonFiles[i];
        const fileName = path.basename(filePath);
        
        this.logger.info(`[${i + 1}/${jsonFiles.length}] Processing: ${fileName}`);

        try {
          const fileStartTime = Date.now();
          await this.uploadFile(filePath);
          
          const fileRecordCount = await this.getRecordCount(filePath);
          stats.totalRecords += fileRecordCount;
          stats.successfulFiles++;

          const fileDuration = Date.now() - fileStartTime;
          this.logger.info(`  ✅ Completed in ${fileDuration}ms (${fileRecordCount} records)`);

        } catch (error) {
          this.logger.error(`  ❌ Failed: ${(error as Error).message}`);
          stats.failedFiles++;
        }

        // Progress indicator
        const progress = ((i + 1) / jsonFiles.length * 100).toFixed(1);
        this.logger.info(`Progress: ${progress}% (${i + 1}/${jsonFiles.length})`);
      }

      stats.duration = Date.now() - startTime;
      return stats;

    } catch (error) {
      stats.duration = Date.now() - startTime;
      this.logger.error(`Error in progressive upload:`, error as Error);
      throw error;
    }
  }

  /**
   * Recursively gets all JSON files in a directory
   */
  private getJsonFiles(dirPath: string): string[] {
    const jsonFiles: string[] = [];

    const traverse = (currentPath: string) => {
      const items = fs.readdirSync(currentPath);

      for (const item of items) {
        const itemPath = path.join(currentPath, item);
        const stat = fs.statSync(itemPath);

        if (stat.isDirectory()) {
          traverse(itemPath); // Recursively traverse subdirectories
        } else if (stat.isFile() && item.endsWith('.json')) {
          jsonFiles.push(itemPath);
        }
      }
    };

    traverse(dirPath);
    return jsonFiles.sort(); // Sort for consistent processing order
  }

  /**
   * Gets the approximate record count for a file
   */
  private async getRecordCount(filePath: string): Promise<number> {
    try {
      const fileInfo = await this.jsonProcessor.getFileInfo(filePath);
      return fileInfo.recordCount;
    } catch (error) {
      this.logger.warn(`Could not get record count for ${filePath}: ${(error as Error).message}`);
      return 0;
    }
  }

  /**
   * Checks if a file has already been uploaded (based on modification time)
   */
  async isFileAlreadyUploaded(_filePath: string): Promise<boolean> {
    // This would require implementing a tracking mechanism
    // For now, we'll assume files are not uploaded
    return false;
  }

  /**
   * Creates a backup of the database before major operations
   */
  async createBackup(): Promise<void> {
    this.logger.info('Creating database backup...');
    // Implementation would depend on MongoDB backup strategy
    // This is a placeholder for the backup functionality
    this.logger.info('Backup completed (placeholder implementation)');
  }
}
