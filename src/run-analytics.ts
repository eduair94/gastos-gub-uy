import { config } from "dotenv";
import mongoose from "mongoose";
import { ReleaseModel } from "./database/release-model";
import { AnalyticsEngine, IBuyerPatternResult, ISupplierPatternResult } from "./services/analytics-engine";
import { Logger } from "./services/logger-service";

// Load environment variables
config();

const logger = new Logger();

async function runAnalytics() {
  try {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error("MONGODB_URI environment variable is required");
    }

    await mongoose.connect(mongoUri);
    logger.info("Connected to MongoDB");

    const analyticsEngine = new AnalyticsEngine(logger);

    // Get available years from the database
    const years = await ReleaseModel.distinct("sourceYear");
    const validYears = years.filter((year) => year && year >= 2000 && year <= 2030);

    logger.info(`Found data for years: ${validYears.join(", ")}`);

    // Generate insights for each year
    for (const year of validYears) {
      try {
        logger.info(`Generating insights for year ${year}`);
        const insight = await analyticsEngine.generateYearlyInsights(year);
        logger.info(`Generated insights for ${year}: ${insight.totalTransactions} transactions, total: ${insight.totalAmount} ${insight.currency}`);
      } catch (error) {
        logger.error(`Failed to generate insights for year ${year}:`, error as Error);
      }
    }

    // Run anomaly detection
    logger.info("Starting anomaly detection...");
    const anomalies = await analyticsEngine.detectAnomalies(500);
    logger.info(`Completed anomaly detection: found ${anomalies.length} anomalies`);

    // Show anomaly summary
    const anomalySummary = anomalies.reduce((acc: any, anomaly: any) => {
      acc[anomaly.type] = acc[anomaly.type] || { count: 0, severities: {} };
      acc[anomaly.type].count++;
      acc[anomaly.type].severities[anomaly.severity] = (acc[anomaly.type].severities[anomaly.severity] || 0) + 1;
      return acc;
    }, {});

    logger.info("Anomaly Summary:");
    Object.entries(anomalySummary).forEach(([type, data]: [string, any]) => {
      logger.info(`  ${type}: ${data.count} total`);
      Object.entries(data.severities).forEach(([severity, count]) => {
        logger.info(`    ${severity}: ${count}`);
      });
    });

    // Generate supplier and buyer analysis
    logger.info("Analyzing supplier patterns...");
    const supplierPatterns = await analyticsEngine.analyzeSupplierPatterns();
    logger.info(`Found ${supplierPatterns.length} supplier patterns`);

    logger.info("Analyzing buyer patterns...");
    const buyerPatterns = await analyticsEngine.analyzeBuyerPatterns();
    logger.info(`Found ${buyerPatterns.length} buyer patterns`);

    // Show top suppliers and buyers
    if (supplierPatterns.length > 0) {
      logger.info("Top 5 suppliers by contract count:");
      supplierPatterns.slice(0, 5).forEach((supplier: ISupplierPatternResult, index: number) => {
        logger.info(`  ${index + 1}. ${supplier.name}: ${supplier.totalContracts} contracts across ${supplier.yearCount} years`);
      });
    }

    if (buyerPatterns.length > 0) {
      logger.info("Top 5 buyers by total spending:");
      buyerPatterns.slice(0, 5).forEach((buyer: IBuyerPatternResult, index: number) => {
        logger.info(`  ${index + 1}. ${buyer.name}: ${buyer.totalSpending} total spending across ${buyer.yearCount} years`);
      });
    }

    await mongoose.disconnect();
    logger.info("Analytics generation completed successfully");
  } catch (error) {
    logger.error("Analytics generation failed:", error as Error);
    process.exit(1);
  }
}

// Run analytics if this script is executed directly
if (require.main === module) {
  runAnalytics();
}

export { runAnalytics };
