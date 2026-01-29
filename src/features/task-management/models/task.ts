/**
 * Task data model for the task management system
 * ID = folder name (e.g., '001-implement-auth') - acts as the task title
 * Details = comprehensive description
 */
export interface Task {
  /** Unique identifier for the task (same as folder name, acts as task title, e.g., '001-implement-auth') */
  id: string;
  /** Comprehensive task description with full context and requirements */
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
  /** Actual time spent in hours */
  actualHours?: number;
  /** Nesting level for UI optimization (calculated field) */
  level?: number;
}

/**
 * Input data for creating a new task
 */
export interface CreateTaskInput {
  /** Task description - first part used to generate folder name/ID, can include full details */
  details: string;
  /** Reference to parent task ID (optional, null for top-level tasks) */
  parentId?: string;
  /** Task dependencies - IDs of tasks that must be completed before this task */
  dependsOn?: string[];
  /** Task status (defaults to 'pending') */
  status?: 'pending' | 'in-progress' | 'blocked' | 'done';
  /** Tags for categorization and filtering */
  tags?: string[];
}

/**
 * Input data for updating an existing task
 */
export interface UpdateTaskInput {
  /** Task description (optional) */
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


