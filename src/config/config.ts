import { ScraperConfig } from "../types/interfaces";

/**
 * Configuration constants for the application
 */
export const SCRAPER_CONFIG: ScraperConfig = {
  targetUrl: "https://www.comprasestatales.gub.uy/ocds/rss",
  timeout: 30000,
  retryAttempts: 3,
  userAgent: "Government Data Scraper Bot 1.0",
};

/**
 * Constants used throughout the application
 */
export const SELECTORS = {
  DOWNLOAD_LINKS: 'a[href*="/download/ocds-"]',
  YEAR_PATTERN: /ocds-(\d{4})\.zip$/,
  BASE_URL: "https://catalogodatos.gub.uy",
} as const;

/**
 * Output configuration
 */
export const OUTPUT_CONFIG = {
  FILE_PATH: "./urls.json",
  ENCODING: "utf8" as const,
  INDENT_SIZE: 2,
} as const;

/**
 * Database directory configuration
 */
export const DB_CONFIG = {
  ROOT_DIR: "db",
  EXTRACTED_SUBDIR: "extracted",
} as const;

/**
 * MongoDB configuration
 */
export const MONGO_CONFIG = {
  uri: process.env.MONGODB_URI || "mongodb://localhost:27017",
  database: process.env.MONGODB_DATABASE || "gastos_gub",
  collection: process.env.MONGODB_COLLECTION || "releases",
  batchSize: parseInt(process.env.MONGODB_BATCH_SIZE || "1000"),
} as const;

/**
 * Schema analyzer configuration
 */
export const SCHEMA_ANALYZER_CONFIG = {
  sampleSize: 100, // Number of records to sample for schema analysis
  maxDepth: 10, // Maximum depth to analyze nested objects
  exampleCount: 3, // Number of examples to keep for each field
} as const;
