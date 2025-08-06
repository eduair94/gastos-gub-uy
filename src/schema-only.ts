#!/usr/bin/env node

import { ScraperFactory } from './factories/scraper-factory';
import { DB_CONFIG } from './config/config';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Schema-only analyzer - analyzes JSON structure without uploading to MongoDB
 * Perfect for understanding data structure before committing to database upload
 */
async function main(): Promise<void> {
  try {
    console.log("📋 Government Data Schema Analyzer (Schema Only)");
    console.log("==============================================");
    console.log("Analyzing JSON structure without database upload\n");

    // Create schema analyzer using factory pattern
    const schemaAnalyzer = ScraperFactory.createSchemaAnalyzer();

    // Check if data exists
    if (!fs.existsSync(DB_CONFIG.ROOT_DIR)) {
      console.log(`❌ Database directory not found: ${DB_CONFIG.ROOT_DIR}`);
      console.log("Please run the scraper first to download and extract the data files.");
      process.exit(1);
    }

    // Find year directories with extracted data
    const yearDirs = fs.readdirSync(DB_CONFIG.ROOT_DIR)
      .filter(item => {
        const yearPath = path.join(DB_CONFIG.ROOT_DIR, item);
        const extractedPath = path.join(yearPath, "extracted", item);
        return fs.statSync(yearPath).isDirectory() && 
               fs.existsSync(extractedPath) && 
               /^\d{4}$/.test(item); // Ensure it's a 4-digit year
      })
      .sort();

    if (yearDirs.length === 0) {
      console.log("❌ No year directories found.");
      process.exit(1);
    }

    console.log(`📁 Found ${yearDirs.length} year directories: ${yearDirs.join(', ')}\n`);

    // Analyze first few years as samples
    const samplesToAnalyze = Math.min(3, yearDirs.length);
    const schemas: { [year: string]: any } = {};

    for (let i = 0; i < samplesToAnalyze; i++) {
      const yearDir = yearDirs[i];
      const yearPath = path.join(DB_CONFIG.ROOT_DIR, yearDir, "extracted", yearDir);
      
      console.log(`🔬 Analyzing ${yearDir}...`);
      
      try {
        const yearSchemas = await schemaAnalyzer.analyzeDirectory(yearPath);
        schemas[yearDir] = yearSchemas;
        
        const fileCount = Object.keys(yearSchemas).length;
        console.log(`   ✅ Analyzed ${fileCount} files`);
        
        if (fileCount > 0) {
          // Show detailed schema for first file
          const firstFile = Object.keys(yearSchemas)[0];
          const firstSchema = yearSchemas[firstFile];
          
          console.log(`\n   📄 Sample file: ${firstFile}`);
          console.log(`   📊 Fields found: ${Object.keys(firstSchema).length}`);
          
          // Show top-level structure
          console.log("   🏗️  Structure:");
          Object.entries(firstSchema).slice(0, 10).forEach(([field, info]: [string, any]) => {
            const type = info.type;
            const optional = info.optional ? '?' : '';
            const examples = info.examples ? ` (e.g., ${JSON.stringify(info.examples[0])})` : '';
            console.log(`      ${field}${optional}: ${type}${examples}`);
          });
          
          if (Object.keys(firstSchema).length > 10) {
            console.log(`      ... and ${Object.keys(firstSchema).length - 10} more fields`);
          }
        }
        console.log();
        
      } catch (error) {
        console.error(`   ❌ Failed to analyze ${yearDir}:`, (error as Error).message);
      }
    }

    // Save detailed schema analysis
    const schemaOutputPath = path.join(DB_CONFIG.ROOT_DIR, 'schema-analysis.json');
    fs.writeFileSync(schemaOutputPath, JSON.stringify(schemas, null, 2));
    console.log(`💾 Detailed schema saved to: ${schemaOutputPath}`);

    // Create summary report
    const summaryPath = path.join(DB_CONFIG.ROOT_DIR, 'schema-summary.json');
    const summary = createSchemaSummary(schemas);
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
    console.log(`📋 Schema summary saved to: ${summaryPath}`);

    // Display summary
    console.log("\n📊 Schema Analysis Summary:");
    console.log(`   Years analyzed: ${Object.keys(schemas).length}`);
    console.log(`   Total unique fields: ${summary.totalUniqueFields}`);
    console.log(`   Common fields across years: ${summary.commonFields.length}`);
    console.log(`   Data types found: ${summary.dataTypes.join(', ')}`);
    
    if (summary.commonFields.length > 0) {
      console.log("\n🔧 Most common fields:");
      summary.commonFields.slice(0, 10).forEach((field: string) => {
        console.log(`   • ${field}`);
      });
    }

    console.log("\n✨ Schema analysis completed!");
    console.log("🎯 Next steps:");
    console.log("   1. Review the generated schema files");
    console.log("   2. Run 'npm run analyze' to upload data to MongoDB");
    console.log("   3. Use the schema information to design queries");

  } catch (error) {
    console.error("\n❌ Schema analysis failed:");
    if (error instanceof Error) {
      console.error(`   Error: ${error.message}`);
    } else {
      console.error(`   Unknown error: ${String(error)}`);
    }
    process.exit(1);
  }
}

/**
 * Creates a summary of the schema analysis
 */
function createSchemaSummary(schemas: { [year: string]: any }): any {
  const allFields = new Set<string>();
  const fieldCounts: { [field: string]: number } = {};
  const dataTypes = new Set<string>();

  // Collect all fields and their frequencies
  Object.values(schemas).forEach((yearSchema: any) => {
    Object.values(yearSchema).forEach((fileSchema: any) => {
      Object.entries(fileSchema).forEach(([field, info]: [string, any]) => {
        allFields.add(field);
        fieldCounts[field] = (fieldCounts[field] || 0) + 1;
        dataTypes.add(info.type);
        
        // Recursively collect nested fields
        if (info.nestedFields) {
          collectNestedFields(info.nestedFields, field, allFields, fieldCounts, dataTypes);
        }
      });
    });
  });

  // Sort fields by frequency
  const sortedFields = Object.entries(fieldCounts)
    .sort(([,a], [,b]) => b - a)
    .map(([field]) => field);

  return {
    totalUniqueFields: allFields.size,
    commonFields: sortedFields,
    dataTypes: Array.from(dataTypes).sort(),
    fieldFrequencies: fieldCounts,
    analyzedYears: Object.keys(schemas)
  };
}

/**
 * Recursively collects nested fields
 */
function collectNestedFields(
  nestedFields: any, 
  prefix: string, 
  allFields: Set<string>, 
  fieldCounts: { [field: string]: number }, 
  dataTypes: Set<string>
): void {
  Object.entries(nestedFields).forEach(([field, info]: [string, any]) => {
    const fullField = `${prefix}.${field}`;
    allFields.add(fullField);
    fieldCounts[fullField] = (fieldCounts[fullField] || 0) + 1;
    dataTypes.add(info.type);
    
    if (info.nestedFields) {
      collectNestedFields(info.nestedFields, fullField, allFields, fieldCounts, dataTypes);
    }
  });
}

// Run the main function
main().catch((error) => {
  console.error("❌ Fatal error:", error);
  process.exit(1);
});
