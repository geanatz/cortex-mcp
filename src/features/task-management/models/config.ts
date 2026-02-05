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
