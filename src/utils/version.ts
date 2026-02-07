import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

/**
 * Read the version from package.json
 * Works in both development (src/) and compiled (dist/) versions
 */
export function getVersion(): string {
  try {
    const currentDir = dirname(fileURLToPath(import.meta.url));
    const packageJsonPath = join(currentDir, '..', '..', 'package.json');
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
    
    if (!packageJson.version) {
      throw new Error('Version not found in package.json');
    }
    
    return packageJson.version;
  } catch {
    return '4.0.0'; // Fallback version — keep in sync with package.json
  }
}

/**
 * Get formatted version string for display
 */
export function getVersionString(): string {
  const version = getVersion();
  return `v${version}`;
}
