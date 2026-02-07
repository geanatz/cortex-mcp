import { Task, TaskHierarchy, TaskFilters, CreateTaskInput, UpdateTaskInput, Subtask, AddSubtaskInput, UpdateSubtaskInput } from '../models/task.js';
import { CURRENT_STORAGE_VERSION } from '../models/config.js';
import { 
  Artifact, 
  CreateArtifactInput, 
  UpdateArtifactInput, 
  ArtifactPhase, 
  TaskArtifacts 
} from '../models/artifact.js';

// Re-export config types for convenience
export { CURRENT_STORAGE_VERSION };

/**
 * Storage operation result
 */
export interface StorageResult<T> {
  readonly success: boolean;
  readonly data?: T;
  readonly error?: string;
}

/**
 * Storage statistics
 */
export interface StorageStats {
  readonly taskCount: number;
  readonly artifactCount: number;
  readonly cacheHitRate?: number;
  readonly lastAccessed?: Date;
}

/**
 * Storage interface for the task management system
 * 
 * Simplified storage model:
 * - Each parent task has its own folder: .cortex/tasks/{number}-{slug}/
 * - .task.json contains parent task + subtasks array
 * - Subtasks are NOT separate folders - they're stored inline
 * - No dependsOn - simplified model
 * - Single level nesting only
 * 
 * Artifacts stored in .cortex/tasks/{number}-{slug}/{phase}.md
 * Each phase (explore, search, plan, build, test) has its own artifact file
 * Artifacts belong to the entire task hierarchy (parent + subtasks)
 */
export interface Storage {
  /**
   * Initialize the storage system
   * Must be called before any other operations
   */
  initialize(): Promise<void>;

  /**
   * Check if storage is initialized
   */
  isInitialized(): boolean;

  // ==================== Task Operations ====================

  /**
   * Get all parent tasks
   */
  getTasks(): Promise<readonly Task[]>;

  /**
   * Get tasks with filters
   */
  getTasksFiltered(filters: TaskFilters): Promise<readonly Task[]>;

  /**
   * Get a single task by ID
   */
  getTask(id: string): Promise<Task | null>;

  /**
   * Create a new parent task
   */
  createTask(input: CreateTaskInput): Promise<Task>;

  /**
   * Update an existing task (parent fields or subtask operations)
   */
  updateTask(id: string, updates: UpdateTaskInput): Promise<Task | null>;

  /**
   * Delete a task and all its subtasks
   */
  deleteTask(id: string): Promise<boolean>;

  /**
   * Check if a task exists
   */
  taskExists(id: string): Promise<boolean>;

  // ==================== Subtask Operations ====================

  /**
   * Add a subtask to a parent task
   */
  addSubtask(taskId: string, input: AddSubtaskInput): Promise<Subtask | null>;

  /**
   * Update a subtask
   */
  updateSubtask(taskId: string, input: UpdateSubtaskInput): Promise<Subtask | null>;

  /**
   * Remove a subtask by ID
   */
  removeSubtask(taskId: string, subtaskId: string): Promise<boolean>;

  // ==================== Task Hierarchy Operations ====================

  /**
   * Get task hierarchy (parent with subtasks)
   */
  getTaskHierarchy(): Promise<readonly TaskHierarchy[]>;

  // ==================== Artifact Operations ====================

  /**
   * Get a single artifact for a task
   */
  getArtifact(taskId: string, phase: ArtifactPhase): Promise<Artifact | null>;

  /**
   * Get all artifacts for a task
   */
  getAllArtifacts(taskId: string): Promise<TaskArtifacts>;

  /**
   * Create a new artifact (overwrites existing)
   */
  createArtifact(taskId: string, phase: ArtifactPhase, input: CreateArtifactInput): Promise<Artifact>;

  /**
   * Update an existing artifact
   */
  updateArtifact(taskId: string, phase: ArtifactPhase, input: UpdateArtifactInput): Promise<Artifact | null>;

  /**
   * Delete an artifact
   */
  deleteArtifact(taskId: string, phase: ArtifactPhase): Promise<boolean>;

  /**
   * Check if an artifact exists
   */
  artifactExists(taskId: string, phase: ArtifactPhase): Promise<boolean>;

  // ==================== Utility Operations ====================

  /**
   * Get storage version
   */
  getVersion(): string;

  /**
   * Get storage statistics
   */
  getStats(): Promise<StorageStats>;

  /**
   * Clear all caches
   */
  clearCache(): void;

  /**
   * Get the working directory
   */
  getWorkingDirectory(): string;
}

/**
 * Abstract base storage class with common functionality
 */
export abstract class BaseStorage implements Storage {
  protected initialized = false;

  abstract initialize(): Promise<void>;
  abstract getTasks(): Promise<readonly Task[]>;
  abstract getTask(id: string): Promise<Task | null>;
  abstract createTask(input: CreateTaskInput): Promise<Task>;
  abstract updateTask(id: string, updates: UpdateTaskInput): Promise<Task | null>;
  abstract deleteTask(id: string): Promise<boolean>;
  abstract addSubtask(taskId: string, input: AddSubtaskInput): Promise<Subtask | null>;
  abstract updateSubtask(taskId: string, input: UpdateSubtaskInput): Promise<Subtask | null>;
  abstract removeSubtask(taskId: string, subtaskId: string): Promise<boolean>;
  abstract getTaskHierarchy(): Promise<readonly TaskHierarchy[]>;
  abstract getArtifact(taskId: string, phase: ArtifactPhase): Promise<Artifact | null>;
  abstract getAllArtifacts(taskId: string): Promise<TaskArtifacts>;
  abstract createArtifact(taskId: string, phase: ArtifactPhase, input: CreateArtifactInput): Promise<Artifact>;
  abstract updateArtifact(taskId: string, phase: ArtifactPhase, input: UpdateArtifactInput): Promise<Artifact | null>;
  abstract deleteArtifact(taskId: string, phase: ArtifactPhase): Promise<boolean>;
  abstract getStats(): Promise<StorageStats>;
  abstract clearCache(): void;
  abstract getWorkingDirectory(): string;

  isInitialized(): boolean {
    return this.initialized;
  }

  getVersion(): string {
    return CURRENT_STORAGE_VERSION;
  }

  async getTasksFiltered(filters: TaskFilters): Promise<readonly Task[]> {
    let tasks = await this.getTasks();
    
    if (filters.status) {
      const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
      tasks = tasks.filter(t => statuses.includes(t.status));
    }
    
    if (filters.tags && filters.tags.length > 0) {
      tasks = tasks.filter(t => 
        t.tags && filters.tags!.some(tag => t.tags!.includes(tag))
      );
    }
    
    if (filters.includeDone === false) {
      tasks = tasks.filter(t => t.status !== 'done');
    }
    
    return tasks;
  }

  async taskExists(id: string): Promise<boolean> {
    const task = await this.getTask(id);
    return task !== null;
  }

  async artifactExists(taskId: string, phase: ArtifactPhase): Promise<boolean> {
    const artifact = await this.getArtifact(taskId, phase);
    return artifact !== null;
  }
}
