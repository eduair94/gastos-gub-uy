import { UrlExtractor as IUrlExtractor, Logger, ParsedDocument, UrlEntry } from "../types/interfaces";
import { ConsoleLogger } from "../utils/logger";

/**
 * URL extractor implementation for government expenditure data
 * Following Single Responsibility Principle - only extracts URLs
 * Following Open/Closed Principle - can be extended for different URL patterns
 */
export class GovernmentDataUrlExtractor implements IUrlExtractor {
  private logger: Logger;

  constructor(logger?: Logger) {
    this.logger = logger || new ConsoleLogger();
  }

  extractUrls(document: ParsedDocument): UrlEntry[] {
    this.logger.info('Extracting URLs from document...');
    
    // First try RSS feed format
    const rssLinks = document.findAll('item link');
    if (rssLinks.length > 0) {
      this.logger.info(`Found ${rssLinks.length} RSS item links`);
      return this.extractFromRssFeed(rssLinks);
    }
    
    // If no RSS links, try HTML download links
    this.logger.info('No RSS feed found, attempting to extract download links from HTML...');
    return this.extractFromHtmlPage(document);
  }

  private extractFromRssFeed(linkElements: any[]): UrlEntry[] {
    const urls: UrlEntry[] = [];
    
    linkElements.forEach((element) => {
      const url = element.getText()?.trim();
      if (url) {
        const year = this.extractYearFromUrl(url);
        if (year) {
          urls.push({
            url,
            year
          });
        }
      }
    });
    
    this.logger.info(`Successfully extracted ${urls.length} URLs from RSS feed`);
    return urls;
  }

  private extractFromHtmlPage(document: ParsedDocument): UrlEntry[] {
    const urls: UrlEntry[] = [];
    
    // Look for download links (typically in buttons or anchor tags with download attribute)
    const downloadLinks = document.findAll('a[download]');
    this.logger.info(`Found ${downloadLinks.length} download links`);
    
    downloadLinks.forEach((element) => {
      const url = element.getAttribute('href');
      if (url && url.includes('.zip')) {
        // Extract year from the URL or filename
        const year = this.extractYearFromUrl(url) || this.extractYearFromFilename(url);
        
        if (year) {
          urls.push({
            url: this.normalizeUrl(url),
            year
          });
        }
      }
    });
    
    this.logger.info(`Successfully extracted ${urls.length} URLs from HTML page`);
    return urls;
  }

  private extractYearFromUrl(url: string): string | null {
    // Try to find year in URL pattern like "2012", "2013", etc.
    const yearMatch = url.match(/(\d{4})/);
    return yearMatch ? yearMatch[1] : null;
  }

  private extractYearFromFilename(url: string): string | null {
    const filename = url.split('/').pop() || '';
    const yearMatch = filename.match(/(\d{4})/);
    return yearMatch ? yearMatch[1] : null;
  }

  private normalizeUrl(url: string): string {
    // If URL is relative, it needs the base domain
    if (url.startsWith('/')) {
      return `https://catalogodatos.gub.uy${url}`;
    }
    return url;
  }
}
