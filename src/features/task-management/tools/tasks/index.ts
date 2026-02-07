import { z } from 'zod';
import { Storage } from '../../storage/storage.js';
import { Task, TaskHierarchy } from '../../models/task.js';
import { ARTIFACT_PHASES, ArtifactPhase, Artifact } from '../../models/artifact.js';
import { ToolDefinition } from '../base/types.js';
import { withErrorHandling } from '../base/handlers.js';
import { createWorkingDirectorySchema } from '../base/schemas.js';
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
  const wdSchema = createWorkingDirectorySchema(getWorkingDirectoryDescription(config));

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
  wdSchema: z.ZodType<string>,
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
    description: 'List all tasks with hierarchical display showing progress, status, and subtasks. Essential for understanding current workflow state, tracking progress, and identifying next steps in the development process.',
    parameters: {
      workingDirectory: wdSchema,
      showHierarchy: z.boolean().optional().describe('Display tasks in hierarchical tree format with subtasks to visualize work breakdown (default: true)'),
      includeDone: z.boolean().optional().describe('Include completed tasks in the results to see historical progress (default: true)')
    },
    handler: withErrorHandling(handler)
  };
}

// ==================== Create Task ====================

function createCreateTaskTool(
  wdSchema: z.ZodType<string>,
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
    description: 'Create a new parent task to organize related work items and establish a clear development objective. Automatically generates unique task ID from description and initializes tracking metadata. Use to begin structured development on a specific feature or fix.',
    parameters: {
      workingDirectory: wdSchema,
      details: z.string().describe('Comprehensive task description that clearly defines the objective, requirements, and expected outcome (e.g., "Implement user authentication with JWT tokens and refresh mechanism")'),
      status: z.enum(['pending', 'in_progress', 'done']).optional().describe('Initial task status reflecting readiness to start (defaults to pending)'),
      tags: z.array(z.string()).optional().describe('Category tags for organizing and filtering related tasks (e.g., ["auth", "security", "backend"])')
    },
    handler: withErrorHandling(handler)
  };
}

// ==================== Get Task ====================

function createGetTaskTool(
  wdSchema: z.ZodType<string>,
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
    description: 'Retrieve complete task details including all subtasks, status, artifacts, and progress metrics. Essential for understanding current task state, reviewing accumulated knowledge across all phases, and determining next steps in the development workflow.',
    parameters: {
      workingDirectory: wdSchema,
      id: z.string().describe('The unique identifier of the task to retrieve (e.g., "001-implement-auth")')
    },
    handler: withErrorHandling(handler)
  };
}

// ==================== Update Task ====================

function createUpdateTaskTool(
  wdSchema: z.ZodType<string>,
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
    description: 'Update task properties to reflect progress, adjust scope, or modify requirements. Manage subtasks to break down work, track time spent, and update status. Use to maintain accurate task tracking throughout the development lifecycle.',
    parameters: {
      workingDirectory: wdSchema,
      id: z.string().describe('The unique identifier of the task to update'),
      details: z.string().optional().describe('Updated comprehensive task description if requirements change or scope adjusts'),
      status: z.enum(['pending', 'in_progress', 'done']).optional().describe('Updated task status reflecting current progress state'),
      tags: z.array(z.string()).optional().describe('Updated category tags for organizing and filtering related tasks'),
      actualHours: z.number().min(0).optional().describe('Actual time spent on the task in hours for tracking and estimation'),
      addSubtask: z.object({
        details: z.string().describe('Detailed subtask description that defines a specific, actionable work item'),
        status: z.enum(['pending', 'in_progress', 'done']).optional().describe('Initial subtask status (defaults to pending)')
      }).optional().describe('Add a new subtask to break down the parent task into smaller, manageable work items'),
      updateSubtask: z.object({
        id: z.string().describe('ID of the specific subtask to update'),
        details: z.string().optional().describe('Updated subtask description if requirements or approach changes'),
        status: z.enum(['pending', 'in_progress', 'done']).optional().describe('Updated subtask status reflecting completion progress')
      }).optional().describe('Update an existing subtask to reflect progress, adjust description, or change status'),
      removeSubtaskId: z.string().optional().describe('ID of the subtask to remove from the task breakdown')
    },
    handler: withErrorHandling(handler)
  };
}

// ==================== Delete Task ====================

function createDeleteTaskTool(
  wdSchema: z.ZodType<string>,
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
    description: 'Permanently delete a task and all its associated subtasks, artifacts, and progress data. Use only when a task is obsolete, no longer needed, or was created by mistake. Requires explicit confirmation to prevent accidental data loss.',
    parameters: {
      workingDirectory: wdSchema,
      id: z.string().describe('The unique identifier of the task to delete completely (e.g., "001-implement-auth")'),
      confirm: z.boolean().describe('Must be set to true to confirm this destructive operation and acknowledge permanent data loss')
    },
    handler: withErrorHandling(handler)
  };
}
