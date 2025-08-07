import * as fs from 'fs';
import * as path from 'path';
import {
  FieldSchema,
  JsonSchema,
  Logger,
  SchemaAnalyzer,
  SchemaAnalyzerConfig
} from '../../shared/types/interfaces';

/**
 * JSON Schema Analyzer implementation following Single Responsibility Principle
 * Analyzes JSON files to extract schema information without loading entire files into memory
 */
export class JsonSchemaAnalyzer implements SchemaAnalyzer {
  private readonly config: SchemaAnalyzerConfig;
  private readonly logger: Logger;

  constructor(config: SchemaAnalyzerConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
  }

  /**
   * Analyzes a single JSON file to extract its schema
   * Focuses on the "releases" array which contains the actual records
   */
  async analyzeFile(filePath: string): Promise<JsonSchema> {
    this.logger.info(`Analyzing schema for file: ${filePath}`);
    
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const schema: JsonSchema = {};
    let sampleCount = 0;

    try {
      // Read the file content
      const fileContent = await this.readFileInChunks(filePath);
      
      // Parse the JSON and extract releases
      const releases = this.extractReleases(fileContent);
      
      // Analyze a sample of releases
      const maxSamples = Math.min(releases.length, this.config.sampleSize);
      
      for (let i = 0; i < maxSamples; i++) {
        const release = releases[i];
        if (typeof release === 'object' && release !== null) {
          this.analyzeObject(release, schema, 0);
          sampleCount++;
        }
      }

      this.logger.info(`Schema analysis completed. Analyzed ${sampleCount} releases from ${releases.length} total.`);
      return schema;

    } catch (error) {
      this.logger.error(`Error analyzing file ${filePath}:`, error as Error);
      throw error;
    }
  }

  /**
   * Reads a file in manageable chunks to prevent memory issues
   */
  private async readFileInChunks(filePath: string): Promise<string> {
    const stats = fs.statSync(filePath);
    const fileSizeInMB = stats.size / (1024 * 1024);
    
    // If file is smaller than 50MB, read it entirely
    if (fileSizeInMB < 50) {
      return fs.readFileSync(filePath, 'utf8');
    }
    
    // For larger files, read first 1MB to get a sample
    this.logger.info(`Large file detected (${fileSizeInMB.toFixed(1)}MB). Reading sample from beginning.`);
    
    const buffer = Buffer.alloc(1024 * 1024); // 1MB buffer
    const fd = fs.openSync(filePath, 'r');
    
    try {
      const bytesRead = fs.readSync(fd, buffer, 0, buffer.length, 0);
      return buffer.slice(0, bytesRead).toString('utf8');
    } finally {
      fs.closeSync(fd);
    }
  }

  /**
   * Extracts the releases array from the JSON content
   */
  private extractReleases(content: string): any[] {
    try {
      // First try to parse as a complete JSON document
      const parsed = JSON.parse(content);
      
      // Look for the releases array
      if (parsed && typeof parsed === 'object' && Array.isArray(parsed.releases)) {
        this.logger.info(`Found ${parsed.releases.length} releases in the file`);
        return parsed.releases;
      }
      
      // If no releases array found, return empty array
      this.logger.warn('No releases array found in JSON file');
      return [];
      
    } catch (error) {
      // If parsing fails, try to extract releases from partial content
      this.logger.warn('Failed to parse complete JSON, attempting partial parsing');
      return this.extractReleasesFromPartialContent(content);
    }
  }

  /**
   * Extracts releases from partial JSON content (for very large files)
   */
  private extractReleasesFromPartialContent(content: string): any[] {
    const releases: any[] = [];
    
    // Look for the start of releases array
    const releasesStartPattern = /"releases"\s*:\s*\[/;
    const match = content.match(releasesStartPattern);
    
    if (!match) {
      this.logger.warn('Could not find releases array in partial content');
      return [];
    }
    
    // Find individual release objects starting from the releases array
    const startIndex = match.index! + match[0].length;
    const releasesContent = content.substring(startIndex);
    
    // Extract individual release objects
    let braceCount = 0;
    let currentRelease = '';
    let inString = false;
    let escaped = false;
    
    for (let i = 0; i < releasesContent.length && releases.length < this.config.sampleSize; i++) {
      const char = releasesContent[i];
      
      if (escaped) {
        escaped = false;
        currentRelease += char;
        continue;
      }
      
      if (char === '\\') {
        escaped = true;
        currentRelease += char;
        continue;
      }
      
      if (char === '"' && !escaped) {
        inString = !inString;
      }
      
      if (!inString) {
        if (char === '{') {
          braceCount++;
        } else if (char === '}') {
          braceCount--;
        }
      }
      
      currentRelease += char;
      
      // When we have a complete object (braceCount back to 0 and we had at least one opening brace)
      if (braceCount === 0 && currentRelease.trim().startsWith('{')) {
        try {
          const release = JSON.parse(currentRelease.trim());
          releases.push(release);
          currentRelease = '';
        } catch (parseError) {
          // Skip invalid JSON and continue
          currentRelease = '';
        }
      }
      
      // Skip to next object if we encounter a comma at the top level
      if (braceCount === 0 && char === ',') {
        currentRelease = '';
      }
    }
    
    this.logger.info(`Extracted ${releases.length} releases from partial content`);
    return releases;
  }

  /**
   * Analyzes all JSON files in a directory
   */
  async analyzeDirectory(dirPath: string): Promise<{ [fileName: string]: JsonSchema }> {
    this.logger.info(`Analyzing schemas for directory: ${dirPath}`);
    
    if (!fs.existsSync(dirPath)) {
      throw new Error(`Directory not found: ${dirPath}`);
    }

    const results: { [fileName: string]: JsonSchema } = {};
    const files = fs.readdirSync(dirPath);
    const jsonFiles = files.filter(file => file.endsWith('.json'));

    this.logger.info(`Found ${jsonFiles.length} JSON files to analyze`);

    for (const file of jsonFiles) {
      const filePath = path.join(dirPath, file);
      try {
        results[file] = await this.analyzeFile(filePath);
      } catch (error) {
        this.logger.error(`Failed to analyze ${file}:`, error as Error);
        // Continue with other files even if one fails
      }
    }

    return results;
  }

  /**
   * Recursively analyzes an object to build schema
   */
  private analyzeObject(obj: any, schema: JsonSchema, depth: number): void {
    if (depth >= this.config.maxDepth) {
      return;
    }

    for (const [key, value] of Object.entries(obj)) {
      if (!schema[key]) {
        schema[key] = this.createFieldSchema(value, depth);
      } else {
        this.updateFieldSchema(schema[key], value, depth);
      }
    }
  }

  /**
   * Creates a new field schema based on the value
   */
  private createFieldSchema(value: any, depth: number): FieldSchema {
    const fieldSchema: FieldSchema = {
      type: this.getValueType(value),
      optional: false,
      examples: []
    };

    this.addExample(fieldSchema, value);

    if (Array.isArray(value) && value.length > 0) {
      fieldSchema.arrayElementType = this.createFieldSchema(value[0], depth + 1);
    } else if (typeof value === 'object' && value !== null) {
      fieldSchema.nestedFields = {};
      this.analyzeObject(value, fieldSchema.nestedFields, depth + 1);
    }

    return fieldSchema;
  }

  /**
   * Updates an existing field schema with new value information
   */
  private updateFieldSchema(fieldSchema: FieldSchema, value: any, depth: number): void {
    const valueType = this.getValueType(value);
    
    // If types don't match, make it a union type
    if (fieldSchema.type !== valueType) {
      if (!fieldSchema.type.includes('|')) {
        fieldSchema.type = `${fieldSchema.type}|${valueType}`;
      } else if (!fieldSchema.type.includes(valueType)) {
        fieldSchema.type += `|${valueType}`;
      }
    }

    this.addExample(fieldSchema, value);

    // Handle nested objects
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      if (!fieldSchema.nestedFields) {
        fieldSchema.nestedFields = {};
      }
      this.analyzeObject(value, fieldSchema.nestedFields, depth + 1);
    }

    // Handle arrays
    if (Array.isArray(value) && value.length > 0) {
      if (!fieldSchema.arrayElementType) {
        fieldSchema.arrayElementType = this.createFieldSchema(value[0], depth + 1);
      } else {
        this.updateFieldSchema(fieldSchema.arrayElementType, value[0], depth + 1);
      }
    }
  }

  /**
   * Adds an example value to the field schema
   */
  private addExample(fieldSchema: FieldSchema, value: any): void {
    if (!fieldSchema.examples) {
      fieldSchema.examples = [];
    }

    if (fieldSchema.examples.length < this.config.exampleCount) {
      // Only add if it's not already in examples
      if (!fieldSchema.examples.some(example => 
        JSON.stringify(example) === JSON.stringify(value))) {
        fieldSchema.examples.push(value);
      }
    }
  }

  /**
   * Determines the type of a value
   */
  private getValueType(value: any): string {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    if (typeof value === 'object') return 'object';
    if (typeof value === 'string') {
      // Check for common patterns
      if (this.isDate(value)) return 'date';
      if (this.isEmail(value)) return 'email';
      if (this.isUrl(value)) return 'url';
      return 'string';
    }
    return typeof value;
  }

  /**
   * Checks if a string represents a date
   */
  private isDate(value: string): boolean {
    const dateRegex = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2})?/;
    return dateRegex.test(value) && !isNaN(Date.parse(value));
  }

  /**
   * Checks if a string represents an email
   */
  private isEmail(value: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(value);
  }

  /**
   * Checks if a string represents a URL
   */
  private isUrl(value: string): boolean {
    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  }
}
