import { ReleaseModel } from "../../shared/models";
import { IRelease } from "../../shared/types";
import { IDatabaseService } from "../services/database-service";
import { ILogger } from "../services/logger-service";
import { ReleaseRSSFetcher } from "../services/release-rss-fetcher";
import {
    calculateTotalAmounts,
    fetchCurrencyRates,
    fetchUYIRate,
    type CurrencyResponse
} from "../utils/amount-calculator";

export interface IReleaseUploaderNew {
  uploadReleasesFromWeb(): Promise<void>;
}

export class ReleaseUploaderNew implements IReleaseUploaderNew {
  private rssFetcher: ReleaseRSSFetcher;

  constructor(
    private databaseService: IDatabaseService,
    private logger: ILogger,
    private mongoUri: string
  ) {
    this.rssFetcher = new ReleaseRSSFetcher('GastosGubUy-ReleaseUploader/1.0');
  }

  async uploadReleasesFromWeb(): Promise<void> {
    try {
      await this.databaseService.connect(this.mongoUri);
      this.logger.info("Connected to MongoDB");

      // Fetch current currency exchange rates
      this.logger.info("Fetching current currency exchange rates...");
      const currencyRates = await fetchCurrencyRates();
      
      // Fetch current UYI (Unidades Indexadas) exchange rate
      const uyiRate = await fetchUYIRate();
      this.logger.info("Currency rates fetched successfully");

      const currentDate = new Date();
      const currentYear = currentDate.getFullYear();
      const currentMonth = currentDate.getMonth() + 1;

      this.logger.info(`Starting web-based upload for ${currentYear} from January to ${currentMonth.toString().padStart(2, '0')}`);

      // Determine months to scrape (from January 2025 to current month)
      const monthsToScrape: number[] = [];
      
      if (currentYear === 2025) {
        // Same year - scrape from January to current month
        for (let month = 1; month <= currentMonth; month++) {
          monthsToScrape.push(month);
        }
      } else if (currentYear > 2025) {
        // Future year - scrape all of 2025 and current year up to current month
        this.logger.info('Current year is beyond 2025, scraping all of 2025 and current year...');
        // First, scrape all of 2025
        for (let month = 1; month <= 12; month++) {
          monthsToScrape.push(month);
        }
        // Note: This version focuses on 2025 as requested
      }

      this.logger.info(`Will process ${monthsToScrape.length} months: ${monthsToScrape.join(', ')}`);

      let totalUploaded = 0;
      let totalSkipped = 0;
      let totalProcessed = 0;

      // Process each month
      for (const month of monthsToScrape) {
        const monthStr = month.toString().padStart(2, '0');
        this.logger.info(`Processing 2025-${monthStr}...`);

        try {
          // Process releases with batch uploading (fetch and upload in batches)
          this.logger.info(`Processing 2025-${monthStr} with batch uploading (200 per batch)...`);
          const result = await this.processReleasesInBatches(
            2025,
            month,
            currencyRates,
            uyiRate,
            monthStr
          );

          totalUploaded += result.uploaded;
          totalSkipped += result.skipped;
          totalProcessed += result.totalProcessed;

          this.logger.info(`2025-${monthStr} complete: ${result.uploaded} uploaded, ${result.skipped} skipped`);

          // Add brief delay between months (reduced since we're using parallel processing)
          if (month < monthsToScrape[monthsToScrape.length - 1]) {
            this.logger.info("Waiting 2 seconds before next month...");
            await this.delay(2000);
          }

        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          this.logger.error(`Error processing 2025-${monthStr}:`, errorMessage);
          // Continue with next month instead of failing completely
        }
      }

      this.logger.info(`Web upload complete. Total: ${totalProcessed} processed, ${totalUploaded} uploaded, ${totalSkipped} skipped`);

    } catch (err) {
      this.logger.error("Failed to upload releases from web:", err as Error);
      throw err;
    } finally {
      if (this.databaseService.isConnected()) {
        await this.databaseService.disconnect();
        this.logger.info("Disconnected from MongoDB");
      }
    }
  }

  private async processReleasesInBatches(
    year: number,
    month: number,
    currencyRates: CurrencyResponse | null,
    uyiRate: number | null,
    monthStr: string
  ): Promise<{ uploaded: number; skipped: number; totalProcessed: number }> {
    // First get the list of release IDs for this month
    const releaseIds = await this.rssFetcher.fetchReleaseIds(year, month);
    
    if (releaseIds.length === 0) {
      this.logger.warn(`No releases found for ${year}-${monthStr}`);
      return { uploaded: 0, skipped: 0, totalProcessed: 0 };
    }

    this.logger.info(`Found ${releaseIds.length} releases for ${year}-${monthStr}. Checking which ones already exist...`);

    // Extract just the IDs for database lookup
    const releaseIdStrings = releaseIds.map(release => release.id);
    
    // Check which releases already exist in the database
    const existingReleases = await ReleaseModel.find(
      { id: { $in: releaseIdStrings } }, 
      { id: 1 }
    ).lean();
    
    const existingIds = new Set(existingReleases.map(release => release.id));
    
    // Filter out releases that already exist
    const newReleaseIds = releaseIds.filter(release => !existingIds.has(release.id));
    
    this.logger.info(`Found ${existingIds.size} existing releases, ${newReleaseIds.length} new releases to process`);
    
    if (newReleaseIds.length === 0) {
      this.logger.info(`All releases for ${year}-${monthStr} already exist in database`);
      return { uploaded: 0, skipped: releaseIds.length, totalProcessed: releaseIds.length };
    }

    let totalUploaded = 0;
    let totalSkipped = 0;
    let totalProcessed = 0;
    const FETCH_BATCH_SIZE = 200; // Process 200 new releases at a time

    // Process only new releases in batches
    for (let i = 0; i < newReleaseIds.length; i += FETCH_BATCH_SIZE) {
      const batchIds = newReleaseIds.slice(i, i + FETCH_BATCH_SIZE);
      const batchNumber = Math.floor(i / FETCH_BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(newReleaseIds.length / FETCH_BATCH_SIZE);

      this.logger.info(`Processing batch ${batchNumber}/${totalBatches} (${batchIds.length} new releases)...`);

      try {
        // Prepare batch data for parallel fetching
        const batchPromises = batchIds.map(async (releaseInfo) => {
          try {
            // Fetch OCDS data for this individual release
            const releaseData = await this.rssFetcher.fetchReleaseData(releaseInfo.link);
            return {
              ...releaseInfo,
              ocdsData: releaseData,
              fetchError: undefined
            };
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return {
              ...releaseInfo,
              ocdsData: undefined,
              fetchError: errorMessage
            };
          }
        });

        // Execute all fetches in this batch with controlled concurrency (20 at a time)
        const batchResults = [];
        const concurrency = 20;
        for (let j = 0; j < batchPromises.length; j += concurrency) {
          const concurrentBatch = batchPromises.slice(j, j + concurrency);
          const concurrentResults = await Promise.all(concurrentBatch);
          batchResults.push(...concurrentResults);
          
          // Small delay between concurrent groups
          if (j + concurrency < batchPromises.length) {
            await this.delay(1000); // 1 second between concurrent groups
          }
        }

        this.logger.info(`Fetched data for batch ${batchNumber}, processing...`);

        // Process and upload this batch immediately
        const batchResult = await this.processReleasesFromWeb(
          batchResults,
          currencyRates,
          uyiRate,
          year,
          monthStr
        );

        totalUploaded += batchResult.uploaded;
        totalSkipped += batchResult.skipped;
        totalProcessed += batchResults.length;

        this.logger.info(`Batch ${batchNumber} complete: ${batchResult.uploaded} uploaded, ${batchResult.skipped} skipped`);

        // Delay between batches to avoid overwhelming the server
        if (i + FETCH_BATCH_SIZE < newReleaseIds.length) {
          this.logger.info("Waiting 2 seconds before next batch...");
          await this.delay(2000);
        }

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error(`Error processing batch ${batchNumber}:`, errorMessage);
        totalSkipped += batchIds.length;
        // Continue with next batch instead of failing completely
      }
    }

    // Add the existing releases to the skipped count for accurate reporting
    totalSkipped += existingIds.size;
    totalProcessed += existingIds.size;

    return { uploaded: totalUploaded, skipped: totalSkipped, totalProcessed };
  }

  private async processReleasesFromWeb(
    releasesWithData: any[],
    currencyRates: CurrencyResponse | null,
    uyiRate: number | null,
    year: number,
    month: string
  ): Promise<{ uploaded: number; skipped: number }> {
    let skipped = 0;
    let processed = 0;
    const bulkOps: any[] = [];
    const BATCH_SIZE = 500; // Smaller database batch size for more frequent uploads

    this.logger.info(`Processing ${releasesWithData.length} releases for ${year}-${month}...`);

    for (const releaseData of releasesWithData) {
      try {
        // Skip if we couldn't fetch the OCDS data
        if (!releaseData.ocdsData || releaseData.fetchError) {
          if (releaseData.fetchError) {
            this.logger.warn(`Skipping ${releaseData.id} due to fetch error: ${releaseData.fetchError}`);
          }
          skipped++;
          continue;
        }

        // Extract the actual OCDS release data
        const ocdsRelease = releaseData.ocdsData.releases?.[0];
        if (!ocdsRelease) {
          this.logger.warn(`No OCDS release data found for ${releaseData.id}`);
          skipped++;
          continue;
        }

        // Validate that the release has the required id field
        if (!ocdsRelease.id) {
          this.logger.warn(`Release missing id field: ${releaseData.id}, skipping`);
          skipped++;
          continue;
        }

        // Create IRelease object from OCDS data
        const release: IRelease = {
          id: ocdsRelease.id,
          ocid: ocdsRelease.ocid,
          date: ocdsRelease.date ? new Date(ocdsRelease.date) : new Date(),
          tag: ocdsRelease.tag || [],
          initiationType: ocdsRelease.initiationType,
          parties: ocdsRelease.parties || [],
          buyer: ocdsRelease.buyer || null,
          tender: ocdsRelease.tender || null,
          awards: ocdsRelease.awards || [],
          // Add any other fields that exist in your IRelease interface
        } as IRelease;

        // Process parties data (similar to original uploader)
        if (release.parties?.length) {
          const buyer = release.parties.find((p: any) => p.roles && p.roles.includes('buyer'));
          if (buyer) release.buyer = buyer;
          const supplier = release.parties.find((p: any) => p.roles && p.roles.includes('supplier'));
          if (supplier) release.supplier = supplier;
        }

        // Calculate total amounts from awards (multicurrency support with conversion)
        const amountData = calculateTotalAmounts(
          release.awards || [], 
          currencyRates, 
          uyiRate,
          {
            includeVersionInfo: true,
            wasVersionUpdate: false, // This is initial upload, not an update
            previousAmount: null,
          }
        );

        // Add metadata to the release (matching original uploader structure)
        const releaseWithMetadata = {
          ...release,
          sourceFileName: "web", // As requested
          sourceYear: year,      // As requested
          amount: amountData,    // As requested
          // Additional metadata from web fetch
          webFetchDate: new Date(),
          rssTitle: releaseData.title,
          rssDescription: releaseData.description,
          rssPublishDate: releaseData.publishDate,
          rssLink: releaseData.link
        };

        // Add bulk operation - keep upsert for safety in case of race conditions
        bulkOps.push({
          updateOne: {
            filter: { id: release.id },
            update: { $set: releaseWithMetadata },
            upsert: true
          }
        });

        processed++;

      } catch (err) {
        this.logger.error(`Error preparing release ${releaseData.id}:`, err as Error);
        skipped++;
      }
    }

    if (bulkOps.length === 0) {
      this.logger.warn(`No valid releases to process for ${year}-${month}`);
      return { uploaded: 0, skipped };
    }

    this.logger.info(`Executing ${bulkOps.length} database operations for ${year}-${month}...`);

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

        this.logger.info(`Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${result.upsertedCount || 0} inserted, ${result.modifiedCount || 0} updated, ${(result.matchedCount || 0) - (result.modifiedCount || 0)} unchanged`);
      } catch (err) {
        this.logger.error(`Error executing bulk write batch:`, err as Error);
        // Continue with remaining batches instead of failing completely
        this.logger.info("Continuing with remaining batches...");
      }
    }

    const uploaded = totalInserted + totalUpdated + totalUnchanged;

    // Log detailed statistics for this month
    if (totalInserted > 0 || totalUpdated > 0 || totalUnchanged > 0) {
      this.logger.info(`  Details for ${year}-${month}: ${totalInserted} new, ${totalUpdated} updated, ${totalUnchanged} unchanged`);
    }

    return { uploaded, skipped };
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Execute if this module is run directly
if (require.main === module) {
  // Import required dependencies for direct execution
  const { DatabaseService } = require("../services/database-service");
  const { Logger } = require("../services/logger-service");
  
  async function main() {
    console.log('🚀 Starting web-based release upload...');
    
    // MongoDB URI (adjust as needed)
    const mongoUri = process.env.MONGODB_URI || "mongodb://localhost:27017/gastos_gub";
    
    const databaseService = new DatabaseService();
    const logger = new Logger();
    
    const uploader = new ReleaseUploaderNew(
      databaseService,
      logger,
      mongoUri
    );

    try {
      await uploader.uploadReleasesFromWeb();
      console.log('✅ Web upload completed successfully!');
    } catch (error) {
      console.error('❌ Web upload failed:', error);
      process.exit(1);
    }
  }
  
  main().catch(error => {
    console.error('💥 Unhandled error:', error);
    process.exit(1);
  });
}
