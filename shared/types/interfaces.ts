// Types and Interfaces following SOLID principles

/**
 * Represents a year-URL pair for government expenditure data
 */
export interface UrlEntry {
  year: string;
  url: string;
}

/**
 * Configuration for the web scraper
 */
export interface ScraperConfig {
  readonly targetUrl: string;
  readonly timeout: number;
  readonly retryAttempts: number;
  readonly userAgent: string;
}

/**
 * Interface for HTTP client abstraction (Dependency Inversion Principle)
 */
export interface HttpClient {
  get(url: string): Promise<string>;
  downloadFile(url: string, outputPath: string): Promise<void>;
}

/**
 * Interface for HTML parser abstraction (Dependency Inversion Principle)
 */
export interface HtmlParser {
  parse(html: string): ParsedDocument;
}

/**
 * Interface for parsed document abstraction
 */
export interface ParsedDocument {
  findAll(selector: string): ParsedElement[];
}

/**
 * Interface for parsed HTML element
 */
export interface ParsedElement {
  getAttribute(name: string): string | null;
  getText(): string;
}

/**
 * Interface for URL extractor (Single Responsibility Principle)
 */
export interface UrlExtractor {
  extractUrls(document: ParsedDocument): UrlEntry[];
}

/**
 * Interface for data writer (Single Responsibility Principle)
 */
export interface DataWriter {
  write(data: UrlEntry[], outputPath: string): Promise<void>;
}

/**
 * Interface for the main scraper (Open/Closed Principle)
 */
export interface WebScraper {
  scrape(): Promise<UrlEntry[]>;
}

/**
 * Interface for logger abstraction
 */
export interface Logger {
  info(message: string): void;
  error(message: string, error?: Error): void;
  warn(message: string): void;
}

/**
 * Interface for file downloader (Single Responsibility Principle)
 */
export interface FileDownloader {
  download(url: string, outputPath: string): Promise<void>;
}

/**
 * Interface for file extractor (Single Responsibility Principle)
 */
export interface FileExtractor {
  extract(zipPath: string, outputDir: string): Promise<void>;
}

/**
 * Interface for data manager that handles download and extraction
 */
export interface DataManager {
  downloadAndExtract(urls: UrlEntry[], outputDir: string): Promise<void>;
}

/**
 * Represents the schema of a JSON field
 */
export interface FieldSchema {
  type: string;
  optional: boolean;
  nestedFields?: { [key: string]: FieldSchema };
  arrayElementType?: FieldSchema;
  examples?: any[];
}

/**
 * Represents the complete schema of a JSON document
 */
export interface JsonSchema {
  [key: string]: FieldSchema;
}

/**
 * Configuration for schema analysis
 */
export interface SchemaAnalyzerConfig {
  sampleSize: number;
  maxDepth: number;
  exampleCount: number;
}

/**
 * Interface for JSON schema analyzer (Single Responsibility Principle)
 */
export interface SchemaAnalyzer {
  analyzeFile(filePath: string): Promise<JsonSchema>;
  analyzeDirectory(dirPath: string): Promise<{ [fileName: string]: JsonSchema }>;
}

/**
 * Configuration for MongoDB connection
 */
export interface MongoConfig {
  uri: string;
  database: string;
  collection: string;
  batchSize: number;
}

/**
 * Interface for database operations (Dependency Inversion Principle)
 */
export interface DatabaseClient {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  insertMany(documents: any[]): Promise<void>;
  createIndex(indexSpec: any): Promise<void>;
  count(): Promise<number>;
}

/**
 * Interface for JSON data processor (Single Responsibility Principle)
 */
export interface JsonProcessor {
  processFile(filePath: string, batchProcessor: (batch: any[]) => Promise<void>): Promise<void>;
  getFileInfo(filePath: string): Promise<{ recordCount: number; sampleRecord: any }>;
}

/**
 * Interface for data uploader (Single Responsibility Principle)
 */
export interface DataUploader {
  uploadFile(filePath: string): Promise<void>;
  uploadDirectory(dirPath: string): Promise<void>;
  uploadDirectoryWithProgress(dirPath: string): Promise<UploadStats>;
}

/**
 * Statistics for upload operations
 */
export interface UploadStats {
  totalFiles: number;
  totalRecords: number;
  successfulFiles: number;
  failedFiles: number;
  duration: number;
}
