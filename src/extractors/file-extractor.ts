import { createWriteStream, promises as fs } from 'fs';
import { dirname, join } from 'path';
import * as yauzl from 'yauzl';
import { FileExtractor, Logger } from '../../shared/types/interfaces';

/**
 * File extractor implementation using yauzl
 * Following Single Responsibility Principle - only handles file extraction
 * Following Dependency Inversion Principle - implements FileExtractor interface
 */
export class ZipFileExtractor implements FileExtractor {
  constructor(private readonly logger: Logger) {}

  async extract(zipPath: string, outputDir: string): Promise<void> {
    try {
      this.logger.info(`Extracting ${zipPath} to ${outputDir}`);
      
      // Ensure output directory exists
      await fs.mkdir(outputDir, { recursive: true });

      // Extract the zip file
      await this.extractZip(zipPath, outputDir);
      
      this.logger.info(`Extraction completed: ${outputDir}`);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to extract ${zipPath}: ${errorMessage}`, error instanceof Error ? error : undefined);
      throw new Error(`Extraction failed: ${errorMessage}`);
    }
  }

  private async extractZip(zipPath: string, outputDir: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      yauzl.open(zipPath, { lazyEntries: true }, (err: Error | null, zipfile: yauzl.ZipFile | undefined) => {
        if (err) {
          reject(err);
          return;
        }

        if (!zipfile) {
          reject(new Error('Failed to open zip file'));
          return;
        }

        let extractedCount = 0;
        let totalEntries = 0;

        zipfile.readEntry();

        zipfile.on('entry', async (entry: yauzl.Entry) => {
          totalEntries++;
          
          // Skip directories
          if (/\/$/.test(entry.fileName)) {
            zipfile.readEntry();
            return;
          }

          const outputPath = join(outputDir, entry.fileName);
          const outputFileDir = dirname(outputPath);

          try {
            // Ensure directory exists
            await fs.mkdir(outputFileDir, { recursive: true });

            // Extract file
            zipfile.openReadStream(entry, (err: Error | null, readStream: NodeJS.ReadableStream | undefined) => {
              if (err) {
                reject(err);
                return;
              }

              if (!readStream) {
                reject(new Error('Failed to create read stream'));
                return;
              }

              const writeStream = createWriteStream(outputPath);

              readStream.pipe(writeStream);

              writeStream.on('finish', () => {
                extractedCount++;
                this.logger.info(`Extracted: ${entry.fileName}`);
                zipfile.readEntry();
              });

              writeStream.on('error', (error: Error) => {
                reject(error);
              });

              readStream.on('error', (error: Error) => {
                reject(error);
              });
            });

          } catch (dirError) {
            reject(dirError);
          }
        });

        zipfile.on('end', () => {
          this.logger.info(`Extraction completed: ${extractedCount} files extracted`);
          resolve();
        });

        zipfile.on('error', (error: Error) => {
          reject(error);
        });
      });
    });
  }
}
