import cors from "cors";
import { config } from "dotenv";
import express, { NextFunction, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { query, validationResult } from "express-validator";
import helmet from "helmet";

import { AnomalyModel, ExpenseInsightModel, ReleaseModel } from "../../shared/models";
import { AnalyticsDataService } from "../services/analytics-data-service";
import { Logger } from "../services/logger-service";

// Load environment variables
config();

const app = express();
const logger = new Logger();
const analyticsDataService = new AnalyticsDataService(logger);

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "10mb" }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: "Too many requests from this IP, please try again later.",
});
app.use("/api/", limiter);

// Error handling middleware
const handleValidationErrors = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({
      success: false,
      message: "Validation errors",
      errors: errors.array(),
    });
    return;
  }
  next();
  return;
};

// Generic error handler
const asyncHandler = (fn: Function) => (req: Request, res: Response, next: NextFunction) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Pagination helper
interface PaginationOptions {
  page?: number;
  limit?: number;
  sort?: string;
  filter?: any;
}

const getPaginationParams = (req: Request): PaginationOptions => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = Math.min(parseInt(req.query.limit as string) || 10, 100); // Max 100 per page
  const sort = (req.query.sort as string) || "-createdAt";

  return { page, limit, sort };
};

// Routes

// Health check
app.get("/api/health", (_req: Request, res: Response) => {
  res.json({
    success: true,
    message: "Government Analytics API is running",
    timestamp: new Date().toISOString(),
  });
});

// Get releases with pagination and filtering
app.get(
  "/api/releases",
  [query("page").optional().isInt({ min: 1 }), query("limit").optional().isInt({ min: 1, max: 100 }), query("year").optional().isInt({ min: 2000, max: 2030 }), query("supplier").optional().isString(), query("buyer").optional().isString(), query("minAmount").optional().isFloat({ min: 0 }), query("maxAmount").optional().isFloat({ min: 0 }), query("currency").optional().isString(), handleValidationErrors],
  asyncHandler(async (req: Request, res: Response) => {
    const { page, limit, sort } = getPaginationParams(req);

    // Build filter
    const filter: any = {};

    if (req.query.year) {
      filter.sourceYear = parseInt(req.query.year as string);
    }

    if (req.query.supplier) {
      filter["awards.suppliers.name"] = new RegExp(req.query.supplier as string, "i");
    }

    if (req.query.buyer) {
      filter["buyer.name"] = new RegExp(req.query.buyer as string, "i");
    }

    if (req.query.currency) {
      filter["awards.items.unit.value.currency"] = req.query.currency;
    }

    if (req.query.minAmount || req.query.maxAmount) {
      filter["awards.items.unit.value.amount"] = {};
      if (req.query.minAmount) {
        filter["awards.items.unit.value.amount"].$gte = parseFloat(req.query.minAmount as string);
      }
      if (req.query.maxAmount) {
        filter["awards.items.unit.value.amount"].$lte = parseFloat(req.query.maxAmount as string);
      }
    }

    const options = {
      page,
      limit,
      sort,
      populate: [],
      lean: true,
    };

    const results = await (ReleaseModel as any).paginate(filter, options);

    res.json({
      success: true,
      data: results.docs,
      pagination: {
        currentPage: results.page,
        totalPages: results.totalPages,
        totalDocs: results.totalDocs,
        limit: results.limit,
        hasNextPage: results.hasNextPage,
        hasPrevPage: results.hasPrevPage,
      },
    });
  })
);

// Get release by ID
app.get(
  "/api/releases/:id",
  [query("id").isString(), handleValidationErrors],
  asyncHandler(async (req: Request, res: Response) => {
    const release = await ReleaseModel.findOne({ id: req.params.id }).lean();

    if (!release) {
      return res.status(404).json({
        success: false,
        message: "Release not found",
      });
    }

    return res.json({
      success: true,
      data: release,
    });
  })
);

// Get expense insights
app.get(
  "/api/insights",
  [query("year").optional().isInt({ min: 2000, max: 2030 }), query("month").optional().isInt({ min: 1, max: 12 }), handleValidationErrors],
  asyncHandler(async (req: Request, res: Response) => {
    const filter: any = {};

    if (req.query.year) {
      filter.year = parseInt(req.query.year as string);
    }

    if (req.query.month) {
      filter.month = parseInt(req.query.month as string);
    }

    const insights = await ExpenseInsightModel.find(filter).sort({ year: -1, month: -1 }).lean();

    res.json({
      success: true,
      data: insights,
    });
  })
);

// Get all expense insights (from pre-computed data)
app.get(
  "/api/analytics/insights",
  [query("year").optional().isInt({ min: 2000, max: 2030 }), query("month").optional().isInt({ min: 1, max: 12 }), handleValidationErrors],
  asyncHandler(async (req: Request, res: Response) => {
    const year = req.query.year ? parseInt(req.query.year as string) : undefined;
    const month = req.query.month ? parseInt(req.query.month as string) : undefined;

    const insights = await analyticsDataService.getExpenseInsights(year, month);

    res.json({
      success: true,
      data: insights,
      summary: {
        count: insights.length,
        years: [...new Set(insights.map((i) => i.year))].sort(),
        totalAmount: insights.reduce((sum, i) => sum + i.totalAmount, 0),
        totalTransactions: insights.reduce((sum, i) => sum + i.totalTransactions, 0),
      },
    });
  })
);

// Get insights for a specific year (from pre-computed data)
app.get(
  "/api/insights/:year",
  [query("year").isInt({ min: 2000, max: 2030 }), handleValidationErrors],
  asyncHandler(async (req: Request, res: Response) => {
    const year = parseInt(req.params.year);

    const insights = await analyticsDataService.getExpenseInsights(year);

    if (insights.length === 0) {
      res.status(404).json({
        success: false,
        message: `No insights found for year ${year}. Run batch analytics processing first.`,
      });
      return;
    }

    res.json({
      success: true,
      message: "Insights retrieved successfully",
      data: insights[0],
    });
  })
);

// Get anomalies with pagination and filtering
app.get(
  "/api/anomalies",
  [query("page").optional().isInt({ min: 1 }), query("limit").optional().isInt({ min: 1, max: 100 }), query("type").optional().isString(), query("severity").optional().isString(), query("minConfidence").optional().isFloat({ min: 0, max: 1 }), handleValidationErrors],
  asyncHandler(async (req: Request, res: Response) => {
    const { page, limit, sort } = getPaginationParams(req);

    const filter: any = {};

    if (req.query.type) {
      filter.type = req.query.type;
    }

    if (req.query.severity) {
      filter.severity = req.query.severity;
    }

    if (req.query.minConfidence) {
      filter.confidence = { $gte: parseFloat(req.query.minConfidence as string) };
    }

    const options = {
      page,
      limit,
      sort: sort || "-confidence",
      lean: true,
    };

    const results = await (AnomalyModel as any).paginate(filter, options);

    res.json({
      success: true,
      data: results.docs,
      pagination: {
        currentPage: results.page,
        totalPages: results.totalPages,
        totalDocs: results.totalDocs,
        limit: results.limit,
        hasNextPage: results.hasNextPage,
        hasPrevPage: results.hasPrevPage,
      },
    });
  })
);

// Get anomalies (from pre-computed data)
app.get(
  "/api/anomalies",
  [query("type").optional().isIn(["price_spike", "unusual_supplier", "high_frequency", "suspicious_amount", "outlier_quantity"]), query("severity").optional().isIn(["low", "medium", "high", "critical"]), query("limit").optional().isInt({ min: 1, max: 1000 }), handleValidationErrors],
  asyncHandler(async (req: Request, res: Response) => {
    const filters = {
      type: req.query.type as string,
      severity: req.query.severity as string,
      limit: parseInt(req.query.limit as string) || 100,
    };

    const anomalies = await analyticsDataService.getAnomalies(filters);

    res.json({
      success: true,
      message: `Retrieved ${anomalies.length} anomalies`,
      data: anomalies,
      summary: {
        count: anomalies.length,
        types: anomalies.reduce((acc: any, anomaly) => {
          acc[anomaly.type] = (acc[anomaly.type] || 0) + 1;
          return acc;
        }, {}),
        severities: anomalies.reduce((acc: any, anomaly) => {
          acc[anomaly.severity] = (acc[anomaly.severity] || 0) + 1;
          return acc;
        }, {}),
      },
    });
  })
);

// Get analytics overview (from pre-computed data)
app.get(
  "/api/analytics/overview",
  asyncHandler(async (_req: Request, res: Response) => {
    const [analyticsSummary, recentInsights, criticalAnomalies] = await Promise.all([analyticsDataService.getAnalyticsSummary(), analyticsDataService.getExpenseInsights().then((insights) => insights.slice(0, 5)), analyticsDataService.getAnomalies({ severity: "critical", limit: 10 })]);

    res.json({
      success: true,
      data: {
        overview: analyticsSummary,
        recentInsights,
        criticalAnomalies,
      },
    });
  })
);

// Get analytics dashboard data
app.get(
  "/api/dashboard",
  asyncHandler(async (_req: Request, res: Response) => {
    const [totalReleases, totalAnomalies, recentInsights, criticalAnomalies, yearlyStats] = await Promise.all([
      ReleaseModel.countDocuments(),
      AnomalyModel.countDocuments(),
      ExpenseInsightModel.find().sort({ createdAt: -1 }).limit(5).lean(),
      AnomalyModel.find({ severity: "critical" }).sort({ createdAt: -1 }).limit(10).lean(),
      ReleaseModel.aggregate([
        {
          $group: {
            _id: "$sourceYear",
            count: { $sum: 1 },
            totalAmount: { $sum: "$awards.items.unit.value.amount" },
          },
        },
        { $sort: { _id: -1 } },
        { $limit: 10 },
      ]),
    ]);

    res.json({
      success: true,
      data: {
        overview: {
          totalReleases,
          totalAnomalies,
          lastUpdated: new Date().toISOString(),
        },
        recentInsights,
        criticalAnomalies,
        yearlyStats,
      },
    });
  })
);

// Get supplier analysis (from pre-computed data)
app.get(
  "/api/analysis/suppliers",
  [query("limit").optional().isInt({ min: 1, max: 200 }), query("search").optional().isString(), handleValidationErrors],
  asyncHandler(async (req: Request, res: Response) => {
    const limit = parseInt(req.query.limit as string) || 50;
    const search = req.query.search as string;

    let supplierPatterns;
    if (search) {
      supplierPatterns = await analyticsDataService.searchSuppliers(search, limit);
    } else {
      supplierPatterns = await analyticsDataService.getSupplierPatterns(limit);
    }

    res.json({
      success: true,
      data: supplierPatterns,
      summary: {
        count: supplierPatterns.length,
        totalContracts: supplierPatterns.reduce((sum, s) => sum + s.totalContracts, 0),
        totalValue: supplierPatterns.reduce((sum, s) => sum + s.totalValue, 0),
      },
    });
  })
);

// Get buyer analysis (from pre-computed data)
app.get(
  "/api/analysis/buyers",
  [query("limit").optional().isInt({ min: 1, max: 200 }), query("search").optional().isString(), handleValidationErrors],
  asyncHandler(async (req: Request, res: Response) => {
    const limit = parseInt(req.query.limit as string) || 50;
    const search = req.query.search as string;

    let buyerPatterns;
    if (search) {
      buyerPatterns = await analyticsDataService.searchBuyers(search, limit);
    } else {
      buyerPatterns = await analyticsDataService.getBuyerPatterns(limit);
    }

    res.json({
      success: true,
      data: buyerPatterns,
      summary: {
        count: buyerPatterns.length,
        totalContracts: buyerPatterns.reduce((sum, b) => sum + b.totalContracts, 0),
        totalSpending: buyerPatterns.reduce((sum, b) => sum + b.totalSpending, 0),
      },
    });
  })
);

// Get spending trends
app.get(
  "/api/analysis/trends",
  [query("startYear").optional().isInt({ min: 2000, max: 2030 }), query("endYear").optional().isInt({ min: 2000, max: 2030 }), handleValidationErrors],
  asyncHandler(async (req: Request, res: Response) => {
    const startYear = parseInt(req.query.startYear as string) || 2020;
    const endYear = parseInt(req.query.endYear as string) || new Date().getFullYear();

    const trends = await ReleaseModel.aggregate([
      {
        $match: {
          sourceYear: { $gte: startYear, $lte: endYear },
          "awards.items.unit.value.amount": { $exists: true, $ne: null },
        },
      },
      { $unwind: "$awards" },
      { $unwind: "$awards.items" },
      {
        $group: {
          _id: {
            year: "$sourceYear",
            month: { $month: { $dateFromString: { dateString: "$date" } } },
          },
          totalAmount: { $sum: "$awards.items.unit.value.amount" },
          transactionCount: { $sum: 1 },
          avgAmount: { $avg: "$awards.items.unit.value.amount" },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } },
    ]);

    res.json({
      success: true,
      data: trends,
    });
  })
);

// Error handling middleware
app.use((error: any, _req: Request, res: Response, _next: NextFunction) => {
  logger.error("API Error:", error);

  res.status(error.status || 500).json({
    success: false,
    message: error.message || "Internal server error",
    ...(process.env.NODE_ENV === "development" && { stack: error.stack }),
  });
});

// 404 handler
app.use("*", (_req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

export default app;
