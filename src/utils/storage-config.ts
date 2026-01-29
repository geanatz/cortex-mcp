import { homedir } from 'os';
import { join } from 'path';

/**
 * Configuration for storage directory resolution
 */
export interface StorageConfig {
  /** Whether to use global user directory instead of project-specific directories */
  useGlobalDirectory: boolean;
}

/**
 * Parse command-line arguments to determine storage configuration
 */
export function parseCommandLineArgs(): StorageConfig {
  const args = process.argv.slice(2);
  const useGlobalDirectory = args.includes('--claude');
  
  return {
    useGlobalDirectory
  };
}

/**
 * Get the global storage directory path
 * - Windows: C:\Users\{username}\.cortex\
 * - macOS/Linux: ~/.cortex/
 */
export function getGlobalStorageDirectory(): string {
  const userHome = homedir();
  return join(userHome, '.cortex');
}

/**
 * Resolve the actual working directory based on configuration
 * 
 * @param providedPath - The working directory path provided by the user
 * @param config - Storage configuration including global directory flag
 * @returns The actual working directory to use for storage
 */
export function resolveWorkingDirectory(providedPath: string, config: StorageConfig): string {
  if (config.useGlobalDirectory) {
    return getGlobalStorageDirectory();
  }
  
  return providedPath;
}

/**
 * Get parameter description for workingDirectory
 */
export function getWorkingDirectoryDescription(config: StorageConfig): string {
  const baseDescription = 'The full absolute path to the working directory where data is stored. MUST be an absolute path, never relative.';
  
  return config.useGlobalDirectory 
    ? baseDescription + ' NOTE: Server started with --claude flag, so this parameter is ignored.'
    : baseDescription;
}
