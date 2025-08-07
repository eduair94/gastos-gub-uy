import { AnomalyModel, BuyerPatternModel, ExpenseInsightModel, IAnomaly, IExpenseInsight, SupplierPatternModel } from "../database/analytics-models";
import { IRelease, ReleaseModel } from "../database/release-model";
import { ILogger } from "../services/logger-service";
import { AnalyticsBatchProcessor } from "./analytics-batch-processor";

export interface ISupplierPatternResult {
  _id: string;
  name: string;
  totalContracts: number;
  years: number[];
  yearCount: number;
  buyers: string[];
  buyerCount: number;
  avgContractValue: number;
}

export interface IBuyerPatternResult {
  _id: string;
  name: string;
  totalContracts: number;
  years: number[];
  yearCount: number;
  suppliers: string[];
  supplierCount: number;
  totalSpending: number;
}

export interface IAnalyticsEngine {
  generateYearlyInsights(year: number): Promise<IExpenseInsight>;
  generateMonthlyInsights(year: number, month: number): Promise<IExpenseInsight>;
  detectAnomalies(batchSize?: number): Promise<IAnomaly[]>;
  analyzeSupplierPatterns(): Promise<ISupplierPatternResult[]>;
  analyzeBuyerPatterns(): Promise<IBuyerPatternResult[]>;
  recomputeAnalytics(): Promise<void>;
}

export class AnalyticsEngine implements IAnalyticsEngine {
  private batchProcessor: AnalyticsBatchProcessor;

  constructor(private logger: ILogger) {
    this.batchProcessor = new AnalyticsBatchProcessor(logger);
  }

  async generateYearlyInsights(year: number): Promise<IExpenseInsight> {
    this.logger.info(`Generating yearly insights for ${year}`);

    const pipeline = [
      {
        $match: {
          sourceYear: year,
          "awards.items.unit.value.amount": { $exists: true, $ne: null },
        },
      },
      { $unwind: "$awards" },
      { $unwind: "$awards.items" },
      {
        $match: {
          "awards.items.unit.value.amount": { $gt: 0 },
        },
      },
      {
        $group: {
          _id: {
            year: "$sourceYear",
            currency: "$awards.items.unit.value.currency",
          },
          totalAmount: { $sum: "$awards.items.unit.value.amount" },
          totalTransactions: { $sum: 1 },
          averageAmount: { $avg: "$awards.items.unit.value.amount" },
          suppliers: {
            $push: {
              id: "$awards.suppliers.id",
              name: "$awards.suppliers.name",
              amount: "$awards.items.unit.value.amount",
            },
          },
          buyers: {
            $push: {
              id: "$buyer.id",
              name: "$buyer.name",
              amount: "$awards.items.unit.value.amount",
            },
          },
          categories: {
            $push: {
              description: "$awards.items.classification.description",
              amount: "$awards.items.unit.value.amount",
            },
          },
        },
      },
    ];

    const results = await ReleaseModel.aggregate(pipeline);

    if (results.length === 0) {
      throw new Error(`No data found for year ${year}`);
    }

    // Process results to create top suppliers, buyers, and categories
    const mainResult = results.find((r) => r._id.currency === "UYU") || results[0];

    const topSuppliers = await this.getTopSuppliers(year, 10);
    const topBuyers = await this.getTopBuyers(year, 10);
    const topCategories = await this.getTopCategories(year, 10);

    const insight: Partial<IExpenseInsight> = {
      year,
      totalAmount: mainResult.totalAmount,
      totalTransactions: mainResult.totalTransactions,
      averageAmount: mainResult.averageAmount,
      currency: mainResult._id.currency,
      topSuppliers,
      topBuyers,
      topCategories,
    };

    // Save or update the insight
    const savedInsight = await ExpenseInsightModel.findOneAndUpdate({ year, month: { $exists: false } }, insight, { upsert: true, new: true });

    return savedInsight;
  }

  async generateMonthlyInsights(year: number, month: number): Promise<IExpenseInsight> {
    this.logger.info(`Generating monthly insights for ${year}-${month}`);

    const startDate = new Date(year, month - 1, 1).toISOString();
    const endDate = new Date(year, month, 1).toISOString();

    const pipeline = [
      {
        $match: {
          sourceYear: year,
          date: { $gte: startDate, $lt: endDate },
          "awards.items.unit.value.amount": { $exists: true, $ne: null },
        },
      },
      { $unwind: "$awards" },
      { $unwind: "$awards.items" },
      {
        $match: {
          "awards.items.unit.value.amount": { $gt: 0 },
        },
      },
      {
        $group: {
          _id: "$awards.items.unit.value.currency",
          totalAmount: { $sum: "$awards.items.unit.value.amount" },
          totalTransactions: { $sum: 1 },
          averageAmount: { $avg: "$awards.items.unit.value.amount" },
        },
      },
    ];

    const results = await ReleaseModel.aggregate(pipeline);

    if (results.length === 0) {
      throw new Error(`No data found for ${year}-${month}`);
    }

    const mainResult = results.find((r) => r._id === "UYU") || results[0];

    const topSuppliers = await this.getTopSuppliersForMonth(year, month, 10);
    const topBuyers = await this.getTopBuyersForMonth(year, month, 10);
    const topCategories = await this.getTopCategoriesForMonth(year, month, 10);

    const insight: Partial<IExpenseInsight> = {
      year,
      month,
      totalAmount: mainResult.totalAmount,
      totalTransactions: mainResult.totalTransactions,
      averageAmount: mainResult.averageAmount,
      currency: mainResult._id,
      topSuppliers,
      topBuyers,
      topCategories,
    };

    const savedInsight = await ExpenseInsightModel.findOneAndUpdate({ year, month }, insight, { upsert: true, new: true });

    return savedInsight;
  }

  async detectAnomalies(batchSize: number = 1000): Promise<IAnomaly[]> {
    this.logger.info("Starting anomaly detection");

    const anomalies: any[] = [];
    let skip = 0;

    while (true) {
      const releases = await ReleaseModel.find({
        "awards.items.unit.value.amount": { $exists: true, $ne: null },
      })
        .skip(skip)
        .limit(batchSize)
        .lean();

      if (releases.length === 0) break;

      for (const release of releases) {
        const releaseAnomalies = await this.detectReleaseAnomalies(release);
        anomalies.push(...releaseAnomalies);
      }

      skip += batchSize;
      this.logger.info(`Processed ${skip} releases for anomaly detection`);
    }

    // Save anomalies to database
    if (anomalies.length > 0) {
      await AnomalyModel.insertMany(anomalies, { ordered: false });
      this.logger.info(`Detected and saved ${anomalies.length} anomalies`);
    }

    return anomalies;
  }

  private async detectReleaseAnomalies(release: IRelease): Promise<any[]> {
    const anomalies: any[] = [];

    if (!release.awards) return anomalies;

    for (const award of release.awards) {
      if (!award.items) continue;

      for (const item of award.items) {
        if (!item.unit?.value?.amount) continue;

        const amount = item.unit.value.amount;
        const currency = item.unit.value.currency;

        // Detect price spikes
        const priceAnomaly = await this.detectPriceSpike(item.classification.description, amount, currency, release.sourceYear || 2024);
        const metadata = {
          ...(award.suppliers?.[0]?.name && { supplierName: award.suppliers[0].name }),
          ...(release.buyer?.name && { buyerName: release.buyer.name }),
          ...(item.classification.description && { itemDescription: item.classification.description }),
          ...(release.sourceYear && { year: release.sourceYear }),
          ...(amount && { amount }),
          ...(currency && { currency }),
          ...(release.sourceFileName && { sourceFileName: release.sourceFileName }),
        };
        if (priceAnomaly) {
          const anomaly = new AnomalyModel({
            type: "price_spike",
            severity: priceAnomaly.severity,
            releaseId: release.id,
            awardId: award.id,
            description: `Unusual price detected for "${item.classification.description}"`,
            detectedValue: amount,
            expectedRange: priceAnomaly.expectedRange,
            confidence: priceAnomaly.confidence,
            metadata,
            detectedAt: new Date(),
          });
          anomalies.push(anomaly);
        }

        // Detect suspicious amounts (round numbers, unusually high/low)
        const suspiciousAmount = this.detectSuspiciousAmount(amount);
        if (suspiciousAmount) {
          const anomaly = new AnomalyModel({
            type: "suspicious_amount",
            severity: suspiciousAmount.severity,
            releaseId: release.id,
            awardId: award.id,
            description: suspiciousAmount.description,
            detectedValue: amount,
            expectedRange: { min: 0, max: 0 },
            confidence: suspiciousAmount.confidence,
            metadata,
            detectedAt: new Date(),
          });
          anomalies.push(anomaly);
        }

        // Detect outlier quantities
        const quantityAnomaly = this.detectOutlierQuantity(item.quantity);
        if (quantityAnomaly) {
          const anomaly = new AnomalyModel({
            type: "outlier_quantity",
            severity: quantityAnomaly.severity,
            releaseId: release.id,
            awardId: award.id,
            description: `Unusual quantity: ${item.quantity} for "${item.classification.description}"`,
            detectedValue: item.quantity,
            expectedRange: quantityAnomaly.expectedRange,
            confidence: quantityAnomaly.confidence,
            metadata,
            detectedAt: new Date(),
          });
          anomalies.push(anomaly);
        }
      }
    }

    return anomalies;
  }

  private async detectPriceSpike(itemDescription: string, amount: number, currency: string, year: number): Promise<{ severity: "low" | "medium" | "high" | "critical"; expectedRange: { min: number; max: number }; confidence: number } | null> {
    // Get historical prices for similar items
    const pipeline = [
      {
        $match: {
          "awards.items.classification.description": new RegExp(itemDescription.split(" ")[0], "i"),
          "awards.items.unit.value.currency": currency,
          sourceYear: { $gte: year - 2, $lte: year },
        },
      },
      { $unwind: "$awards" },
      { $unwind: "$awards.items" },
      {
        $match: {
          "awards.items.classification.description": new RegExp(itemDescription.split(" ")[0], "i"),
          "awards.items.unit.value.amount": { $gt: 0 },
        },
      },
      {
        $group: {
          _id: null,
          avgAmount: { $avg: "$awards.items.unit.value.amount" },
          minAmount: { $min: "$awards.items.unit.value.amount" },
          maxAmount: { $max: "$awards.items.unit.value.amount" },
          stdDev: { $stdDevPop: "$awards.items.unit.value.amount" },
          count: { $sum: 1 },
        },
      },
    ];

    const stats = await ReleaseModel.aggregate(pipeline);

    if (stats.length === 0 || stats[0].count < 5) return null;

    const { avgAmount, stdDev } = stats[0];
    const threshold = avgAmount + 3 * stdDev; // 3 standard deviations

    if (amount > threshold) {
      const severity: "low" | "medium" | "high" | "critical" = amount > avgAmount + 5 * stdDev ? "critical" : amount > avgAmount + 4 * stdDev ? "high" : "medium";

      return {
        severity,
        expectedRange: { min: avgAmount - stdDev, max: avgAmount + stdDev },
        confidence: Math.min(0.9, stats[0].count / 100),
      };
    }

    return null;
  }

  private detectSuspiciousAmount(amount: number): { severity: "low" | "medium" | "high" | "critical"; description: string; confidence: number } | null {
    // Check for suspiciously round numbers
    if (amount % 10000 === 0 && amount > 100000) {
      return {
        severity: "medium",
        description: `Suspiciously round amount: ${amount}`,
        confidence: 0.7,
      };
    }

    // Check for extremely high amounts
    if (amount > 10000000) {
      // 10 million
      return {
        severity: "high",
        description: `Extremely high amount: ${amount}`,
        confidence: 0.8,
      };
    }

    // Check for very low amounts (could be test data)
    if (amount < 10) {
      return {
        severity: "low",
        description: `Suspiciously low amount: ${amount}`,
        confidence: 0.6,
      };
    }

    return null;
  }

  private detectOutlierQuantity(quantity: number): { severity: "low" | "medium" | "high" | "critical"; expectedRange: { min: number; max: number }; confidence: number } | null {
    // Basic quantity anomaly detection
    if (quantity > 10000) {
      return {
        severity: "medium",
        expectedRange: { min: 1, max: 1000 },
        confidence: 0.7,
      };
    }

    if (quantity === 0) {
      return {
        severity: "low",
        expectedRange: { min: 1, max: 100 },
        confidence: 0.8,
      };
    }

    return null;
  }

  private async getTopSuppliers(year: number, limit: number) {
    const pipeline = [
      {
        $match: {
          sourceYear: year,
          "awards.suppliers": { $exists: true, $ne: [] },
        },
      },
      { $unwind: "$awards" },
      { $unwind: "$awards.suppliers" },
      { $unwind: "$awards.items" },
      {
        $group: {
          _id: {
            id: "$awards.suppliers.id",
            name: "$awards.suppliers.name",
          },
          totalAmount: { $sum: "$awards.items.unit.value.amount" },
          transactionCount: { $sum: 1 },
        },
      },
      { $sort: { totalAmount: -1 } },
      { $limit: limit },
      {
        $project: {
          _id: 0,
          id: "$_id.id",
          name: "$_id.name",
          totalAmount: 1,
          transactionCount: 1,
        },
      },
    ];

    return await ReleaseModel.aggregate(pipeline as any);
  }

  private async getTopBuyers(year: number, limit: number) {
    const pipeline = [
      {
        $match: {
          sourceYear: year,
          buyer: { $exists: true },
        },
      },
      { $unwind: "$awards" },
      { $unwind: "$awards.items" },
      {
        $group: {
          _id: {
            id: "$buyer.id",
            name: "$buyer.name",
          },
          totalAmount: { $sum: "$awards.items.unit.value.amount" },
          transactionCount: { $sum: 1 },
        },
      },
      { $sort: { totalAmount: -1 } },
      { $limit: limit },
      {
        $project: {
          _id: 0,
          id: "$_id.id",
          name: "$_id.name",
          totalAmount: 1,
          transactionCount: 1,
        },
      },
    ];

    return await ReleaseModel.aggregate(pipeline as any);
  }

  private async getTopCategories(year: number, limit: number) {
    const pipeline = [
      {
        $match: {
          sourceYear: year,
          "awards.items": { $exists: true, $ne: [] },
        },
      },
      { $unwind: "$awards" },
      { $unwind: "$awards.items" },
      {
        $group: {
          _id: "$awards.items.classification.description",
          totalAmount: { $sum: "$awards.items.unit.value.amount" },
          transactionCount: { $sum: 1 },
        },
      },
      { $sort: { totalAmount: -1 } },
      { $limit: limit },
      {
        $project: {
          _id: 0,
          description: "$_id",
          totalAmount: 1,
          transactionCount: 1,
        },
      },
    ];

    return await ReleaseModel.aggregate(pipeline as any);
  }

  private async getTopSuppliersForMonth(year: number, month: number, limit: number) {
    const startDate = new Date(year, month - 1, 1).toISOString();
    const endDate = new Date(year, month, 1).toISOString();

    const pipeline = [
      {
        $match: {
          sourceYear: year,
          date: { $gte: startDate, $lt: endDate },
          "awards.suppliers": { $exists: true, $ne: [] },
        },
      },
      { $unwind: "$awards" },
      { $unwind: "$awards.suppliers" },
      { $unwind: "$awards.items" },
      {
        $group: {
          _id: {
            id: "$awards.suppliers.id",
            name: "$awards.suppliers.name",
          },
          totalAmount: { $sum: "$awards.items.unit.value.amount" },
          transactionCount: { $sum: 1 },
        },
      },
      { $sort: { totalAmount: -1 } },
      { $limit: limit },
      {
        $project: {
          _id: 0,
          id: "$_id.id",
          name: "$_id.name",
          totalAmount: 1,
          transactionCount: 1,
        },
      },
    ];

    return await ReleaseModel.aggregate(pipeline as any);
  }

  private async getTopBuyersForMonth(year: number, month: number, limit: number) {
    const startDate = new Date(year, month - 1, 1).toISOString();
    const endDate = new Date(year, month, 1).toISOString();

    const pipeline = [
      {
        $match: {
          sourceYear: year,
          date: { $gte: startDate, $lt: endDate },
          buyer: { $exists: true },
        },
      },
      { $unwind: "$awards" },
      { $unwind: "$awards.items" },
      {
        $group: {
          _id: {
            id: "$buyer.id",
            name: "$buyer.name",
          },
          totalAmount: { $sum: "$awards.items.unit.value.amount" },
          transactionCount: { $sum: 1 },
        },
      },
      { $sort: { totalAmount: -1 } },
      { $limit: limit },
      {
        $project: {
          _id: 0,
          id: "$_id.id",
          name: "$_id.name",
          totalAmount: 1,
          transactionCount: 1,
        },
      },
    ];

    return await ReleaseModel.aggregate(pipeline as any);
  }

  private async getTopCategoriesForMonth(year: number, month: number, limit: number) {
    const startDate = new Date(year, month - 1, 1).toISOString();
    const endDate = new Date(year, month, 1).toISOString();

    const pipeline = [
      {
        $match: {
          sourceYear: year,
          date: { $gte: startDate, $lt: endDate },
          "awards.items": { $exists: true, $ne: [] },
        },
      },
      { $unwind: "$awards" },
      { $unwind: "$awards.items" },
      {
        $group: {
          _id: "$awards.items.classification.description",
          totalAmount: { $sum: "$awards.items.unit.value.amount" },
          transactionCount: { $sum: 1 },
        },
      },
      { $sort: { totalAmount: -1 } },
      { $limit: limit },
      {
        $project: {
          _id: 0,
          description: "$_id",
          totalAmount: 1,
          transactionCount: 1,
        },
      },
    ];

    return await ReleaseModel.aggregate(pipeline as any);
  }

  async analyzeSupplierPatterns(): Promise<ISupplierPatternResult[]> {
    this.logger.info("Retrieving pre-computed supplier patterns...");

    // Check if we have recent data, if not, recompute
    const recentPattern = await SupplierPatternModel.findOne().sort({ lastUpdated: -1 });
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    if (!recentPattern || recentPattern.lastUpdated < oneWeekAgo) {
      this.logger.info("Supplier patterns data is stale, recomputing...");
      await this.batchProcessor.processSupplierPatterns();
    }

    const patterns = await this.batchProcessor.getSupplierPatterns(50);
    return patterns.map((pattern) => ({
      _id: pattern.supplierId,
      name: pattern.name,
      totalContracts: pattern.totalContracts,
      years: pattern.years,
      yearCount: pattern.yearCount,
      buyers: pattern.buyers,
      buyerCount: pattern.buyerCount,
      avgContractValue: pattern.avgContractValue,
    }));
  }

  async analyzeBuyerPatterns(): Promise<IBuyerPatternResult[]> {
    this.logger.info("Retrieving pre-computed buyer patterns...");

    // Check if we have recent data, if not, recompute
    const recentPattern = await BuyerPatternModel.findOne().sort({ lastUpdated: -1 });
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    if (!recentPattern || recentPattern.lastUpdated < oneWeekAgo) {
      this.logger.info("Buyer patterns data is stale, recomputing...");
      await this.batchProcessor.processBuyerPatterns();
    }

    const patterns = await this.batchProcessor.getBuyerPatterns(50);
    return patterns.map((pattern) => ({
      _id: pattern.buyerId,
      name: pattern.name,
      totalContracts: pattern.totalContracts,
      years: pattern.years,
      yearCount: pattern.yearCount,
      suppliers: pattern.suppliers,
      supplierCount: pattern.supplierCount,
      totalSpending: pattern.totalSpending,
    }));
  }

  // Method to manually trigger analytics recomputation
  async recomputeAnalytics(): Promise<void> {
    this.logger.info("Manually triggering analytics recomputation...");
    await this.batchProcessor.processAllPatterns();
  }
}
