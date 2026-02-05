import { promises as fs, constants } from 'fs';
import { dirname, join, relative, resolve } from 'path';
import { StorageError } from '../errors/errors.js';

/**
 * Check if a file or directory exists
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if path is readable
 */
export async function isReadable(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if path is writable
 */
export async function isWritable(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if path is a directory
 */
export async function isDirectory(filePath: string): Promise<boolean> {
  try {
    const stats = await fs.stat(filePath);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Check if path is a file
 */
export async function isFile(filePath: string): Promise<boolean> {
  try {
    const stats = await fs.stat(filePath);
    return stats.isFile();
  } catch {
    return false;
  }
}

/**
 * Ensure directory exists, creating it if necessary
 */
export async function ensureDirectory(dirPath: string): Promise<void> {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error) {
    // Ignore if directory already exists
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
      throw StorageError.directoryError(dirPath, error as Error);
    }
  }
}

/**
 * Atomic file write using temporary file
 * Ensures data integrity by writing to temp file first, then renaming
 */
export async function atomicWriteFile(filePath: string, content: string): Promise<void> {
  const tempFile = `${filePath}.${Date.now()}.tmp`;
  
  try {
    // Ensure parent directory exists
    await ensureDirectory(dirname(filePath));
    
    // Write to temp file
    await fs.writeFile(tempFile, content, 'utf-8');
    
    // Atomic rename
    await fs.rename(tempFile, filePath);
  } catch (error) {
    // Clean up temp file on error
    try {
      await fs.unlink(tempFile);
    } catch {
      // Ignore cleanup errors
    }
    throw StorageError.writeError(filePath, error as Error);
  }
}

/**
 * Read file with error handling
 */
export async function readFile(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch (error) {
    throw StorageError.readError(filePath, error as Error);
  }
}

/**
 * Read file or return null if not found
 */
export async function readFileOrNull(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw StorageError.readError(filePath, error as Error);
  }
}

/**
 * Read and parse JSON file
 */
export async function readJsonFile<T>(filePath: string): Promise<T> {
  const content = await readFile(filePath);
  try {
    return JSON.parse(content) as T;
  } catch (error) {
    throw StorageError.parseError(filePath, 'JSON', error as Error);
  }
}

/**
 * Read JSON file or return null if not found
 */
export async function readJsonFileOrNull<T>(filePath: string): Promise<T | null> {
  const content = await readFileOrNull(filePath);
  if (content === null) {
    return null;
  }
  try {
    return JSON.parse(content) as T;
  } catch (error) {
    throw StorageError.parseError(filePath, 'JSON', error as Error);
  }
}

/**
 * Write JSON file with pretty printing
 */
export async function writeJsonFile<T>(filePath: string, data: T, indent: number = 2): Promise<void> {
  const content = JSON.stringify(data, null, indent);
  await atomicWriteFile(filePath, content);
}

/**
 * Delete file if it exists
 */
export async function deleteFile(filePath: string): Promise<boolean> {
  try {
    await fs.unlink(filePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

/**
 * Delete directory recursively
 */
export async function deleteDirectory(dirPath: string): Promise<boolean> {
  try {
    await fs.rm(dirPath, { recursive: true, force: true });
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

/**
 * List directory contents with filtering options
 */
export interface ListDirectoryOptions {
  /** Only return directories */
  directoriesOnly?: boolean;
  /** Only return files */
  filesOnly?: boolean;
  /** Filter by pattern (regex or string) */
  pattern?: RegExp | string;
  /** Sort results */
  sort?: boolean;
}

export async function listDirectory(
  dirPath: string,
  options: ListDirectoryOptions = {}
): Promise<string[]> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    
    let results = entries.filter(entry => {
      if (options.directoriesOnly && !entry.isDirectory()) return false;
      if (options.filesOnly && !entry.isFile()) return false;
      
      if (options.pattern) {
        const pattern = typeof options.pattern === 'string' 
          ? new RegExp(options.pattern)
          : options.pattern;
        if (!pattern.test(entry.name)) return false;
      }
      
      return true;
    }).map(entry => entry.name);
    
    if (options.sort !== false) {
      results.sort();
    }
    
    return results;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw StorageError.directoryError(dirPath, error as Error);
  }
}

/**
 * Copy file
 */
export async function copyFile(source: string, destination: string): Promise<void> {
  await ensureDirectory(dirname(destination));
  await fs.copyFile(source, destination);
}

/**
 * Move file (rename)
 */
export async function moveFile(source: string, destination: string): Promise<void> {
  await ensureDirectory(dirname(destination));
  await fs.rename(source, destination);
}

/**
 * Get file stats or null if not found
 */
export async function getFileStats(filePath: string): Promise<{
  size: number;
  created: Date;
  modified: Date;
  isDirectory: boolean;
  isFile: boolean;
} | null> {
  try {
    const stats = await fs.stat(filePath);
    return {
      size: stats.size,
      created: stats.birthtime,
      modified: stats.mtime,
      isDirectory: stats.isDirectory(),
      isFile: stats.isFile(),
    };
  } catch {
    return null;
  }
}

/**
 * Resolve path relative to base
 */
export function resolvePath(base: string, ...paths: string[]): string {
  return resolve(base, ...paths);
}

/**
 * Get relative path
 */
export function getRelativePath(from: string, to: string): string {
  return relative(from, to);
}

/**
 * Join paths
 */
export function joinPath(...paths: string[]): string {
  return join(...paths);
}