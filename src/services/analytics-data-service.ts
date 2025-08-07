import { AnomalyModel, BuyerPatternModel, ExpenseInsightModel, SupplierPatternModel } from "../../shared/models";
import { IAnomaly, IBuyerPattern, IExpenseInsight, ISupplierPattern } from "../database/release-model";
import { ILogger } from "./logger-service";

export interface IAnalyticsDataService {
  getExpenseInsights(year?: number, month?: number): Promise<IExpenseInsight[]>;
  getAnomalies(filters?: { type?: string; severity?: string; limit?: number }): Promise<IAnomaly[]>;
  getSupplierPatterns(limit?: number): Promise<ISupplierPattern[]>;
  getBuyerPatterns(limit?: number): Promise<IBuyerPattern[]>;
  getAnalyticsSummary(): Promise<{
    totalInsights: number;
    totalAnomalies: number;
    totalSuppliers: number;
    totalBuyers: number;
    lastUpdated: Date | null;
  }>;
}

export class AnalyticsDataService implements IAnalyticsDataService {
  constructor(private logger: ILogger) {}

  async getExpenseInsights(year?: number, month?: number): Promise<IExpenseInsight[]> {
    this.logger.info(`Retrieving expense insights for year: ${year}, month: ${month}`);

    const filter: any = {};
    if (year) filter.year = year;
    if (month) filter.month = month;

    const insights = await ExpenseInsightModel.find(filter).sort({ year: -1, month: -1 }).lean();

    return insights;
  }

  async getAnomalies(filters?: { type?: string; severity?: string; limit?: number }): Promise<IAnomaly[]> {
    this.logger.info("Retrieving anomalies with filters:", filters);

    const query: any = {};
    if (filters?.type) query.type = filters.type;
    if (filters?.severity) query.severity = filters.severity;

    const limit = filters?.limit || 100;

    const anomalies = await AnomalyModel.find(query).sort({ createdAt: -1 }).limit(limit).lean();

    return anomalies;
  }

  async getSupplierPatterns(limit: number = 50): Promise<ISupplierPattern[]> {
    this.logger.info(`Retrieving top ${limit} supplier patterns`);

    const suppliers = await SupplierPatternModel.find({}).sort({ totalContracts: -1 }).limit(limit).lean();

    return suppliers;
  }

  async getBuyerPatterns(limit: number = 50): Promise<IBuyerPattern[]> {
    this.logger.info(`Retrieving top ${limit} buyer patterns`);

    const buyers = await BuyerPatternModel.find({}).sort({ totalSpending: -1 }).limit(limit).lean();

    return buyers;
  }

  async getAnalyticsSummary(): Promise<{
    totalInsights: number;
    totalAnomalies: number;
    totalSuppliers: number;
    totalBuyers: number;
    lastUpdated: Date | null;
  }> {
    this.logger.info("Retrieving analytics summary");

    const [totalInsights, totalAnomalies, totalSuppliers, totalBuyers, lastSupplierUpdate, lastBuyerUpdate] = await Promise.all([ExpenseInsightModel.countDocuments(), AnomalyModel.countDocuments(), SupplierPatternModel.countDocuments(), BuyerPatternModel.countDocuments(), SupplierPatternModel.findOne().sort({ lastUpdated: -1 }).select("lastUpdated").lean(), BuyerPatternModel.findOne().sort({ lastUpdated: -1 }).select("lastUpdated").lean()]);

    const lastUpdated = lastSupplierUpdate?.lastUpdated && lastBuyerUpdate?.lastUpdated ? new Date(Math.max(lastSupplierUpdate.lastUpdated.getTime(), lastBuyerUpdate.lastUpdated.getTime())) : lastSupplierUpdate?.lastUpdated || lastBuyerUpdate?.lastUpdated || null;

    return {
      totalInsights,
      totalAnomalies,
      totalSuppliers,
      totalBuyers,
      lastUpdated,
    };
  }

  // Helper method to get supplier by ID
  async getSupplierById(supplierId: string): Promise<ISupplierPattern | null> {
    return await SupplierPatternModel.findOne({ supplierId }).lean();
  }

  // Helper method to get buyer by ID
  async getBuyerById(buyerId: string): Promise<IBuyerPattern | null> {
    return await BuyerPatternModel.findOne({ buyerId }).lean();
  }

  // Search suppliers by name
  async searchSuppliers(name: string, limit: number = 20): Promise<ISupplierPattern[]> {
    return await SupplierPatternModel.find({ name: new RegExp(name, "i") })
      .sort({ totalContracts: -1 })
      .limit(limit)
      .lean();
  }

  // Search buyers by name
  async searchBuyers(name: string, limit: number = 20): Promise<IBuyerPattern[]> {
    return await BuyerPatternModel.find({ name: new RegExp(name, "i") })
      .sort({ totalSpending: -1 })
      .limit(limit)
      .lean();
  }
}
