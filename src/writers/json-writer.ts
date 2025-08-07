import { promises as fs } from "fs";
import { DataWriter, Logger, UrlEntry } from "../../shared/types/interfaces";
import { OUTPUT_CONFIG } from "../config/config";

/**
 * JSON file writer implementation
 * Following Single Responsibility Principle - only writes data to JSON files
 * Following Dependency Inversion Principle - implements DataWriter interface
 */
export class JsonFileWriter implements DataWriter {
  constructor(private readonly logger: Logger) {}

  async write(data: UrlEntry[], outputPath: string = OUTPUT_CONFIG.FILE_PATH): Promise<void> {
    try {
      this.logger.info(`Writing ${data.length} entries to ${outputPath}`);

      const jsonData = JSON.stringify(data, null, OUTPUT_CONFIG.INDENT_SIZE);
      await fs.writeFile(outputPath, jsonData, OUTPUT_CONFIG.ENCODING);

      this.logger.info(`Successfully wrote data to ${outputPath}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to write data to ${outputPath}: ${errorMessage}`, error instanceof Error ? error : undefined);
      throw new Error(`Failed to write data to file: ${errorMessage}`);
    }
  }
}
