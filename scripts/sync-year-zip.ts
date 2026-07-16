#!/usr/bin/env node
// Sync a single year's extracted OCDS zip (db/5203/extracted/<year>) into MongoDB,
// without reprocessing the entire db/ tree. Usage: tsx scripts/sync-year-zip.ts 2025
import { config } from "dotenv";
import * as path from "path";
import { mongoUri } from "../shared/config";
import { DatabaseService } from "../src/services/database-service";
import { FileService } from "../src/services/file-service";
import { Logger } from "../src/services/logger-service";
import { ReleaseUploader } from "../src/uploaders/release-uploader";

config();

async function main(): Promise<void> {
  const year = process.argv[2];
  if (!year || !/^\d{4}$/.test(year)) {
    console.error("Usage: tsx scripts/sync-year-zip.ts <year>");
    process.exit(1);
  }

  if (!mongoUri) {
    console.error("MONGODB_URI environment variable is required");
    process.exit(1);
  }

  const dataDirectory = path.join(__dirname, "..", "db", "5203", "extracted", year);

  const fileService = new FileService();
  const databaseService = new DatabaseService();
  const logger = new Logger();
  const releaseUploader = new ReleaseUploader(fileService, databaseService, logger, mongoUri);

  try {
    console.log(`Syncing ${dataDirectory} into MongoDB...`);
    await releaseUploader.uploadReleases(dataDirectory);
    process.exit(0);
  } catch (error) {
    logger.error("Sync failed:", error as Error);
    process.exit(1);
  }
}

main();
