import { exec, spawn } from "child_process";
import path from "path";
import express from "express";
import cron from "node-cron";
import { promisify } from "util";
// Load .env as early as possible so process.env values are available
import dotenv from "dotenv";
dotenv.config();

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

const freshStatus = (): CronJobStatus => ({
  lastRun: null,
  nextRun: null,
  status: "idle",
  lastError: null,
  successfulRuns: 0,
  failedRuns: 0,
});

class CronServer {
  private app: express.Application;
  private logger: Logger;
  private databaseService: DatabaseService;
  private mongoUri: string;
  private jobStatus: CronJobStatus;
  private isJobRunning: boolean = false;
  private reconcileStatus: CronJobStatus;
  private isReconcileRunning: boolean = false;
  private readonly reconcileMonthsBack: number = 5;
  private analyticsStatus: CronJobStatus;
  private isAnalyticsRunning: boolean = false;
  private anomalyStatus: CronJobStatus;
  private isAnomalyRunning: boolean = false;

  constructor() {
    this.app = express();
    this.logger = new Logger();
    this.databaseService = new DatabaseService();
    this.mongoUri = process.env.MONGODB_URI || "mongodb://localhost:27017/gastos_gub";

    this.jobStatus = freshStatus();
    this.reconcileStatus = freshStatus();
    this.analyticsStatus = freshStatus();
    this.anomalyStatus = freshStatus();

    this.setupMiddleware();
    this.setupRoutes();
    this.setupCronJob();
  }

  /**
   * Names whichever job currently holds the box, or null when idle.
   *
   * All four jobs are mutually exclusive, and this is the single place that decides it. Each guard
   * used to be hand-written at its own call site and every one checked a different subset: ingest
   * never looked at reconcile, analytics never looked at reconcile, and the HTTP reconcile trigger
   * checked neither of the other two. Ingest and reconcile both WRITE releases; analytics and the
   * detector run multi-minute aggregations over them. Overlap risks writer-vs-writer conflict on the
   * same releases and, at best, wastes a shared 6-core box on jobs that are individually infrequent.
   *
   * Serialising costs almost nothing: the schedules are already staggered (:05 hourly ingest at ~6s,
   * :30 six-hourly analytics at ~7min, 04:15 daily detector at ~50s, Sunday 02:00 reconcile), so
   * this only bites on manual triggers or an unusually long run — where skipping is the right call.
   *
   * NOTE: these are in-process booleans, not a durable lock. A pm2 restart forgets them while a
   * spawned child keeps running, so a job triggered right after a restart could still overlap an
   * orphan. A collection-based lock would close that; it has not been needed yet.
   */
  private busyWith(): string | null {
    if (this.isJobRunning) return "ingest";
    if (this.isReconcileRunning) return "reconciliation";
    if (this.isAnalyticsRunning) return "analytics refresh";
    if (this.isAnomalyRunning) return "anomaly detection";
    return null;
  }

  /**
   * Runs one of the analytics jobs as a detached child process.
   *
   * These aggregate over ~2.2M releases, while this server is started by pm2 with
   * `--max-old-space-size=512` (see cronserver.config.js). Running them in-process would either OOM
   * or take the ingest scheduler down with them. A child gets its own, larger heap and its failure
   * is just a non-zero exit code here.
   */
  private runJobProcess(script: string, args: string[] = []): Promise<void> {
    // Under pm2 this file is dist/src/cronserver.js and siblings are compiled; under `tsx` it is
    // still TypeScript. Pick the interpreter that matches whichever one is executing.
    //
    // `script` is a path relative to src/ without extension, e.g. "jobs/refresh-analytics" or
    // "populate-filters".
    const isTs = __filename.endsWith(".ts");
    const jobPath = path.join(__dirname, `${script}.${isTs ? "ts" : "js"}`);
    const command = isTs ? "npx" : process.execPath;
    const argv = isTs
      ? ["tsx", jobPath, ...args]
      : ["--max-old-space-size=2048", jobPath, ...args];

    return new Promise((resolve, reject) => {
      this.logger.info(`Spawning job: ${script} ${args.join(" ")}`);
      const child = spawn(command, argv, {
        cwd: path.resolve(__dirname, isTs ? ".." : "../.."),
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
      });

      child.stdout?.on("data", (d) => this.logger.info(`[${script}] ${String(d).trimEnd()}`));
      child.stderr?.on("data", (d) => this.logger.warn(`[${script}] ${String(d).trimEnd()}`));

      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`${script} exited with code ${code}`));
      });
    });
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

    // Manual trigger endpoint for testing (POST)
    this.app.post("/cron/trigger", async (_req, res) => {
      const busy = this.busyWith();
      if (busy) {
        res.status(409).json({
          error: `Cannot start ingest - ${busy} is running`,
          status: this.jobStatus,
        });
        return;
      }

      try {
        this.logger.info("Manual cronjob trigger initiated (POST)");
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

    // Manual trigger endpoint for testing (GET)
    this.app.get("/cron/trigger", async (_req, res) => {
      const busy = this.busyWith();
      if (busy) {
        res.status(409).json({
          error: `Cannot start ingest - ${busy} is running`,
          status: this.jobStatus,
        });
        return;
      }

      try {
        this.logger.info("Manual cronjob trigger initiated (GET)");
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

    // Reconciliation status endpoint
    this.app.get("/cron/reconcile/status", (_req, res) => {
      res.json({
        ...this.reconcileStatus,
        isRunning: this.isReconcileRunning,
        monthsBack: this.reconcileMonthsBack,
      });
    });

    // Manual reconciliation trigger (GET/POST) - re-checks non-final releases from the last N months
    const triggerReconcile = (_req: express.Request, res: express.Response): void => {
      const busy = this.busyWith();
      if (busy) {
        res.status(409).json({
          error: `Cannot start reconciliation - ${busy} is running`,
          status: this.reconcileStatus,
        });
        return;
      }

      this.logger.info("Manual reconciliation trigger initiated");
      // Don't await to avoid request timeout
      this.runReconcileJob().catch((error) => {
        this.logger.error("Manual reconcile trigger failed:", error);
      });

      res.json({
        message: "Reconciliation job triggered manually",
        monthsBack: this.reconcileMonthsBack,
        timestamp: new Date().toISOString(),
      });
    };
    this.app.post("/cron/reconcile", triggerReconcile);
    this.app.get("/cron/reconcile", triggerReconcile);

    // Analytics refresh: status + manual trigger
    this.app.get("/cron/analytics/status", (_req, res) => {
      res.json({ ...this.analyticsStatus, isRunning: this.isAnalyticsRunning });
    });

    const triggerAnalytics = (_req: express.Request, res: express.Response): void => {
      const busy = this.busyWith();
      if (busy) {
        res.status(409).json({ error: `Cannot start analytics refresh - ${busy} is running`, status: this.analyticsStatus });
        return;
      }
      this.logger.info("Manual analytics refresh trigger initiated");
      this.runAnalyticsJob().catch((error) => {
        this.logger.error("Manual analytics trigger failed:", error);
      });
      res.json({ message: "Analytics refresh triggered manually", timestamp: new Date().toISOString() });
    };
    this.app.post("/cron/analytics", triggerAnalytics);
    this.app.get("/cron/analytics", triggerAnalytics);

    // Anomaly detection: status + manual trigger
    this.app.get("/cron/anomalies/status", (_req, res) => {
      res.json({ ...this.anomalyStatus, isRunning: this.isAnomalyRunning });
    });

    const triggerAnomalies = (_req: express.Request, res: express.Response): void => {
      const busy = this.busyWith();
      if (busy) {
        res.status(409).json({ error: `Cannot start anomaly detection - ${busy} is running`, status: this.anomalyStatus });
        return;
      }
      this.logger.info("Manual anomaly detection trigger initiated");
      this.runAnomalyJob().catch((error) => {
        this.logger.error("Manual anomaly trigger failed:", error);
      });
      res.json({ message: "Anomaly detection triggered manually", timestamp: new Date().toISOString() });
    };
    this.app.post("/cron/anomalies", triggerAnomalies);
    this.app.get("/cron/anomalies", triggerAnomalies);

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
      reconcile: {
        ...this.reconcileStatus,
        isRunning: this.isReconcileRunning,
        monthsBack: this.reconcileMonthsBack,
      },
      analytics: {
        ...this.analyticsStatus,
        isRunning: this.isAnalyticsRunning,
      },
      anomalies: {
        ...this.anomalyStatus,
        isRunning: this.isAnomalyRunning,
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
    // Ingest runs hourly at :05 so newly awarded contracts show up within the hour instead of
    // waiting for the next midnight. This is cheap despite the "last 7 days" name: it pulls the
    // current month's RSS feed, diffs the IDs against what is already stored, and only fetches
    // releases that are new or were re-published upstream. A quiet hour costs ~2 RSS requests.
    const cronExpression = "5 * * * *";

    cron.schedule(
      cronExpression,
      async () => {
        await this.runDailyUploadJob();
      },
      {
        scheduled: true,
        timezone: "America/Montevideo", // Uruguay timezone
      }
    );

    this.logger.info(`Ingest job scheduled with expression: ${cronExpression} (Uruguay timezone)`);
    this.jobStatus.nextRun = this.getNextRunTime();

    // Analytics rebuild. Every 6 hours at :30, offset from the :05 ingest so the two do not overlap.
    // Nothing scheduled this before, which is why every pre-calculated collection was still serving
    // figures from the last manual run.
    const analyticsExpression = "30 */6 * * *";
    cron.schedule(
      analyticsExpression,
      async () => {
        await this.runAnalyticsJob();
      },
      { scheduled: true, timezone: "America/Montevideo" }
    );
    this.logger.info(`Analytics job scheduled with expression: ${analyticsExpression} (Uruguay timezone)`);

    // Anomaly detection. Daily at 04:15, after the 00:30 analytics pass. Rebuilds the price
    // baselines and rescores recent releases against them.
    const anomalyExpression = "15 4 * * *";
    cron.schedule(
      anomalyExpression,
      async () => {
        await this.runAnomalyJob();
      },
      { scheduled: true, timezone: "America/Montevideo" }
    );
    this.logger.info(`Anomaly job scheduled with expression: ${anomalyExpression} (Uruguay timezone)`);

    // Weekly reconciliation: every Sunday at 02:00 (Uruguay time) re-check non-final releases
    // from the last N months against the live API to catch late awards / silent edits.
    const reconcileExpression = "0 2 * * 0";
    cron.schedule(
      reconcileExpression,
      async () => {
        await this.runReconcileJob();
      },
      {
        scheduled: true,
        timezone: "America/Montevideo",
      }
    );

    this.logger.info(`Reconciliation job scheduled with expression: ${reconcileExpression} (Uruguay timezone)`);
  }

  /**
   * Next ingest tick: the coming :05. Minute-of-hour is timezone-independent for every zone at a
   * whole-hour offset, so unlike the old next-midnight version this needs no offset arithmetic.
   */
  private getNextRunTime(): Date {
    const next = new Date();
    next.setSeconds(0, 0);
    if (next.getMinutes() >= 5) {
      next.setHours(next.getHours() + 1);
    }
    next.setMinutes(5);
    return next;
  }

  private async runDailyUploadJob(): Promise<void> {
    const busy = this.busyWith();
    if (busy) {
      this.logger.warn(`Skipping ingest - ${busy} is running`);
      return;
    }

    this.isJobRunning = true;
    this.jobStatus.status = "running";
    this.jobStatus.lastRun = new Date();
    this.jobStatus.lastError = null;

    try {
      this.logger.info("=".repeat(50));
      this.logger.info("Starting release upload job (last 7 days)");
      this.logger.info("=".repeat(50));

      const uploader = new ReleaseUploaderNew(this.databaseService, this.logger, this.mongoUri);

      // Run the upload process for last 7 days only
      await uploader.uploadLastSevenDaysFromWeb();

      this.jobStatus.status = "idle";
      this.jobStatus.successfulRuns++;
      this.logger.info("Ingest job completed successfully");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.jobStatus.status = "error";
      this.jobStatus.lastError = errorMessage;
      this.jobStatus.failedRuns++;
      this.logger.error("Ingest job failed:", errorMessage);
    } finally {
      this.isJobRunning = false;
      this.jobStatus.nextRun = this.getNextRunTime();
    }
  }

  private async runReconcileJob(): Promise<void> {
    const busy = this.busyWith();
    if (busy) {
      this.logger.warn(`Skipping reconciliation - ${busy} is running`);
      return;
    }

    this.isReconcileRunning = true;
    this.reconcileStatus.status = "running";
    this.reconcileStatus.lastRun = new Date();
    this.reconcileStatus.lastError = null;

    try {
      this.logger.info("=".repeat(50));
      this.logger.info(`Starting reconciliation job (non-final releases, last ${this.reconcileMonthsBack} months)`);
      this.logger.info("=".repeat(50));

      const uploader = new ReleaseUploaderNew(this.databaseService, this.logger, this.mongoUri);
      const result = await uploader.reconcileNonFinalReleases(this.reconcileMonthsBack);

      this.reconcileStatus.status = "idle";
      this.reconcileStatus.successfulRuns++;
      this.logger.info(`Reconciliation job completed: scanned ${result.scanned}, updated ${result.updated}, failed ${result.failed}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.reconcileStatus.status = "error";
      this.reconcileStatus.lastError = errorMessage;
      this.reconcileStatus.failedRuns++;
      this.logger.error("Reconciliation job failed:", errorMessage);
    } finally {
      this.isReconcileRunning = false;
    }
  }

  /**
   * Rebuilds supplier/buyer patterns and every pre-calculated dashboard collection.
   * Skipped rather than queued if ingest or a previous pass is still going — a stale dashboard for
   * six more hours beats two rebuilds writing the same collections at once.
   */
  private async runAnalyticsJob(): Promise<void> {
    const busy = this.busyWith();
    if (busy) {
      this.logger.warn(`Skipping analytics refresh - ${busy} is running`);
      return;
    }

    this.isAnalyticsRunning = true;
    this.analyticsStatus.status = "running";
    this.analyticsStatus.lastRun = new Date();
    this.analyticsStatus.lastError = null;

    try {
      this.logger.info("Starting analytics refresh...");
      await this.runJobProcess("jobs/refresh-analytics");

      // filter_data drives the frontend's filter dropdowns (years, buyers, suppliers, statuses,
      // methods). It is a separate script and nothing ever scheduled it either, so the year filter
      // was still offering 2002-2025 with no 2026 — 80,500 releases unreachable from the UI.
      // Runs after the rebuild so a failure here cannot abort the analytics that already landed.
      this.logger.info("Refreshing filter data...");
      await this.runJobProcess("populate-filters");

      // Per catalogue-code analytics (product_analytics), for the /products pages. Non-fatal and
      // last, like populate-filters: a slow product rebuild must not roll back analytics that
      // already landed. Sets a long socket timeout because its four grouped scans over ~2.2M
      // releases legitimately run for minutes (see shared/connection/database.ts).
      this.logger.info("Refreshing product analytics...");
      await this.runJobProcess("jobs/refresh-product-analytics").catch((error) => {
        this.logger.error("Product analytics refresh failed (non-fatal):", error);
      });

      this.analyticsStatus.status = "idle";
      this.analyticsStatus.successfulRuns++;
      this.logger.info("Analytics refresh completed successfully");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.analyticsStatus.status = "error";
      this.analyticsStatus.lastError = errorMessage;
      this.analyticsStatus.failedRuns++;
      this.logger.error("Analytics refresh failed:", errorMessage);
    } finally {
      this.isAnalyticsRunning = false;
    }
  }

  /** Rebuilds item price baselines, then rescores recent releases against them. */
  private async runAnomalyJob(): Promise<void> {
    const busy = this.busyWith();
    if (busy) {
      this.logger.warn(`Skipping anomaly detection - ${busy} is running`);
      return;
    }

    this.isAnomalyRunning = true;
    this.anomalyStatus.status = "running";
    this.anomalyStatus.lastRun = new Date();
    this.anomalyStatus.lastError = null;

    try {
      this.logger.info("Starting anomaly detection...");
      await this.runJobProcess("jobs/detect-anomalies");

      // Second-stage LLM triage of the fresh flags. Runs right after detection so new/changed
      // anomalies get an aiVerdict the same night. Non-fatal and last, like the analytics tail
      // jobs: a Gemini/network hiccup (or a missing GEMINI_API_KEY) must not mark the statistical
      // detection — which is the source of truth — as failed. It is incremental by construction,
      // so it only spends on flags that changed since its last run.
      this.logger.info("Starting AI anomaly triage...");
      await this.runJobProcess("jobs/score-anomalies-ai").catch((error) => {
        this.logger.error("AI anomaly triage failed (non-fatal):", error);
      });

      this.anomalyStatus.status = "idle";
      this.anomalyStatus.successfulRuns++;
      this.logger.info("Anomaly detection completed successfully");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.anomalyStatus.status = "error";
      this.anomalyStatus.lastError = errorMessage;
      this.anomalyStatus.failedRuns++;
      this.logger.error("Anomaly detection failed:", errorMessage);
    } finally {
      this.isAnomalyRunning = false;
    }
  }

  public start(port: number = 3002): void {
    this.app.listen(port, () => {
      this.logger.info(`Cron server started on port ${port}`);
      this.logger.info("Health endpoint: http://localhost:" + port + "/health");
      this.logger.info("Cron status endpoint: http://localhost:" + port + "/cron/status");
      this.logger.info("Manual trigger endpoint: GET/POST http://localhost:" + port + "/cron/trigger");
    });
  }
}

// Create and start the server
const cronServer = new CronServer();
const port = parseInt(process.env.CRON_SERVER_PORT || "3002");
cronServer.start(port);

export default CronServer;
