import { MongoDbClient } from "../../shared/connection/mongodb-client";
import {
  DatabaseClient,
  DataManager,
  DataUploader,
  DataWriter,
  FileDownloader,
  FileExtractor,
  HtmlParser,
  HttpClient,
  JsonProcessor,
  Logger,
  SchemaAnalyzer,
  ScraperConfig,
  UrlExtractor,
  WebScraper
} from "../../shared/types/interfaces";
import { JsonSchemaAnalyzer } from "../analyzers/json-schema-analyzer";
import { MONGO_CONFIG, SCHEMA_ANALYZER_CONFIG, SCRAPER_CONFIG } from "../config/config";
import { AxiosFileDownloader } from "../downloaders/file-downloader";
import { ZipFileExtractor } from "../extractors/file-extractor";
import { GovernmentDataUrlExtractor } from "../extractors/url-extractor";
import { AxiosHttpClient } from "../http/axios-client";
import { GovernmentDataManager } from "../managers/data-manager";
import { CheerioParser } from "../parsers/cheerio-parser";
import { StreamingJsonProcessor } from "../processors/streaming-json-processor";
import { GovernmentDataScraper } from "../scrapers/government-data-scraper";
import { MongoDataUploader } from "../uploaders/mongo-data-uploader";
import { ConsoleLogger } from "../utils/logger";
import { JsonFileWriter } from "../writers/json-writer";

/**
 * Factory class for creating scraper instances
 * Following Dependency Inversion Principle - creates dependencies and injects them
 * Following Single Responsibility Principle - only responsible for object creation
 */
export class ScraperFactory {
  /**
   * Creates a fully configured web scraper instance
   * This method demonstrates the Dependency Injection pattern
   */
  static createScraper(): WebScraper {
    // Create configuration and logger (no dependencies)
    const config: ScraperConfig = SCRAPER_CONFIG;
    const logger: Logger = new ConsoleLogger();

    // Create dependencies (injecting config and logger)
    const httpClient: HttpClient = new AxiosHttpClient(config, logger);
    const htmlParser: HtmlParser = new CheerioParser();
    const urlExtractor: UrlExtractor = new GovernmentDataUrlExtractor(logger);
    const dataWriter: DataWriter = new JsonFileWriter(logger);

    // Create and return the main scraper (injecting all dependencies)
    return new GovernmentDataScraper(httpClient, htmlParser, urlExtractor, dataWriter, config, logger);
  }

  /**
   * Creates a data manager for downloading and extracting files
   * Following Dependency Injection pattern
   */
  static createDataManager(): DataManager {
    const config: ScraperConfig = SCRAPER_CONFIG;
    const logger: Logger = new ConsoleLogger();

    const fileDownloader: FileDownloader = new AxiosFileDownloader(config, logger);
    const fileExtractor: FileExtractor = new ZipFileExtractor(logger);

    return new GovernmentDataManager(fileDownloader, fileExtractor, logger);
  }

  /**
   * Creates a scraper with custom configuration
   * Following Open/Closed Principle - allows extension without modification
   */
  static createScraperWithConfig(customConfig: Partial<ScraperConfig>): WebScraper {
    const defaultConfig = SCRAPER_CONFIG;
    const config: ScraperConfig = { ...defaultConfig, ...customConfig };
    const logger: Logger = new ConsoleLogger();

    const httpClient: HttpClient = new AxiosHttpClient(config, logger);
    const htmlParser: HtmlParser = new CheerioParser();
    const urlExtractor: UrlExtractor = new GovernmentDataUrlExtractor(logger);
    const dataWriter: DataWriter = new JsonFileWriter(logger);

    return new GovernmentDataScraper(httpClient, htmlParser, urlExtractor, dataWriter, config, logger);
  }

  /**
   * Creates and configures a schema analyzer instance
   */
  static createSchemaAnalyzer(): SchemaAnalyzer {
    const logger = new ConsoleLogger();
    return new JsonSchemaAnalyzer(SCHEMA_ANALYZER_CONFIG, logger);
  }

  /**
   * Creates and configures a MongoDB client instance
   */
  static createDatabaseClient(): DatabaseClient {
    const logger = new ConsoleLogger();
    return new MongoDbClient(MONGO_CONFIG, logger);
  }

  /**
   * Creates and configures a JSON processor instance
   */
  static createJsonProcessor(): JsonProcessor {
    const logger = new ConsoleLogger();
    return new StreamingJsonProcessor(logger);
  }

  /**
   * Creates and configures a data uploader instance
   */
  static createDataUploader(): DataUploader {
    const logger = new ConsoleLogger();
    const dbClient = ScraperFactory.createDatabaseClient();
    const jsonProcessor = ScraperFactory.createJsonProcessor();
    
    return new MongoDataUploader(dbClient, jsonProcessor, logger);
  }

  /**
   * Creates a complete data analysis and upload pipeline
   */
  static createAnalysisAndUploadPipeline(): {
    schemaAnalyzer: SchemaAnalyzer;
    dataUploader: DataUploader;
    dbClient: DatabaseClient;
  } {
    return {
      schemaAnalyzer: ScraperFactory.createSchemaAnalyzer(),
      dataUploader: ScraperFactory.createDataUploader(),
      dbClient: ScraperFactory.createDatabaseClient()
    };
  }
}
