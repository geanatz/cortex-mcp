import { promises as fs } from 'fs';
import { join } from 'path';
import { Storage, CURRENT_STORAGE_VERSION } from './storage.js';
import { Task, TaskHierarchy } from '../models/task.js';
import {
  TaskIndex,
  TaskIndexEntry,
  createEmptyTaskIndex
} from '../models/config.js';

/**
 * File-based storage implementation using individual task folders
 * 
 * Version 4.0.0: New folder-based architecture
 * 
 * Storage Structure:
 * - .cortex/tasks/index.json - Task index for quick lookups
 * - .cortex/tasks/{number}-{name}/task.json - Individual task files
 * 
 * Features:
 * - Each task has its own folder with sequential numbering (001-, 002-, etc.)
 * - Index file maintains task registry for fast listing
 * - Atomic-ish file writes using temp files
 * - Unlimited task hierarchy via parentId
 * - No project concept - simplified architecture
 */
export class FileStorage implements Storage {
  private workingDirectory: string;
  private cortexDir: string;
  private tasksDir: string;
  private indexFile: string;
  
  // In-memory index cache
  private taskIndex: TaskIndex;
  
  // Initialization state
  private initialized: boolean = false;

  constructor(workingDirectory: string) {
    this.workingDirectory = workingDirectory;
    this.cortexDir = join(workingDirectory, '.cortex');
    this.tasksDir = join(this.cortexDir, 'tasks');
    this.indexFile = join(this.tasksDir, 'index.json');
    
    // Initialize with empty index
    this.taskIndex = createEmptyTaskIndex();
  }

  /**
   * Initialize storage by validating working directory and loading index
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // Validate working directory exists
    try {
      await fs.access(this.workingDirectory);
    } catch (error) {
      throw new Error(`Working directory does not exist or is not accessible: ${this.workingDirectory}`);
    }

    // Ensure directories exist
    await fs.mkdir(this.cortexDir, { recursive: true });
    await fs.mkdir(this.tasksDir, { recursive: true });

    // Load or create index
    const indexExists = await this.fileExists(this.indexFile);
    if (indexExists) {
      await this.loadIndex();
    } else {
      await this.saveIndex();
    }

    this.initialized = true;
  }

  /**
   * Check if a file exists
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Load task index from index.json
   */
  private async loadIndex(): Promise<void> {
    try {
      const content = await fs.readFile(this.indexFile, 'utf-8');
      const data = JSON.parse(content);
      
      this.taskIndex = {
        version: data.version || CURRENT_STORAGE_VERSION,
        nextNumber: data.nextNumber || 1,
        tasks: data.tasks || [],
        lastModified: data.lastModified || new Date().toISOString()
      };
    } catch (error) {
      console.warn('[cortex-mcp] Could not load index, creating new one:', error);
      this.taskIndex = createEmptyTaskIndex();
      await this.saveIndex();
    }
  }

  /**
   * Save task index to index.json with atomic-ish write
   */
  private async saveIndex(): Promise<void> {
    this.taskIndex.lastModified = new Date().toISOString();
    const content = JSON.stringify(this.taskIndex, null, 2);
    
    // Write to temp file first, then rename (atomic on POSIX)
    const tempFile = this.indexFile + '.tmp';
    try {
      await fs.writeFile(tempFile, content, 'utf-8');
      await fs.rename(tempFile, this.indexFile);
    } catch (error) {
      // Cleanup temp file on error
      try {
        await fs.unlink(tempFile);
      } catch { /* ignore */ }
      throw error;
    }
  }

  /**
   * Sanitize a string for safe filesystem usage
   */
  private sanitizeName(input: string): string {
    // Remove or replace unsafe characters
    let sanitized = input
      .toLowerCase()
      .replace(/[/\\:*?"<>|]/g, '-') // Replace unsafe chars with dash
      .replace(/\s+/g, '-') // Replace spaces with dash
      .replace(/-{2,}/g, '-') // Replace multiple dashes with single
      .replace(/^-+|-+$/g, ''); // Remove leading/trailing dashes

    // Limit length to 50 characters
    if (sanitized.length > 50) {
      sanitized = sanitized.substring(0, 50);
    }

    // Ensure it's not empty
    if (!sanitized) {
      sanitized = 'task';
    }

    return sanitized;
  }

  /**
   * Generate folder name for a task
   * Format: {3-digit-number}-{sanitized-name}
   */
  private generateFolderName(name: string): string {
    const number = this.taskIndex.nextNumber;
    const paddedNumber = number.toString().padStart(3, '0');
    const sanitizedName = this.sanitizeName(name);
    return `${paddedNumber}-${sanitizedName}`;
  }

  /**
   * Get task folder path by folder name
   */
  private getTaskFolderPath(folderName: string): string {
    return join(this.tasksDir, folderName);
  }

  /**
   * Get task file path by folder name
   */
  private getTaskFilePath(folderName: string): string {
    return join(this.getTaskFolderPath(folderName), 'task.json');
  }

  /**
   * Load a task from its folder
   */
  private async loadTaskFromFolder(folderName: string): Promise<Task | null> {
    try {
      const filePath = this.getTaskFilePath(folderName);
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content) as Task;
    } catch (error) {
      return null;
    }
  }

  /**
   * Save a task to its folder with atomic-ish write
   */
  private async saveTaskToFolder(folderName: string, task: Task): Promise<void> {
    const folderPath = this.getTaskFolderPath(folderName);
    const filePath = this.getTaskFilePath(folderName);
    
    // Ensure folder exists
    await fs.mkdir(folderPath, { recursive: true });
    
    const content = JSON.stringify(task, null, 2);
    
    // Write to temp file first, then rename
    const tempFile = filePath + '.tmp';
    try {
      await fs.writeFile(tempFile, content, 'utf-8');
      await fs.rename(tempFile, filePath);
    } catch (error) {
      try {
        await fs.unlink(tempFile);
      } catch { /* ignore */ }
      throw error;
    }
  }

  /**
   * Delete a task folder
   */
  private async deleteTaskFolder(folderName: string): Promise<void> {
    const folderPath = this.getTaskFolderPath(folderName);
    try {
      await fs.rm(folderPath, { recursive: true, force: true });
    } catch (error) {
      // Ignore if folder doesn't exist
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
    return this.taskIndex.version;
  }

  /**
   * Get task index
   */
  async getTaskIndex(): Promise<TaskIndex> {
    return { ...this.taskIndex };
  }

  // ==================== Task Operations ====================

  async getTasks(parentId?: string): Promise<Task[]> {
    const tasks: Task[] = [];
    
    // Load all tasks from their folders
    for (const entry of this.taskIndex.tasks) {
      const task = await this.loadTaskFromFolder(entry.folderName);
      if (task) {
        tasks.push(task);
      }
    }

    // Filter by parentId if specified
    if (parentId !== undefined) {
      return tasks.filter(t => t.parentId === parentId);
    }

    // Calculate levels
    for (const task of tasks) {
      task.level = this.calculateTaskLevel(task, tasks);
    }

    return tasks;
  }

  async getTask(id: string): Promise<Task | null> {
    const entry = this.taskIndex.tasks.find(t => t.id === id);
    if (!entry) return null;

    const task = await this.loadTaskFromFolder(entry.folderName);
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

    // Generate folder name
    const folderName = this.generateFolderName(task.name);
    
    // Save task to folder
    await this.saveTaskToFolder(folderName, task);

    // Add to index
    const indexEntry: TaskIndexEntry = {
      id: task.id,
      folderName,
      name: task.name,
      parentId: task.parentId,
      status: task.status || 'pending',
      completed: task.completed,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt
    };
    this.taskIndex.tasks.push(indexEntry);
    this.taskIndex.nextNumber++;
    await this.saveIndex();

    // Calculate level
    const allTasks = await this.getTasks();
    task.level = this.calculateTaskLevel(task, allTasks);

    return task;
  }

  async updateTask(id: string, updates: Partial<Task>): Promise<Task | null> {
    const entryIndex = this.taskIndex.tasks.findIndex(t => t.id === id);
    if (entryIndex === -1) return null;

    const entry = this.taskIndex.tasks[entryIndex];
    const task = await this.loadTaskFromFolder(entry.folderName);
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

    // Merge updates
    const updatedTask: Task = {
      ...task,
      ...updates,
      updatedAt: new Date().toISOString()
    };

    // Save updated task
    await this.saveTaskToFolder(entry.folderName, updatedTask);

    // Update index entry
    this.taskIndex.tasks[entryIndex] = {
      ...entry,
      name: updatedTask.name,
      parentId: updatedTask.parentId,
      status: updatedTask.status || 'pending',
      completed: updatedTask.completed,
      updatedAt: updatedTask.updatedAt
    };
    await this.saveIndex();

    // Calculate level
    const allTasks = await this.getTasks();
    updatedTask.level = this.calculateTaskLevel(updatedTask, allTasks);

    return updatedTask;
  }

  async deleteTask(id: string): Promise<boolean> {
    const entryIndex = this.taskIndex.tasks.findIndex(t => t.id === id);
    if (entryIndex === -1) return false;

    const entry = this.taskIndex.tasks[entryIndex];

    // Delete all child tasks recursively first
    await this.deleteTasksByParent(id);

    // Delete the task folder
    await this.deleteTaskFolder(entry.folderName);

    // Remove from index
    this.taskIndex.tasks.splice(entryIndex, 1);
    await this.saveIndex();

    return true;
  }

  async deleteTasksByParent(parentId: string): Promise<number> {
    const childEntries = this.taskIndex.tasks.filter(t => t.parentId === parentId);
    let deletedCount = 0;

    // Recursively delete children first
    for (const child of childEntries) {
      deletedCount += await this.deleteTasksByParent(child.id);
    }

    // Delete direct children
    for (const child of childEntries) {
      await this.deleteTaskFolder(child.folderName);
      const index = this.taskIndex.tasks.findIndex(t => t.id === child.id);
      if (index !== -1) {
        this.taskIndex.tasks.splice(index, 1);
        deletedCount++;
      }
    }

    await this.saveIndex();
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
}
