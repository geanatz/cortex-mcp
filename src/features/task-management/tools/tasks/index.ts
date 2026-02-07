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
 * Count total subtasks in a task
 */
function countSubtasks(task: Task): number {
  return task.subtasks?.length || 0;
}

/**
 * Count done subtasks in a task
 */
function countDoneSubtasks(task: Task): number {
  return task.subtasks?.filter(s => s.status === 'done').length || 0;
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
    // REMOVED: createMoveTaskTool - no longer needed in simplified model
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
    showHierarchy?: boolean;
    includeDone?: boolean;
  }

  const handler = async ({ workingDirectory, showHierarchy = true, includeDone = true }: ListParams) => {
    try {
      const storage = await createStorage(workingDirectory, config);

      if (showHierarchy) {
        const hierarchy = await storage.getTaskHierarchy();

        if (hierarchy.length === 0) {
          return {
            content: [{ type: 'text' as const, text: 'No tasks found. Create your first task using create_task.' }]
          };
        }

        const formatTaskHierarchy = (hierarchyList: readonly TaskHierarchy[]): string => {
          return hierarchyList.map(item => {
            const task = item.task;
            if (!includeDone && task.status === 'done') return '';

            const icon = task.status === 'done' ? '✅' : '⏳';
            const statusText = ` [${task.status.toUpperCase()}]`;
            const subtaskSummary = task.subtasks?.length 
              ? ` (${countDoneSubtasks(task)}/${countSubtasks(task)} subtasks done)`
              : '';

            let taskLine = `${icon} **${task.id}**${statusText}${subtaskSummary}\n`;
            taskLine += `   ${task.details}\n`;

            if (task.tags && task.tags.length > 0) {
              taskLine += `   Tags: ${task.tags.join(', ')}\n`;
            }

            // Show subtasks indented
            if (task.subtasks && task.subtasks.length > 0) {
              const visibleSubtasks = includeDone 
                ? task.subtasks 
                : task.subtasks.filter(s => s.status !== 'done');
              
              if (visibleSubtasks.length > 0) {
                taskLine += '\n   📋 Subtasks:\n';
                for (const subtask of visibleSubtasks) {
                  const subIcon = subtask.status === 'done' ? '✅' : '⏳';
                  taskLine += `      ${subIcon} [${subtask.id}] ${subtask.details}\n`;
                }
              }
            }

            return taskLine;
          }).filter(line => line.trim()).join('\n');
        };

        const hierarchyText = formatTaskHierarchy(hierarchy);
        const totalTasks = hierarchy.length;
        const totalSubtasks = hierarchy.reduce((sum, h) => sum + countSubtasks(h.task), 0);
        const doneTasks = hierarchy.filter(h => h.task.status === 'done').length;
        const doneSubtasks = hierarchy.reduce((sum, h) => sum + countDoneSubtasks(h.task), 0);

        return {
          content: [{
            type: 'text' as const,
            text: `🌲 **Task Hierarchy**

Total: ${totalTasks} tasks with ${totalSubtasks} subtasks (${doneTasks} tasks, ${doneSubtasks} subtasks done)

${hierarchyText}

💡 **Tips:**
• Use \`create_task\` to add new tasks
• Use \`update_task\` with addSubtask to break down tasks
• Use \`list_tasks\` with includeDone: false to hide completed work`
          }]
        };
      } else {
        const tasks = await storage.getTasks();

        if (tasks.length === 0) {
          return {
            content: [{ type: 'text' as const, text: 'No tasks found. Create your first task using create_task.' }]
          };
        }

        const filteredTasks = includeDone ? [...tasks] : tasks.filter(t => t.status !== 'done');

        const taskList = filteredTasks.map(task => {
          const icon = task.status === 'done' ? '✅' : '⏳';
          const statusText = ` [${task.status.toUpperCase()}]`;
          const subtaskInfo = task.subtasks?.length 
            ? ` (${countDoneSubtasks(task)}/${countSubtasks(task)} subtasks)`
            : '';

          return `${icon} **${task.id}**${statusText}${subtaskInfo}
    ${task.details}
    ${task.tags && task.tags.length > 0 ? `Tags: ${task.tags.join(', ')}` : ''}
    Created: ${new Date(task.createdAt).toLocaleString()}`;
        }).join('\n\n');

        const doneCount = filteredTasks.filter(t => t.status === 'done').length;

        return {
          content: [{
            type: 'text' as const,
            text: `📋 **Tasks**

Found ${filteredTasks.length} task(s) (${doneCount} done):

${taskList}

💡 Use \`list_tasks\` with \`showHierarchy: true\` to see subtasks.`
          }]
        };
      }
    } catch (error) {
      logger.error('Error in list_tasks', error);
      return {
        content: [{ type: 'text' as const, text: `Error listing tasks: ${error instanceof Error ? error.message : 'Unknown error'}` }],
        isError: true
      };
    }
  };

  return {
    name: 'list_tasks',
    description: 'List all tasks with hierarchical display including subtasks. Perfect for understanding current workflow state and task organization.',
    parameters: {
      workingDirectory: wdSchema,
      showHierarchy: z.boolean().optional().describe('Show tasks in hierarchical tree format with subtasks (default: true)'),
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
    status?: 'pending' | 'in_progress' | 'done';
    tags?: string[];
  }

  const handler = async ({ workingDirectory, details, status, tags }: CreateParams) => {
    try {
      const storage = await createStorage(workingDirectory, config);

      const createdTask = await storage.createTask({
        details: details.trim(),
        status,
        tags,
      });

      return {
        content: [{
          type: 'text' as const,
          text: `✅ Task created successfully!

**${createdTask.id}**

📋 **Task Details:**
• Details: ${createdTask.details}
• Status: ${createdTask.status}
• Tags: ${createdTask.tags?.join(', ') || 'None'}
• Subtasks: None (add with update_task)
• Created: ${new Date(createdTask.createdAt).toLocaleString()}

🎯 **Next Steps:**
• Break down into subtasks using update_task with addSubtask
• Update progress using \`update_task\` as you work
• Add phase artifacts (explore, plan, build, test)`
        }]
      };
    } catch (error) {
      logger.error('Error in create_task', error);
      return {
        content: [{ type: 'text' as const, text: `Error creating task: ${error instanceof Error ? error.message : 'Unknown error'}` }],
        isError: true
      };
    }
  };

  return {
    name: 'create_task',
    description: 'Create a new task for the orchestration workflow. Task ID is auto-generated from details. Use update_task with addSubtask to create subtasks.',
    parameters: {
      workingDirectory: wdSchema,
      details: z.string().describe('Task description - used to generate the task ID (e.g., "Implement authentication" becomes "001-implement-authentication")'),
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

      // Build subtasks section
      let subtasksSection = '';
      if (task.subtasks && task.subtasks.length > 0) {
        const doneCount = countDoneSubtasks(task);
        subtasksSection = `\n## Subtasks (${doneCount}/${task.subtasks.length} done)\n\n`;
        for (const subtask of task.subtasks) {
          const icon = subtask.status === 'done' ? '✅' : '⏳';
          subtasksSection += `- ${icon} **[${subtask.id}]** ${subtask.details} (${subtask.status})\n`;
        }
      } else {
        subtasksSection = '\n## Subtasks\n\nNo subtasks yet. Use update_task with addSubtask to create them.\n';
      }

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
- **Actual Hours:** ${task.actualHours || 'Not set'}
- **Created:** ${new Date(task.createdAt).toLocaleString()}
- **Updated:** ${new Date(task.updatedAt).toLocaleString()}
${subtasksSection}

## Phase Artifacts
${artifactSummary}`;

      const fullOutput = artifactSections
        ? `${taskInfo}\n\n---\n\n${artifactSections}`
        : `${taskInfo}\n\n---\n\n*No artifacts created yet. Run explore phase to start.*`;

      return {
        content: [{ type: 'text' as const, text: fullOutput }]
      };
    } catch (error) {
      logger.error('Error in get_task', error);
      return {
        content: [{ type: 'text' as const, text: `Error retrieving task: ${error instanceof Error ? error.message : 'Unknown error'}` }],
        isError: true
      };
    }
  };

  return {
    name: 'get_task',
    description: 'Retrieve complete task details including all subtasks and phase artifacts (explore, search, plan, build, test). Essential for understanding current task state and accumulated knowledge.',
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
    status?: 'pending' | 'in_progress' | 'done';
    tags?: string[];
    actualHours?: number;
    addSubtask?: {
      details: string;
      status?: 'pending' | 'in_progress' | 'done';
    };
    updateSubtask?: {
      id: string;
      details?: string;
      status?: 'pending' | 'in_progress' | 'done';
    };
    removeSubtaskId?: string;
  }

  const handler = async ({ workingDirectory, id, details, status, tags, actualHours, addSubtask, updateSubtask, removeSubtaskId }: UpdateParams) => {
    try {
      const storage = await createStorage(workingDirectory, config);

      if (details !== undefined && details.trim().length === 0) {
        return {
          content: [{ type: 'text' as const, text: 'Error: Task details must not be empty.' }],
          isError: true
        };
      }

      if (details === undefined && status === undefined && tags === undefined &&
          actualHours === undefined && addSubtask === undefined && 
          updateSubtask === undefined && removeSubtaskId === undefined) {
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

      // Validate subtask operations
      if (addSubtask && addSubtask.details.trim().length === 0) {
        return {
          content: [{ type: 'text' as const, text: 'Error: Subtask details must not be empty.' }],
          isError: true
        };
      }

      if (updateSubtask) {
        if (updateSubtask.id.trim().length === 0) {
          return {
            content: [{ type: 'text' as const, text: 'Error: Subtask ID is required for update.' }],
            isError: true
          };
        }
        const existingSubtask = existingTask.subtasks?.find(s => s.id === updateSubtask.id);
        if (!existingSubtask) {
          return {
            content: [{ type: 'text' as const, text: `Error: Subtask with ID "${updateSubtask.id}" not found in task "${id}".` }],
            isError: true
          };
        }
      }

      const updatedTask = await storage.updateTask(id, {
        details: details?.trim(),
        status,
        tags,
        actualHours,
        addSubtask: addSubtask ? {
          details: addSubtask.details.trim(),
          status: addSubtask.status,
        } : undefined,
        updateSubtask: updateSubtask ? {
          id: updateSubtask.id.trim(),
          details: updateSubtask.details?.trim(),
          status: updateSubtask.status,
        } : undefined,
        removeSubtaskId: removeSubtaskId?.trim(),
      });

      if (!updatedTask) {
        return {
          content: [{ type: 'text' as const, text: `Error: Failed to update task with ID "${id}".` }],
          isError: true
        };
      }

      const changedFields: string[] = [];
      if (details !== undefined) changedFields.push('details');
      if (status !== undefined) changedFields.push('status');
      if (tags !== undefined) changedFields.push('tags');
      if (actualHours !== undefined) changedFields.push('actual hours');
      if (addSubtask !== undefined) changedFields.push('added subtask');
      if (updateSubtask !== undefined) changedFields.push('updated subtask');
      if (removeSubtaskId !== undefined) changedFields.push('removed subtask');

      const subtaskSummary = updatedTask.subtasks?.length 
        ? `${countDoneSubtasks(updatedTask)}/${countSubtasks(updatedTask)} done`
        : 'None';

      return {
        content: [{
          type: 'text' as const,
          text: `✅ Task updated successfully!

**${updatedTask.id}**

📋 **Task Properties:**
• Status: ${updatedTask.status}
• Tags: ${updatedTask.tags?.join(', ') || 'None'}
• Actual Hours: ${updatedTask.actualHours || 'Not set'}
• Subtasks: ${subtaskSummary}
• Details: ${updatedTask.details}
• Last Updated: ${new Date(updatedTask.updatedAt).toLocaleString()}

✏️ **Updated:** ${changedFields.join(', ')}

🎯 **Next Steps:**
• Continue adding subtasks with update_task
• Mark subtasks as done to track progress
• Update progress using \`update_task\``
        }]
      };
    } catch (error) {
      logger.error('Error in update_task', error);
      return {
        content: [{ type: 'text' as const, text: `Error updating task: ${error instanceof Error ? error.message : 'Unknown error'}` }],
        isError: true
      };
    }
  };

  return {
    name: 'update_task',
    description: 'Update task properties including status, details, tags, and manage subtasks. Use addSubtask to break down work, updateSubtask to update subtask status, and removeSubtaskId to remove subtasks.',
    parameters: {
      workingDirectory: wdSchema,
      id: z.string().describe('The unique identifier of the task to update'),
      details: z.string().optional().describe('Updated task description (optional)'),
      status: z.enum(['pending', 'in_progress', 'done']).optional().describe('Updated task status'),
      tags: z.array(z.string()).optional().describe('Updated tags for categorization and filtering'),
      actualHours: z.number().min(0).optional().describe('Actual time spent on the task in hours'),
      addSubtask: z.object({
        details: z.string().describe('Subtask description'),
        status: z.enum(['pending', 'in_progress', 'done']).optional().describe('Subtask status (defaults to pending)')
      }).optional().describe('Add a new subtask to this task'),
      updateSubtask: z.object({
        id: z.string().describe('ID of the subtask to update'),
        details: z.string().optional().describe('Updated subtask description'),
        status: z.enum(['pending', 'in_progress', 'done']).optional().describe('Updated subtask status')
      }).optional().describe('Update an existing subtask'),
      removeSubtaskId: z.string().optional().describe('ID of the subtask to remove')
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
**Subtasks deleted:** ${countSubtasks(task)}

This action cannot be undone. All data associated with this task and its subtasks has been permanently removed.`
        }]
      };
    } catch (error) {
      logger.error('Error in delete_task', error);
      return {
        content: [{ type: 'text' as const, text: `Error deleting task: ${error instanceof Error ? error.message : 'Unknown error'}` }],
        isError: true
      };
    }
  };

  return {
    name: 'delete_task',
    description: 'Delete a task and all its subtasks. Requires confirmation to prevent accidental deletion.',
    parameters: {
      workingDirectory: wdSchema,
      id: z.string().describe('The unique identifier of the task to delete'),
      confirm: z.boolean().describe('Must be set to true to confirm deletion (safety measure)')
    },
    handler: withErrorHandling(handler)
  };
}
