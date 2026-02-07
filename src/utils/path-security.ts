/**
 * Secure path utilities to prevent path traversal attacks
 */

import { resolve, normalize, sep } from 'path';

/**
 * Validate that a path doesn't contain traversal sequences
 * Blocks paths containing .. or null bytes
 */
export function containsPathTraversal(filePath: string): boolean {
  // Check for null bytes (null byte injection)
  if (filePath.includes('\0')) {
    return true;
  }
  
  // Normalize the path and check if it contains parent directory references
  const normalized = normalize(filePath);
  
  // Check for .. components in the path
  const parts = normalized.split(sep);
  return parts.some(part => part === '..');
}

/**
 * Securely resolve a path within a base directory
 * Throws if the resolved path escapes the base directory
 * 
 * @param baseDir - The allowed base directory
 * @param targetPath - The path to resolve (can be relative)
 * @returns The resolved path (guaranteed to be within baseDir)
 * @throws Error if path escapes baseDir
 */
export function resolveSecurePath(baseDir: string, targetPath: string): string {
  // Reject paths with traversal attempts
  if (containsPathTraversal(targetPath)) {
    throw new Error(`Path traversal detected: ${targetPath}`);
  }
  
  // Resolve the path
  const resolvedPath = resolve(baseDir, targetPath);
  const resolvedBase = resolve(baseDir);
  
  // Ensure the resolved path is within the base directory
  // Add trailing separator to base to prevent partial matches
  const baseWithSep = resolvedBase.endsWith(sep) ? resolvedBase : resolvedBase + sep;
  
  if (!resolvedPath.startsWith(baseWithSep) && resolvedPath !== resolvedBase) {
    throw new Error(`Path escapes base directory: ${targetPath}`);
  }
  
  return resolvedPath;
}

/**
 * Validate that a working directory path is safe
 * - Must be absolute
 * - Must not contain traversal sequences
 * - Must not be empty
 * 
 * @param workingDirectory - The path to validate
 * @returns Normalized absolute path
 * @throws Error if path is invalid
 */
export function validateWorkingDirectory(workingDirectory: string): string {
  if (!workingDirectory || workingDirectory.trim().length === 0) {
    throw new Error('Working directory is required');
  }
  
  // Check for traversal sequences
  if (containsPathTraversal(workingDirectory)) {
    throw new Error('Working directory cannot contain path traversal sequences (..)');
  }
  
  const normalized = normalize(workingDirectory);
  
  // On Windows, check for absolute path (starts with drive letter or \\)
  // On Unix, check for absolute path (starts with /)
  const isWindows = process.platform === 'win32';
  const isAbsolute = isWindows 
    ? /^[a-zA-Z]:[\\/]|^\\\\/.test(normalized)
    : normalized.startsWith('/');
  
  if (!isAbsolute) {
    throw new Error('Working directory must be an absolute path');
  }
  
  return normalized;
}
