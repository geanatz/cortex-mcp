import { Task, TaskHierarchy, TaskFilters, CreateTaskInput, UpdateTaskInput } from '../models/task.js';
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
 * Tasks stored in .cortex/tasks/{number}-{slug}/task.json
 * Task ID = folder name (e.g., '001-implement-auth') - serves as the task title
 * ID generated intelligently from details field (first 50 chars, sanitized)
 * No index file - tasks discovered by scanning folders
 * Supports unlimited task hierarchy via parentId
 * 
 * Artifacts stored in .cortex/tasks/{number}-{slug}/{phase}.md
 * Each phase (explore, search, plan, build, test) has its own artifact file
 * Artifacts use YAML frontmatter for metadata + markdown body for content
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
   * Get all tasks, optionally filtered by parentId
   */
  getTasks(parentId?: string): Promise<readonly Task[]>;

  /**
   * Get tasks with filters
   */
  getTasksFiltered(filters: TaskFilters): Promise<readonly Task[]>;

  /**
   * Get a single task by ID
   */
  getTask(id: string): Promise<Task | null>;

  /**
   * Create a new task
   */
  createTask(input: CreateTaskInput): Promise<Task>;

  /**
   * Update an existing task
   */
  updateTask(id: string, updates: UpdateTaskInput): Promise<Task | null>;

  /**
   * Delete a task and all its children
   */
  deleteTask(id: string): Promise<boolean>;

  /**
   * Delete all tasks under a parent
   */
  deleteTasksByParent(parentId: string): Promise<number>;

  /**
   * Check if a task exists
   */
  taskExists(id: string): Promise<boolean>;

  // ==================== Task Hierarchy Operations ====================

  /**
   * Get task hierarchy starting from a parent (or root)
   */
  getTaskHierarchy(parentId?: string): Promise<readonly TaskHierarchy[]>;

  /**
   * Get direct children of a task
   */
  getTaskChildren(taskId: string): Promise<readonly Task[]>;

  /**
   * Get all ancestors of a task (parent chain)
   */
  getTaskAncestors(taskId: string): Promise<readonly Task[]>;

  /**
   * Get all descendants of a task (recursive children)
   */
  getTaskDescendants(taskId: string): Promise<readonly Task[]>;

  /**
   * Move a task to a different parent
   */
  moveTask(taskId: string, newParentId?: string): Promise<Task | null>;

  /**
   * Check if moving would create a circular reference
   */
  wouldCreateCircularReference(taskId: string, newParentId: string): Promise<boolean>;

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
  abstract getTasks(parentId?: string): Promise<readonly Task[]>;
  abstract getTask(id: string): Promise<Task | null>;
  abstract createTask(input: CreateTaskInput): Promise<Task>;
  abstract updateTask(id: string, updates: UpdateTaskInput): Promise<Task | null>;
  abstract deleteTask(id: string): Promise<boolean>;
  abstract deleteTasksByParent(parentId: string): Promise<number>;
  abstract getTaskHierarchy(parentId?: string): Promise<readonly TaskHierarchy[]>;
  abstract getTaskChildren(taskId: string): Promise<readonly Task[]>;
  abstract getTaskAncestors(taskId: string): Promise<readonly Task[]>;
  abstract getTaskDescendants(taskId: string): Promise<readonly Task[]>;
  abstract moveTask(taskId: string, newParentId?: string): Promise<Task | null>;
  abstract wouldCreateCircularReference(taskId: string, newParentId: string): Promise<boolean>;
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
    let tasks = await this.getTasks(filters.parentId);
    
    if (filters.status) {
      const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
      tasks = tasks.filter(t => statuses.includes(t.status));
    }
    
    if (filters.tags && filters.tags.length > 0) {
      tasks = tasks.filter(t => 
        t.tags && filters.tags!.some(tag => t.tags!.includes(tag))
      );
    }
    
    if (filters.hasDependencies !== undefined) {
      tasks = tasks.filter(t => 
        filters.hasDependencies 
          ? (t.dependsOn && t.dependsOn.length > 0)
          : (!t.dependsOn || t.dependsOn.length === 0)
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
