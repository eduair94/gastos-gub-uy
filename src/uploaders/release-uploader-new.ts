import { ReleaseModel } from "../../shared/models";
import { IRelease } from "../../shared/types";
import { hasVerifiedOverride } from "../../shared/utils/verified-override";
import { IDatabaseService } from "../services/database-service";
import { ILogger } from "../services/logger-service";
import { ReleaseRSSFetcher } from "../services/release-rss-fetcher";
import { calculateTotalAmounts, fetchCurrencyRates, fetchUYIRate, type CurrencyResponse } from "../utils/amount-calculator";
import { attachProbedReiteraciones, type ReiteracionBudget } from "../jobs/releases/reiteracion-probe";

// Per-run cap on reiteración-del-gasto HEAD-probes against the government site. Steady
// state is small (only releases with a fresh awardNotice and no prior probe); this mainly
// bounds a full historical catch-up run. Backfilling the existing backlog is the dedicated
// job (src/jobs/backfill-reiteracion-docs.ts).
const REITER_PROBE_MAX_PER_RUN = Number(process.env.REITER_PROBE_MAX_PER_RUN ?? 500);

export interface IReleaseUploaderNew {
  uploadReleasesFromWeb(): Promise<void>;
  uploadCurrentMonthFromWeb(): Promise<void>;
  uploadLastSevenDaysFromWeb(): Promise<void>;
  reconcileNonFinalReleases(monthsBack?: number): Promise<{ scanned: number; updated: number; failed: number }>;
}

export class ReleaseUploaderNew implements IReleaseUploaderNew {
  private rssFetcher: ReleaseRSSFetcher;

  constructor(
    private databaseService: IDatabaseService,
    private logger: ILogger,
    private mongoUri: string
  ) {
    this.rssFetcher = new ReleaseRSSFetcher("GastosGubUy-ReleaseUploader/1.0");
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

      this.logger.info(`Starting web-based upload for ${currentYear} from January to ${currentMonth.toString().padStart(2, "0")}`);

      // Determine months to scrape (from January 2025 to current month)
      const monthsToScrape: number[] = [];

      if (currentYear === 2025) {
        // Same year - scrape from January to current month
        for (let month = 1; month <= currentMonth; month++) {
          monthsToScrape.push(month);
        }
      } else if (currentYear > 2025) {
        // Future year - scrape all of 2025 and current year up to current month
        this.logger.info("Current year is beyond 2025, scraping all of 2025 and current year...");
        // First, scrape all of 2025
        for (let month = 1; month <= 12; month++) {
          monthsToScrape.push(month);
        }
        // Note: This version focuses on 2025 as requested
      }

      this.logger.info(`Will process ${monthsToScrape.length} months: ${monthsToScrape.join(", ")}`);

      let totalUploaded = 0;
      let totalSkipped = 0;
      let totalProcessed = 0;
      // Shared across every month in this run so the whole backfill respects one probe budget.
      const reiterBudget: ReiteracionBudget = { remaining: REITER_PROBE_MAX_PER_RUN };

      // Process each month
      for (const month of monthsToScrape) {
        const monthStr = month.toString().padStart(2, "0");
        this.logger.info(`Processing 2025-${monthStr}...`);

        try {
          // Process releases with batch uploading (fetch and upload in batches)
          this.logger.info(`Processing 2025-${monthStr} with batch uploading (200 per batch)...`);
          const result = await this.processReleasesInBatches(2025, month, currencyRates, uyiRate, monthStr, reiterBudget);

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

  async uploadCurrentMonthFromWeb(): Promise<void> {
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

      this.logger.info(`Starting current month upload for ${currentYear}-${currentMonth.toString().padStart(2, "0")}`);

      const monthStr = currentMonth.toString().padStart(2, "0");
      const reiterBudget: ReiteracionBudget = { remaining: REITER_PROBE_MAX_PER_RUN };

      try {
        // Process releases with batch uploading (fetch and upload in batches)
        this.logger.info(`Processing ${currentYear}-${monthStr} with batch uploading (200 per batch)...`);
        const result = await this.processReleasesInBatches(currentYear, currentMonth, currencyRates, uyiRate, monthStr, reiterBudget);

        this.logger.info(`${currentYear}-${monthStr} complete: ${result.uploaded} uploaded, ${result.skipped} skipped, ${result.totalProcessed} total processed`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error(`Error processing ${currentYear}-${monthStr}:`, errorMessage);
        throw error; // Re-throw for cron job error handling
      }

      this.logger.info(`Current month upload complete.`);
    } catch (err) {
      this.logger.error("Failed to upload current month releases from web:", err as Error);
      throw err;
    } finally {
      if (this.databaseService.isConnected()) {
        await this.databaseService.disconnect();
        this.logger.info("Disconnected from MongoDB");
      }
    }
  }

  async uploadLastSevenDaysFromWeb(): Promise<void> {
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
      const sevenDaysAgo = new Date(currentDate);
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      this.logger.info(`Starting last 7 days upload (from ${sevenDaysAgo.toISOString().split("T")[0]} to ${currentDate.toISOString().split("T")[0]})`);

      // Determine which months to check (current month and possibly previous month)
      const monthsToCheck = new Set<{ year: number; month: number }>();

      // Add current month
      monthsToCheck.add({
        year: currentDate.getFullYear(),
        month: currentDate.getMonth() + 1,
      });

      // Add previous month if the 7-day window crosses month boundaries
      if (sevenDaysAgo.getMonth() !== currentDate.getMonth() || sevenDaysAgo.getFullYear() !== currentDate.getFullYear()) {
        monthsToCheck.add({
          year: sevenDaysAgo.getFullYear(),
          month: sevenDaysAgo.getMonth() + 1,
        });
      }

      let totalUploaded = 0;
      let totalSkipped = 0;
      let totalProcessed = 0;
      // Shared across every month in this run so the whole daily ingest respects one probe budget.
      const reiterBudget: ReiteracionBudget = { remaining: REITER_PROBE_MAX_PER_RUN };

      // Process each month
      for (const monthInfo of monthsToCheck) {
        const monthStr = monthInfo.month.toString().padStart(2, "0");
        this.logger.info(`Processing ${monthInfo.year}-${monthStr} for last 7 days...`);

        try {
          // Get releases for this month and filter by date
          const result = await this.processLastSevenDaysInMonth(monthInfo.year, monthInfo.month, sevenDaysAgo, currentDate, currencyRates, uyiRate, monthStr, reiterBudget);

          totalUploaded += result.uploaded;
          totalSkipped += result.skipped;
          totalProcessed += result.totalProcessed;

          this.logger.info(`${monthInfo.year}-${monthStr} complete: ${result.uploaded} uploaded, ${result.skipped} skipped from last 7 days`);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          this.logger.error(`Error processing ${monthInfo.year}-${monthStr}:`, errorMessage);
          // Continue with next month instead of failing completely
        }
      }

      this.logger.info(`Last 7 days upload complete. Total: ${totalProcessed} processed, ${totalUploaded} uploaded, ${totalSkipped} skipped`);
    } catch (err) {
      this.logger.error("Failed to upload last 7 days releases from web:", err as Error);
      throw err;
    } finally {
      if (this.databaseService.isConnected()) {
        await this.databaseService.disconnect();
        this.logger.info("Disconnected from MongoDB");
      }
    }
  }

  private async processReleasesInBatches(year: number, month: number, currencyRates: CurrencyResponse | null, uyiRate: number | null, monthStr: string, reiterBudget: ReiteracionBudget): Promise<{ uploaded: number; skipped: number; totalProcessed: number }> {
    // First get the list of release IDs for this month
    const releaseIds = await this.rssFetcher.fetchReleaseIds(year, month);

    if (releaseIds.length === 0) {
      this.logger.warn(`No releases found for ${year}-${monthStr}`);
      return { uploaded: 0, skipped: 0, totalProcessed: 0 };
    }

    this.logger.info(`Found ${releaseIds.length} releases for ${year}-${monthStr}. Checking which ones need to be synced...`);

    // Sync new releases AND releases re-published upstream (see filterReleasesNeedingSync)
    const { toProcess, newCount, updatedCount, unchangedCount } = await this.filterReleasesNeedingSync(releaseIds);

    this.logger.info(`Sync plan for ${year}-${monthStr}: ${newCount} new, ${updatedCount} updated upstream, ${unchangedCount} unchanged`);

    if (toProcess.length === 0) {
      this.logger.info(`All releases for ${year}-${monthStr} are already up to date`);
      return { uploaded: 0, skipped: releaseIds.length, totalProcessed: releaseIds.length };
    }

    let totalUploaded = 0;
    let totalSkipped = 0;
    let totalProcessed = 0;
    const FETCH_BATCH_SIZE = 200; // Process 200 releases at a time

    // Process new + updated releases in batches
    for (let i = 0; i < toProcess.length; i += FETCH_BATCH_SIZE) {
      const batchIds = toProcess.slice(i, i + FETCH_BATCH_SIZE);
      const batchNumber = Math.floor(i / FETCH_BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(toProcess.length / FETCH_BATCH_SIZE);

      this.logger.info(`Processing batch ${batchNumber}/${totalBatches} (${batchIds.length} new/updated releases)...`);

      try {
        // Prepare batch data for parallel fetching
        const batchPromises = batchIds.map(async (releaseInfo) => {
          try {
            // Fetch OCDS data for this individual release
            const releaseData = await this.rssFetcher.fetchReleaseData(releaseInfo.link);
            return {
              ...releaseInfo,
              ocdsData: releaseData,
              fetchError: undefined,
            };
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return {
              ...releaseInfo,
              ocdsData: undefined,
              fetchError: errorMessage,
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
        const batchResult = await this.processReleasesFromWeb(batchResults, currencyRates, uyiRate, year, monthStr, reiterBudget);

        totalUploaded += batchResult.uploaded;
        totalSkipped += batchResult.skipped;
        totalProcessed += batchResults.length;

        this.logger.info(`Batch ${batchNumber} complete: ${batchResult.uploaded} uploaded, ${batchResult.skipped} skipped`);

        // Delay between batches to avoid overwhelming the server
        if (i + FETCH_BATCH_SIZE < toProcess.length) {
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

    // Unchanged releases were intentionally skipped (already up to date)
    totalSkipped += unchangedCount;
    totalProcessed += unchangedCount;

    return { uploaded: totalUploaded, skipped: totalSkipped, totalProcessed };
  }

  private async processReleasesFromWeb(releasesWithData: any[], currencyRates: CurrencyResponse | null, uyiRate: number | null, year: number, month: string, reiterBudget: ReiteracionBudget): Promise<{ uploaded: number; skipped: number }> {
    let skipped = 0;
    let processed = 0;
    const bulkOps: any[] = [];
    const BATCH_SIZE = 500; // Smaller database batch size for more frequent uploads

    this.logger.info(`Processing ${releasesWithData.length} releases for ${year}-${month}...`);

    const prepared: Array<{ release: IRelease; releaseData: any }> = [];

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
          const buyer = release.parties.find((p: any) => p.roles && p.roles.includes("buyer"));
          if (buyer) release.buyer = buyer;
          const supplier = release.parties.find((p: any) => p.roles && p.roles.includes("supplier"));
          if (supplier) release.supplier = supplier;
        }

        prepared.push({ release, releaseData });
      } catch (err) {
        this.logger.error(`Error preparing release ${releaseData.id}:`, err as Error);
        skipped++;
      }
    }

    // Fill the "reiteración del gasto" gap for releases whose feed carried an
    // awardNotice — the OCDS feed never includes this document itself (see
    // src/jobs/releases/reiteracion-probe.ts). Mutates `release.awards` in place,
    // bounded by reiterBudget across the whole upload run.
    const reiterAttach = await attachProbedReiteraciones(prepared.map((p) => p.release), reiterBudget, new Date());
    if (reiterAttach.found || reiterAttach.probed) {
      this.logger.info(`  reiteración-del-gasto probe: +${reiterAttach.found} found (${reiterAttach.probed} probed, ${reiterAttach.carried} carried, budget left ${reiterBudget.remaining})`);
    }

    // This loop $sets a fully-rebuilt document, so a release whose total was verified
    // against the government page would be silently re-inflated. Look up which ids
    // carry an override and omit `amount` from their update.
    const preparedIds = prepared.map((p) => p.release.id).filter(Boolean);
    const protectedIds = new Set<string>(
      preparedIds.length
        ? (
            await ReleaseModel.find({ id: { $in: preparedIds } }, { id: 1, amount: 1 }).lean()
          )
            .filter((d: any) => hasVerifiedOverride(d))
            .map((d: any) => d.id)
        : []
    );

    for (const { release, releaseData } of prepared) {
      try {
        // Calculate total amounts from awards (multicurrency support with conversion)
        const amountData = calculateTotalAmounts(release.awards || [], currencyRates, uyiRate, {
          includeVersionInfo: true,
          wasVersionUpdate: false, // This is initial upload, not an update
          previousAmount: null,
        });

        // Add metadata to the release (matching original uploader structure)
        const releaseWithMetadata: Record<string, unknown> = {
          ...release,
          sourceFileName: "web", // As requested
          sourceYear: year, // As requested
          amount: amountData, // As requested
          // Additional metadata from web fetch
          webFetchDate: new Date(),
          rssTitle: releaseData.title,
          rssDescription: releaseData.description,
          rssPublishDate: releaseData.publishDate,
          rssLink: releaseData.link,
        };
        // Keep the verified total; everything else about the release still refreshes.
        if (protectedIds.has(release.id)) {
          delete releaseWithMetadata.amount;
        }

        // Add bulk operation - keep upsert for safety in case of race conditions
        bulkOps.push({
          updateOne: {
            filter: { id: release.id },
            update: { $set: releaseWithMetadata },
            upsert: true,
          },
        });

        processed++;
      } catch (err) {
        this.logger.error(`Error preparing release ${release.id}:`, err as Error);
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

  private async processLastSevenDaysInMonth(year: number, month: number, startDate: Date, endDate: Date, currencyRates: CurrencyResponse | null, uyiRate: number | null, monthStr: string, reiterBudget: ReiteracionBudget): Promise<{ uploaded: number; skipped: number; totalProcessed: number }> {
    // First get all release IDs for this month
    const releaseIds = await this.rssFetcher.fetchReleaseIds(year, month);

    if (releaseIds.length === 0) {
      this.logger.warn(`No releases found for ${year}-${monthStr}`);
      return { uploaded: 0, skipped: 0, totalProcessed: 0 };
    }

    this.logger.info(`Found ${releaseIds.length} releases for ${year}-${monthStr}. Filtering by last 7 days...`);

    // Filter releases by publish date (last 7 days)
    const recentReleases = releaseIds.filter((release) => {
      const publishDate = new Date(release.publishDate);
      return publishDate >= startDate && publishDate <= endDate;
    });

    if (recentReleases.length === 0) {
      this.logger.info(`No releases found in the last 7 days for ${year}-${monthStr}`);
      return { uploaded: 0, skipped: 0, totalProcessed: 0 };
    }

    this.logger.info(`Found ${recentReleases.length} releases from last 7 days in ${year}-${monthStr}. Checking which ones need to be synced...`);

    // Determine which releases are NEW or were UPDATED upstream (RSS re-published with a newer date).
    // Previously existing releases were skipped unconditionally, which meant any government edit
    // (award added, amount corrected, status change) made after the first fetch was never re-synced.
    const { toProcess, newCount, updatedCount, unchangedCount } = await this.filterReleasesNeedingSync(recentReleases);

    this.logger.info(`Sync plan for ${year}-${monthStr} (last 7 days): ${newCount} new, ${updatedCount} updated upstream, ${unchangedCount} unchanged`);

    if (toProcess.length === 0) {
      this.logger.info(`All recent releases for ${year}-${monthStr} are already up to date`);
      return { uploaded: 0, skipped: recentReleases.length, totalProcessed: recentReleases.length };
    }

    let totalUploaded = 0;
    const FETCH_BATCH_SIZE = 200; // Process 200 releases at a time

    // Process new + updated releases in batches
    for (let i = 0; i < toProcess.length; i += FETCH_BATCH_SIZE) {
      const batchIds = toProcess.slice(i, i + FETCH_BATCH_SIZE);
      const batchNumber = Math.floor(i / FETCH_BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(toProcess.length / FETCH_BATCH_SIZE);

      this.logger.info(`Processing batch ${batchNumber}/${totalBatches} (${batchIds.length} new/updated releases from last 7 days)...`);

      try {
        // Prepare batch data for parallel fetching
        const batchPromises = batchIds.map(async (releaseInfo: any) => {
          try {
            // Fetch OCDS data for this individual release
            const releaseData = await this.rssFetcher.fetchReleaseData(releaseInfo.link);
            return {
              ...releaseInfo,
              ocdsData: releaseData,
              fetchError: undefined,
            };
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return {
              ...releaseInfo,
              ocdsData: undefined,
              fetchError: errorMessage,
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
        const batchResult = await this.processReleasesFromWeb(batchResults, currencyRates, uyiRate, year, monthStr, reiterBudget);

        totalUploaded += batchResult.uploaded;

        this.logger.info(`Batch ${batchNumber} complete: ${batchResult.uploaded} uploaded, ${batchResult.skipped} skipped`);

        // Delay between batches to avoid overwhelming the server
        if (i + FETCH_BATCH_SIZE < toProcess.length) {
          this.logger.info("Waiting 2 seconds before next batch...");
          await this.delay(2000);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error(`Error processing batch ${batchNumber}:`, errorMessage);
        // Continue with next batch instead of failing completely
      }
    }

    // Unchanged releases were intentionally skipped (already up to date)
    const totalSkipped = unchangedCount;
    const totalProcessed = toProcess.length + unchangedCount;

    return { uploaded: totalUploaded, skipped: totalSkipped, totalProcessed };
  }

  /**
   * Given a list of releases seen in the RSS feed, decides which ones actually need to be
   * (re)fetched from the OCDS API: releases not yet in the database, or releases whose RSS
   * publish date is newer than the one we stored (i.e. the government re-published/edited them).
   *
   * This is the core fix for stale data: existing releases are no longer skipped blindly, so
   * upstream corrections after the first import are picked up on the next run.
   */
  private async filterReleasesNeedingSync(candidates: any[]): Promise<{ toProcess: any[]; newCount: number; updatedCount: number; unchangedCount: number }> {
    const ids = candidates.map((r) => r.id);

    // Only pull the fields we need to compare freshness
    const existing = await ReleaseModel.find({ id: { $in: ids } }, { id: 1, rssPublishDate: 1 }).lean();
    const existingMap = new Map<string, any>(existing.map((r: any) => [r.id, r]));

    let newCount = 0;
    let updatedCount = 0;
    let unchangedCount = 0;

    const toProcess = candidates.filter((r) => {
      const stored = existingMap.get(r.id);
      if (!stored) {
        newCount++;
        return true; // brand new release
      }

      const storedTime = stored.rssPublishDate ? new Date(stored.rssPublishDate).getTime() : 0;
      const feedTime = r.publishDate ? new Date(r.publishDate).getTime() : 0;

      if (feedTime > storedTime) {
        updatedCount++;
        return true; // re-published upstream -> re-sync to capture edits
      }

      unchangedCount++;
      return false;
    });

    return { toProcess, newCount, updatedCount, unchangedCount };
  }

  /**
   * Weekly reconciliation: re-fetches releases from the last N months that are NOT in a final
   * state (tender still active/planning, no awards yet, or no calculated amounts) and updates
   * them from the live OCDS API. This catches late awards and edits on releases whose RSS entry
   * was not re-published, which the daily job cannot detect on its own.
   */
  async reconcileNonFinalReleases(monthsBack: number = 5): Promise<{ scanned: number; updated: number; failed: number }> {
    try {
      await this.databaseService.connect(this.mongoUri);
      this.logger.info("Connected to MongoDB");

      this.logger.info("Fetching current currency exchange rates...");
      const currencyRates = await fetchCurrencyRates();
      const uyiRate = await fetchUYIRate();
      this.logger.info("Currency rates fetched successfully");

      const cutoff = new Date();
      cutoff.setMonth(cutoff.getMonth() - monthsBack);

      this.logger.info(`Reconciliation: scanning non-final releases published since ${cutoff.toISOString().split("T")[0]} (last ${monthsBack} months)`);

      // Candidate = recently seen AND not obviously finalized. These are the releases most likely
      // to still change on the government side (pending award, missing amounts, open tender).
      const candidates = await ReleaseModel.find(
        {
          $and: [
            { $or: [{ rssPublishDate: { $gte: cutoff } }, { webFetchDate: { $gte: cutoff } }] },
            {
              $or: [
                { "tender.status": { $in: ["active", "planning", "enquiry"] } },
                { awards: { $exists: false } },
                { awards: { $size: 0 } },
                { "amount.hasAmounts": { $ne: true } },
              ],
            },
          ],
        },
        // amount.verifiedOverride must be projected too: the reconcile guard below reads
        // it off this same `candidate` document, and a narrower projection would silently
        // make that guard never fire.
        { id: 1, rssLink: 1, "amount.primaryAmount": 1, "amount.verifiedOverride": 1 }
      ).lean();

      this.logger.info(`Found ${candidates.length} non-final releases to re-check against the live API`);

      if (candidates.length === 0) {
        return { scanned: 0, updated: 0, failed: 0 };
      }

      let updated = 0;
      let failed = 0;
      const BATCH_SIZE = 200;
      const concurrency = 20;

      for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
        const batch = candidates.slice(i, i + BATCH_SIZE);
        const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(candidates.length / BATCH_SIZE);
        this.logger.info(`Reconcile batch ${batchNumber}/${totalBatches} (${batch.length} releases)...`);

        const bulkOps: any[] = [];

        for (let j = 0; j < batch.length; j += concurrency) {
          const group = batch.slice(j, j + concurrency);
          const fetched = await Promise.all(
            group.map(async (candidate: any) => {
              // Prefer the stored RSS link; fall back to the canonical OCDS release URL
              const url = candidate.rssLink || `https://www.comprasestatales.gub.uy/ocds/release/${candidate.id}`;
              try {
                const data = await this.rssFetcher.fetchReleaseData(url);
                return { candidate, data, error: undefined as string | undefined };
              } catch (error) {
                return { candidate, data: undefined, error: error instanceof Error ? error.message : String(error) };
              }
            })
          );

          for (const result of fetched) {
            if (!result.data || result.error) {
              failed++;
              continue;
            }

            const ocdsRelease = result.data.releases?.[0];
            if (!ocdsRelease || !ocdsRelease.id) {
              failed++;
              continue;
            }

            // Never let a re-sync recompute a page-verified total.
            if (hasVerifiedOverride(result.candidate)) {
              continue;
            }

            const awards = ocdsRelease.awards || [];
            const amountData = calculateTotalAmounts(awards, currencyRates, uyiRate, {
              includeVersionInfo: true,
              wasVersionUpdate: true,
              previousAmount: result.candidate.amount?.primaryAmount ?? null,
            });

            // IMPORTANT: only $set OCDS-derived fields. Do NOT touch rss* fields so the daily
            // job's freshness comparison (rssPublishDate) keeps working.
            const setFields: any = {
              ocid: ocdsRelease.ocid,
              date: ocdsRelease.date ? new Date(ocdsRelease.date) : new Date(),
              tag: ocdsRelease.tag || [],
              initiationType: ocdsRelease.initiationType,
              parties: ocdsRelease.parties || [],
              tender: ocdsRelease.tender || null,
              awards,
              amount: amountData,
              reconciledAt: new Date(),
            };

            const parties = ocdsRelease.parties || [];
            const buyer = parties.find((p: any) => p.roles && p.roles.includes("buyer")) || ocdsRelease.buyer;
            if (buyer) setFields.buyer = buyer;
            const supplier = parties.find((p: any) => p.roles && p.roles.includes("supplier"));
            if (supplier) setFields.supplier = supplier;

            bulkOps.push({
              updateOne: {
                filter: { id: ocdsRelease.id },
                update: { $set: setFields },
              },
            });
          }

          if (j + concurrency < batch.length) {
            await this.delay(1000);
          }
        }

        if (bulkOps.length > 0) {
          try {
            const result = await ReleaseModel.bulkWrite(bulkOps, { ordered: false });
            const modified = result.modifiedCount || 0;
            updated += modified;
            this.logger.info(`Reconcile batch ${batchNumber}: ${modified} updated (${bulkOps.length} re-synced from live API)`);
          } catch (error) {
            this.logger.error(`Reconcile bulk write failed for batch ${batchNumber}:`, error as Error);
          }
        }

        if (i + BATCH_SIZE < candidates.length) {
          await this.delay(2000);
        }
      }

      this.logger.info(`Reconciliation complete: scanned ${candidates.length}, updated ${updated}, failed ${failed}`);
      return { scanned: candidates.length, updated, failed };
    } catch (err) {
      this.logger.error("Reconciliation failed:", err as Error);
      throw err;
    } finally {
      if (this.databaseService.isConnected()) {
        await this.databaseService.disconnect();
        this.logger.info("Disconnected from MongoDB");
      }
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Execute if this module is run directly
if (require.main === module) {
  // Import required dependencies for direct execution
  const { DatabaseService } = require("../services/database-service");
  const { Logger } = require("../services/logger-service");

  async function main() {
    console.log("🚀 Starting web-based release upload...");

    // MongoDB URI (adjust as needed)
    const mongoUri = process.env.MONGODB_URI || "mongodb://localhost:27017/gastos_gub";

    const databaseService = new DatabaseService();
    const logger = new Logger();

    const uploader = new ReleaseUploaderNew(databaseService, logger, mongoUri);

    try {
      await uploader.uploadReleasesFromWeb();
      console.log("✅ Web upload completed successfully!");
    } catch (error) {
      console.error("❌ Web upload failed:", error);
      process.exit(1);
    }
  }

  main().catch((error) => {
    console.error("💥 Unhandled error:", error);
    process.exit(1);
  });
}
