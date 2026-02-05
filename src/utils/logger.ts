/**
 * Logger utility with levels and formatting
 * Provides consistent logging throughout the application
 */

/**
 * Log levels
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  SILENT = 4,
}

/**
 * Logger configuration
 */
export interface LoggerConfig {
  level: LogLevel;
  prefix?: string;
  timestamps?: boolean;
  colors?: boolean;
}

/**
 * ANSI color codes for terminal output
 */
const Colors = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
} as const;

/**
 * Log level configurations
 */
const LevelConfig = {
  [LogLevel.DEBUG]: { label: 'DEBUG', color: Colors.dim },
  [LogLevel.INFO]: { label: 'INFO', color: Colors.blue },
  [LogLevel.WARN]: { label: 'WARN', color: Colors.yellow },
  [LogLevel.ERROR]: { label: 'ERROR', color: Colors.red },
} as const;

/**
 * Simple structured logger
 */
export class Logger {
  private level: LogLevel;
  private prefix: string;
  private timestamps: boolean;
  private colors: boolean;

  constructor(config: Partial<LoggerConfig> = {}) {
    this.level = config.level ?? LogLevel.INFO;
    this.prefix = config.prefix ?? '';
    this.timestamps = config.timestamps ?? true;
    this.colors = config.colors ?? true;
  }

  /**
   * Set log level
   */
  setLevel(level: LogLevel): void {
    this.level = level;
  }

  /**
   * Format a log message
   */
  private format(level: LogLevel, message: string, data?: Record<string, unknown>): string {
    const parts: string[] = [];
    const config = LevelConfig[level as keyof typeof LevelConfig];
    
    if (this.timestamps) {
      const time = new Date().toISOString().slice(11, 19);
      parts.push(this.colors ? `${Colors.dim}[${time}]${Colors.reset}` : `[${time}]`);
    }
    
    if (config) {
      const label = this.colors 
        ? `${config.color}[${config.label}]${Colors.reset}`
        : `[${config.label}]`;
      parts.push(label);
    }
    
    if (this.prefix) {
      parts.push(this.colors ? `${Colors.cyan}${this.prefix}${Colors.reset}` : this.prefix);
    }
    
    parts.push(message);
    
    if (data && Object.keys(data).length > 0) {
      parts.push(JSON.stringify(data));
    }
    
    return parts.join(' ');
  }

  /**
   * Log at DEBUG level
   */
  debug(message: string, data?: Record<string, unknown>): void {
    if (this.level <= LogLevel.DEBUG) {
      console.error(this.format(LogLevel.DEBUG, message, data));
    }
  }

  /**
   * Log at INFO level
   */
  info(message: string, data?: Record<string, unknown>): void {
    if (this.level <= LogLevel.INFO) {
      console.error(this.format(LogLevel.INFO, message, data));
    }
  }

  /**
   * Log at WARN level
   */
  warn(message: string, data?: Record<string, unknown>): void {
    if (this.level <= LogLevel.WARN) {
      console.error(this.format(LogLevel.WARN, message, data));
    }
  }

  /**
   * Log at ERROR level
   */
  error(message: string, error?: Error | unknown, data?: Record<string, unknown>): void {
    if (this.level <= LogLevel.ERROR) {
      const errorData = error instanceof Error 
        ? { error: error.message, stack: error.stack, ...data }
        : { error, ...data };
      console.error(this.format(LogLevel.ERROR, message, errorData));
    }
  }

  /**
   * Create a child logger with a prefix
   */
  child(prefix: string): Logger {
    return new Logger({
      level: this.level,
      prefix: this.prefix ? `${this.prefix}:${prefix}` : prefix,
      timestamps: this.timestamps,
      colors: this.colors,
    });
  }

  /**
   * Log operation timing
   */
  time<T>(label: string, fn: () => T): T {
    const start = performance.now();
    try {
      const result = fn();
      const duration = performance.now() - start;
      this.debug(`${label} completed`, { duration: `${duration.toFixed(2)}ms` });
      return result;
    } catch (error) {
      const duration = performance.now() - start;
      this.error(`${label} failed`, error, { duration: `${duration.toFixed(2)}ms` });
      throw error;
    }
  }

  /**
   * Log async operation timing
   */
  async timeAsync<T>(label: string, fn: () => Promise<T>): Promise<T> {
    const start = performance.now();
    try {
      const result = await fn();
      const duration = performance.now() - start;
      this.debug(`${label} completed`, { duration: `${duration.toFixed(2)}ms` });
      return result;
    } catch (error) {
      const duration = performance.now() - start;
      this.error(`${label} failed`, error, { duration: `${duration.toFixed(2)}ms` });
      throw error;
    }
  }
}

/**
 * Default application logger
 */
export const logger = new Logger({ prefix: 'cortex' });

/**
 * Create a logger for a specific module
 */
export function createLogger(module: string): Logger {
  return logger.child(module);
}
