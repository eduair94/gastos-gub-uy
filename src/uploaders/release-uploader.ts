import { IRelease, ReleaseModel } from "../database/release-model";
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

      for (const file of files) {
        try {
          const { uploaded, skipped } = await this.processFile(file);
          totalUploaded += uploaded;
          totalSkipped += skipped;

          // Extract year for better logging
          const yearMatch = file.match(/(\d{4})/);
          const year = yearMatch ? yearMatch[1] : "unknown";
          const fileName = file.split(/[/\\]/).pop() || "unknown";

          this.logger.info(`Processed ${fileName} (${year}): ${uploaded} uploaded, ${skipped} skipped`);
        } catch (err) {
          this.logger.error(`Error processing ${file}:`, err as Error);
        }
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
    const yearMatch = filePath.match(/(\d{4})/);
    const year = yearMatch ? parseInt(yearMatch[1], 10) : undefined;

    let uploaded = 0;
    let skipped = 0;
    let inserted = 0;
    let updated = 0;
    let unchanged = 0;

    for (const release of data.releases) {
      try {
        // Validate that the release has the required id field
        if (!release.id) {
          this.logger.warn(`Release missing id field in ${filePath}, skipping`);
          skipped++;
          continue;
        }

        // Add metadata to the release
        const releaseWithMetadata = {
          ...release,
          sourceFileName: fileName,
          sourceYear: year,
        };

        const result = await ReleaseModel.updateOne({ id: release.id }, { $set: releaseWithMetadata }, { upsert: true });

        if (result.upsertedCount && result.upsertedCount > 0) {
          uploaded++; // New record inserted
          inserted++;
        } else if (result.modifiedCount && result.modifiedCount > 0) {
          uploaded++; // Existing record updated
          updated++;
        } else if (result.matchedCount && result.matchedCount > 0) {
          uploaded++; // Record matched but no changes (still counts as processed)
          unchanged++;
        } else {
          skipped++;
        }
      } catch (err) {
        this.logger.error(`Error upserting release ${release.id}:`, err as Error);
        skipped++;
      }
    }

    // Log detailed statistics for this file
    if (inserted > 0 || updated > 0 || unchanged > 0) {
      this.logger.info(`  Details: ${inserted} new, ${updated} updated, ${unchanged} unchanged`);
    }

    return { uploaded, skipped };
  }
}
