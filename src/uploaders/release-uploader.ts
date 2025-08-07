import { ReleaseModel } from "../../shared/models";
import { IRelease } from "../../shared/types";
import { IDatabaseService } from "../services/database-service";
import { IFileService } from "../services/file-service";
import { ILogger } from "../services/logger-service";

export interface IReleaseUploader {
  uploadReleases(dataDirectory: string): Promise<void>;
}

export interface IJsonData {
  releases?: IRelease[];
}

export class ReleaseUploader implements IReleaseUploader {
  constructor(
    private fileService: IFileService,
    private databaseService: IDatabaseService,
    private logger: ILogger,
    private mongoUri: string
  ) {}

  async uploadReleases(dataDirectory: string): Promise<void> {
    try {
      await this.databaseService.connect(this.mongoUri);
      this.logger.info("Connected to MongoDB");

      const files = this.fileService.findJsonFiles(dataDirectory);
      this.logger.info(`Found ${files.length} JSON files.`);

      let totalUploaded = 0;
      let totalSkipped = 0;

      // Process files in concurrent batches
      const CONCURRENT_FILES = 3; // Process up to 3 files simultaneously
      const fileBatches: string[][] = [];
      
      // Split files into batches for concurrent processing
      for (let i = 0; i < files.length; i += CONCURRENT_FILES) {
        fileBatches.push(files.slice(i, i + CONCURRENT_FILES));
      }

      this.logger.info(`Processing ${files.length} files in ${fileBatches.length} concurrent batches`);

      for (let batchIndex = 0; batchIndex < fileBatches.length; batchIndex++) {
        const batch = fileBatches[batchIndex];
        this.logger.info(`Processing file batch ${batchIndex + 1}/${fileBatches.length} (${batch.length} files)`);

        // Process files in this batch concurrently
        const batchPromises = batch.map(async (file) => {
          try {
            const result = await this.processFile(file);
            
            // Extract year for better logging
            const yearMatch = file.match(/(\d{4})/);
            const year = yearMatch ? yearMatch[1] : "unknown";
            const fileName = file.split(/[/\\]/).pop() || "unknown";

            this.logger.info(`Processed ${fileName} (${year}): ${result.uploaded} uploaded, ${result.skipped} skipped`);
            return result;
          } catch (err) {
            this.logger.error(`Error processing ${file}:`, err as Error);
            return { uploaded: 0, skipped: 0 };
          }
        });

        // Wait for all files in this batch to complete
        const batchResults = await Promise.all(batchPromises);
        
        // Aggregate results from this batch
        const batchUploaded = batchResults.reduce((sum, result) => sum + result.uploaded, 0);
        const batchSkipped = batchResults.reduce((sum, result) => sum + result.skipped, 0);
        
        totalUploaded += batchUploaded;
        totalSkipped += batchSkipped;

        this.logger.info(`Batch ${batchIndex + 1} complete: ${batchUploaded} uploaded, ${batchSkipped} skipped`);
      }

      this.logger.info(`Upload complete. Total: ${totalUploaded} uploaded, ${totalSkipped} skipped`);
    } catch (err) {
      this.logger.error("Failed to upload releases:", err as Error);
      throw err;
    } finally {
      if (this.databaseService.isConnected()) {
        await this.databaseService.disconnect();
        this.logger.info("Disconnected from MongoDB");
      }
    }
  }

  private async processFile(filePath: string): Promise<{ uploaded: number; skipped: number }> {
    const data = this.fileService.readJsonFile<IJsonData>(filePath);

    if (!Array.isArray(data.releases)) {
      this.logger.warn(`No releases array found in ${filePath}`);
      return { uploaded: 0, skipped: 0 };
    }

    // Extract file name and year from file path
    const fileName = filePath.split(/[/\\]/).pop() || "unknown";
    const sourceYear = parseInt(fileName.split('.')[0].split(/-/g).at(-1) as string, 10);

    let skipped = 0;
    const bulkOps: any[] = [];
    const BATCH_SIZE = 10000; // Process in batches to avoid memory issues

    // Prepare all bulk operations
    for (const release of data.releases) {
      try {
        // Validate that the release has the required id field
        if (!release.id) {
          this.logger.warn(`Release missing id field in ${filePath}, skipping`);
          skipped++;
          continue;
        }

        // Process parties data
        if(release?.parties?.length) {
          const buyer = release.parties.find(p => p.roles.includes('buyer'));
          if(buyer) release.buyer = buyer;
          const supplier = release.parties.find(p => p.roles.includes('supplier'));
          if(supplier) release.supplier = supplier;
        }

        // Process date field
        if(release?.date) {
          release.date = new Date(release.date);
        }

        // Add metadata to the release
        const releaseWithMetadata = {
          ...release,
          sourceFileName: fileName,
          sourceYear,
        };

        // Add bulk operation
        bulkOps.push({
          updateOne: {
            filter: { id: release.id },
            update: { $set: releaseWithMetadata },
            upsert: true
          }
        });

      } catch (err) {
        this.logger.error(`Error preparing release ${release.id}:`, err as Error);
        skipped++;
      }
    }

    if (bulkOps.length === 0) {
      this.logger.warn(`No valid releases to process in ${filePath}`);
      return { uploaded: 0, skipped };
    }

    // Execute bulk operations in batches
    let totalInserted = 0;
    let totalUpdated = 0;
    let totalUnchanged = 0;

    for (let i = 0; i < bulkOps.length; i += BATCH_SIZE) {
      const batch = bulkOps.slice(i, i + BATCH_SIZE);
      
      try {
        const result = await ReleaseModel.bulkWrite(batch, { ordered: false });
        
        totalInserted += result.upsertedCount || 0;
        totalUpdated += result.modifiedCount || 0;
        totalUnchanged += (result.matchedCount || 0) - (result.modifiedCount || 0);

        this.logger.info(`Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length} operations completed`);
      } catch (err) {
        this.logger.error(`Error executing bulk write batch:`, err as Error);
        // In case of batch failure, we could implement retry logic here
        throw err;
      }
    }

    const uploaded = totalInserted + totalUpdated + totalUnchanged;

    // Log detailed statistics for this file
    if (totalInserted > 0 || totalUpdated > 0 || totalUnchanged > 0) {
      this.logger.info(`  Details: ${totalInserted} new, ${totalUpdated} updated, ${totalUnchanged} unchanged`);
    }

    return { uploaded, skipped };
  }
}
