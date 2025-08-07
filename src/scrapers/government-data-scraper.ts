import { DataWriter, HtmlParser, HttpClient, Logger, ScraperConfig, UrlEntry, UrlExtractor, WebScraper } from "../types/interfaces";

/**
 * Main web scraper implementation
 * Following Single Responsibility Principle - orchestrates the scraping process
 * Following Dependency Inversion Principle - depends on abstractions, not concretions
 * Following Open/Closed Principle - can be extended with different implementations
 */
export class GovernmentDataScraper implements WebScraper {
  constructor(
    private readonly httpClient: HttpClient,
    private readonly htmlParser: HtmlParser,
    private readonly urlExtractor: UrlExtractor,
    private readonly dataWriter: DataWriter,
    private readonly config: ScraperConfig,
    private readonly logger: Logger
  ) {}

  async scrape(): Promise<UrlEntry[]> {
    try {
      this.logger.info("Starting web scraping process...");
      this.logger.info(`Target URL: ${this.config.targetUrl}`);

      // Step 1: Fetch HTML content
      const htmlContent = await this.httpClient.get(this.config.targetUrl);
      this.logger.info(`Fetched HTML content from ${this.config.targetUrl} ${htmlContent}`);
      // Step 2: Parse HTML
      const parsedDocument = this.htmlParser.parse(htmlContent);
      this.logger.info(`Parsed HTML document: ${JSON.stringify(parsedDocument)}`);
      // Step 3: Extract URLs
      const extractedUrls = this.urlExtractor.extractUrls(parsedDocument);

      // Step 4: Write data to file
      await this.dataWriter.write(extractedUrls, "./urls.json");

      this.logger.info("Web scraping process completed successfully");
      return extractedUrls;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Web scraping failed: ${errorMessage}`, error instanceof Error ? error : undefined);
      throw error;
    }
  }
}
