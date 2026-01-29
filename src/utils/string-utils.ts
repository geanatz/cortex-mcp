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