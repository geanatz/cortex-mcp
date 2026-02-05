/**
 * Task data model for the task management system
 * ID = folder name (e.g., '001-implement-auth') - acts as the task title
 * Details = comprehensive description
 */

/**
 * Valid task status values
 */
export const TASK_STATUSES = ['pending', 'in_progress', 'done'] as const;
export type TaskStatus = typeof TASK_STATUSES[number];

/**
 * Status display information
 */
export const TASK_STATUS_INFO: Record<TaskStatus, { label: string; icon: string; description: string }> = {
  pending: { label: 'Pending', icon: '⏳', description: 'Task has not been started' },
  in_progress: { label: 'In Progress', icon: '🔄', description: 'Task is currently being worked on' },
  done: { label: 'Done', icon: '✅', description: 'Task has been completed' },
} as const;

/**
 * Base task interface with all fields
 */
export interface Task {
  /** Unique identifier for the task (same as folder name, acts as task title, e.g., '001-implement-auth') */
  readonly id: string;
  /** Comprehensive task description with full context and requirements */
  details: string;
  /** Reference to parent task ID (null for top-level tasks) */
  parentId?: string;
  /** Timestamp when the task was created */
  readonly createdAt: string;
  /** Timestamp when the task was last updated */
  updatedAt: string;
  /** Task dependencies - IDs of tasks that must be completed before this task */
  dependsOn?: string[];
  /** Task status (pending, in_progress, done) */
  status: TaskStatus;
  /** Tags for categorization and filtering */
  tags?: string[];
  /** Actual time spent in hours */
  actualHours?: number;
  /** Nesting level for UI optimization (calculated field) */
  level?: number;
}

/**
 * Task without calculated fields (as stored in JSON)
 */
export type StoredTask = Omit<Task, 'level'>;

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
  status?: TaskStatus;
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
  /** Task dependencies - IDs of tasks that must be completed before this task */
  dependsOn?: string[];
  /** Task status */
  status?: TaskStatus;
  /** Tags for categorization and filtering */
  tags?: string[];
  /** Actual time spent in hours */
  actualHours?: number;
}

/**
 * Task hierarchy helper types
 */
export interface TaskHierarchy {
  readonly task: Task;
  readonly children: readonly TaskHierarchy[];
  readonly depth: number;
}

/**
 * Task summary for list views
 */
export interface TaskSummary {
  readonly id: string;
  readonly status: TaskStatus;
  readonly level: number;
  readonly childCount: number;
  readonly doneChildCount: number;
}

/**
 * Task filters for querying
 */
export interface TaskFilters {
  readonly parentId?: string;
  readonly status?: TaskStatus | TaskStatus[];
  readonly tags?: string[];
  readonly hasDependencies?: boolean;
  readonly includeDone?: boolean;
}

/**
 * Check if a status is valid
 */
export function isValidTaskStatus(status: unknown): status is TaskStatus {
  return typeof status === 'string' && TASK_STATUSES.includes(status as TaskStatus);
}

/**
 * Get status icon
 */
export function getStatusIcon(status: TaskStatus): string {
  return TASK_STATUS_INFO[status].icon;
}

/**
 * Get status label
 */
export function getStatusLabel(status: TaskStatus): string {
  return TASK_STATUS_INFO[status].label;
}

/**
 * Check if task is done
 */
export function isTaskDone(task: Task): boolean {
  return task.status === 'done';
}

/**
 * Check if task is blocked by dependencies
 */
export function isTaskBlocked(task: Task, allTasks: readonly Task[]): boolean {
  if (!task.dependsOn || task.dependsOn.length === 0) {
    return false;
  }
  
  return task.dependsOn.some(depId => {
    const dep = allTasks.find(t => t.id === depId);
    return dep && dep.status !== 'done';
  });
}

/**
 * Get blocking tasks
 */
export function getBlockingTasks(task: Task, allTasks: readonly Task[]): Task[] {
  if (!task.dependsOn || task.dependsOn.length === 0) {
    return [];
  }
  
  return task.dependsOn
    .map(depId => allTasks.find(t => t.id === depId))
    .filter((dep): dep is Task => dep !== undefined && dep.status !== 'done');
}

/**
 * Calculate task progress (ratio of done children)
 */
export function calculateTaskProgress(hierarchy: TaskHierarchy): number {
  const countTasks = (h: TaskHierarchy): { total: number; done: number } => {
    let total = 1;
    let done = h.task.status === 'done' ? 1 : 0;
    
    for (const child of h.children) {
      const childCounts = countTasks(child);
      total += childCounts.total;
      done += childCounts.done;
    }
    
    return { total, done };
  };
  
  const { total, done } = countTasks(hierarchy);
  return total > 0 ? done / total : 0;
}