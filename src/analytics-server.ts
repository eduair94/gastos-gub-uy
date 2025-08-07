import { config } from "dotenv";
import mongoose from "mongoose";
import app from "./api/server";
import { Logger } from "./services/logger-service";

// Load environment variables
config();

const logger = new Logger();
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;

async function startServer() {
  try {
    // Connect to MongoDB
    if (!MONGODB_URI) {
      throw new Error("MONGODB_URI environment variable is required");
    }

    await mongoose.connect(MONGODB_URI);
    logger.info("Connected to MongoDB");

    // Start the server
    app.listen(PORT, () => {
      logger.info(`🚀 Government Analytics API server running on port ${PORT}`);
      logger.info(`📊 API Documentation available at http://localhost:${PORT}/api/health`);
      logger.info(`🔍 Available endpoints:`);
      logger.info(`   GET  /api/analytics/insights - Get expense insights (pre-computed)`);
      logger.info(`   GET  /api/analytics/anomalies - Get anomalies with filtering (pre-computed)`);
      logger.info(`   GET  /api/analytics/overview - Get analytics overview (pre-computed)`);
      logger.info(`   GET  /api/analysis/suppliers - Get supplier analysis (pre-computed)`);
      logger.info(`   GET  /api/analysis/buyers - Get buyer analysis (pre-computed)`);
      logger.info(`   GET  /api/insights/:year - Get insights for specific year`);
      logger.info(`   GET  /api/data/releases - Get releases with pagination`);
      logger.info(`   GET  /api/dashboard - Dashboard data with yearly stats`);
      logger.info(`   GET  /api/stats/database - Database statistics`);
      logger.info(`💡 All analytics data is pre-computed for better performance`);
      logger.info(`⚡ Run batch analytics processing to update data`);
    });
  } catch (error) {
    logger.error("Failed to start server:", error as Error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on("SIGTERM", async () => {
  logger.info("SIGTERM received, shutting down gracefully");
  await mongoose.disconnect();
  process.exit(0);
});

process.on("SIGINT", async () => {
  logger.info("SIGINT received, shutting down gracefully");
  await mongoose.disconnect();
  process.exit(0);
});

// Start the server
if (require.main === module) {
  startServer();
}

export { app };
