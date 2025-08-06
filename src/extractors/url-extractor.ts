import { SELECTORS } from "../config/config";
import { Logger, ParsedDocument, UrlEntry, UrlExtractor } from "../types/interfaces";

/**
 * URL extractor implementation for government expenditure data
 * Following Single Responsibility Principle - only extracts URLs
 * Following Open/Closed Principle - can be extended for different URL patterns
 */
export class GovernmentDataUrlExtractor implements UrlExtractor {
  constructor(private readonly logger: Logger) {}

  extractUrls(document: ParsedDocument): UrlEntry[] {
    const urls: UrlEntry[] = [];
    const downloadLinks = document.findAll(SELECTORS.DOWNLOAD_LINKS);

    this.logger.info(`Found ${downloadLinks.length} potential download links`);

    for (const link of downloadLinks) {
      const href = link.getAttribute("href");
      if (!href) {
        this.logger.warn("Found link without href attribute");
        continue;
      }

      const year = this.extractYearFromUrl(href);
      if (!year) {
        this.logger.warn(`Could not extract year from URL: ${href}`);
        continue;
      }

      const fullUrl = this.buildFullUrl(href);
      urls.push({ year, url: fullUrl });
      this.logger.info(`Extracted: ${year} -> ${fullUrl}`);
    }

    // Sort by year (descending)
    urls.sort((a, b) => parseInt(b.year) - parseInt(a.year));

    this.logger.info(`Successfully extracted ${urls.length} URLs`);
    return urls;
  }

  private extractYearFromUrl(url: string): string | null {
    const match = url.match(SELECTORS.YEAR_PATTERN);
    return match ? match[1] : null;
  }

  private buildFullUrl(href: string): string {
    if (href.startsWith("http")) {
      return href;
    }
    return `${SELECTORS.BASE_URL}${href.startsWith("/") ? "" : "/"}${href}`;
  }
}
