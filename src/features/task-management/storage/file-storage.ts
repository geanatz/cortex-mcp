import { promises as fs } from 'fs';
import { join } from 'path';
import { Storage, CURRENT_STORAGE_VERSION } from './storage.js';
import { Task, TaskHierarchy } from '../models/task.js';
import { 
  Artifact, 
  ArtifactInput, 
  ArtifactPhase, 
  TaskArtifacts, 
  ARTIFACT_PHASES,
  getArtifactFilename 
} from '../models/artifact.js';
import { fileExists, ensureDirectory, atomicWriteFile } from '../../../utils/file-utils.js';
import { sanitizeFileName } from '../../../utils/string-utils.js';

/**
 * File-based storage implementation using individual task folders
 * 
 * Storage Structure:
 * - .cortex/tasks/{number}-{slug}/task.json - Individual task files
 * 
 * Features:
 * - Each task has its own folder with sequential numbering (001-, 002-, etc.)
 * - Task ID = folder name (e.g., '001-implement-auth') - serves as the task title
 * - ID generated from details field using intelligent extraction
 * - No index file - tasks discovered by scanning folders
 * - Atomic-ish file writes using temp files
 * - Unlimited task hierarchy via parentId
 */
export class FileStorage implements Storage {
  private workingDirectory: string;
  private cortexDir: string;
  private tasksDir: string;
  
  // Initialization state
  private initialized: boolean = false;

  constructor(workingDirectory: string) {
    this.workingDirectory = workingDirectory;
    this.cortexDir = join(workingDirectory, '.cortex');
    this.tasksDir = join(this.cortexDir, 'tasks');
  }

  /**
   * Initialize storage by validating working directory and ensuring directories exist
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // Validate working directory exists
    if (!await fileExists(this.workingDirectory)) {
      throw new Error(`Working directory does not exist or is not accessible: ${this.workingDirectory}`);
    }

    // Ensure directories exist
    await ensureDirectory(this.cortexDir);
    await ensureDirectory(this.tasksDir);

    this.initialized = true;
  }



  /**
   * Sanitize a string for safe filesystem usage
   * Used to generate folder name slugs from task details
   */
  private sanitizeName(input: string): string {
    return sanitizeFileName(input, 50);
  }

  /**
   * Get the next sequential number by scanning existing task folders
   */
  private async getNextNumber(): Promise<number> {
    try {
      const entries = await fs.readdir(this.tasksDir, { withFileTypes: true });
      const taskFolders = entries
        .filter(e => e.isDirectory() && /^\d{3}-/.test(e.name))
        .map(e => parseInt(e.name.slice(0, 3), 10))
        .filter(n => !isNaN(n));

      if (taskFolders.length === 0) return 1;
      return Math.max(...taskFolders) + 1;
    } catch {
      return 1;
    }
  }

  /**
   * Generate task ID (folder name) from details
   * Format: {3-digit-number}-{sanitized-slug}
   * Uses intelligent extraction to create a concise, descriptive ID
   */
  private generateTaskId(details: string, number: number): string {
    const paddedNumber = number.toString().padStart(3, '0');
    const sanitizedSlug = this.sanitizeName(details);
    return `${paddedNumber}-${sanitizedSlug}`;
  }

  /**
   * Get task folder path by task ID (folder name)
   */
  private getTaskFolderPath(taskId: string): string {
    return join(this.tasksDir, taskId);
  }

  /**
   * Get task file path by task ID (folder name)
   */
  private getTaskFilePath(taskId: string): string {
    return join(this.getTaskFolderPath(taskId), 'task.json');
  }

  /**
   * Load a task from its folder
   */
  private async loadTaskFromFolder(taskId: string): Promise<Task | null> {
    try {
      const filePath = this.getTaskFilePath(taskId);
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content) as Task;
    } catch (error) {
      return null;
    }
  }

  /**
   * Save a task to its folder with atomic-ish write
   */
  private async saveTaskToFolder(taskId: string, task: Task): Promise<void> {
    const folderPath = this.getTaskFolderPath(taskId);
    const filePath = this.getTaskFilePath(taskId);
    
    // Ensure folder exists
    await ensureDirectory(folderPath);
    
    const content = JSON.stringify(task, null, 2);
    await atomicWriteFile(filePath, content);
  }

  /**
   * Delete a task folder
   */
  private async deleteTaskFolder(taskId: string): Promise<void> {
    try {
      await fs.rm(this.getTaskFolderPath(taskId), { recursive: true, force: true });
    } catch { /* ignore if folder doesn't exist */ }
  }

  /**
   * Get all task folder names from the tasks directory
   */
  private async getAllTaskFolders(): Promise<string[]> {
    try {
      const entries = await fs.readdir(this.tasksDir, { withFileTypes: true });
      return entries
        .filter(e => e.isDirectory() && /^\d{3}-/.test(e.name))
        .map(e => e.name)
        .sort(); // Sort by folder name (which includes number prefix)
    } catch {
      return [];
    }
  }

  /**
   * Calculate task level in hierarchy
   */
  private calculateTaskLevel(task: Task, allTasks: Task[]): number {
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

  // ==================== Public API ====================

  /**
   * Get current storage version
   */
  getVersion(): string {
    return CURRENT_STORAGE_VERSION;
  }

  // ==================== Task Operations ====================

  async getTasks(parentId?: string): Promise<Task[]> {
    const folders = await this.getAllTaskFolders();
    const tasks: Task[] = [];
    
    // Load all tasks from their folders
    for (const folder of folders) {
      const task = await this.loadTaskFromFolder(folder);
      if (task) {
        tasks.push(task);
      }
    }

    // Filter by parentId if specified
    if (parentId !== undefined) {
      return tasks.filter(t => t.parentId === parentId);
    }

    // Calculate levels for all tasks
    for (const task of tasks) {
      task.level = this.calculateTaskLevel(task, tasks);
    }

    return tasks;
  }

  async getTask(id: string): Promise<Task | null> {
    // ID is the folder name - load directly
    const task = await this.loadTaskFromFolder(id);
    if (task) {
      const allTasks = await this.getTasks();
      task.level = this.calculateTaskLevel(task, allTasks);
    }
    return task;
  }

  async createTask(task: Task): Promise<Task> {
    // Validate parent exists if specified
    if (task.parentId) {
      const parent = await this.getTask(task.parentId);
      if (!parent) {
        throw new Error('Parent task with id ' + task.parentId + ' not found');
      }
    }

    // Get next number and generate task ID from details
    const nextNumber = await this.getNextNumber();
    const taskId = this.generateTaskId(task.details, nextNumber);
    
    // Set the ID to the folder name
    task.id = taskId;
    
    // Save task to folder
    await this.saveTaskToFolder(taskId, task);

    // Calculate level
    const allTasks = await this.getTasks();
    task.level = this.calculateTaskLevel(task, allTasks);

    return task;
  }

  async updateTask(id: string, updates: Partial<Task>): Promise<Task | null> {
    const task = await this.loadTaskFromFolder(id);
    if (!task) return null;

    // If updating parentId, validate the new parent
    if (updates.parentId !== undefined && updates.parentId) {
      const parent = await this.getTask(updates.parentId);
      if (!parent) {
        throw new Error('Parent task with id ' + updates.parentId + ' not found');
      }
      // Prevent circular references
      if (await this.wouldCreateCircularReference(id, updates.parentId)) {
        throw new Error('Moving task would create a circular reference');
      }
    }

    // Merge updates (don't allow changing ID)
    const updatedTask: Task = {
      ...task,
      ...updates,
      id: task.id, // Preserve original ID
      updatedAt: new Date().toISOString()
    };

    // Save updated task
    await this.saveTaskToFolder(id, updatedTask);

    // Calculate level
    const allTasks = await this.getTasks();
    updatedTask.level = this.calculateTaskLevel(updatedTask, allTasks);

    return updatedTask;
  }

  async deleteTask(id: string): Promise<boolean> {
    const task = await this.loadTaskFromFolder(id);
    if (!task) return false;

    // Delete all child tasks recursively first
    await this.deleteTasksByParent(id);

    // Delete the task folder
    await this.deleteTaskFolder(id);

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
      await this.deleteTaskFolder(child.id);
      deletedCount++;
    }

    return deletedCount;
  }

  // ==================== Task Hierarchy Operations ====================

  async getTaskHierarchy(parentId?: string): Promise<TaskHierarchy[]> {
    const allTasks = await this.getTasks();
    const tasks = parentId !== undefined
      ? allTasks.filter(t => t.parentId === parentId)
      : allTasks.filter(t => !t.parentId);

    const hierarchies: TaskHierarchy[] = [];

    for (const task of tasks) {
      const children = await this.buildTaskHierarchy(task.id, allTasks);
      hierarchies.push({
        task,
        children,
        depth: task.level || 0
      });
    }

    return hierarchies;
  }

  private async buildTaskHierarchy(taskId: string, allTasks: Task[]): Promise<TaskHierarchy[]> {
    const children = allTasks.filter(t => t.parentId === taskId);
    const hierarchies: TaskHierarchy[] = [];

    for (const child of children) {
      const grandchildren = await this.buildTaskHierarchy(child.id, allTasks);
      hierarchies.push({
        task: child,
        children: grandchildren,
        depth: child.level || 0
      });
    }

    return hierarchies;
  }

  async getTaskChildren(taskId: string): Promise<Task[]> {
    const allTasks = await this.getTasks();
    return allTasks.filter(t => t.parentId === taskId);
  }

  async getTaskAncestors(taskId: string): Promise<Task[]> {
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

  async moveTask(taskId: string, newParentId?: string): Promise<Task | null> {
    if (newParentId && await this.wouldCreateCircularReference(taskId, newParentId)) {
      throw new Error('Moving task would create a circular reference');
    }

    return this.updateTask(taskId, { parentId: newParentId });
  }

  /**
   * Check if moving a task would create a circular reference
   */
  private async wouldCreateCircularReference(taskId: string, newParentId: string): Promise<boolean> {
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
   * Get the file path for an artifact
   */
  private getArtifactFilePath(taskId: string, phase: ArtifactPhase): string {
    return join(this.getTaskFolderPath(taskId), getArtifactFilename(phase));
  }

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

    // Parse YAML manually (simple key: value pairs)
    const metadata: Record<string, unknown> = {};
    for (const line of yamlContent.split('\n')) {
      const colonIndex = line.indexOf(':');
      if (colonIndex > 0) {
        const key = line.slice(0, colonIndex).trim();
        let value: unknown = line.slice(colonIndex + 1).trim();
        
        // Handle specific type conversions
        if (value === 'true') value = true;
        else if (value === 'false') value = false;
        else if (!isNaN(Number(value)) && value !== '') value = Number(value);
        // Remove quotes if present
        else if (typeof value === 'string' && value.startsWith('"') && value.endsWith('"')) {
          value = value.slice(1, -1);
        }
        
        metadata[key] = value;
      }
    }

    return {
      metadata: {
        phase: metadata.phase as ArtifactPhase,
        status: metadata.status as Artifact['metadata']['status'],
        createdAt: metadata.createdAt as string,
        updatedAt: metadata.updatedAt as string,
        retries: metadata.retries as number | undefined,
        error: metadata.error as string | undefined
      },
      content: markdownContent
    };
  }

  /**
   * Serialize artifact to file content (YAML frontmatter + markdown body)
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

  /**
   * Get a single artifact for a task
   */
  async getArtifact(taskId: string, phase: ArtifactPhase): Promise<Artifact | null> {
    try {
      // Verify task exists
      const task = await this.getTask(taskId);
      if (!task) return null;

      const filePath = this.getArtifactFilePath(taskId, phase);
      if (!await fileExists(filePath)) {
        return null;
      }

      const content = await fs.readFile(filePath, 'utf-8');
      return this.parseArtifactContent(content);
    } catch {
      return null;
    }
  }

  /**
   * Get all artifacts for a task
   */
  async getAllArtifacts(taskId: string): Promise<TaskArtifacts> {
    const artifacts: TaskArtifacts = {};

    for (const phase of ARTIFACT_PHASES) {
      const artifact = await this.getArtifact(taskId, phase);
      if (artifact) {
        artifacts[phase] = artifact;
      }
    }

    return artifacts;
  }

  /**
   * Create a new artifact for a task
   * Overwrites existing artifact if present
   */
  async createArtifact(taskId: string, phase: ArtifactPhase, input: ArtifactInput): Promise<Artifact> {
    // Verify task exists
    const task = await this.getTask(taskId);
    if (!task) {
      throw new Error(`Task with id '${taskId}' not found`);
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
      content: input.content
    };

    const filePath = this.getArtifactFilePath(taskId, phase);
    const fileContent = this.serializeArtifact(artifact);
    await atomicWriteFile(filePath, fileContent);

    return artifact;
  }

  /**
   * Update an existing artifact
   */
  async updateArtifact(taskId: string, phase: ArtifactPhase, input: Partial<ArtifactInput>): Promise<Artifact | null> {
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
      content: input.content ?? existingArtifact.content
    };

    const filePath = this.getArtifactFilePath(taskId, phase);
    const fileContent = this.serializeArtifact(updatedArtifact);
    await atomicWriteFile(filePath, fileContent);

    return updatedArtifact;
  }

  /**
   * Delete an artifact
   */
  async deleteArtifact(taskId: string, phase: ArtifactPhase): Promise<boolean> {
    try {
      const filePath = this.getArtifactFilePath(taskId, phase);
      if (!await fileExists(filePath)) {
        return false;
      }
      await fs.unlink(filePath);
      return true;
    } catch {
      return false;
    }
  }
}
