import { promises as fs } from 'fs';
import { join } from 'path';
import { Storage, CURRENT_CONFIG_VERSION } from './storage.js';
import { Project } from '../models/project.js';
import { Task, TaskHierarchy } from '../models/task.js';
import {
  CortexConfig,
  TasksData,
  createEmptyConfig,
  createEmptyTasksData
} from '../models/config.js';

/**
 * File-based storage implementation using separated JSON files
 * 
 * Version 3.0: Separated architecture following MCP best practices
 * 
 * Storage Structure:
 * - .cortex/config.json - Projects and configuration (namespace definitions)
 * - .cortex/tasks/tasks.json - Task data only (operational data)
 * 
 * Features:
 * - Atomic-ish file writes using temp files
 * - Cascade delete when removing projects
 * - Referential integrity validation
 */
export class FileStorage implements Storage {
  private workingDirectory: string;
  private cortexDir: string;
  private configFile: string;
  private tasksDir: string;
  private tasksFile: string;
  
  // In-memory data
  private config: CortexConfig;
  private tasksData: TasksData;
  
  // Initialization state
  private initialized: boolean = false;

  constructor(workingDirectory: string) {
    this.workingDirectory = workingDirectory;
    this.cortexDir = join(workingDirectory, '.cortex');
    this.configFile = join(this.cortexDir, 'config.json');
    this.tasksDir = join(this.cortexDir, 'tasks');
    this.tasksFile = join(this.tasksDir, 'tasks.json');
    
    // Initialize with empty data
    this.config = createEmptyConfig();
    this.tasksData = createEmptyTasksData();
  }

  /**
   * Initialize storage by validating working directory and loading data
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

    // Check for config.json
    const configExists = await this.fileExists(this.configFile);
    const tasksExists = await this.fileExists(this.tasksFile);

    if (configExists) {
      // Load existing data
      await this.loadConfig();
      await this.loadTasks();
    } else if (tasksExists) {
      // Tasks file exists but no config - load tasks and create empty config
      await this.loadTasks();
      this.config = createEmptyConfig();
      await this.saveConfig();
    } else {
      // Fresh installation - create empty files
      await this.saveConfig();
      await this.saveTasks();
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
   * Load configuration from config.json
   */
  private async loadConfig(): Promise<void> {
    try {
      const content = await fs.readFile(this.configFile, 'utf-8');
      const data = JSON.parse(content);
      
      this.config = {
        version: data.version || CURRENT_CONFIG_VERSION,
        projects: data.projects || [],
        lastModified: data.lastModified
      };
    } catch (error) {
      console.warn('[cortex-mcp] Could not load config, using empty config:', error);
      this.config = createEmptyConfig();
    }
  }

  /**
   * Load tasks from tasks/tasks.json
   */
  private async loadTasks(): Promise<void> {
    try {
      const content = await fs.readFile(this.tasksFile, 'utf-8');
      const data = JSON.parse(content);
      
      this.tasksData = {
        tasks: data.tasks || []
      };
    } catch (error) {
      console.warn('[cortex-mcp] Could not load tasks, using empty tasks:', error);
      this.tasksData = createEmptyTasksData();
    }
  }

  /**
   * Save configuration to config.json with atomic-ish write
   */
  private async saveConfig(): Promise<void> {
    this.config.lastModified = new Date().toISOString();
    const content = JSON.stringify(this.config, null, 2);
    
    // Write to temp file first, then rename (atomic on POSIX)
    const tempFile = this.configFile + '.tmp';
    try {
      await fs.writeFile(tempFile, content, 'utf-8');
      await fs.rename(tempFile, this.configFile);
    } catch (error) {
      // Cleanup temp file on error
      try {
        await fs.unlink(tempFile);
      } catch { /* ignore */ }
      throw error;
    }
  }

  /**
   * Save tasks to tasks/tasks.json with atomic-ish write
   */
  private async saveTasks(): Promise<void> {
    const content = JSON.stringify(this.tasksData, null, 2);
    
    // Write to temp file first, then rename (atomic on POSIX)
    const tempFile = this.tasksFile + '.tmp';
    try {
      await fs.writeFile(tempFile, content, 'utf-8');
      await fs.rename(tempFile, this.tasksFile);
    } catch (error) {
      // Cleanup temp file on error
      try {
        await fs.unlink(tempFile);
      } catch { /* ignore */ }
      throw error;
    }
  }

  /**
   * Calculate task level in hierarchy
   */
  private calculateTaskLevel(task: Task): number {
    if (!task.parentId) return 0;

    let level = 0;
    let currentParentId: string | undefined = task.parentId;
    const visited = new Set<string>();

    while (currentParentId && !visited.has(currentParentId)) {
      visited.add(currentParentId);
      const parent = this.tasksData.tasks.find(t => t.id === currentParentId);
      if (!parent) break;
      level++;
      currentParentId = parent.parentId;
    }

    return level;
  }

  /**
   * Update task levels for all tasks
   */
  private updateTaskLevels(): void {
    for (const task of this.tasksData.tasks) {
      task.level = this.calculateTaskLevel(task);
    }
  }

  // ==================== Configuration Info ====================

  /**
   * Get current storage version
   */
  getVersion(): string {
    return this.config.version;
  }

  // ==================== Project Operations ====================
  // Projects are stored in config.json (configuration data)

  async getProjects(): Promise<Project[]> {
    return [...this.config.projects];
  }

  async getProject(id: string): Promise<Project | null> {
    return this.config.projects.find(p => p.id === id) || null;
  }

  async projectExists(id: string): Promise<boolean> {
    return this.config.projects.some(p => p.id === id);
  }

  async createProject(project: Project): Promise<Project> {
    this.config.projects.push(project);
    await this.saveConfig();
    return project;
  }

  async updateProject(id: string, updates: Partial<Project>): Promise<Project | null> {
    const index = this.config.projects.findIndex(p => p.id === id);
    if (index === -1) return null;

    this.config.projects[index] = { ...this.config.projects[index], ...updates };
    await this.saveConfig();
    return this.config.projects[index];
  }

  async deleteProject(id: string): Promise<boolean> {
    const index = this.config.projects.findIndex(p => p.id === id);
    if (index === -1) return false;

    // Remove project from config
    this.config.projects.splice(index, 1);
    
    // CASCADE DELETE: Remove all tasks belonging to this project
    const deletedCount = await this.deleteTasksByProject(id);
    
    // Save config after cascade delete
    await this.saveConfig();
    
    console.log('[cortex-mcp] Deleted project ' + id + ' and ' + deletedCount + ' associated task(s)');
    return true;
  }

  // ==================== Task Operations ====================
  // Tasks are stored in tasks/tasks.json (operational data)

  async getTasks(projectId?: string, parentId?: string): Promise<Task[]> {
    let tasks = [...this.tasksData.tasks];

    if (projectId) {
      tasks = tasks.filter(t => t.projectId === projectId);
    }

    if (parentId !== undefined) {
      tasks = tasks.filter(t => t.parentId === parentId);
    }

    // Update levels before returning
    this.updateTaskLevels();
    return tasks;
  }

  async getTask(id: string): Promise<Task | null> {
    const task = this.tasksData.tasks.find(t => t.id === id) || null;
    if (task) {
      task.level = this.calculateTaskLevel(task);
    }
    return task;
  }

  async createTask(task: Task): Promise<Task> {
    // REFERENTIAL INTEGRITY: Validate project exists
    const projectExists = await this.projectExists(task.projectId);
    if (!projectExists) {
      throw new Error('Project with id ' + task.projectId + ' not found. Cannot create task.');
    }

    // Validate parent exists if specified
    if (task.parentId) {
      const parent = await this.getTask(task.parentId);
      if (!parent) {
        throw new Error('Parent task with id ' + task.parentId + ' not found');
      }
      // Ensure task belongs to same project as parent
      if (parent.projectId !== task.projectId) {
        throw new Error('Task must belong to same project as parent task');
      }
    }

    task.level = this.calculateTaskLevel(task);
    this.tasksData.tasks.push(task);
    await this.saveTasks();
    return task;
  }

  async updateTask(id: string, updates: Partial<Task>): Promise<Task | null> {
    const index = this.tasksData.tasks.findIndex(t => t.id === id);
    if (index === -1) return null;

    const task = this.tasksData.tasks[index];

    // If updating parentId, validate the new parent
    if (updates.parentId !== undefined) {
      if (updates.parentId) {
        const parent = await this.getTask(updates.parentId);
        if (!parent) {
          throw new Error('Parent task with id ' + updates.parentId + ' not found');
        }
        // Prevent circular references
        if (await this.wouldCreateCircularReference(id, updates.parentId)) {
          throw new Error('Moving task would create a circular reference');
        }
      }
    }

    this.tasksData.tasks[index] = { ...task, ...updates };
    this.tasksData.tasks[index].level = this.calculateTaskLevel(this.tasksData.tasks[index]);
    await this.saveTasks();
    return this.tasksData.tasks[index];
  }

  async deleteTask(id: string): Promise<boolean> {
    const index = this.tasksData.tasks.findIndex(t => t.id === id);
    if (index === -1) return false;

    // Delete all child tasks recursively
    await this.deleteTasksByParent(id);

    // Remove the task itself
    this.tasksData.tasks.splice(index, 1);
    await this.saveTasks();
    return true;
  }

  async deleteTasksByProject(projectId: string): Promise<number> {
    const tasksToDelete = this.tasksData.tasks.filter(t => t.projectId === projectId);
    this.tasksData.tasks = this.tasksData.tasks.filter(t => t.projectId !== projectId);
    await this.saveTasks();
    return tasksToDelete.length;
  }

  async deleteTasksByParent(parentId: string): Promise<number> {
    const childTasks = this.tasksData.tasks.filter(t => t.parentId === parentId);
    let deletedCount = 0;

    // Recursively delete children first
    for (const child of childTasks) {
      deletedCount += await this.deleteTasksByParent(child.id);
    }

    // Delete direct children
    const directChildren = this.tasksData.tasks.filter(t => t.parentId === parentId);
    this.tasksData.tasks = this.tasksData.tasks.filter(t => t.parentId !== parentId);
    deletedCount += directChildren.length;

    await this.saveTasks();
    return deletedCount;
  }

  // ==================== Task Hierarchy Operations ====================

  async getTaskHierarchy(projectId?: string, parentId?: string): Promise<TaskHierarchy[]> {
    const tasks = await this.getTasks(projectId, parentId);
    const hierarchies: TaskHierarchy[] = [];

    for (const task of tasks) {
      const children = await this.getTaskHierarchy(projectId, task.id);
      hierarchies.push({
        task,
        children,
        depth: task.level || 0
      });
    }

    return hierarchies;
  }

  async getTaskChildren(taskId: string): Promise<Task[]> {
    return this.tasksData.tasks.filter(t => t.parentId === taskId);
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
