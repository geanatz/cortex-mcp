export const ValidationLimits = {
  // Task fields
  TASK_DETAILS_MAX_LENGTH: 2000,
  TASK_DETAILS_MIN_LENGTH: 1,
  
  // Tags
  TAG_MAX_LENGTH: 50,
  TAG_MIN_LENGTH: 1,
  MAX_TAGS: 20,
  
  // Dependencies (not used in simplified model but kept for compatibility)
  MAX_DEPENDENCIES: 50,
  
  // Task ID
  TASK_ID_MAX_LENGTH: 100,
  
  // Artifact content - prevent DoS via huge content
  ARTIFACT_CONTENT_MAX_LENGTH: 10 * 1024 * 1024, // 10MB max
  ARTIFACT_ERROR_MAX_LENGTH: 10000, // 10KB max for error messages
  
  // Subtask details
  SUBTASK_DETAILS_MAX_LENGTH: 1000,
  
  // Time tracking
  MAX_ACTUAL_HOURS: 10000, // Max 10,000 hours (reasonable limit)
  
  // Retry attempts
  MAX_RETRIES: 100, // Reasonable max for retry attempts
  
  // Working directory
  MAX_WORKING_DIRECTORY_LENGTH: 4096, // Max path length on most systems
  
  // Cache
  MAX_CACHE_ENTRY_SIZE: 1024 * 1024, // 1MB max per cache entry
} as const;

/**
 * Validate that a number is within safe integer range
 */
export function isSafeNumber(value: number): boolean {
  return Number.isFinite(value) && 
         value >= Number.MIN_SAFE_INTEGER && 
         value <= Number.MAX_SAFE_INTEGER;
}

/**
 * Validate hours value
 */
export function validateHours(value: number): boolean {
  return isSafeNumber(value) && 
         value >= 0 && 
         value <= ValidationLimits.MAX_ACTUAL_HOURS;
}

/**
 * Validate content size
 */
export function validateContentSize(content: string, maxSize: number): boolean {
  // Use Buffer to get accurate byte length for unicode
  const byteLength = Buffer.byteLength(content, 'utf-8');
  return byteLength <= maxSize;
}
