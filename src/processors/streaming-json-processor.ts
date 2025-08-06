import * as fs from 'fs';
import { JsonProcessor, Logger } from '../types/interfaces';

/**
 * JSON processor implementation for handling large JSON files
 * Uses streaming to process files without loading them entirely into memory
 */
export class StreamingJsonProcessor implements JsonProcessor {
  private readonly logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Processes a JSON file in batches using streaming
   * Focuses on the "releases" array which contains the actual records
   * @param filePath Path to the JSON file
   * @param batchProcessor Function to process each batch of records
   */
  async processFile(
    filePath: string, 
    batchProcessor: (batch: any[]) => Promise<void>
  ): Promise<void> {
    this.logger.info(`Processing file: ${filePath}`);
    
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    let batch: any[] = [];
    let recordCount = 0;
    const batchSize = 1000; // Process in batches of 1000 records

    try {
      // Read the file and parse the releases array
      const fileContent = fs.readFileSync(filePath, 'utf8');
      const jsonData = JSON.parse(fileContent);
      
      if (!jsonData.releases || !Array.isArray(jsonData.releases)) {
        this.logger.warn(`No releases array found in ${filePath}`);
        return;
      }

      const releases = jsonData.releases;
      this.logger.info(`Found ${releases.length} releases to process`);

      // Process releases in batches
      for (const release of releases) {
        if (typeof release === 'object' && release !== null) {
          batch.push(release);
          recordCount++;

          // Process batch when it reaches the batch size
          if (batch.length >= batchSize) {
            try {
              await batchProcessor(batch);
              this.logger.info(`Processed batch of ${batch.length} records (total: ${recordCount})`);
            } catch (error) {
              this.logger.error(`Error processing batch:`, error as Error);
              throw error;
            }
            batch = []; // Reset batch
          }
        }
      }

      // Process remaining records in the last batch
      if (batch.length > 0) {
        try {
          await batchProcessor(batch);
          this.logger.info(`Processed final batch of ${batch.length} records (total: ${recordCount})`);
        } catch (error) {
          this.logger.error(`Error processing final batch:`, error as Error);
          throw error;
        }
      }

      this.logger.info(`File processing completed. Total records processed: ${recordCount}`);

    } catch (error) {
      this.logger.error(`Error processing file ${filePath}:`, error as Error);
      throw error;
    }
  }



  /**
   * Gets basic information about a JSON file without fully loading it
   * Focuses on the releases array
   */
  async getFileInfo(filePath: string): Promise<{ recordCount: number; sampleRecord: any }> {
    this.logger.info(`Getting file info for: ${filePath}`);
    
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    try {
      // For government data files, we can safely read them to get the releases count
      const fileContent = fs.readFileSync(filePath, 'utf8');
      const jsonData = JSON.parse(fileContent);
      
      if (!jsonData.releases || !Array.isArray(jsonData.releases)) {
        return { recordCount: 0, sampleRecord: null };
      }

      const releases = jsonData.releases;
      const recordCount = releases.length;
      const sampleRecord = releases.length > 0 ? releases[0] : null;

      return { recordCount, sampleRecord };

    } catch (error) {
      this.logger.error(`Error getting file info for ${filePath}:`, error as Error);
      throw error;
    }
  }
}
