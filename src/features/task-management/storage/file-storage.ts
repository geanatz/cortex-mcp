import { promises as fs } from 'fs';
import { join } from 'path';
import { BaseStorage, CURRENT_STORAGE_VERSION, StorageStats } from './storage.js';
import { 
  Task, 
  TaskHierarchy, 
  CreateTaskInput, 
  UpdateTaskInput 
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
import { NotFoundError, StorageError, ConflictError } from '../../../errors/errors.js';
import { createLogger } from '../../../utils/logger.js';

const logger = createLogger('file-storage');

/**
 * File-based storage implementation using individual task folders
 * 
 * Storage Structure:
 * - .cortex/tasks/{number}-{slug}/task.json - Individual task files
 * - .cortex/tasks/{number}-{slug}/{phase}.md - Artifact files
 * 
 * Features:
 * - Each task has its own folder with sequential numbering (001-, 002-, etc.)
 * - Task ID = folder name (e.g., '001-implement-auth') - serves as the task title
 * - ID generated from details field using intelligent extraction
 * - No index file - tasks discovered by scanning folders
 * - Atomic-ish file writes using temp files
 * - Unlimited task hierarchy via parentId
 * - In-memory caching with TTL for improved performance
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
      throw StorageError.initializationError(
        this.workingDirectory,
        `Working directory does not exist or is not accessible: ${this.workingDirectory}`
      );
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
   * Get all task folder names (with caching)
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

  /**
   * Calculate task level in hierarchy
   */
  private calculateTaskLevel(task: Task, allTasks: readonly Task[]): number {
    if (!task.parentId) return 0;

    let level = 0;
    let currentParentId: string | undefined = task.parentId;
    const visited = new Set<string>();

    while (currentParentId && !visited.has(currentParentId)) {
      visited.add(currentParentId);
      const parent = allTasks.find(t => t.id === currentParentId);
      if (!parent) break;
      level++;
      currentParentId = parent.parentId;
    }

    return level;
  }

  // ==================== Task Operations ====================

  async getTasks(parentId?: string): Promise<readonly Task[]> {
    const folders = await this.getTaskFolders();
    const tasks: Task[] = [];
    
    // Load all tasks (utilizing cache)
    for (const folder of folders) {
      const task = await this.loadTask(folder);
      if (task) {
        tasks.push(task);
      }
    }

    // Calculate levels for all tasks
    for (const task of tasks) {
      task.level = this.calculateTaskLevel(task, tasks);
    }

    // Filter by parentId if specified
    if (parentId !== undefined) {
      return tasks.filter(t => t.parentId === parentId);
    }

    return tasks;
  }

  async getTask(id: string): Promise<Task | null> {
    const task = await this.loadTask(id);
    if (task) {
      const allTasks = await this.getTasks();
      task.level = this.calculateTaskLevel(task, allTasks);
    }
    return task;
  }

  async createTask(input: CreateTaskInput): Promise<Task> {
    // Validate parent exists if specified
    if (input.parentId) {
      const parent = await this.getTask(input.parentId);
      if (!parent) {
        throw NotFoundError.parent(input.parentId);
      }
    }

    // Get next number and generate task ID
    const nextNumber = await this.getNextNumber();
    const taskId = this.generateTaskId(input.details, nextNumber);
    
    const now = new Date().toISOString();
    const task: Task = {
      id: taskId,
      details: input.details.trim(),
      parentId: input.parentId?.trim(),
      createdAt: now,
      updatedAt: now,
      dependsOn: input.dependsOn || [],
      status: input.status || 'pending',
      tags: input.tags || [],
    };
    
    // Save task
    await this.saveTask(taskId, task);

    // Calculate level
    const allTasks = await this.getTasks();
    task.level = this.calculateTaskLevel(task, allTasks);

    logger.debug('Task created', { taskId });
    return task;
  }

  async updateTask(id: string, updates: UpdateTaskInput): Promise<Task | null> {
    const task = await this.loadTask(id);
    if (!task) return null;

    // Validate new parent if changing
    if (updates.parentId !== undefined && updates.parentId) {
      const parent = await this.getTask(updates.parentId);
      if (!parent) {
        throw NotFoundError.parent(updates.parentId);
      }
      if (await this.wouldCreateCircularReference(id, updates.parentId)) {
        throw ConflictError.circularReference(id, updates.parentId);
      }
    }

    // Merge updates
    const updatedTask: Task = {
      ...task,
      details: updates.details?.trim() ?? task.details,
      parentId: updates.parentId !== undefined ? updates.parentId?.trim() : task.parentId,
      dependsOn: updates.dependsOn ?? task.dependsOn,
      status: updates.status ?? task.status,
      tags: updates.tags ?? task.tags,
      actualHours: updates.actualHours ?? task.actualHours,
      updatedAt: new Date().toISOString(),
    };

    // Save and invalidate cache
    await this.saveTask(id, updatedTask);
    this.taskCache.invalidate(InvalidationPatterns.task(id));

    // Calculate level
    const allTasks = await this.getTasks();
    updatedTask.level = this.calculateTaskLevel(updatedTask, allTasks);

    logger.debug('Task updated', { taskId: id });
    return updatedTask;
  }

  async deleteTask(id: string): Promise<boolean> {
    const task = await this.loadTask(id);
    if (!task) return false;

    // Delete all child tasks recursively first
    await this.deleteTasksByParent(id);

    // Delete the task folder
    await deleteDirectory(this.getTaskFolderPath(id));

    // Invalidate caches
    this.taskCache.delete(CacheKeys.task(id));
    this.artifactCache.invalidate(InvalidationPatterns.artifact(id));
    this.invalidateTaskFoldersCache();

    logger.debug('Task deleted', { taskId: id });
    return true;
  }

  async deleteTasksByParent(parentId: string): Promise<number> {
    const allTasks = await this.getTasks();
    const childTasks = allTasks.filter(t => t.parentId === parentId);
    let deletedCount = 0;

    // Recursively delete children first
    for (const child of childTasks) {
      deletedCount += await this.deleteTasksByParent(child.id);
    }

    // Delete direct children
    for (const child of childTasks) {
      await deleteDirectory(this.getTaskFolderPath(child.id));
      this.taskCache.delete(CacheKeys.task(child.id));
      deletedCount++;
    }

    return deletedCount;
  }

  // ==================== Task Hierarchy Operations ====================

  async getTaskHierarchy(parentId?: string): Promise<readonly TaskHierarchy[]> {
    const allTasks = await this.getTasks();
    const tasks = parentId !== undefined
      ? allTasks.filter(t => t.parentId === parentId)
      : allTasks.filter(t => !t.parentId);

    const hierarchies: TaskHierarchy[] = [];

    for (const task of tasks) {
      const children = this.buildTaskHierarchySync(task.id, allTasks);
      hierarchies.push({
        task,
        children,
        depth: task.level || 0
      });
    }

    return hierarchies;
  }

  private buildTaskHierarchySync(taskId: string, allTasks: readonly Task[]): readonly TaskHierarchy[] {
    const children = allTasks.filter(t => t.parentId === taskId);
    const hierarchies: TaskHierarchy[] = [];

    for (const child of children) {
      const grandchildren = this.buildTaskHierarchySync(child.id, allTasks);
      hierarchies.push({
        task: child,
        children: grandchildren,
        depth: child.level || 0
      });
    }

    return hierarchies;
  }

  async getTaskChildren(taskId: string): Promise<readonly Task[]> {
    const allTasks = await this.getTasks();
    return allTasks.filter(t => t.parentId === taskId);
  }

  async getTaskAncestors(taskId: string): Promise<readonly Task[]> {
    const ancestors: Task[] = [];
    let currentTask = await this.getTask(taskId);

    while (currentTask?.parentId) {
      const parent = await this.getTask(currentTask.parentId);
      if (!parent) break;
      ancestors.unshift(parent);
      currentTask = parent;
    }

    return ancestors;
  }

  async getTaskDescendants(taskId: string): Promise<readonly Task[]> {
    const descendants: Task[] = [];
    const children = await this.getTaskChildren(taskId);
    
    for (const child of children) {
      descendants.push(child);
      const childDescendants = await this.getTaskDescendants(child.id);
      descendants.push(...childDescendants);
    }
    
    return descendants;
  }

  async moveTask(taskId: string, newParentId?: string): Promise<Task | null> {
    if (newParentId && await this.wouldCreateCircularReference(taskId, newParentId)) {
      throw ConflictError.circularReference(taskId, newParentId);
    }

    return this.updateTask(taskId, { parentId: newParentId });
  }

  async wouldCreateCircularReference(taskId: string, newParentId: string): Promise<boolean> {
    let currentParentId: string | undefined = newParentId;
    const visited = new Set<string>();

    while (currentParentId && !visited.has(currentParentId)) {
      if (currentParentId === taskId) {
        return true;
      }
      visited.add(currentParentId);
      const parent = await this.getTask(currentParentId);
      currentParentId = parent?.parentId;
    }

    return false;
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
