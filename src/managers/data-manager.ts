import { join, basename } from 'path';
import { DataManager, UrlEntry, FileDownloader, FileExtractor, Logger } from '../types/interfaces';

/**
 * Data manager implementation that orchestrates download and extraction
 * Following Single Responsibility Principle - manages the download/extract workflow
 * Following Dependency Inversion Principle - depends on abstractions
 */
export class GovernmentDataManager implements DataManager {
  constructor(
    private readonly fileDownloader: FileDownloader,
    private readonly fileExtractor: FileExtractor,
    private readonly logger: Logger
  ) {}

  async downloadAndExtract(urls: UrlEntry[], outputDir: string): Promise<void> {
    try {
      this.logger.info(`Starting download and extraction of ${urls.length} files to ${outputDir}`);

      for (const urlEntry of urls) {
        try {
          await this.processUrlEntry(urlEntry, outputDir);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          this.logger.error(`Failed to process ${urlEntry.year}: ${errorMessage}`, error instanceof Error ? error : undefined);
          // Continue with next file instead of failing completely
          continue;
        }
      }

      this.logger.info('Download and extraction process completed');

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Data management failed: ${errorMessage}`, error instanceof Error ? error : undefined);
      throw error;
    }
  }

  private async processUrlEntry(urlEntry: UrlEntry, outputDir: string): Promise<void> {
    const { year, url } = urlEntry;
    
    this.logger.info(`Processing ${year}: ${url}`);

    // Create year-specific directory
    const yearDir = join(outputDir, year);
    
    // Generate download path
    const fileName = this.getFileNameFromUrl(url);
    const downloadPath = join(yearDir, fileName);
    
    // Download the file
    await this.fileDownloader.download(url, downloadPath);
    
    // Extract the file to the same directory
    const extractDir = join(yearDir, 'extracted');
    await this.fileExtractor.extract(downloadPath, extractDir);
    
    this.logger.info(`Completed processing ${year}`);
  }

  private getFileNameFromUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      const filename = basename(urlObj.pathname);
      return filename || `download-${Date.now()}.zip`;
    } catch {
      // Fallback if URL parsing fails
      return `download-${Date.now()}.zip`;
    }
  }
}
