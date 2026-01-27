import { Project } from '../models/project.js';
import { Task, TaskHierarchy } from '../models/task.js';

/**
 * Storage interface for the task management system
 * Version 2.0: Updated for unified task model with migration support
 */
export interface Storage {
  // Project operations
  getProjects(): Promise<Project[]>;
  getProject(id: string): Promise<Project | null>;
  createProject(project: Project): Promise<Project>;
  updateProject(id: string, updates: Partial<Project>): Promise<Project | null>;
  deleteProject(id: string): Promise<boolean>;

  // Task operations (unified model)
  getTasks(projectId?: string, parentId?: string): Promise<Task[]>;
  getTask(id: string): Promise<Task | null>;
  createTask(task: Task): Promise<Task>;
  updateTask(id: string, updates: Partial<Task>): Promise<Task | null>;
  deleteTask(id: string): Promise<boolean>;
  deleteTasksByProject(projectId: string): Promise<number>;
  deleteTasksByParent(parentId: string): Promise<number>;

  // Task hierarchy operations
  getTaskHierarchy(projectId?: string, parentId?: string): Promise<TaskHierarchy[]>;
  getTaskChildren(taskId: string): Promise<Task[]>;
  getTaskAncestors(taskId: string): Promise<Task[]>;
  moveTask(taskId: string, newParentId?: string): Promise<Task | null>;
}

/**
 * Data structure for the storage file
 * Version 2.0: Supports both legacy and unified models during migration
 */
export interface StorageData {
  projects: Project[];
  tasks: Task[];
}
