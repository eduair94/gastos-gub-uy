import { Logger } from "../types/interfaces";

/**
 * Simple console logger implementation
 * Following Single Responsibility Principle - only handles logging
 */
export class ConsoleLogger implements Logger {
  private getTimestamp(): string {
    return new Date().toISOString();
  }

  info(message: string): void {
    console.log(`[${this.getTimestamp()}] INFO: ${message}`);
  }

  error(message: string, error?: Error): void {
    console.error(`[${this.getTimestamp()}] ERROR: ${message}`);
    if (error) {
      console.error(`Stack trace: ${error.stack}`);
    }
  }

  warn(message: string): void {
    console.warn(`[${this.getTimestamp()}] WARN: ${message}`);
  }
}
