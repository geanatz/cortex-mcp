import { promises as fs } from 'fs';
import { join } from 'path';
import { Storage, StorageData } from './storage.js';
import { Project } from '../models/project.js';
import { Task, TaskHierarchy } from '../models/task.js';
import { getVersion } from '../../../utils/version.js';

/**
 * File-based storage implementation using JSON with project-specific directories
 * Version 2.0: Updated for unified task model with migration support
 */
export class FileStorage implements Storage {
  private workingDirectory: string;
  private storageDir: string;
  private dataFile: string;
  private data: StorageData;

  constructor(workingDirectory: string) {
    this.workingDirectory = workingDirectory;
    this.storageDir = join(workingDirectory, '.agentic-tools-mcp', 'tasks');
    this.dataFile = join(this.storageDir, 'tasks.json');
    this.data = {
      projects: [],
      tasks: []
    };
  }

  /**
   * Initialize storage by validating working directory and loading data from file
   */
  async initialize(): Promise<void> {
    try {
      // Validate that working directory exists
      await fs.access(this.workingDirectory);
    } catch (error) {
      throw new Error(`Working directory does not exist or is not accessible: ${this.workingDirectory}`);
    }

    try {
      // Ensure .agentic-tools-mcp/tasks directory exists
      await fs.mkdir(this.storageDir, { recursive: true });

      // Try to load existing data
      const fileContent = await fs.readFile(this.dataFile, 'utf-8');
      const loadedData = JSON.parse(fileContent);

      // Ensure migration metadata exists
      this.data = {
        projects: loadedData.projects || [],
        tasks: loadedData.tasks || []
      };
    } catch (error) {
      // File doesn't exist or is invalid, start with empty data
      await this.save();
    }
  }

  /**
   * Save data to file
   */
  private async save(): Promise<void> {
    await fs.writeFile(this.dataFile, JSON.stringify(this.data, null, 2));
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
      const parent = this.data.tasks.find(t => t.id === currentParentId);
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
    for (const task of this.data.tasks) {
      task.level = this.calculateTaskLevel(task);
    }
  }

  // Project operations
  async getProjects(): Promise<Project[]> {
    return [...this.data.projects];
  }

  async getProject(id: string): Promise<Project | null> {
    return this.data.projects.find(p => p.id === id) || null;
  }

  async createProject(project: Project): Promise<Project> {
    this.data.projects.push(project);
    await this.save();
    return project;
  }

  async updateProject(id: string, updates: Partial<Project>): Promise<Project | null> {
    const index = this.data.projects.findIndex(p => p.id === id);
    if (index === -1) return null;

    this.data.projects[index] = { ...this.data.projects[index], ...updates };
    await this.save();
    return this.data.projects[index];
  }

  async deleteProject(id: string): Promise<boolean> {
    const index = this.data.projects.findIndex(p => p.id === id);
    if (index === -1) return false;

    this.data.projects.splice(index, 1);
    // Also delete all related tasks (including nested ones)
    await this.deleteTasksByProject(id);
    await this.save();
    return true;
  }

  // Task operations (unified model)
  async getTasks(projectId?: string, parentId?: string): Promise<Task[]> {
    let tasks = [...this.data.tasks];

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
    const task = this.data.tasks.find(t => t.id === id) || null;
    if (task) {
      task.level = this.calculateTaskLevel(task);
    }
    return task;
  }

  async createTask(task: Task): Promise<Task> {
    // Validate parent exists if specified
    if (task.parentId) {
      const parent = await this.getTask(task.parentId);
      if (!parent) {
        throw new Error(`Parent task with id ${task.parentId} not found`);
      }
      // Ensure task belongs to same project as parent
      if (parent.projectId !== task.projectId) {
        throw new Error(`Task must belong to same project as parent task`);
      }
    }

    task.level = this.calculateTaskLevel(task);
    this.data.tasks.push(task);
    await this.save();
    return task;
  }

  async updateTask(id: string, updates: Partial<Task>): Promise<Task | null> {
    const index = this.data.tasks.findIndex(t => t.id === id);
    if (index === -1) return null;

    const task = this.data.tasks[index];

    // If updating parentId, validate the new parent
    if (updates.parentId !== undefined) {
      if (updates.parentId) {
        const parent = await this.getTask(updates.parentId);
        if (!parent) {
          throw new Error(`Parent task with id ${updates.parentId} not found`);
        }
        // Prevent circular references
        if (await this.wouldCreateCircularReference(id, updates.parentId)) {
          throw new Error(`Moving task would create a circular reference`);
        }
      }
    }

    this.data.tasks[index] = { ...task, ...updates };
    this.data.tasks[index].level = this.calculateTaskLevel(this.data.tasks[index]);
    await this.save();
    return this.data.tasks[index];
  }

  async deleteTask(id: string): Promise<boolean> {
    const index = this.data.tasks.findIndex(t => t.id === id);
    if (index === -1) return false;

    // Delete all child tasks recursively
    await this.deleteTasksByParent(id);

    this.data.tasks.splice(index, 1);
    await this.save();
    return true;
  }

  async deleteTasksByProject(projectId: string): Promise<number> {
    const tasksToDelete = this.data.tasks.filter(t => t.projectId === projectId);
    this.data.tasks = this.data.tasks.filter(t => t.projectId !== projectId);
    await this.save();
    return tasksToDelete.length;
  }

  async deleteTasksByParent(parentId: string): Promise<number> {
    const childTasks = this.data.tasks.filter(t => t.parentId === parentId);
    let deletedCount = 0;

    // Recursively delete children first
    for (const child of childTasks) {
      deletedCount += await this.deleteTasksByParent(child.id);
    }

    // Delete direct children
    const directChildren = this.data.tasks.filter(t => t.parentId === parentId);
    this.data.tasks = this.data.tasks.filter(t => t.parentId !== parentId);
    deletedCount += directChildren.length;

    await this.save();
    return deletedCount;
  }

  // Task hierarchy operations
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
    return this.data.tasks.filter(t => t.parentId === taskId);
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

  // Migration operations
}
