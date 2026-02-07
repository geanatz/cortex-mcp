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
    
    // Try multiple paths to find package.json
    const pathsToTry = [
      join(currentDir, '..', '..', 'package.json'),  // dist/utils/version.js -> ../../package.json
      join(currentDir, '..', '..', '..', 'package.json'),  // src/utils/version.ts -> ../../../package.json
      join(process.cwd(), 'package.json'),  // fallback to cwd
    ];
    
    for (const packageJsonPath of pathsToTry) {
      try {
        const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
        if (packageJson.version) {
          return packageJson.version;
        }
      } catch {
        // Try next path
        continue;
      }
    }
    
    return '5.0.2'; // Fallback version — keep in sync with package.json
  } catch {
    return '5.0.2'; // Fallback version — keep in sync with package.json
  }
}

/**
 * Get formatted version string for display
 */
export function getVersionString(): string {
  const version = getVersion();
  return `v${version}`;
}
