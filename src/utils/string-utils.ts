export function sanitizeFileName(input: string, maxLength: number = 50): string {
  let sanitized = input
    .toLowerCase()
    .replace(/[/\\:*?"<>|]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');

  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength);
    sanitized = sanitized.replace(/-+$/, '');
  }

  return sanitized || 'file';
}

export function padNumber(num: number, length: number): string {
  return String(num).padStart(length, '0');
}
