import { Task, TaskHierarchy } from '../models/task.js';
import { TaskIndex, TaskIndexEntry, CURRENT_STORAGE_VERSION } from '../models/config.js';

// Re-export config types for convenience
export { TaskIndex, TaskIndexEntry, CURRENT_STORAGE_VERSION };

/**
 * Storage interface for the task management system
 * 
 * Version 4.0.0: Simplified architecture without projects
 * - Tasks stored in .cortex/tasks/{number}-{name}/task.json
 * - Index file in .cortex/tasks/index.json for quick lookups
 * - No project concept - tasks are standalone entities
 * - Supports unlimited task hierarchy via parentId
 */
export interface Storage {
  /**
   * Initialize the storage system
   */
  initialize(): Promise<void>;

  // Task operations
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

  // Index operations
  getTaskIndex(): Promise<TaskIndex>;

  // Configuration info
  getVersion(): string;
}
