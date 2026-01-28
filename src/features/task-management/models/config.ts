/**
 * Configuration constants for the task management system
 * 
 * Version 5.0.0 - Simplified architecture
 * - No index.json - tasks are discovered by scanning folders
 * - Task ID = folder name (e.g., '001-implement-auth')
 * - No name, priority, or complexity fields
 */

/**
 * Current schema version for the task storage format
 */
export const CURRENT_STORAGE_VERSION = '5.0.0';
