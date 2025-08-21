import { exec } from "child_process";
import express from "express";
import cron from "node-cron";
import { promisify } from "util";
import { DatabaseService } from "./services/database-service";
import { Logger } from "./services/logger-service";
import { ReleaseUploaderNew } from "./uploaders/release-uploader-new";

const execAsync = promisify(exec);

interface CronJobStatus {
  lastRun: Date | null;
  nextRun: Date | null;
  status: "idle" | "running" | "error";
  lastError: string | null;
  successfulRuns: number;
  failedRuns: number;
}

class CronServer {
  private app: express.Application;
  private logger: Logger;
  private databaseService: DatabaseService;
  private mongoUri: string;
  private jobStatus: CronJobStatus;
  private isJobRunning: boolean = false;

  constructor() {
    this.app = express();
    this.logger = new Logger();
    this.databaseService = new DatabaseService();
    this.mongoUri = process.env.MONGODB_URI || "mongodb://localhost:27017/gastos_gub";

    this.jobStatus = {
      lastRun: null,
      nextRun: null,
      status: "idle",
      lastError: null,
      successfulRuns: 0,
      failedRuns: 0,
    };

    this.setupMiddleware();
    this.setupRoutes();
    this.setupCronJob();
  }

  private setupMiddleware(): void {
    this.app.use(express.json());
    this.app.use((req, _res, next) => {
      this.logger.info(`${req.method} ${req.path} - ${req.ip}`);
      next();
    });
  }

  private setupRoutes(): void {
    // Health endpoint with comprehensive checks
    this.app.get("/health", async (_req, res) => {
      try {
        const healthData = await this.performHealthCheck();
        res.json(healthData);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error("Health check failed:", errorMessage);
        res.status(500).json({
          status: "unhealthy",
          error: errorMessage,
          timestamp: new Date().toISOString(),
        });
      }
    });

    // Cronjob status endpoint
    this.app.get("/cron/status", (_req, res) => {
      const nextRunTime = this.getNextRunTime();
      res.json({
        ...this.jobStatus,
        nextRun: nextRunTime,
        isRunning: this.isJobRunning,
      });
    });

    // Manual trigger endpoint for testing
    this.app.post("/cron/trigger", async (_req, res) => {
      if (this.isJobRunning) {
        res.status(409).json({
          error: "Cronjob is already running",
          status: this.jobStatus,
        });
        return;
      }

      try {
        this.logger.info("Manual cronjob trigger initiated");
        // Don't await this to avoid request timeout
        this.runDailyUploadJob().catch((error) => {
          this.logger.error("Manual trigger failed:", error);
        });

        res.json({
          message: "Cronjob triggered manually",
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        res.status(500).json({
          error: errorMessage,
          timestamp: new Date().toISOString(),
        });
      }
    });

    // MongoDB restart endpoint
    this.app.post("/admin/restart-mongodb", async (_req, res) => {
      try {
        this.logger.info("Attempting to restart MongoDB service...");
        await this.restartMongoDBService();
        res.json({
          message: "MongoDB service restart initiated",
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error("MongoDB restart failed:", errorMessage);
        res.status(500).json({
          error: errorMessage,
          timestamp: new Date().toISOString(),
        });
      }
    });
  }

  private async performHealthCheck(): Promise<any> {
    const healthData: any = {
      status: "healthy",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || "development",
      mongodb: {
        status: "unknown",
        connected: false,
      },
      cronjob: {
        ...this.jobStatus,
        nextRun: this.getNextRunTime(),
        isRunning: this.isJobRunning,
      },
    };

    // Check MongoDB connection
    try {
      const isConnected = this.databaseService.isConnected();

      if (!isConnected) {
        // Try to connect if not connected
        await this.databaseService.connect(this.mongoUri);
      }

      // Verify connection by performing a simple operation
      const mongoose = require("mongoose");
      await mongoose.connection.db.admin().ping();

      healthData.mongodb = {
        status: "healthy",
        connected: true,
        readyState: mongoose.connection.readyState,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error("MongoDB health check failed:", errorMessage);

      healthData.mongodb = {
        status: "unhealthy",
        connected: false,
        error: errorMessage,
      };

      // Attempt to restart MongoDB service if connection fails
      try {
        this.logger.info("MongoDB appears unhealthy, attempting service restart...");
        await this.restartMongoDBService();
        healthData.mongodb.restartAttempted = true;
        healthData.mongodb.restartTime = new Date().toISOString();
      } catch (restartError) {
        const restartErrorMessage = restartError instanceof Error ? restartError.message : String(restartError);
        this.logger.error("MongoDB restart attempt failed:", restartErrorMessage);
        healthData.mongodb.restartError = restartErrorMessage;
      }

      healthData.status = "degraded";
    }

    return healthData;
  }

  private async restartMongoDBService(): Promise<void> {
    try {
      this.logger.info("Executing MongoDB service restart...");

      // First try to stop the service gracefully
      try {
        await execAsync("sudo systemctl stop mongod", { timeout: 30000 });
        this.logger.info("MongoDB service stopped");
      } catch (stopError) {
        this.logger.warn("MongoDB stop command failed, continuing with restart...");
      }

      // Wait a moment for the service to fully stop
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Start the service
      const { stderr } = await execAsync("sudo systemctl start mongod", { timeout: 30000 });

      if (stderr && !stderr.includes("Warning")) {
        throw new Error(`MongoDB restart stderr: ${stderr}`);
      }

      this.logger.info("MongoDB service restart completed successfully");

      // Wait for MongoDB to be ready and try to reconnect
      await new Promise((resolve) => setTimeout(resolve, 5000));

      // Try to reconnect our database service
      if (this.databaseService.isConnected()) {
        await this.databaseService.disconnect();
      }

      await this.databaseService.connect(this.mongoUri);
      this.logger.info("Database reconnection successful after MongoDB restart");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error("MongoDB service restart failed:", errorMessage);
      throw new Error(`Failed to restart MongoDB service: ${errorMessage}`);
    }
  }

  private setupCronJob(): void {
    // Run every day at 00:00 (midnight)
    const cronExpression = "0 0 * * *";

    cron.schedule(
      cronExpression,
      async () => {
        if (this.isJobRunning) {
          this.logger.warn("Skipping scheduled run - previous job still running");
          return;
        }

        this.logger.info("Starting scheduled daily upload job...");
        await this.runDailyUploadJob();
      },
      {
        scheduled: true,
        timezone: "America/Montevideo", // Uruguay timezone
      }
    );

    this.logger.info(`Cronjob scheduled with expression: ${cronExpression} (Uruguay timezone)`);
    this.jobStatus.nextRun = this.getNextRunTime();
  }

  private getNextRunTime(): Date {
    // Calculate next midnight in Uruguay timezone
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);

    // Convert to Uruguay timezone (UTC-3)
    const uruguayOffset = -3 * 60; // Uruguay is UTC-3
    const localOffset = now.getTimezoneOffset();
    const timezoneOffset = uruguayOffset - localOffset;

    tomorrow.setMinutes(tomorrow.getMinutes() + timezoneOffset);

    return tomorrow;
  }

  private async runDailyUploadJob(): Promise<void> {
    this.isJobRunning = true;
    this.jobStatus.status = "running";
    this.jobStatus.lastRun = new Date();
    this.jobStatus.lastError = null;

    try {
      this.logger.info("=".repeat(50));
      this.logger.info("Starting daily release upload job");
      this.logger.info("=".repeat(50));

      const uploader = new ReleaseUploaderNew(this.databaseService, this.logger, this.mongoUri);

      // Run the upload process for current month only
      await uploader.uploadCurrentMonthFromWeb();

      this.jobStatus.status = "idle";
      this.jobStatus.successfulRuns++;
      this.logger.info("Daily upload job completed successfully");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.jobStatus.status = "error";
      this.jobStatus.lastError = errorMessage;
      this.jobStatus.failedRuns++;
      this.logger.error("Daily upload job failed:", errorMessage);
    } finally {
      this.isJobRunning = false;
      this.jobStatus.nextRun = this.getNextRunTime();
    }
  }

  public start(port: number = 3002): void {
    this.app.listen(port, () => {
      this.logger.info(`Cron server started on port ${port}`);
      this.logger.info("Health endpoint: http://localhost:" + port + "/health");
      this.logger.info("Cron status endpoint: http://localhost:" + port + "/cron/status");
      this.logger.info("Manual trigger endpoint: POST http://localhost:" + port + "/cron/trigger");
    });
  }
}

// Create and start the server
const cronServer = new CronServer();
const port = parseInt(process.env.CRON_SERVER_PORT || "3002");
cronServer.start(port);

export default CronServer;
