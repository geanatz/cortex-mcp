/**
 * Configuration data model for the task management system
 * 
 * Version 4.0.0 - Simplified architecture without projects
 * - Removed project concept entirely
 * - Tasks stored in individual folders with sequential numbering
 * - Index file for quick lookups
 */

/**
 * Current schema version for the storage format
 */
export const CURRENT_STORAGE_VERSION = '4.0.0';

/**
 * Task index entry for quick lookups
 */
export interface TaskIndexEntry {
  /** Task ID (UUID) */
  id: string;
  /** Task folder name (e.g., "001-implement-auth") */
  folderName: string;
  /** Task name for display */
  name: string;
  /** Parent task ID for hierarchy */
  parentId?: string;
  /** Task status */
  status: 'pending' | 'in-progress' | 'blocked' | 'done';
  /** Whether task is completed */
  completed: boolean;
  /** Creation timestamp */
  createdAt: string;
  /** Last update timestamp */
  updatedAt: string;
}

/**
 * Task index structure stored in .cortex/tasks/index.json
 */
export interface TaskIndex {
  /** Schema version */
  version: string;
  /** Next sequential number for task folders */
  nextNumber: number;
  /** Array of task index entries */
  tasks: TaskIndexEntry[];
  /** Last modified timestamp */
  lastModified: string;
}

/**
 * Create an empty task index
 */
export function createEmptyTaskIndex(): TaskIndex {
  return {
    version: CURRENT_STORAGE_VERSION,
    nextNumber: 1,
    tasks: [],
    lastModified: new Date().toISOString()
  };
}
