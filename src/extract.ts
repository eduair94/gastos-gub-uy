#!/usr/bin/env node

import { ScraperFactory } from './factories/scraper-factory';
import { DB_CONFIG } from './config/config';
import * as fs from 'fs';

/**
 * Main entry point for the government data scraper
 * Demonstrates the use of the Factory pattern and SOLID principles
 */
async function main(): Promise<void> {
  try {
    console.log("🕷️  Government Data URL Scraper & Downloader");
    console.log("===========================================");
    console.log("Built with TypeScript and SOLID principles\n");

    // Create scraper using factory pattern
    const scraper = ScraperFactory.createScraper();
    const dataManager = ScraperFactory.createDataManager();

    // Ensure db directory exists
    if (!fs.existsSync(DB_CONFIG.ROOT_DIR)) {
      fs.mkdirSync(DB_CONFIG.ROOT_DIR, { recursive: true });
      console.log(`📁 Created database directory: ${DB_CONFIG.ROOT_DIR}`);
    }

    console.log("🔍 Phase 1: Scraping URLs...");
    // Execute scraping
    const urls = await scraper.scrape();

    console.log("\n✅ Scraping completed successfully!");
    console.log(`📊 Extracted ${urls.length} URLs`);
    console.log("📁 Results saved to urls.json");

    // Display scraping summary
    if (urls.length > 0) {
      console.log("\n📋 Scraping Summary:");
      const yearRange = `${urls[urls.length - 1].year} - ${urls[0].year}`;
      console.log(`   Years covered: ${yearRange}`);
      console.log(`   Total files: ${urls.length}`);
    }

    console.log("\n🔄 Phase 2: Downloading and extracting files...");
    
    // Download and extract all files
    await dataManager.downloadAndExtract(urls, DB_CONFIG.ROOT_DIR);

    console.log("\n🎉 All operations completed successfully!");
    console.log(`📦 Files extracted to: ${DB_CONFIG.ROOT_DIR}`);

  } catch (error) {
    console.error("\n❌ Operation failed:");
    if (error instanceof Error) {
      console.error(`   Error: ${error.message}`);
    } else {
      console.error(`   Unknown error: ${String(error)}`);
    }
    process.exit(1);
  }
}

/**
 * Enhanced error handling for better user experience
 */
function setupErrorHandling(): void {
  // Handle unhandled promise rejections
  process.on("unhandledRejection", (reason: any, promise: any) => {
    console.error("❌ Unhandled Promise Rejection:");
    console.error("   Promise:", promise);
    console.error("   Reason:", reason);
    process.exit(1);
  });

  // Handle uncaught exceptions
  process.on("uncaughtException", (error: Error) => {
    console.error("❌ Uncaught Exception:");
    console.error("   Error:", error.message);
    console.error("   Stack:", error.stack);
    process.exit(1);
  });

  // Handle SIGINT (Ctrl+C)
  process.on("SIGINT", () => {
    console.log("\n\n🛑 Operation cancelled by user");
    process.exit(0);
  });
}

// Setup error handling
setupErrorHandling();

// Run the main function
main().catch((error) => {
  console.error("❌ Fatal error in main:", error);
  process.exit(1);
});
