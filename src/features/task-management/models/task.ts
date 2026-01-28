/**
 * Task data model for the task management system
 * Version 5.0.0: Simplified model
 * - ID = folder name (e.g., '001-implement-auth')
 * - No name field (use id for display)
 * - No priority or complexity fields
 */
export interface Task {
  /** Unique identifier for the task (same as folder name, e.g., '001-implement-auth') */
  id: string;
  /** Enhanced task description */
  details: string;
  /** Reference to parent task ID (null for top-level tasks) */
  parentId?: string;
  /** Task completion status */
  completed: boolean;
  /** Timestamp when the task was created */
  createdAt: string;
  /** Timestamp when the task was last updated */
  updatedAt: string;
  /** Task dependencies - IDs of tasks that must be completed before this task */
  dependsOn?: string[];
  /** Task status beyond just completed (pending, in-progress, blocked, done) */
  status?: 'pending' | 'in-progress' | 'blocked' | 'done';
  /** Tags for categorization and filtering */
  tags?: string[];
  /** Estimated time to complete in hours */
  estimatedHours?: number;
  /** Actual time spent in hours */
  actualHours?: number;
  /** Nesting level for UI optimization (calculated field) */
  level?: number;
}

/**
 * Input data for creating a new task
 */
export interface CreateTaskInput {
  /** Enhanced task description (used to generate folder name/ID) */
  details: string;
  /** Reference to parent task ID (optional, null for top-level tasks) */
  parentId?: string;
  /** Task dependencies - IDs of tasks that must be completed before this task */
  dependsOn?: string[];
  /** Task status (defaults to 'pending') */
  status?: 'pending' | 'in-progress' | 'blocked' | 'done';
  /** Tags for categorization and filtering */
  tags?: string[];
  /** Estimated time to complete in hours */
  estimatedHours?: number;
}

/**
 * Input data for updating an existing task
 */
export interface UpdateTaskInput {
  /** Enhanced task description (optional) */
  details?: string;
  /** Reference to parent task (optional) */
  parentId?: string;
  /** Task completion status (optional) */
  completed?: boolean;
  /** Task dependencies - IDs of tasks that must be completed before this task */
  dependsOn?: string[];
  /** Task status */
  status?: 'pending' | 'in-progress' | 'blocked' | 'done';
  /** Tags for categorization and filtering */
  tags?: string[];
  /** Estimated time to complete in hours */
  estimatedHours?: number;
  /** Actual time spent in hours */
  actualHours?: number;
}

/**
 * Task hierarchy helper types
 */
export interface TaskHierarchy {
  task: Task;
  children: TaskHierarchy[];
  depth: number;
}

/**
 * Task tree traversal result
 */
export interface TaskTreeNode {
  id: string;
  parentId?: string;
  children: string[];
  depth: number;
  path: string[];
}
