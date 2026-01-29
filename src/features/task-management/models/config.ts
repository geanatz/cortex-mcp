/**
 * Configuration constants for the task management system
 * 
 * Version 6.0.0 - Improved ID generation - ID acts as task title
 * - Task ID = folder name (e.g., '001-implement-auth') - serves as the task title
 * - ID generated from details field using intelligent slug extraction
 * - Details can be comprehensive, ID is auto-generated from key parts
 * - No index.json - tasks are discovered by scanning folders
 */

/**
 * Current schema version for the task storage format
 */
export const CURRENT_STORAGE_VERSION = '6.0.0';
