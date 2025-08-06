import axios from 'axios';
import { createWriteStream } from 'fs';
import { promises as fs } from 'fs';
import { dirname } from 'path';
import { FileDownloader, Logger, ScraperConfig } from '../types/interfaces';

/**
 * File downloader implementation using Axios
 * Following Single Responsibility Principle - only handles file downloads
 * Following Dependency Inversion Principle - implements FileDownloader interface
 */
export class AxiosFileDownloader implements FileDownloader {
  constructor(
    private readonly config: ScraperConfig,
    private readonly logger: Logger
  ) {}

  async download(url: string, outputPath: string): Promise<void> {
    try {
      this.logger.info(`Starting download: ${url}`);
      
      // Ensure output directory exists
      const outputDir = dirname(outputPath);
      await fs.mkdir(outputDir, { recursive: true });

      // Configure request for file download
      const response = await axios({
        method: 'GET',
        url: url,
        responseType: 'stream',
        timeout: this.config.timeout,
        headers: {
          'User-Agent': this.config.userAgent,
          'Accept': '*/*',
          'Accept-Encoding': 'gzip, deflate',
          'Connection': 'keep-alive'
        }
      });

      if (response.status !== 200) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Get file size from headers for progress tracking
      const totalSize = parseInt(response.headers['content-length'] || '0', 10);
      let downloadedSize = 0;

      // Create write stream
      const writer = createWriteStream(outputPath);

      // Track download progress
      response.data.on('data', (chunk: Buffer) => {
        downloadedSize += chunk.length;
        if (totalSize > 0) {
          const progress = Math.round((downloadedSize / totalSize) * 100);
          if (progress % 10 === 0) { // Log every 10%
            this.logger.info(`Download progress: ${progress}%`);
          }
        }
      });

      // Pipe response to file
      response.data.pipe(writer);

      // Wait for download to complete
      await new Promise<void>((resolve, reject) => {
        writer.on('finish', () => {
          this.logger.info(`Download completed: ${outputPath}`);
          resolve();
        });
        
        writer.on('error', (error) => {
          this.logger.error(`Download failed: ${error.message}`, error);
          reject(error);
        });

        response.data.on('error', (error: Error) => {
          this.logger.error(`Stream error: ${error.message}`, error);
          reject(error);
        });
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to download ${url}: ${errorMessage}`, error instanceof Error ? error : undefined);
      throw new Error(`Download failed: ${errorMessage}`);
    }
  }
}
