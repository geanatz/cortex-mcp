import { promises as fs } from 'fs';
import { join } from 'path';
import { BaseStorage, CURRENT_STORAGE_VERSION, StorageStats } from './storage.js';
import { 
  Task, 
  TaskHierarchy, 
  CreateTaskInput, 
  UpdateTaskInput,
  Subtask,
  AddSubtaskInput,
  UpdateSubtaskInput,
  generateNextSubtaskId
} from '../models/task.js';
import { 
  Artifact, 
  CreateArtifactInput,
  UpdateArtifactInput,
  ArtifactPhase, 
  type ArtifactStatus,
  TaskArtifacts, 
  ARTIFACT_PHASES,
  getArtifactFilename 
} from '../models/artifact.js';
import { 
  STORAGE_PATHS, 
  TASK_NUMBERING, 
  FILE_NAMING,
  CACHE_CONFIG 
} from '../models/config.js';
import { 
  fileExists, 
  ensureDirectory, 
  atomicWriteFile,
  readJsonFileOrNull,
  writeJsonFile,
  listDirectory,
  deleteDirectory,
  deleteFile,
  readFileOrNull
} from '../../../utils/file-utils.js';
import { sanitizeFileName, padNumber } from '../../../utils/string-utils.js';
import { Cache, CacheKeys, InvalidationPatterns } from '../../../utils/cache.js';
import { NotFoundError, StorageError } from '../../../errors/errors.js';
import { createLogger } from '../../../utils/logger.js';

const logger = createLogger('file-storage');

/**
 * File-based storage implementation - Simplified Model
 * 
 * Storage Structure:
 * - .cortex/tasks/{number}-{slug}/.task.json - Contains parent task + subtasks array
 * - .cortex/tasks/{number}-{slug}/{phase}.md - Artifact files (for entire hierarchy)
 * 
 * Key Changes:
 * - Subtasks are stored INSIDE the parent .task.json file
 * - No separate folders for subtasks
 * - No dependsOn field - simplified model
 * - Single level nesting only (subtasks cannot have subtasks)
 * - Artifacts belong to the entire task hierarchy
 * 
 * Features:
 * - Each parent task has its own folder with sequential numbering
 * - Task ID = folder name (e.g., '001-implement-auth')
 * - Atomic file writes using temp files
 * - In-memory caching with TTL
 */
export class FileStorage extends BaseStorage {
  private readonly workingDirectory: string;
  private readonly cortexDir: string;
  private readonly tasksDir: string;
  
  // Caches for performance
  private readonly taskCache: Cache<Task>;
  private readonly artifactCache: Cache<Artifact>;
  private taskFoldersCache: string[] | null = null;
  private taskFoldersCacheTime: number = 0;

  constructor(workingDirectory: string) {
    super();
    this.workingDirectory = workingDirectory;
    this.cortexDir = join(workingDirectory, STORAGE_PATHS.ROOT_DIR);
    this.tasksDir = join(this.cortexDir, STORAGE_PATHS.TASKS_DIR);
    
    // Initialize caches
    this.taskCache = new Cache<Task>({ 
      defaultTtl: CACHE_CONFIG.DEFAULT_TTL,
      maxSize: CACHE_CONFIG.MAX_SIZE 
    });
    this.artifactCache = new Cache<Artifact>({ 
      defaultTtl: CACHE_CONFIG.DEFAULT_TTL,
      maxSize: CACHE_CONFIG.MAX_SIZE 
    });
  }

  // ==================== Initialization ====================

  /**
   * Initialize storage by validating working directory and ensuring directories exist
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    logger.debug('Initializing file storage', { workingDirectory: this.workingDirectory });

    // Validate working directory exists
    if (!await fileExists(this.workingDirectory)) {
      // Try to create the working directory if it doesn't exist
      try {
        await ensureDirectory(this.workingDirectory);
        logger.debug('Created working directory', { workingDirectory: this.workingDirectory });
      } catch (error) {
        throw StorageError.initializationError(
          this.workingDirectory,
          `Working directory does not exist and could not be created: ${this.workingDirectory}. Error: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }

    // Ensure directories exist
    await ensureDirectory(this.cortexDir);
    await ensureDirectory(this.tasksDir);

    this.initialized = true;
    logger.debug('File storage initialized successfully');
  }

  getWorkingDirectory(): string {
    return this.workingDirectory;
  }

  // ==================== Private Helpers ====================

  /**
   * Sanitize a string for safe filesystem usage
   */
  private sanitizeName(input: string): string {
    return sanitizeFileName(input, FILE_NAMING.MAX_SLUG_LENGTH);
  }

  /**
   * Get the next sequential number by scanning existing task folders
   */
  private async getNextNumber(): Promise<number> {
    const folders = await this.getTaskFolders();
    const numbers = folders
      .filter(name => TASK_NUMBERING.PATTERN.test(name))
      .map(name => parseInt(name.slice(0, TASK_NUMBERING.DIGITS), 10))
      .filter(n => !isNaN(n));

    if (numbers.length === 0) return 1;
    return Math.max(...numbers) + 1;
  }

  /**
   * Generate task ID (folder name) from details
   */
  private generateTaskId(details: string, number: number): string {
    const paddedNumber = padNumber(number, TASK_NUMBERING.DIGITS);
    const sanitizedSlug = this.sanitizeName(details);
    return `${paddedNumber}-${sanitizedSlug}`;
  }

  /**
   * Get task folder path
   */
  private getTaskFolderPath(taskId: string): string {
    return join(this.tasksDir, taskId);
  }

  /**
   * Get task file path
   */
  private getTaskFilePath(taskId: string): string {
    return join(this.getTaskFolderPath(taskId), STORAGE_PATHS.TASK_FILE);
  }

  /**
   * Get artifact file path
   */
  private getArtifactFilePath(taskId: string, phase: ArtifactPhase): string {
    return join(this.getTaskFolderPath(taskId), getArtifactFilename(phase));
  }

  /**
   * Get all task folder names (parent tasks only, with caching)
   */
  private async getTaskFolders(): Promise<string[]> {
    const now = Date.now();
    const cacheAge = now - this.taskFoldersCacheTime;
    
    // Use cache if fresh (within 1 second)
    if (this.taskFoldersCache && cacheAge < 1000) {
      return this.taskFoldersCache;
    }

    this.taskFoldersCache = await listDirectory(this.tasksDir, {
      directoriesOnly: true,
      pattern: TASK_NUMBERING.PATTERN,
      sort: true
    });
    this.taskFoldersCacheTime = now;
    
    return this.taskFoldersCache;
  }

  /**
   * Invalidate task folders cache
   */
  private invalidateTaskFoldersCache(): void {
    this.taskFoldersCache = null;
    this.taskFoldersCacheTime = 0;
  }

  /**
   * Load a task from disk (with caching)
   */
  private async loadTask(taskId: string): Promise<Task | null> {
    // Check cache first
    const cached = this.taskCache.get(CacheKeys.task(taskId));
    if (cached) {
      return cached;
    }

    const task = await readJsonFileOrNull<Task>(this.getTaskFilePath(taskId));
    if (task) {
      // Ensure subtasks array exists
      if (!task.subtasks) {
        task.subtasks = [];
      }
      this.taskCache.set(CacheKeys.task(taskId), task);
    }
    return task;
  }

  /**
   * Save a task to disk and update cache
   */
  private async saveTask(taskId: string, task: Task): Promise<void> {
    const folderPath = this.getTaskFolderPath(taskId);
    await ensureDirectory(folderPath);
    await writeJsonFile(this.getTaskFilePath(taskId), task);
    
    // Update cache
    this.taskCache.set(CacheKeys.task(taskId), task);
    this.invalidateTaskFoldersCache();
  }

  // ==================== Task Operations ====================

  /**
   * Get all parent tasks (subtasks are inside each task)
   */
  async getTasks(): Promise<readonly Task[]> {
    const folders = await this.getTaskFolders();
    const tasks: Task[] = [];
    
    // Load all parent tasks (utilizing cache)
    for (const folder of folders) {
      const task = await this.loadTask(folder);
      if (task) {
        // Ensure subtasks array exists
        if (!task.subtasks) {
          task.subtasks = [];
        }
        tasks.push(task);
      }
    }

    return tasks;
  }

  /**
   * Get a single task by ID
   */
  async getTask(id: string): Promise<Task | null> {
    const task = await this.loadTask(id);
    if (task && !task.subtasks) {
      task.subtasks = [];
    }
    return task;
  }

  /**
   * Create a new parent task
   */
  async createTask(input: CreateTaskInput): Promise<Task> {
    // Get next number and generate task ID
    const nextNumber = await this.getNextNumber();
    const taskId = this.generateTaskId(input.details, nextNumber);
    
    const now = new Date().toISOString();
    const task: Task = {
      id: taskId,
      details: input.details.trim(),
      createdAt: now,
      updatedAt: now,
      status: input.status || 'pending',
      tags: input.tags || [],
      subtasks: [],
    };
    
    // Save task
    await this.saveTask(taskId, task);

    logger.debug('Task created', { taskId });
    return task;
  }

  /**
   * Update an existing task
   * Supports updating parent fields and subtask operations
   */
  async updateTask(id: string, updates: UpdateTaskInput): Promise<Task | null> {
    const task = await this.loadTask(id);
    if (!task) return null;

    // Ensure subtasks array exists
    if (!task.subtasks) {
      task.subtasks = [];
    }

    let subtasks = [...task.subtasks];
    let updated = false;

    // Handle addSubtask operation
    if (updates.addSubtask) {
      const newSubtask: Subtask = {
        id: generateNextSubtaskId(subtasks),
        details: updates.addSubtask.details.trim(),
        status: updates.addSubtask.status || 'pending',
      };
      subtasks.push(newSubtask);
      updated = true;
    }

    // Handle updateSubtask operation
    if (updates.updateSubtask) {
      const subtaskIndex = subtasks.findIndex(s => s.id === updates.updateSubtask!.id);
      if (subtaskIndex !== -1) {
        subtasks[subtaskIndex] = {
          ...subtasks[subtaskIndex],
          details: updates.updateSubtask.details?.trim() ?? subtasks[subtaskIndex].details,
          status: updates.updateSubtask.status ?? subtasks[subtaskIndex].status,
        };
        updated = true;
      }
    }

    // Handle removeSubtaskId operation
    if (updates.removeSubtaskId) {
      const initialLength = subtasks.length;
      subtasks = subtasks.filter(s => s.id !== updates.removeSubtaskId);
      if (subtasks.length !== initialLength) {
        updated = true;
      }
    }

    // Merge updates
    const updatedTask: Task = {
      ...task,
      details: updates.details?.trim() ?? task.details,
      status: updates.status ?? task.status,
      tags: updates.tags ?? task.tags,
      actualHours: updates.actualHours ?? task.actualHours,
      subtasks,
      updatedAt: new Date().toISOString(),
    };

    // Save and invalidate cache
    await this.saveTask(id, updatedTask);
    this.taskCache.invalidate(InvalidationPatterns.task(id));

    logger.debug('Task updated', { taskId: id });
    return updatedTask;
  }

  /**
   * Delete a task and all its subtasks
   */
  async deleteTask(id: string): Promise<boolean> {
    const task = await this.loadTask(id);
    if (!task) return false;

    // Delete the entire task folder (includes .task.json, artifacts, and effectively all subtasks)
    await deleteDirectory(this.getTaskFolderPath(id));

    // Invalidate caches
    this.taskCache.delete(CacheKeys.task(id));
    this.artifactCache.invalidate(InvalidationPatterns.artifact(id));
    this.invalidateTaskFoldersCache();

    logger.debug('Task deleted', { taskId: id });
    return true;
  }

  // ==================== Subtask Operations ====================

  /**
   * Add a subtask to a parent task
   */
  async addSubtask(taskId: string, input: AddSubtaskInput): Promise<Subtask | null> {
    const task = await this.loadTask(taskId);
    if (!task) return null;

    const newSubtask: Subtask = {
      id: generateNextSubtaskId(task.subtasks || []),
      details: input.details.trim(),
      status: input.status || 'pending',
    };

    const updatedTask: Task = {
      ...task,
      subtasks: [...(task.subtasks || []), newSubtask],
      updatedAt: new Date().toISOString(),
    };

    await this.saveTask(taskId, updatedTask);
    this.taskCache.set(CacheKeys.task(taskId), updatedTask);

    logger.debug('Subtask added', { taskId, subtaskId: newSubtask.id });
    return newSubtask;
  }

  /**
   * Update a subtask
   */
  async updateSubtask(taskId: string, input: UpdateSubtaskInput): Promise<Subtask | null> {
    const task = await this.loadTask(taskId);
    if (!task) return null;

    const subtasks = task.subtasks || [];
    const subtaskIndex = subtasks.findIndex(s => s.id === input.id);
    
    if (subtaskIndex === -1) return null;

    const updatedSubtask: Subtask = {
      ...subtasks[subtaskIndex],
      details: input.details?.trim() ?? subtasks[subtaskIndex].details,
      status: input.status ?? subtasks[subtaskIndex].status,
    };

    const updatedSubtasks = [...subtasks];
    updatedSubtasks[subtaskIndex] = updatedSubtask;

    const updatedTask: Task = {
      ...task,
      subtasks: updatedSubtasks,
      updatedAt: new Date().toISOString(),
    };

    await this.saveTask(taskId, updatedTask);
    this.taskCache.set(CacheKeys.task(taskId), updatedTask);

    logger.debug('Subtask updated', { taskId, subtaskId: input.id });
    return updatedSubtask;
  }

  /**
   * Remove a subtask by ID
   */
  async removeSubtask(taskId: string, subtaskId: string): Promise<boolean> {
    const task = await this.loadTask(taskId);
    if (!task) return false;

    const initialLength = (task.subtasks || []).length;
    const updatedSubtasks = (task.subtasks || []).filter(s => s.id !== subtaskId);

    if (updatedSubtasks.length === initialLength) {
      return false; // Subtask not found
    }

    const updatedTask: Task = {
      ...task,
      subtasks: updatedSubtasks,
      updatedAt: new Date().toISOString(),
    };

    await this.saveTask(taskId, updatedTask);
    this.taskCache.set(CacheKeys.task(taskId), updatedTask);

    logger.debug('Subtask removed', { taskId, subtaskId });
    return true;
  }

  // ==================== Task Hierarchy Operations ====================

  /**
   * Get task hierarchy (all parent tasks with their subtasks)
   */
  async getTaskHierarchy(): Promise<readonly TaskHierarchy[]> {
    const tasks = await this.getTasks();
    
    return tasks.map(task => ({
      task,
      depth: 0
    }));
  }

  // ==================== Artifact Operations ====================

  /**
   * Parse artifact file content (YAML frontmatter + markdown body)
   */
  private parseArtifactContent(fileContent: string): Artifact {
    const frontmatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
    const match = fileContent.match(frontmatterRegex);

    if (!match) {
      throw new Error('Invalid artifact format: missing YAML frontmatter');
    }

    const yamlContent = match[1];
    const markdownContent = match[2].trim();

    // Parse YAML (simple key: value pairs)
    const metadata: Record<string, unknown> = {};
    for (const line of yamlContent.split('\n')) {
      const colonIndex = line.indexOf(':');
      if (colonIndex > 0) {
        const key = line.slice(0, colonIndex).trim();
        let value: unknown = line.slice(colonIndex + 1).trim();
        
        // Type conversions
        if (value === 'true') value = true;
        else if (value === 'false') value = false;
        else if (!isNaN(Number(value)) && value !== '') value = Number(value);
        else if (typeof value === 'string' && value.startsWith('"') && value.endsWith('"')) {
          value = value.slice(1, -1);
        }
        
        metadata[key] = value;
      }
    }

    return {
      metadata: {
        phase: metadata.phase as ArtifactPhase,
        status: metadata.status as ArtifactStatus,
        createdAt: metadata.createdAt as string,
        updatedAt: metadata.updatedAt as string,
        retries: metadata.retries as number | undefined,
        error: metadata.error as string | undefined
      },
      content: markdownContent
    };
  }

  /**
   * Serialize artifact to file content
   */
  private serializeArtifact(artifact: Artifact): string {
    const lines: string[] = ['---'];
    
    lines.push(`phase: ${artifact.metadata.phase}`);
    lines.push(`status: ${artifact.metadata.status}`);
    lines.push(`createdAt: ${artifact.metadata.createdAt}`);
    lines.push(`updatedAt: ${artifact.metadata.updatedAt}`);
    
    if (artifact.metadata.retries !== undefined) {
      lines.push(`retries: ${artifact.metadata.retries}`);
    }
    if (artifact.metadata.error) {
      lines.push(`error: "${artifact.metadata.error.replace(/"/g, '\\"')}"`);
    }
    
    lines.push('---');
    lines.push('');
    lines.push(artifact.content);
    
    return lines.join('\n');
  }

  async getArtifact(taskId: string, phase: ArtifactPhase): Promise<Artifact | null> {
    // Check cache
    const cacheKey = CacheKeys.artifact(taskId, phase);
    const cached = this.artifactCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    // Verify task exists
    const task = await this.getTask(taskId);
    if (!task) return null;

    const content = await readFileOrNull(this.getArtifactFilePath(taskId, phase));
    if (!content) return null;

    try {
      const artifact = this.parseArtifactContent(content);
      this.artifactCache.set(cacheKey, artifact);
      return artifact;
    } catch {
      return null;
    }
  }

  async getAllArtifacts(taskId: string): Promise<TaskArtifacts> {
    const artifacts: TaskArtifacts = {};

    for (const phase of ARTIFACT_PHASES) {
      const artifact = await this.getArtifact(taskId, phase);
      if (artifact) {
        (artifacts as Record<ArtifactPhase, Artifact | undefined>)[phase] = artifact;
      }
    }

    return artifacts;
  }

  async createArtifact(taskId: string, phase: ArtifactPhase, input: CreateArtifactInput): Promise<Artifact> {
    // Verify task exists
    const task = await this.getTask(taskId);
    if (!task) {
      throw NotFoundError.task(taskId);
    }

    const now = new Date().toISOString();
    const artifact: Artifact = {
      metadata: {
        phase,
        status: input.status || 'completed',
        createdAt: now,
        updatedAt: now,
        retries: input.retries,
        error: input.error
      },
      content: input.content.trim()
    };

    const filePath = this.getArtifactFilePath(taskId, phase);
    await atomicWriteFile(filePath, this.serializeArtifact(artifact));

    // Update cache
    this.artifactCache.set(CacheKeys.artifact(taskId, phase), artifact);

    logger.debug('Artifact created', { taskId, phase });
    return artifact;
  }

  async updateArtifact(taskId: string, phase: ArtifactPhase, input: UpdateArtifactInput): Promise<Artifact | null> {
    const existingArtifact = await this.getArtifact(taskId, phase);
    if (!existingArtifact) {
      return null;
    }

    const now = new Date().toISOString();
    const updatedArtifact: Artifact = {
      metadata: {
        ...existingArtifact.metadata,
        status: input.status ?? existingArtifact.metadata.status,
        updatedAt: now,
        retries: input.retries ?? existingArtifact.metadata.retries,
        error: input.error ?? existingArtifact.metadata.error
      },
      content: input.content?.trim() ?? existingArtifact.content
    };

    const filePath = this.getArtifactFilePath(taskId, phase);
    await atomicWriteFile(filePath, this.serializeArtifact(updatedArtifact));

    // Update cache
    this.artifactCache.set(CacheKeys.artifact(taskId, phase), updatedArtifact);

    logger.debug('Artifact updated', { taskId, phase });
    return updatedArtifact;
  }

  async deleteArtifact(taskId: string, phase: ArtifactPhase): Promise<boolean> {
    const deleted = await deleteFile(this.getArtifactFilePath(taskId, phase));
    
    if (deleted) {
      this.artifactCache.delete(CacheKeys.artifact(taskId, phase));
      logger.debug('Artifact deleted', { taskId, phase });
    }
    
    return deleted;
  }

  // ==================== Utility Operations ====================

  async getStats(): Promise<StorageStats> {
    const folders = await this.getTaskFolders();
    let artifactCount = 0;
    
    for (const folder of folders) {
      for (const phase of ARTIFACT_PHASES) {
        if (await fileExists(this.getArtifactFilePath(folder, phase))) {
          artifactCount++;
        }
      }
    }

    const cacheStats = this.taskCache.getStats();
    
    return {
      taskCount: folders.length,
      artifactCount,
      cacheHitRate: cacheStats.hitRate,
    };
  }

  clearCache(): void {
    this.taskCache.clear();
    this.artifactCache.clear();
    this.invalidateTaskFoldersCache();
    logger.debug('Cache cleared');
  }
}
