/**
 * String utility functions
 * Provides common string manipulation operations
 */

/**
 * Sanitize a string for safe filesystem usage
 */
export function sanitizeFileName(input: string, maxLength: number = 50): string {
  // Remove or replace unsafe characters
  let sanitized = input
    .toLowerCase()
    .replace(/[/\\:*?"<>|]/g, '-') // Replace unsafe chars with dash
    .replace(/\s+/g, '-') // Replace spaces with dash
    .replace(/-{2,}/g, '-') // Replace multiple dashes with single
    .replace(/^-+|-+$/g, ''); // Remove leading/trailing dashes

  // Limit length
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength);
    // Don't end on a dash
    sanitized = sanitized.replace(/-+$/, '');
  }

  // Ensure it's not empty
  return sanitized || 'file';
}

/**
 * Truncate string with ellipsis
 */
export function truncate(str: string, maxLength: number, suffix: string = '...'): string {
  if (str.length <= maxLength) {
    return str;
  }
  return str.substring(0, maxLength - suffix.length) + suffix;
}

/**
 * Capitalize first letter
 */
export function capitalize(str: string): string {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Title case (capitalize each word)
 */
export function titleCase(str: string): string {
  return str
    .toLowerCase()
    .split(/\s+/)
    .map(word => capitalize(word))
    .join(' ');
}

/**
 * Convert to slug (kebab-case)
 */
export function toSlug(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Convert to camelCase
 */
export function toCamelCase(str: string): string {
  return str
    .replace(/[-_\s]+(.)?/g, (_, char) => (char ? char.toUpperCase() : ''))
    .replace(/^(.)/, (char) => char.toLowerCase());
}

/**
 * Convert to snake_case
 */
export function toSnakeCase(str: string): string {
  return str
    .replace(/([A-Z])/g, '_$1')
    .toLowerCase()
    .replace(/[-\s]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
}

/**
 * Pad string to specified length
 */
export function padStart(str: string, length: number, char: string = ' '): string {
  if (str.length >= length) return str;
  return char.repeat(length - str.length) + str;
}

export function padEnd(str: string, length: number, char: string = ' '): string {
  if (str.length >= length) return str;
  return str + char.repeat(length - str.length);
}

/**
 * Pad number with leading zeros
 */
export function padNumber(num: number, length: number): string {
  return padStart(String(num), length, '0');
}

/**
 * Check if string is empty or whitespace only
 */
export function isBlank(str: string | null | undefined): boolean {
  return !str || str.trim().length === 0;
}

/**
 * Check if string is not empty and not whitespace only
 */
export function isNotBlank(str: string | null | undefined): str is string {
  return !!str && str.trim().length > 0;
}

/**
 * Remove extra whitespace (trim and collapse internal spaces)
 */
export function normalizeWhitespace(str: string): string {
  return str.trim().replace(/\s+/g, ' ');
}

/**
 * Split string into lines
 */
export function splitLines(str: string): string[] {
  return str.split(/\r?\n/);
}

/**
 * Join lines with newlines
 */
export function joinLines(lines: string[]): string {
  return lines.join('\n');
}

/**
 * Indent each line
 */
export function indent(str: string, spaces: number = 2): string {
  const prefix = ' '.repeat(spaces);
  return splitLines(str).map(line => prefix + line).join('\n');
}

/**
 * Remove common indentation from multi-line string
 */
export function dedent(str: string): string {
  const lines = splitLines(str);
  
  // Find minimum indentation (excluding empty lines)
  const minIndent = lines
    .filter(line => line.trim().length > 0)
    .reduce((min, line) => {
      const match = line.match(/^(\s*)/);
      const indent = match ? match[1].length : 0;
      return Math.min(min, indent);
    }, Infinity);
  
  if (minIndent === Infinity || minIndent === 0) {
    return str;
  }
  
  return lines
    .map(line => line.substring(minIndent))
    .join('\n');
}

/**
 * Escape HTML special characters
 */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Escape for use in regular expressions
 */
export function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Generate a simple unique ID
 */
export function generateId(prefix?: string): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  const id = `${timestamp}-${random}`;
  return prefix ? `${prefix}-${id}` : id;
}

/**
 * Extract first N words from string
 */
export function extractWords(str: string, count: number): string {
  return str.split(/\s+/).slice(0, count).join(' ');
}

/**
 * Count words in string
 */
export function countWords(str: string): number {
  const trimmed = str.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

/**
 * Pluralize word based on count
 */
export function pluralize(word: string, count: number, plural?: string): string {
  if (count === 1) return word;
  return plural || word + 's';
}

/**
 * Format number with commas
 */
export function formatNumber(num: number): string {
  return num.toLocaleString();
}

/**
 * Format bytes to human readable
 */
export function formatBytes(bytes: number, decimals: number = 2): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + ' ' + sizes[i];
}

/**
 * Format duration in milliseconds to human readable
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  return `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`;
}