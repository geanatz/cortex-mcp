import { Task, TaskHierarchy } from '../models/task.js';
import { CURRENT_STORAGE_VERSION } from '../models/config.js';
import { Artifact, ArtifactInput, ArtifactPhase, TaskArtifacts } from '../models/artifact.js';

// Re-export config types for convenience
export { CURRENT_STORAGE_VERSION };

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

  // Artifact operations
  getArtifact(taskId: string, phase: ArtifactPhase): Promise<Artifact | null>;
  getAllArtifacts(taskId: string): Promise<TaskArtifacts>;
  createArtifact(taskId: string, phase: ArtifactPhase, input: ArtifactInput): Promise<Artifact>;
  updateArtifact(taskId: string, phase: ArtifactPhase, input: Partial<ArtifactInput>): Promise<Artifact | null>;
  deleteArtifact(taskId: string, phase: ArtifactPhase): Promise<boolean>;

  // Configuration info
  getVersion(): string;
}
