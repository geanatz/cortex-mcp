/**
 * Configuration data model for the task management system
 * 
 * This file defines the structure of the cortex configuration stored in .cortex/config.json
 * Projects are treated as configuration (namespace definitions) rather than operational data,
 * following MCP best practices for separation of concerns.
 * 
 * @version 3.0.0
 */

import { Project } from './project.js';

/**
 * Current schema version for the configuration file
 */
export const CURRENT_CONFIG_VERSION = '3.0.0';

/**
 * Main configuration structure stored in .cortex/config.json
 * 
 * This is the single source of truth for:
 * - Schema version
 * - Project definitions (workspace namespaces)
 * - Future: User preferences, settings, feature flags
 */
export interface CortexConfig {
  /** Schema version */
  version: string;
  
  /** Project ID (previously inside project object) */
  id?: string;
  
  /** Project Name */
  name?: string;
  
  /** Project Description */
  description?: string;
  
  /** Timestamp when config was last modified */
  lastModified?: string;
}

/**
 * Tasks-only data structure stored in .cortex/tasks/tasks.json
 * 
 * This contains only operational task data, separate from project configuration.
 * Tasks operate within the scope of the single defined project.
 */
export interface TasksData {
  /** Array of tasks (operational data) */
  tasks: import('./task.js').Task[];
}

/**
 * Create a new empty configuration with current version
 */
export function createEmptyConfig(): CortexConfig {
  return {
    version: CURRENT_CONFIG_VERSION,
    lastModified: new Date().toISOString()
  };
}

/**
 * Create empty tasks data structure
 */
export function createEmptyTasksData(): TasksData {
  return {
    tasks: []
  };
}
