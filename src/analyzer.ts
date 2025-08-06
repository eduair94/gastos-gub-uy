#!/usr/bin/env node

import { ScraperFactory } from './factories/scraper-factory';
import { DB_CONFIG } from './config/config';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Main entry point for schema analysis and data upload
 * Demonstrates the use of SOLID principles with MongoDB integration
 */
async function main(): Promise<void> {
  try {
    console.log("📊 Government Data Schema Analyzer & MongoDB Uploader");
    console.log("====================================================");
    console.log("Built with TypeScript, SOLID principles, and MongoDB\n");

    // Create services using factory pattern
    const { schemaAnalyzer, dataUploader, dbClient } = ScraperFactory.createAnalysisAndUploadPipeline();

    // Ensure db directory exists
    if (!fs.existsSync(DB_CONFIG.ROOT_DIR)) {
      console.log(`❌ Database directory not found: ${DB_CONFIG.ROOT_DIR}`);
      console.log("Please run the scraper first to download the data files.");
      process.exit(1);
    }

    console.log("🔍 Phase 1: Analyzing JSON schemas...");
    
    // Get extracted directory structure - files are in db/{year}/extracted/{year}/
    const dbDir = DB_CONFIG.ROOT_DIR;
    if (!fs.existsSync(dbDir)) {
      console.log(`❌ Database directory not found: ${dbDir}`);
      console.log("Please run the scraper first to download the data files.");
      process.exit(1);
    }

    // Find year directories in the main db folder
    const yearDirs = fs.readdirSync(dbDir)
      .filter(item => {
        const itemPath = path.join(dbDir, item);
        if (!fs.statSync(itemPath).isDirectory()) return false;
        
        // Check if this year directory has an extracted subfolder
        const extractedPath = path.join(itemPath, "extracted", item);
        return fs.existsSync(extractedPath) && fs.statSync(extractedPath).isDirectory();
      })
      .sort();    if (yearDirs.length === 0) {
      console.log("❌ No year directories found in extracted folder.");
      process.exit(1);
    }

    console.log(`📁 Found ${yearDirs.length} year directories: ${yearDirs.join(', ')}`);

    // Analyze a sample from each year to understand the schema
    const schemas: { [year: string]: any } = {};
    
    for (const yearDir of yearDirs.slice(0, 3)) { // Analyze first 3 years as samples
      const yearPath = path.join(DB_CONFIG.ROOT_DIR, yearDir, "extracted", yearDir);
      console.log(`\n🔬 Analyzing schema for year: ${yearDir}`);
      
      try {
        const yearSchemas = await schemaAnalyzer.analyzeDirectory(yearPath);
        schemas[yearDir] = yearSchemas;
        
        const fileCount = Object.keys(yearSchemas).length;
        console.log(`   ✅ Analyzed ${fileCount} files`);
        
        // Show sample schema for the first file
        if (fileCount > 0) {
          const firstFile = Object.keys(yearSchemas)[0];
          const sampleSchema = yearSchemas[firstFile];
          const fieldCount = Object.keys(sampleSchema).length;
          console.log(`   📋 Sample (${firstFile}): ${fieldCount} fields detected`);
          
          // Show top-level fields
          const topFields = Object.keys(sampleSchema).slice(0, 5);
          console.log(`   🏷️  Top fields: ${topFields.join(', ')}${fieldCount > 5 ? '...' : ''}`);
        }
        
      } catch (error) {
        console.error(`   ❌ Failed to analyze ${yearDir}:`, (error as Error).message);
      }
    }

    // Save schema analysis results
    const schemaOutputPath = path.join(DB_CONFIG.ROOT_DIR, 'schema-analysis.json');
    fs.writeFileSync(schemaOutputPath, JSON.stringify(schemas, null, 2));
    console.log(`\n💾 Schema analysis saved to: ${schemaOutputPath}`);

    console.log("\n🔄 Phase 2: Connecting to MongoDB...");
    
    try {
      await dbClient.connect();
      console.log("✅ Connected to MongoDB successfully");

      // Create recommended indexes
      console.log("📑 Creating recommended indexes...");
      await (dbClient as any).createRecommendedIndexes();

    } catch (error) {
      console.error("❌ MongoDB connection failed:", (error as Error).message);
      console.log("\n💡 Make sure MongoDB is running and the connection string is correct.");
      console.log("   Default connection: mongodb://localhost:27017");
      console.log("   Set MONGODB_URI environment variable to customize.");
      process.exit(1);
    }

    console.log("\n📤 Phase 3: Uploading data to MongoDB...");
    
    // Ask user which years to upload (or upload all)
    console.log(`\nAvailable years: ${yearDirs.join(', ')}`);
    console.log("Starting upload for all years...");

    try {
      // Upload data from all year directories
      let totalStats = {
        totalFiles: 0,
        totalRecords: 0,
        successfulFiles: 0,
        failedFiles: 0,
        duration: 0
      };

      const overallStartTime = Date.now();

      for (const yearDir of yearDirs) {
        const yearExtractedPath = path.join(DB_CONFIG.ROOT_DIR, yearDir, "extracted", yearDir);
        
        if (fs.existsSync(yearExtractedPath)) {
          console.log(`\n📁 Processing year: ${yearDir}`);
          const yearStats = await dataUploader.uploadDirectoryWithProgress(yearExtractedPath);
          
          // Aggregate statistics
          totalStats.totalFiles += yearStats.totalFiles;
          totalStats.totalRecords += yearStats.totalRecords;
          totalStats.successfulFiles += yearStats.successfulFiles;
          totalStats.failedFiles += yearStats.failedFiles;
        } else {
          console.log(`⚠️  Skipping ${yearDir}: extracted data not found`);
        }
      }

      totalStats.duration = Date.now() - overallStartTime;
      
      console.log("\n🎉 Upload completed successfully!");
      console.log("📊 Overall Upload Summary:");
      console.log(`   Total files processed: ${totalStats.totalFiles}`);
      console.log(`   Successful uploads: ${totalStats.successfulFiles}`);
      console.log(`   Failed uploads: ${totalStats.failedFiles}`);
      console.log(`   Total records uploaded: ${totalStats.totalRecords}`);
      console.log(`   Duration: ${(totalStats.duration / 1000).toFixed(2)} seconds`);

      // Get database statistics
      console.log("\n📈 Database Statistics:");
      const dbStats = await (dbClient as any).getStats();
      console.log(`   Database: ${dbStats.database.name}`);
      console.log(`   Collection: ${dbStats.collection.name}`);
      console.log(`   Documents: ${dbStats.collection.documentCount.toLocaleString()}`);
      console.log(`   Average document size: ${Math.round(dbStats.collection.avgDocumentSize)} bytes`);
      console.log(`   Indexes: ${dbStats.collection.indexes.length}`);

    } catch (error) {
      console.error("\n❌ Upload failed:", (error as Error).message);
    } finally {
      await dbClient.disconnect();
      console.log("🔌 Disconnected from MongoDB");
    }

    console.log("\n✨ All operations completed!");
    console.log("\n🔍 You can now query the government purchase data in MongoDB:");
    console.log("   Database: government_data");
    console.log("   Collection: purchases");
    console.log("\n📖 Example queries:");
    console.log("   - Find purchases by buyer: db.purchases.find({'buyer.name': /ministry/i})");
    console.log("   - Find large contracts: db.purchases.find({'tender.value.amount': {$gt: 1000000}})");
    console.log("   - Search by supplier: db.purchases.find({'awards.suppliers.name': /company/i})");

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
