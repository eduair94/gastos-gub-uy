import axios, { AxiosRequestConfig } from 'axios';
import { createWriteStream } from 'fs';
import { promises as fs } from 'fs';
import { dirname } from 'path';
import { HttpClient, ScraperConfig, Logger } from '../types/interfaces';

/**
 * HTTP client implementation using Axios
 * Following Single Responsibility Principle - only handles HTTP requests
 * Following Dependency Inversion Principle - implements HttpClient interface
 */
export class AxiosHttpClient implements HttpClient {
  constructor(
    private readonly config: ScraperConfig,
    private readonly logger: Logger
  ) {}

  async get(url: string): Promise<string> {
    const requestConfig: AxiosRequestConfig = {
      timeout: this.config.timeout,
      headers: {
        "User-Agent": this.config.userAgent,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Accept-Encoding": "gzip, deflate",
        Connection: "keep-alive",
      },
    };

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.config.retryAttempts; attempt++) {
      try {
        this.logger.info(`Attempting to fetch ${url} (attempt ${attempt}/${this.config.retryAttempts})`);

        const response = await axios.get(url, requestConfig);

        if (response.status === 200) {
          this.logger.info(`Successfully fetched ${url}`);
          return response.data;
        } else {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        this.logger.warn(`Attempt ${attempt} failed for ${url}: ${lastError.message}`);

        if (attempt < this.config.retryAttempts) {
          // Wait before retrying (exponential backoff)
          const delay = Math.pow(2, attempt) * 1000;
          this.logger.info(`Waiting ${delay}ms before retry...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw new Error(`Failed to fetch ${url} after ${this.config.retryAttempts} attempts. Last error: ${lastError?.message}`);
  }

  async downloadFile(url: string, outputPath: string): Promise<void> {
    try {
      this.logger.info(`Starting file download: ${url}`);
      
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
          if (progress % 20 === 0) { // Log every 20%
            this.logger.info(`Download progress: ${progress}%`);
          }
        }
      });

      // Pipe response to file
      response.data.pipe(writer);

      // Wait for download to complete
      await new Promise<void>((resolve, reject) => {
        writer.on('finish', () => {
          this.logger.info(`File download completed: ${outputPath}`);
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
      this.logger.error(`Failed to download file ${url}: ${errorMessage}`, error instanceof Error ? error : undefined);
      throw new Error(`File download failed: ${errorMessage}`);
    }
  }
}
