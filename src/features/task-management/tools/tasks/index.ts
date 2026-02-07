import { z } from 'zod';
import { Storage } from '../../storage/storage.js';
import { Task, TaskHierarchy } from '../../models/task.js';
import { ARTIFACT_PHASES, ArtifactPhase, Artifact } from '../../models/artifact.js';
import { ToolDefinition } from '../base/types.js';
import { withErrorHandling } from '../base/handlers.js';
import { workingDirectorySchema } from '../base/schemas.js';
import { StorageConfig, getWorkingDirectoryDescription } from '../../../../utils/storage-config.js';
import { createLogger } from '../../../../utils/logger.js';

const logger = createLogger('task-tools');

type StorageFactory = (workingDirectory: string, config: StorageConfig) => Promise<Storage>;

// ==================== Formatting Helpers ====================

/**
 * Format a single artifact section for display
 */
function formatArtifactSection(phase: ArtifactPhase, artifact: Artifact): string {
  const phaseTitle = phase.charAt(0).toUpperCase() + phase.slice(1);
  const header = `## ${phaseTitle} Phase`;

  const metadata = [
    `**Status:** ${artifact.metadata.status}`,
    `**Created:** ${new Date(artifact.metadata.createdAt).toLocaleString()}`,
    `**Updated:** ${new Date(artifact.metadata.updatedAt).toLocaleString()}`
  ];

  if (artifact.metadata.retries !== undefined && artifact.metadata.retries > 0) {
    metadata.push(`**Retries:** ${artifact.metadata.retries}`);
  }

  if (artifact.metadata.error) {
    metadata.push(`**Error:** ${artifact.metadata.error}`);
  }

  return `${header}\n${metadata.join(' | ')}\n\n${artifact.content}`;
}

/**
 * Get all descendant task IDs recursively
 */
async function getAllDescendants(storage: Storage, taskId: string): Promise<string[]> {
  const children = await storage.getTaskChildren(taskId);
  const descendants: string[] = [];

  for (const child of children) {
    descendants.push(child.id);
    const childDescendants = await getAllDescendants(storage, child.id);
    descendants.push(...childDescendants);
  }

  return descendants;
}

/**
 * Count total tasks in hierarchy
 */
function countTasksInHierarchy(hierarchy: readonly TaskHierarchy[]): number {
  return hierarchy.reduce((count, item) => {
    return count + 1 + countTasksInHierarchy(item.children);
  }, 0);
}

/**
 * Count done tasks in hierarchy
 */
function countDoneTasksInHierarchy(hierarchy: readonly TaskHierarchy[]): number {
  return hierarchy.reduce((count, item) => {
    const thisCount = item.task.status === 'done' ? 1 : 0;
    return count + thisCount + countDoneTasksInHierarchy(item.children);
  }, 0);
}

// ==================== Tool Factories ====================

/**
 * Create all task management tools using the same factory pattern as artifact tools.
 * Each tool creates its own storage instance per-call using the provided factory.
 */
export function createTaskTools(
  config: StorageConfig,
  createStorage: StorageFactory
): ToolDefinition[] {
  const wdSchema = workingDirectorySchema.describe(getWorkingDirectoryDescription(config));

  return [
    createListTasksTool(wdSchema, config, createStorage),
    createCreateTaskTool(wdSchema, config, createStorage),
    createGetTaskTool(wdSchema, config, createStorage),
    createUpdateTaskTool(wdSchema, config, createStorage),
    createDeleteTaskTool(wdSchema, config, createStorage),
    createMoveTaskTool(wdSchema, config, createStorage),
  ];
}

// ==================== List Tasks ====================

function createListTasksTool(
  wdSchema: z.ZodString,
  config: StorageConfig,
  createStorage: StorageFactory
): ToolDefinition {
  interface ListParams {
    workingDirectory: string;
    parentId?: string;
    showHierarchy?: boolean;
    includeDone?: boolean;
  }

  const handler = async ({ workingDirectory, parentId, showHierarchy = true, includeDone = true }: ListParams) => {
    try {
      const storage = await createStorage(workingDirectory, config);

      let parentTask: Task | null = null;
      if (parentId) {
        parentTask = await storage.getTask(parentId);
        if (!parentTask) {
          return {
            content: [{ type: 'text' as const, text: `Error: Parent task with ID "${parentId}" not found.` }],
            isError: true
          };
        }
      }

      if (showHierarchy) {
        const hierarchy = await storage.getTaskHierarchy(parentId);

        if (hierarchy.length === 0) {
          const scopeDescription = parentTask
            ? `under parent task "${parentTask.id}"`
            : `at the top level`;
          return {
            content: [{ type: 'text' as const, text: `No tasks found ${scopeDescription}. Create your first task using create_task.` }]
          };
        }

        const formatTaskHierarchy = (hierarchyList: readonly TaskHierarchy[], baseLevel: number = 0): string => {
          return hierarchyList.map(item => {
            const task = item.task;
            if (!includeDone && task.status === 'done') return '';

            const indent = '  '.repeat(baseLevel);
            const icon = task.status === 'done' ? '✅' : '⏳';
            const statusText = task.status ? ` [${task.status.toUpperCase()}]` : '';

            let taskLine = `${indent}${icon} **${task.id}**${statusText}\n`;
            taskLine += `${indent}   Level: ${task.level || 0}\n`;
            taskLine += `${indent}   ${task.details}\n`;

            if (task.tags && task.tags.length > 0) {
              taskLine += `${indent}   Tags: ${task.tags.join(', ')}\n`;
            }

            if (task.dependsOn && task.dependsOn.length > 0) {
              taskLine += `${indent}   Dependencies: ${task.dependsOn.length} task(s)\n`;
            }

            if (item.children.length > 0) {
              const childrenText = formatTaskHierarchy(item.children, baseLevel + 1);
              if (childrenText.trim()) {
                taskLine += childrenText;
              }
            }

            return taskLine;
          }).filter(line => line.trim()).join('\n');
        };

        const hierarchyText = formatTaskHierarchy(hierarchy);
        const totalTasks = countTasksInHierarchy(hierarchy);
        const doneTasks = countDoneTasksInHierarchy(hierarchy);

        const scopeInfo = parentTask
          ? `Showing hierarchy under "${parentTask.id}"`
          : `Showing full task hierarchy`;

        return {
          content: [{
            type: 'text' as const,
            text: `🌲 **Task Hierarchy**

  ${scopeInfo}
   Total: ${totalTasks} tasks (${doneTasks} done)

  ${hierarchyText}

  💡 **Tips:**
  • Use \`create_task\` with parentId to add tasks at any level
  • Use \`list_tasks\` with specific parentId to focus on a subtree
  • Use \`update_task\` to change parent relationships`
          }]
        };
      } else {
        const tasks = await storage.getTasks(parentId);

        if (tasks.length === 0) {
          const scopeDescription = parentTask
            ? `under parent task "${parentTask.id}"`
            : `at the top level`;
          return {
            content: [{ type: 'text' as const, text: `No tasks found ${scopeDescription}. Create your first task using create_task.` }]
          };
        }

        const filteredTasks = includeDone ? [...tasks] : tasks.filter(t => t.status !== 'done');

        const taskList = filteredTasks.map(task => {
          const icon = task.status === 'done' ? '✅' : '⏳';
          const statusText = task.status ? ` [${task.status.toUpperCase()}]` : '';

          return `${icon} **${task.id}**${statusText}
    Level: ${task.level || 0}
    ${task.details}
    ${task.tags && task.tags.length > 0 ? `Tags: ${task.tags.join(', ')}` : ''}
    Created: ${new Date(task.createdAt).toLocaleString()}`;
        }).join('\n\n');

        const doneCount = filteredTasks.filter(t => t.status === 'done').length;
        const scopeDescription = parentTask
          ? `under "${parentTask.id}"`
          : `at top level`;

        return {
          content: [{
            type: 'text' as const,
            text: `📋 **Tasks ${scopeDescription}**

  Found ${filteredTasks.length} task(s) (${doneCount} done):

  ${taskList}

  💡 Use \`list_tasks\` with \`showHierarchy: true\` to see the full tree structure.`
          }]
        };
      }
    } catch (error) {
      logger.error('Error in cortex_list_tasks', error);
      return {
        content: [{ type: 'text' as const, text: `Error listing tasks: ${error instanceof Error ? error.message : 'Unknown error'}` }],
        isError: true
      };
    }
  };

  return {
    name: 'cortex_list_tasks',
    description: 'List all tasks with hierarchical display. Filter by parentId for subtrees. Perfect for understanding current workflow state and task organization.',
    parameters: {
      workingDirectory: wdSchema,
      parentId: z.string().optional().describe('Filter to tasks under this parent (optional)'),
      showHierarchy: z.boolean().optional().describe('Show tasks in hierarchical tree format (default: true)'),
      includeDone: z.boolean().optional().describe('Include done tasks in results (default: true)')
    },
    handler: withErrorHandling(handler)
  };
}

// ==================== Create Task ====================

function createCreateTaskTool(
  wdSchema: z.ZodString,
  config: StorageConfig,
  createStorage: StorageFactory
): ToolDefinition {
  interface CreateParams {
    workingDirectory: string;
    details: string;
    parentId?: string;
    dependsOn?: string[];
    status?: 'pending' | 'in_progress' | 'done';
    tags?: string[];
  }

  const handler = async ({ workingDirectory, details, parentId, dependsOn, status, tags }: CreateParams) => {
    try {
      const storage = await createStorage(workingDirectory, config);

      let parentTask: Task | null = null;
      let taskLevel = 0;

      if (parentId) {
        parentTask = await storage.getTask(parentId.trim());
        if (!parentTask) {
          return {
            content: [{ type: 'text' as const, text: `Error: Parent task with ID "${parentId}" not found. Use list_tasks to see available tasks.` }],
            isError: true
          };
        }
        taskLevel = (parentTask.level || 0) + 1;
      }

      if (dependsOn && dependsOn.length > 0) {
        for (const depId of dependsOn) {
          const depTask = await storage.getTask(depId);
          if (!depTask) {
            return {
              content: [{ type: 'text' as const, text: `Error: Dependency task with ID "${depId}" not found.` }],
              isError: true
            };
          }
        }
      }

      const createdTask = await storage.createTask({
        details: details.trim(),
        parentId: parentId?.trim(),
        dependsOn,
        status,
        tags,
      });

      const hierarchyPath = parentTask
        ? `${parentTask.id} → ${createdTask.id}`
        : createdTask.id;
      const levelIndicator = '  '.repeat(taskLevel) + '→';

      return {
        content: [{
          type: 'text' as const,
          text: `✅ Task created successfully!

 **${levelIndicator} ${createdTask.id}**
 ${parentTask ? `Parent: ${parentTask.id}` : 'Top-level task'}
 Level: ${taskLevel} ${taskLevel === 0 ? '(Top-level)' : `(${taskLevel} level${taskLevel > 1 ? 's' : ''} deep)`}
 Path: ${hierarchyPath}

 📋 **Task Details:**
 • Details: ${createdTask.details}
 • Status: ${createdTask.status}
 • Tags: ${createdTask.tags?.join(', ') || 'None'}
 • Dependencies: ${createdTask.dependsOn?.length ? createdTask.dependsOn.join(', ') : 'None'}
 • Created: ${new Date(createdTask.createdAt).toLocaleString()}

 🎯 **Next Steps:**
 ${taskLevel === 0
   ? '• Break down into smaller tasks using create_task with parentId for complex work'
   : '• Add even more granular tasks if needed using create_task with this task as parentId'
}
 • Update progress using \`update_task\` as you work
 • Use \`list_tasks\` with parentId to see the task hierarchy`
        }]
      };
    } catch (error) {
      logger.error('Error in cortex_create_task', error);
      return {
        content: [{ type: 'text' as const, text: `Error creating task: ${error instanceof Error ? error.message : 'Unknown error'}` }],
        isError: true
      };
    }
  };

  return {
    name: 'cortex_create_task',
    description: 'Create a new task for the orchestration workflow. Task ID is auto-generated from details. Use parentId to create subtasks for hierarchical organization.',
    parameters: {
      workingDirectory: wdSchema,
      details: z.string().describe('Task description - used to generate the task ID (e.g., "Implement authentication" becomes "001-implement-authentication")'),
      parentId: z.string().optional().describe('Parent task ID for creating subtasks (optional - creates top-level task if not specified)'),
      dependsOn: z.array(z.string()).optional().describe('Array of task IDs that must be completed before this task'),
      status: z.enum(['pending', 'in_progress', 'done']).optional().describe('Initial task status (defaults to pending)'),
      tags: z.array(z.string()).optional().describe('Tags for categorization and filtering')
    },
    handler: withErrorHandling(handler)
  };
}

// ==================== Get Task ====================

function createGetTaskTool(
  wdSchema: z.ZodString,
  config: StorageConfig,
  createStorage: StorageFactory
): ToolDefinition {
  interface GetParams {
    workingDirectory: string;
    id: string;
  }

  const handler = async ({ workingDirectory, id }: GetParams) => {
    try {
      const storage = await createStorage(workingDirectory, config);
      const task = await storage.getTask(id.trim());

      if (!task) {
        return {
          content: [{ type: 'text' as const, text: `Error: Task with ID "${id}" not found. Use list_tasks to see all available tasks.` }],
          isError: true
        };
      }

      const artifacts = await storage.getAllArtifacts(task.id);
      const childTasks = await storage.getTaskChildren(task.id);
      const doneChildren = childTasks.filter(t => t.status === 'done').length;
      const childTaskSummary = childTasks.length > 0
        ? `${doneChildren}/${childTasks.length} done`
        : 'None';

      const artifactSummary = ARTIFACT_PHASES.map(phase => {
        const artifact = artifacts[phase];
        if (artifact) {
          return `  - **${phase}:** ${artifact.metadata.status}${artifact.metadata.retries ? ` (retries: ${artifact.metadata.retries})` : ''}`;
        }
        return `  - **${phase}:** Not started`;
      }).join('\n');

      const artifactSections = ARTIFACT_PHASES.map(phase => {
        const artifact = artifacts[phase];
        if (artifact) return formatArtifactSection(phase, artifact);
        return null;
      }).filter(Boolean).join('\n\n');

      const taskInfo = `# Task: ${task.id}

  ## Metadata
  - **Status:** ${task.status}
  - **Details:** ${task.details}
  - **Tags:** ${task.tags?.join(', ') || 'None'}
  - **Dependencies:** ${task.dependsOn?.length ? task.dependsOn.join(', ') : 'None'}
  - **Child Tasks:** ${childTaskSummary}
  - **Created:** ${new Date(task.createdAt).toLocaleString()}
  - **Updated:** ${new Date(task.updatedAt).toLocaleString()}

  ## Phase Artifacts
  ${artifactSummary}`;

      const fullOutput = artifactSections
        ? `${taskInfo}\n\n---\n\n${artifactSections}`
        : `${taskInfo}\n\n---\n\n*No artifacts created yet. Run explore phase to start.*`;

      return {
        content: [{ type: 'text' as const, text: fullOutput }]
      };
    } catch (error) {
      logger.error('Error in cortex_get_task', error);
      return {
        content: [{ type: 'text' as const, text: `Error retrieving task: ${error instanceof Error ? error.message : 'Unknown error'}` }],
        isError: true
      };
    }
  };

  return {
    name: 'cortex_get_task',
    description: 'Retrieve complete task details including all phase artifacts (explore, search, plan, build, test). Essential for understanding current task state and accumulated knowledge.',
    parameters: {
      workingDirectory: wdSchema,
      id: z.string().describe('The unique identifier of the task to retrieve')
    },
    handler: withErrorHandling(handler)
  };
}

// ==================== Update Task ====================

function createUpdateTaskTool(
  wdSchema: z.ZodString,
  config: StorageConfig,
  createStorage: StorageFactory
): ToolDefinition {
  interface UpdateParams {
    workingDirectory: string;
    id: string;
    details?: string;
    parentId?: string;
    dependsOn?: string[];
    status?: 'pending' | 'in_progress' | 'done';
    tags?: string[];
    actualHours?: number;
  }

  const handler = async ({ workingDirectory, id, details, parentId, dependsOn, status, tags, actualHours }: UpdateParams) => {
    try {
      const storage = await createStorage(workingDirectory, config);

      if (details !== undefined && details.trim().length === 0) {
        return {
          content: [{ type: 'text' as const, text: 'Error: Task details must not be empty.' }],
          isError: true
        };
      }

      if (details === undefined && parentId === undefined &&
          dependsOn === undefined && status === undefined && tags === undefined &&
          actualHours === undefined) {
        return {
          content: [{ type: 'text' as const, text: 'Error: At least one field must be provided for update.' }],
          isError: true
        };
      }

      const existingTask = await storage.getTask(id.trim());
      if (!existingTask) {
        return {
          content: [{ type: 'text' as const, text: `Error: Task with ID "${id}" not found. Use list_tasks to see all available tasks.` }],
          isError: true
        };
      }

      if (parentId !== undefined && parentId) {
        if (parentId === id) {
          return {
            content: [{ type: 'text' as const, text: `Error: Task cannot be its own parent.` }],
            isError: true
          };
        }

        const newParentTask = await storage.getTask(parentId.trim());
        if (!newParentTask) {
          return {
            content: [{ type: 'text' as const, text: `Error: Parent task with ID "${parentId}" not found.` }],
            isError: true
          };
        }

        const allDescendantIds = await getAllDescendants(storage, id);
        if (allDescendantIds.includes(parentId)) {
          return {
            content: [{ type: 'text' as const, text: `Error: Cannot move task under its own descendant. This would create a circular hierarchy.` }],
            isError: true
          };
        }
      }

      if (dependsOn && dependsOn.length > 0) {
        for (const depId of dependsOn) {
          if (depId === id) {
            return {
              content: [{ type: 'text' as const, text: `Error: Task cannot depend on itself.` }],
              isError: true
            };
          }
          const depTask = await storage.getTask(depId);
          if (!depTask) {
            return {
              content: [{ type: 'text' as const, text: `Error: Dependency task with ID "${depId}" not found.` }],
              isError: true
            };
          }
        }
      }

      const updatedTask = await storage.updateTask(id, {
        details: details?.trim(),
        parentId: parentId !== undefined ? parentId?.trim() : undefined,
        dependsOn,
        status,
        tags,
        actualHours,
      });

      if (!updatedTask) {
        return {
          content: [{ type: 'text' as const, text: `Error: Failed to update task with ID "${id}".` }],
          isError: true
        };
      }

      const currentParent = updatedTask.parentId ? await storage.getTask(updatedTask.parentId) : null;
      const taskLevel = updatedTask.level || 0;

      const changedFields: string[] = [];
      if (details !== undefined) changedFields.push('details');
      if (parentId !== undefined) changedFields.push('parent relationship');
      if (dependsOn !== undefined) changedFields.push('dependencies');
      if (status !== undefined) changedFields.push('status');
      if (tags !== undefined) changedFields.push('tags');
      if (actualHours !== undefined) changedFields.push('actual hours');

      const levelIndicator = '  '.repeat(taskLevel) + '→';

      let hierarchyPath: string;
      if (currentParent) {
        const ancestors = await storage.getTaskAncestors(updatedTask.id);
        hierarchyPath = `${ancestors.map(a => a.id).join(' → ')} → ${updatedTask.id}`;
      } else {
        hierarchyPath = updatedTask.id;
      }

      return {
        content: [{
          type: 'text' as const,
          text: `✅ Task updated successfully!

  **${levelIndicator} ${updatedTask.id}**
  ${currentParent ? `Parent: ${currentParent.id}` : 'Top-level task'}
  Level: ${taskLevel} ${taskLevel === 0 ? '(Top-level)' : `(${taskLevel} level${taskLevel > 1 ? 's' : ''} deep)`}
  Path: ${hierarchyPath}

  📋 **Task Properties:**
  • Status: ${updatedTask.status}
  • Tags: ${updatedTask.tags?.join(', ') || 'None'}
  • Dependencies: ${updatedTask.dependsOn?.length ? updatedTask.dependsOn.join(', ') : 'None'}
  • Actual Hours: ${updatedTask.actualHours || 'Not set'}
  • Details: ${updatedTask.details}
  • Last Updated: ${new Date(updatedTask.updatedAt).toLocaleString()}

  ✏️ **Updated fields:** ${changedFields.join(', ')}

  🎯 **Next Steps:**
  ${parentId !== undefined ? '• Use `list_tasks` to see the updated hierarchy structure' : ''}
  • Update progress using \`update_task\` as you work
  ${taskLevel > 0 ? '• Consider breaking down further with create_task using this task as parentId' : ''}`
        }]
      };
    } catch (error) {
      logger.error('Error in cortex_update_task', error);
      return {
        content: [{ type: 'text' as const, text: `Error updating task: ${error instanceof Error ? error.message : 'Unknown error'}` }],
        isError: true
      };
    }
  };

  return {
    name: 'cortex_update_task',
    description: 'Update task properties including status, details, dependencies, and tags. Use this to mark progress and update task metadata.',
    parameters: {
      workingDirectory: wdSchema,
      id: z.string().describe('The unique identifier of the task to update'),
      details: z.string().optional().describe('Updated task description (optional)'),
      parentId: z.string().optional().describe('Updated parent task ID for moving between hierarchy levels (optional)'),
      dependsOn: z.array(z.string()).optional().describe('Updated array of task IDs that must be completed before this task'),
      status: z.enum(['pending', 'in_progress', 'done']).optional().describe('Updated task status'),
      tags: z.array(z.string()).optional().describe('Updated tags for categorization and filtering'),
      actualHours: z.number().min(0).optional().describe('Actual time spent on the task in hours')
    },
    handler: withErrorHandling(handler)
  };
}

// ==================== Delete Task ====================

function createDeleteTaskTool(
  wdSchema: z.ZodString,
  config: StorageConfig,
  createStorage: StorageFactory
): ToolDefinition {
  interface DeleteParams {
    workingDirectory: string;
    id: string;
    confirm: boolean;
  }

  const handler = async ({ workingDirectory, id, confirm }: DeleteParams) => {
    try {
      const storage = await createStorage(workingDirectory, config);

      if (confirm !== true) {
        return {
          content: [{ type: 'text' as const, text: 'Error: You must set confirm to true to delete a task.' }],
          isError: true
        };
      }

      const task = await storage.getTask(id.trim());
      if (!task) {
        return {
          content: [{ type: 'text' as const, text: `Error: Task with ID "${id}" not found. Use list_tasks to see all available tasks.` }],
          isError: true
        };
      }

      const childTasks = await storage.getTaskChildren(task.id);
      const deleted = await storage.deleteTask(id);

      if (!deleted) {
        return {
          content: [{ type: 'text' as const, text: `Error: Failed to delete task with ID "${id}".` }],
          isError: true
        };
      }

      return {
        content: [{
          type: 'text' as const,
          text: `✅ Task deleted successfully!

  **Deleted:** "${task.id}"
  **Also deleted:** ${childTasks.length} child task(s)

  This action cannot be undone. All data associated with this task has been permanently removed.`
        }]
      };
    } catch (error) {
      logger.error('Error in cortex_delete_task', error);
      return {
        content: [{ type: 'text' as const, text: `Error deleting task: ${error instanceof Error ? error.message : 'Unknown error'}` }],
        isError: true
      };
    }
  };

  return {
    name: 'cortex_delete_task',
    description: 'Delete a task and all its children. Requires confirmation to prevent accidental deletion.',
    parameters: {
      workingDirectory: wdSchema,
      id: z.string().describe('The unique identifier of the task to delete'),
      confirm: z.boolean().describe('Must be set to true to confirm deletion (safety measure)')
    },
    handler: withErrorHandling(handler)
  };
}

// ==================== Move Task ====================

function createMoveTaskTool(
  wdSchema: z.ZodString,
  config: StorageConfig,
  createStorage: StorageFactory
): ToolDefinition {
  interface MoveParams {
    workingDirectory: string;
    taskId: string;
    newParentId?: string;
  }

  const handler = async ({ workingDirectory, taskId, newParentId }: MoveParams) => {
    try {
      const storage = await createStorage(workingDirectory, config);

      const task = await storage.getTask(taskId.trim());
      if (!task) {
        return {
          content: [{ type: 'text' as const, text: `Error: Task with ID "${taskId}" not found. Use list_tasks to see available tasks.` }],
          isError: true
        };
      }

      const oldParent = task.parentId ? await storage.getTask(task.parentId) : null;
      const newParent = newParentId ? await storage.getTask(newParentId.trim()) : null;

      if (newParentId && !newParent) {
        return {
          content: [{ type: 'text' as const, text: `Error: New parent task with ID "${newParentId}" not found.` }],
          isError: true
        };
      }

      const movedTask = await storage.moveTask(taskId.trim(), newParentId?.trim());
      if (!movedTask) {
        return {
          content: [{ type: 'text' as const, text: `Error: Failed to move task with ID "${taskId}".` }],
          isError: true
        };
      }

      const ancestors = await storage.getTaskAncestors(movedTask.id);
      const oldPath = oldParent
        ? `${oldParent.id} → ${task.id}`
        : task.id;
      const newPath = newParent
        ? `${ancestors.map(a => a.id).join(' → ')} → ${movedTask.id}`
        : movedTask.id;
      const levelIndicator = '  '.repeat(movedTask.level || 0) + '→';

      return {
        content: [{
          type: 'text' as const,
          text: `✅ **Task Moved Successfully!**

  **${levelIndicator} ${movedTask.id}**

  📍 **Movement Summary:**
  • From: ${oldPath}
  • To: ${newPath}
  • New Level: ${movedTask.level || 0} ${(movedTask.level || 0) === 0 ? '(Top-level)' : `(${movedTask.level} level${(movedTask.level || 0) > 1 ? 's' : ''} deep)`}
  • New Parent: ${newParent ? `${newParent.id}` : 'None (Top-level)'}

  🎯 **Next Steps:**
  • Use \`list_tasks\` with \`showHierarchy: true\` to see the updated structure
  • Continue organizing with \`move_task\` or \`update_task\`
  • Add more nested tasks with \`create_task\` using parentId`
        }]
      };
    } catch (error) {
      logger.error('Error in cortex_move_task', error);
      return {
        content: [{ type: 'text' as const, text: `Error moving task: ${error instanceof Error ? error.message : 'Unknown error'}` }],
        isError: true
      };
    }
  };

  return {
    name: 'cortex_move_task',
    description: 'Move a task to a different parent in the hierarchy. Set newParentId to move under another task, or leave empty to move to top level.',
    parameters: {
      workingDirectory: wdSchema,
      taskId: z.string().describe('The unique identifier of the task to move'),
      newParentId: z.string().optional().describe('The ID of the new parent task (optional - leave empty for top level)')
    },
    handler: withErrorHandling(handler)
  };
}
