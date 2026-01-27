import { Project } from '../models/project.js';
import { Task, TaskHierarchy } from '../models/task.js';
import { CortexConfig, TasksData, CURRENT_CONFIG_VERSION } from '../models/config.js';

// Re-export config types for convenience
export { CortexConfig, TasksData, CURRENT_CONFIG_VERSION };

/**
 * Storage interface for the task management system
 * 
 * Version 3.0: Separated architecture
 * - Projects stored in .cortex/config.json (configuration data)
 * - Tasks stored in .cortex/tasks/tasks.json (operational data)
 * 
 * This follows MCP best practices for:
 * - Single Responsibility Principle (separate files for different concerns)
 * - Configuration Management (externalized configuration)
 * - Referential Integrity (cascade delete on project removal)
 */
export interface Storage {
  /**
   * Initialize the storage system
   */
  initialize(): Promise<void>;

  // Project operations (stored in config.json)
  getProject(): Promise<Project | null>;
  createProject(project: Project): Promise<Project>;
  updateProject(updates: Partial<Project>): Promise<Project | null>;
  deleteProject(): Promise<boolean>;

  // Project validation
  hasProject(): Promise<boolean>;

  // Task operations (stored in tasks/tasks.json)
  getTasks(parentId?: string): Promise<Task[]>;
  getTask(id: string): Promise<Task | null>;
  createTask(task: Task): Promise<Task>;
  updateTask(id: string, updates: Partial<Task>): Promise<Task | null>;
  deleteTask(id: string): Promise<boolean>;
  deleteTasksByParent(parentId: string): Promise<number>;

  // Task hierarchy operations
  getTaskHierarchy(parentId?: string): Promise<TaskHierarchy[]>;
  getTaskChildren(taskId: string): Promise<Task[]>;
  getTaskAncestors(taskId: string): Promise<Task[]>;
  moveTask(taskId: string, newParentId?: string): Promise<Task | null>;

  // Configuration info
  getVersion(): string;
}
