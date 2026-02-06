/**
 * Configuration constants for the task management system
 * 
 * Task ID = folder name (e.g., '001-implement-auth') - serves as the task title
 * ID generated from details field using intelligent slug extraction
 * Details can be comprehensive, ID is auto-generated from key parts
 * No index.json - tasks are discovered by scanning folders
 * 
 * Artifacts stored in task folders as {phase}.md files
 * Each phase (explore, search, plan, build, test) has its own artifact
 */

/**
 * Current schema version for the task storage format
 * v8.0.0 - Simplified task status (removed completed field, status only)
 */
export const CURRENT_STORAGE_VERSION = '8.0.0';

/**
 * Storage paths configuration
 */
export const STORAGE_PATHS = {
  /** Root directory for cortex data */
  ROOT_DIR: '.cortex',
  /** Tasks directory name */
  TASKS_DIR: 'tasks',
  /** Task metadata filename */
  TASK_FILE: 'task.json',
} as const;

/**
 * Task numbering configuration
 */
export const TASK_NUMBERING = {
  /** Number of digits for task numbers */
  DIGITS: 3,
  /** Pattern for matching task folders */
  PATTERN: /^\d{3}-/,
} as const;

/**
 * File naming constraints
 */
export const FILE_NAMING = {
  /** Maximum length for task slug */
  MAX_SLUG_LENGTH: 50,
  /** Maximum length for full task ID */
  MAX_ID_LENGTH: 100,
} as const;

/**
 * Cache configuration defaults
 */
export const CACHE_CONFIG = {
  /** Default TTL in milliseconds */
  DEFAULT_TTL: 5 * 60 * 1000, // 5 minutes
  /** Maximum cache entries */
  MAX_SIZE: 1000,
} as const;

