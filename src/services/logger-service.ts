export interface ILogger {
  info(message: string, ...args: any[]): void;
  error(message: string, error?: Error | string): void;
  warn(message: string, ...args: any[]): void;
}

export class Logger implements ILogger {
  info(message: string, ...args: any[]): void {
    console.log(`[INFO] ${message}`, ...args);
  }

  error(message: string, error?: Error | string): void {
    if (error) {
      console.error(`[ERROR] ${message}`, error);
    } else {
      console.error(`[ERROR] ${message}`);
    }
  }

  warn(message: string, ...args: any[]): void {
    console.warn(`[WARN] ${message}`, ...args);
  }
}
