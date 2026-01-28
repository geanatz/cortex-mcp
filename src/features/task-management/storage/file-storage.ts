import { promises as fs } from 'fs';
import { join } from 'path';
import { Storage, CURRENT_STORAGE_VERSION } from './storage.js';
import { Task, TaskHierarchy } from '../models/task.js';

/**
 * File-based storage implementation using individual task folders
 * 
 * Version 5.0.0: Simplified folder-based architecture without index.json
 * 
 * Storage Structure:
 * - .cortex/tasks/{number}-{slug}/task.json - Individual task files
 * 
 * Features:
 * - Each task has its own folder with sequential numbering (001-, 002-, etc.)
 * - Task ID = folder name (e.g., '001-implement-auth')
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
    try {
      await fs.access(this.workingDirectory);
    } catch (error) {
      throw new Error(`Working directory does not exist or is not accessible: ${this.workingDirectory}`);
    }

    // Ensure directories exist
    await fs.mkdir(this.cortexDir, { recursive: true });
    await fs.mkdir(this.tasksDir, { recursive: true });

    this.initialized = true;
  }

  /**
   * Check if a file or directory exists
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
   * Sanitize a string for safe filesystem usage
   * Used to generate folder name slugs from task details
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
      // Don't end on a dash
      sanitized = sanitized.replace(/-+$/, '');
    }

    // Ensure it's not empty
    if (!sanitized) {
      sanitized = 'task';
    }

    return sanitized;
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
    await fs.mkdir(folderPath, { recursive: true });
    
    const content = JSON.stringify(task, null, 2);
    
    // Write to temp file first, then rename (atomic on POSIX)
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
  private async deleteTaskFolder(taskId: string): Promise<void> {
    const folderPath = this.getTaskFolderPath(taskId);
    try {
      await fs.rm(folderPath, { recursive: true, force: true });
    } catch (error) {
      // Ignore if folder doesn't exist
    }
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

    // Get next number and generate task ID
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
}
