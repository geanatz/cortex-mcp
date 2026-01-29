import { promises as fs } from 'fs';

/**
 * Check if a file or directory exists
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensure directory exists, creating it if necessary
 */
export async function ensureDirectory(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

/**
 * Atomic file write using temporary file
 */
export async function atomicWriteFile(filePath: string, content: string): Promise<void> {
  const tempFile = filePath + '.tmp';
  try {
    await fs.writeFile(tempFile, content, 'utf-8');
    await fs.rename(tempFile, filePath);
  } catch (error) {
    try {
      await fs.unlink(tempFile);
    } catch { /* ignore */ }
    throw error;
  }
}