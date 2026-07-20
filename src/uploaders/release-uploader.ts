import { ReleaseModel } from "../../shared/models";
import { IRelease } from "../../shared/types";
import { hasVerifiedOverride } from "../../shared/utils/verified-override";
import { IDatabaseService } from "../services/database-service";
import { IFileService } from "../services/file-service";
import { ILogger } from "../services/logger-service";
import {
  calculateTotalAmounts,
  fetchCurrencyRates,
  fetchUYIRate,
  type CurrencyResponse
} from "../utils/amount-calculator";

export interface IReleaseUploader {
  uploadReleases(dataDirectory: string): Promise<void>;
}

export interface IJsonData {
  releases?: IRelease[];
}

/**
 * The pipeline-`$set` expression that decides whether a release's stored `amount`
 * survives a re-upload untouched or gets recomputed from the incoming feed file.
 *
 * - When `isProtected` (the stored release already carries a page-verified override),
 *   ALWAYS keep the stored amount (`"$amount"`) — never recompute it, regardless of
 *   the awards-count comparison below. A government amendment winning this precedence
 *   is handled elsewhere (reconcile-award-amendments.ts), never here.
 * - Otherwise, the same OCDS release id can be republished across multiple source
 *   files (e.g. a tender-stage file and a later, richer award-stage file); keep the
 *   existing stored amount only if it already has strictly more awards than the
 *   incoming file, so an earlier/thinner republish can't clobber a later/richer one.
 *
 * Pure and side-effect free (no Mongo call, no I/O) so it's directly unit-testable.
 */
export function amountPipelineExpr(isProtected: boolean, amountData: unknown, incomingAwardsCount: number): unknown {
  if (isProtected) {
    return "$amount";
  }
  return {
    $cond: [
      { $gt: [{ $size: { $ifNull: ["$awards", []] } }, incomingAwardsCount] },
      "$amount",
      { $literal: amountData }
    ]
  };
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

      // Fetch current currency exchange rates
      const currencyRates = await fetchCurrencyRates();
      
      // Fetch current UYI (Unidades Indexadas) exchange rate
      const uyiRate = await fetchUYIRate();

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
            const result = await this.processFile(file, currencyRates, uyiRate);
            
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

  private async processFile(
    filePath: string,
    currencyRates: CurrencyResponse | null,
    uyiRate: number | null
  ): Promise<{ uploaded: number; skipped: number }> {
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

    // This loop's pipeline $set can recompute `amount` for a release whose total was
    // verified against the government page. Unlike add-missing-amounts.ts, the loop
    // variable here (`release`) comes straight from the feed file being parsed, never
    // from the database, so it can never itself carry the verifiedOverride marker —
    // checking it directly would be a guard that never fires. Pre-load which of this
    // file's ids are protected, against the STORED document, so the pipeline below can
    // leave their amount untouched no matter what the awards-count comparison says.
    const releaseIds = data.releases.map((r) => r.id).filter(Boolean) as string[];
    const protectedIds = new Set<string>();
    if (releaseIds.length) {
      // Narrow both the filter (only ids that even have the field) and the projection
      // (only the one field we need) — a whole-year feed file can carry 10k+ ids, x3
      // concurrent files, and pulling the full `amount` subtree for every one of them
      // was needless memory pressure under this process's 512MB cap. $exists: true also
      // matches `verifiedOverride: null`, so keep running the docs through
      // hasVerifiedOverride() below — the Mongo filter narrows, the helper decides.
      const existingDocs = await ReleaseModel.find(
        { id: { $in: releaseIds }, "amount.verifiedOverride": { $exists: true } },
        { id: 1, "amount.verifiedOverride": 1 }
      ).lean();
      for (const doc of existingDocs) {
        if (hasVerifiedOverride(doc)) {
          protectedIds.add((doc as any).id);
        }
      }
    }

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

        // Add metadata to the release
        const { awards: incomingAwards, ...releaseWithoutAwards } = release;
        const releaseWithMetadata = {
          ...releaseWithoutAwards,
          sourceFileName: fileName,
          sourceYear
        };
        const incomingAwardsCount = Array.isArray(incomingAwards) ? incomingAwards.length : 0;

        // Pipeline-style $set evaluates every value as an aggregation expression, so plain
        // nested objects get parsed instead of treated as data - and MongoDB rejects an empty
        // object (e.g. buyer.contactPoint: {}) found that way. $literal-wrap each field's raw
        // value so it's always taken verbatim.
        const literalFields = Object.fromEntries(
          Object.entries(releaseWithMetadata).map(([key, value]) => [key, { $literal: value }])
        );

        // Same OCDS release `id` can be republished multiple times across the source files
        // (e.g. a tender-stage "l-" file and a later award-stage "a-" file share one id).
        // A plain $set would let whichever file is processed last silently overwrite awards
        // data with an earlier, less-complete snapshot. Use a pipeline update so MongoDB
        // decides server-side: keep the existing awards/amount only if they already have
        // strictly more awards than what we're about to write.
        bulkOps.push({
          updateOne: {
            filter: { id: release.id },
            update: [
              {
                $set: {
                  ...literalFields,
                  awards: {
                    $cond: [
                      { $gt: [{ $size: { $ifNull: ["$awards", []] } }, incomingAwardsCount] },
                      "$awards",
                      { $literal: incomingAwards || [] }
                    ]
                  },
                  // Never let a re-sync recompute a page-verified total: for a protected
                  // id, always keep the stored amount, regardless of the awards-count
                  // comparison below. See amountPipelineExpr() for the decision itself.
                  amount: amountPipelineExpr(protectedIds.has(release.id), amountData, incomingAwardsCount)
                }
              }
            ],
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
