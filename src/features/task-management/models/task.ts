/**
 * Task data model for the task management system
 * ID = folder name (e.g., '001-implement-auth') - acts as the task title
 * Details = comprehensive description
 * 
 * New Structure:
 * - Each parent task has its own folder
 * - Subtasks are stored INSIDE the parent .task.json file
 * - No separate folders for subtasks
 * - No dependsOn field - simplified dependency model
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
 * Subtask - simplified task for organizational purposes
 * Stored inside parent task's subtasks array
 * Single level only - subtasks cannot have their own subtasks
 */
export interface Subtask {
  /** Subtask ID (simple incremental number: "1", "2", etc.) */
  readonly id: string;
  /** Subtask description */
  details: string;
  /** Subtask status */
  status: TaskStatus;
}

/**
 * Base task interface - parent task with all fields
 * Each parent task has its own folder with .task.json
 */
export interface Task {
  /** Unique identifier for the task (same as folder name, e.g., '001-implement-auth') */
  readonly id: string;
  /** Comprehensive task description with full context and requirements */
  details: string;
  /** Timestamp when the task was created */
  readonly createdAt: string;
  /** Timestamp when the task was last updated */
  updatedAt: string;
  /** Task status (pending, in_progress, done) */
  status: TaskStatus;
  /** Tags for categorization and filtering */
  tags?: string[];
  /** Actual time spent in hours */
  actualHours?: number;
  /** Subtasks for organizational purposes */
  subtasks: Subtask[];
}

/**
 * Task without readonly fields (for internal updates)
 */
export type MutableTask = Omit<Task, 'id' | 'createdAt'> & {
  id: string;
  createdAt: string;
};

/**
 * Input data for creating a new parent task
 */
export interface CreateTaskInput {
  /** Task description - used to generate folder name/ID */
  details: string;
  /** Task status (defaults to 'pending') */
  status?: TaskStatus;
  /** Tags for categorization and filtering */
  tags?: string[];
}

/**
 * Input for adding a new subtask
 */
export interface AddSubtaskInput {
  /** Subtask description */
  details: string;
  /** Subtask status (defaults to 'pending') */
  status?: TaskStatus;
}

/**
 * Input for updating an existing subtask
 */
export interface UpdateSubtaskInput {
  /** Subtask ID to update */
  id: string;
  /** Updated description (optional) */
  details?: string;
  /** Updated status (optional) */
  status?: TaskStatus;
}

/**
 * Input data for updating an existing parent task
 * Supports updating parent fields and subtask operations
 */
export interface UpdateTaskInput {
  /** Task description (optional) */
  details?: string;
  /** Task status */
  status?: TaskStatus;
  /** Tags for categorization and filtering */
  tags?: string[];
  /** Actual time spent in hours */
  actualHours?: number;
  /** Add a new subtask */
  addSubtask?: AddSubtaskInput;
  /** Update an existing subtask */
  updateSubtask?: UpdateSubtaskInput;
  /** Remove subtask by ID */
  removeSubtaskId?: string;
}

/**
 * Task hierarchy helper types
 */
export interface TaskHierarchy {
  readonly task: Task;
  readonly depth: number;
}

/**
 * Task summary for list views
 */
export interface TaskSummary {
  readonly id: string;
  readonly status: TaskStatus;
  readonly subtaskCount: number;
  readonly doneSubtaskCount: number;
}

/**
 * Task filters for querying
 */
export interface TaskFilters {
  readonly status?: TaskStatus | TaskStatus[];
  readonly tags?: string[];
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
 * Check if task is done (including all subtasks)
 */
export function isTaskDone(task: Task): boolean {
  if (task.status !== 'done') return false;
  if (task.subtasks.length === 0) return true;
  return task.subtasks.every(subtask => subtask.status === 'done');
}

/**
 * Calculate task progress (ratio of done subtasks)
 */
export function calculateTaskProgress(task: Task): number {
  if (task.subtasks.length === 0) {
    return task.status === 'done' ? 1 : 0;
  }
  
  const doneCount = task.subtasks.filter(s => s.status === 'done').length;
  return doneCount / task.subtasks.length;
}

/**
 * Generate next subtask ID
 */
export function generateNextSubtaskId(subtasks: readonly Subtask[]): string {
  if (subtasks.length === 0) return '1';
  const maxId = Math.max(...subtasks.map(s => parseInt(s.id, 10)).filter(n => !isNaN(n)));
  return String(maxId + 1);
}

/**
 * Find subtask by ID
 */
export function findSubtask(task: Task, subtaskId: string): Subtask | undefined {
  return task.subtasks.find(s => s.id === subtaskId);
}

/**
 * Check if all subtasks are done
 */
export function areAllSubtasksDone(task: Task): boolean {
  if (task.subtasks.length === 0) return true;
  return task.subtasks.every(s => s.status === 'done');
}
