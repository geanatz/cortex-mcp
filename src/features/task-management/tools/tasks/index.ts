import { z } from 'zod';
import { Storage } from '../../storage/storage.js';
import { Task, TaskHierarchy } from '../../models/task.js';
import { ARTIFACT_PHASES, ArtifactPhase, Artifact } from '../../models/artifact.js';
import { ToolDefinition } from '../base/types.js';
import { withValidationAndErrorHandling } from '../base/handlers.js';
import { workingDirectorySchema, taskIdSchema } from '../base/schemas.js';

// Define custom schemas for task-specific validation
const createTaskSchema = z.object({
  workingDirectory: workingDirectorySchema,
  details: z.string().min(1).max(2000),
  parentId: taskIdSchema.optional(),
  dependsOn: z.array(taskIdSchema).optional(),
  status: z.enum(['pending', 'in_progress', 'done']).optional(),
  tags: z.array(z.string()).optional()
});

const getTaskSchema = z.object({
  workingDirectory: workingDirectorySchema,
  taskId: taskIdSchema
});

const listTasksSchema = z.object({
  workingDirectory: workingDirectorySchema,
  parentId: taskIdSchema.optional(),
  showHierarchy: z.boolean().optional(),
  includeDone: z.boolean().optional()
});

const updateTaskSchema = z.object({
  workingDirectory: workingDirectorySchema,
  taskId: taskIdSchema,
  details: z.string().min(1).max(2000).optional(),
  parentId: taskIdSchema.optional(),
  dependsOn: z.array(taskIdSchema).optional(),
  status: z.enum(['pending', 'in_progress', 'done']).optional(),
  tags: z.array(z.string()).optional(),
  actualHours: z.number().min(0).optional()
});

const moveTaskSchema = z.object({
  workingDirectory: workingDirectorySchema,
  taskId: taskIdSchema,
  newParentId: taskIdSchema.optional()
});

const deleteTaskSchema = z.object({
  workingDirectory: workingDirectorySchema,
  taskId: taskIdSchema,
  confirm: z.literal(true, {
    errorMap: () => ({ message: 'You must set confirm to true to delete a task.' })
  })
});

/**
 * Create a new task with unlimited nesting depth
 * ID generated from details, acts as task title
 *
 * @param storage - Storage instance
 * @returns MCP tool handler for creating tasks
 */
export function createCreateTaskTool(storage: Storage) {
  const handler = async ({ workingDirectory, details, parentId, dependsOn, status, tags }: z.infer<typeof createTaskSchema>) => {
    try {
      // Validate inputs
      if (!details || details.trim().length === 0) {
        return {
          content: [{
            type: 'text' as const,
            text: 'Error: Task details are required.'
          }],
          isError: true
        };
      }

      if (details.trim().length > 2000) {
        return {
          content: [{
            type: 'text' as const,
            text: 'Error: Task details must be 2000 characters or less.'
          }],
          isError: true
        };
      }

      let parentTask = null;
      let taskLevel = 0;

      // Validate parent task exists if parentId is provided
      if (parentId) {
        parentTask = await storage.getTask(parentId.trim());
        if (!parentTask) {
          return {
            content: [{
              type: 'text' as const,
              text: `Error: Parent task with ID "${parentId}" not found. Use list_tasks to see available tasks.`
            }],
            isError: true
          };
        }

        taskLevel = (parentTask.level || 0) + 1;
      }

      // Validate dependencies exist if provided
      if (dependsOn && dependsOn.length > 0) {
        for (const depId of dependsOn) {
          const depTask = await storage.getTask(depId);
          if (!depTask) {
            return {
              content: [{
                type: 'text' as const,
                text: `Error: Dependency task with ID "${depId}" not found.`
              }],
              isError: true
            };
          }
        }
      }

      const now = new Date().toISOString();
      const task: Task = {
        id: '', // Will be set by storage.createTask based on details
        details: details.trim(),
        parentId: parentId?.trim() || undefined,
        createdAt: now,
        updatedAt: now,
        dependsOn: dependsOn || [],
        status: status || 'pending',
        tags: tags || [],
        level: taskLevel
      };

      const createdTask = await storage.createTask(task);

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
      return {
        content: [{
          type: 'text' as const,
          text: `Error creating task: ${error instanceof Error ? error.message : 'Unknown error'}`
        }],
        isError: true
      };
    }
  };

  return {
    name: 'create_task',
    description: 'Create a new task. The task ID will be automatically generated from the details (e.g., "001-implement-auth") and serves as the task title. Supports unlimited nesting depth - set parentId to create subtasks.',
    parameters: {
      type: 'object',
      properties: {
        workingDirectory: { type: 'string', description: 'Working directory for the operation' },
        details: { type: 'string', description: 'Task details and requirements' },
        parentId: { type: 'string', description: 'Parent task ID (optional)', nullable: true },
        dependsOn: { type: 'array', items: { type: 'string' }, description: 'IDs of tasks this task depends on' },
        status: { type: 'string', enum: ['pending', 'in_progress', 'done'], description: 'Initial status of the task', default: 'pending' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Task tags for categorization' },
      },
      required: ['workingDirectory', 'details']
    },
    handler: withValidationAndErrorHandling(createTaskSchema, handler)
  };
}

/**
 * Get task details by ID including all phase artifacts
 * ID=folder name, no name field
 * Returns task metadata + all artifacts (explore, search, plan, build, test)
 *
 * @param storage - Storage instance
 * @returns MCP tool handler for getting task details
 */
export function createGetTaskTool(storage: Storage) {
  const handler = async ({ workingDirectory, taskId }: z.infer<typeof getTaskSchema>) => {
    try {
      // Validate input
      if (!taskId || taskId.trim().length === 0) {
        return {
          content: [{
            type: 'text' as const,
            text: 'Error: Task ID is required.'
          }],
          isError: true
        };
      }

      const task = await storage.getTask(taskId.trim());

      if (!task) {
        return {
          content: [{
            type: 'text' as const,
            text: `Error: Task with ID "${taskId}" not found. Use list_tasks to see all available tasks.`
          }],
          isError: true
        };
      }

      // Get all artifacts for this task
      const artifacts = await storage.getAllArtifacts(task.id);

      // Get related child tasks for summary
      const childTasks = await storage.getTaskChildren(task.id);
      const doneChildren = childTasks.filter(t => t.status === 'done').length;

      const childTaskSummary = childTasks.length > 0
        ? `${doneChildren}/${childTasks.length} done`
        : 'None';

      // Build artifact status summary
      const artifactSummary = ARTIFACT_PHASES.map(phase => {
        const artifact = artifacts[phase];
        if (artifact) {
          return `  - **${phase}:** ${artifact.metadata.status}${artifact.metadata.retries ? ` (retries: ${artifact.metadata.retries})` : ''}`;
        }
        return `  - **${phase}:** Not started`;
      }).join('\n');

      // Build full artifact content sections
      const artifactSections = ARTIFACT_PHASES.map(phase => {
        const artifact = artifacts[phase];
        if (artifact) {
          return formatArtifactSection(phase, artifact);
        }
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
        content: [{
          type: 'text' as const,
          text: fullOutput
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: 'text' as const,
          text: `Error retrieving task: ${error instanceof Error ? error.message : 'Unknown error'}`
        }],
        isError: true
      };
    }
  };

  return {
    name: 'get_task',
    description: 'Get detailed information about a specific task including all phase artifacts (explore, search, plan, build, test). Essential for understanding current task state and accumulated knowledge.',
    parameters: {
      type: 'object',
      properties: {
        workingDirectory: { type: 'string', description: 'Working directory for the operation' },
        taskId: { type: 'string', description: 'The ID of the task to retrieve' },
      },
      required: ['workingDirectory', 'taskId']
    },
    handler: withValidationAndErrorHandling(getTaskSchema, handler)
  };
}

/**
 * List tasks with hierarchical display, optionally filtered by parent
 * ID=folder name, no name/priority/complexity fields
 *
 * @param storage - Storage instance
 * @returns MCP tool handler for listing tasks
 */
export function createListTasksTool(storage: Storage) {
  const handler = async ({ workingDirectory, parentId, showHierarchy = true, includeDone = true }: z.infer<typeof listTasksSchema>) => {
    try {
      // If parentId is provided, validate parent task exists
      let parentTask = null;
      if (parentId) {
        parentTask = await storage.getTask(parentId);
        if (!parentTask) {
          return {
            content: [{
              type: 'text' as const,
              text: `Error: Parent task with ID "${parentId}" not found.`
            }],
            isError: true
          };
        }
      }

      if (showHierarchy) {
        // Show full hierarchy starting from parentId (or root if not specified)
        const hierarchy = await storage.getTaskHierarchy(parentId);

        if (hierarchy.length === 0) {
          const scopeDescription = parentTask
            ? `under parent task "${parentTask.id}"`
            : `at the top level`;

          return {
            content: [{
              type: 'text' as const,
              text: `No tasks found ${scopeDescription}. Create your first task using create_task.`
            }]
          };
        }

        const formatTaskHierarchy = (hierarchyList: typeof hierarchy, baseLevel: number = 0): string => {
          return hierarchyList.map(item => {
            const task = item.task;

            // Skip done tasks if not included
            if (!includeDone && task.status === 'done') {
              return '';
            }

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

            // Add children recursively
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
        // Show flat list for specific parent level
        const tasks = await storage.getTasks(parentId);

        if (tasks.length === 0) {
          const scopeDescription = parentTask
            ? `under parent task "${parentTask.id}"`
            : `at the top level`;

          return {
            content: [{
              type: 'text' as const,
              text: `No tasks found ${scopeDescription}. Create your first task using create_task.`
            }]
          };
        }

        const filteredTasks = includeDone ? tasks : tasks.filter(t => t.status !== 'done');

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
      return {
        content: [{
          type: 'text' as const,
          text: `Error listing tasks: ${error instanceof Error ? error.message : 'Unknown error'}`
        }],
        isError: true
      };
    }
  };

  return {
    name: 'list_tasks',
    description: 'View tasks in hierarchical tree format. Filter by parentId. Use parentId=null for top-level tasks, or specific parentId for subtasks. Use includeDone=false to hide done tasks.',
    parameters: {
      type: 'object',
      properties: {
        workingDirectory: { type: 'string', description: 'Working directory for the operation' },
        parentId: { type: 'string', description: 'Filter by parent task ID (optional)', nullable: true },
        showHierarchy: { type: 'boolean', description: 'Whether to show tasks in hierarchical format', default: true },
        includeDone: { type: 'boolean', description: 'Whether to include done tasks', default: true },
      },
      required: ['workingDirectory']
    },
    handler: withValidationAndErrorHandling(listTasksSchema, handler)
  };
}

/**
 * Update an existing task including hierarchy changes
 * ID=folder name, no name/priority/complexity fields
 *
 * @param storage - Storage instance
 * @returns MCP tool handler for updating tasks
 */
export function createUpdateTaskTool(storage: Storage) {
  const handler = async ({ workingDirectory, taskId, details, parentId, dependsOn, status, tags, actualHours }: z.infer<typeof updateTaskSchema>) => {
    try {
      // Validate inputs
      if (!taskId || taskId.trim().length === 0) {
        return {
          content: [{
            type: 'text' as const,
            text: 'Error: Task ID is required.'
          }],
          isError: true
        };
      }

      if (details !== undefined && (!details || details.trim().length === 0)) {
        return {
          content: [{
            type: 'text' as const,
            text: 'Error: Task details must not be empty.'
          }],
          isError: true
        };
      }

      if (details !== undefined && details.trim().length > 2000) {
        return {
          content: [{
            type: 'text' as const,
            text: 'Error: Task details must be 2000 characters or less.'
          }],
          isError: true
        };
      }

      if (details === undefined && parentId === undefined &&
          dependsOn === undefined && status === undefined && tags === undefined &&
          actualHours === undefined) {
        return {
          content: [{
            type: 'text' as const,
            text: 'Error: At least one field must be provided for update.'
          }],
          isError: true
        };
      }

      const existingTask = await storage.getTask(taskId.trim());

      if (!existingTask) {
        return {
          content: [{
            type: 'text' as const,
            text: `Error: Task with ID "${taskId}" not found. Use list_tasks to see all available tasks.`
          }],
          isError: true
        };
      }

      // Validate parentId if provided
      let newParentTask = null;
      if (parentId !== undefined) {
        if (parentId) {
          if (parentId === taskId) {
            return {
              content: [{
                type: 'text' as const,
                text: `Error: Task cannot be its own parent.`
              }],
              isError: true
            };
          }

          newParentTask = await storage.getTask(parentId.trim());
          if (!newParentTask) {
            return {
              content: [{
                type: 'text' as const,
                text: `Error: Parent task with ID "${parentId}" not found.`
              }],
              isError: true
            };
          }

          // Check for circular dependencies (would the new parent be a descendant?)
          const allDescendants = await getAllDescendants(storage, taskId);
          if (allDescendants.includes(parentId)) {
            return {
              content: [{
                type: 'text' as const,
                text: `Error: Cannot move task under its own descendant. This would create a circular hierarchy.`
              }],
              isError: true
            };
          }
        }
      }

      // Validate dependencies exist if provided
      if (dependsOn && dependsOn.length > 0) {
        for (const depId of dependsOn) {
          if (depId === taskId) {
            return {
              content: [{
                type: 'text' as const,
                text: `Error: Task cannot depend on itself.`
              }],
              isError: true
            };
          }
          const depTask = await storage.getTask(depId);
          if (!depTask) {
            return {
              content: [{
                type: 'text' as const,
                text: `Error: Dependency task with ID "${depId}" not found.`
              }],
              isError: true
            };
          }
        }
      }

      const updates: any = {
        updatedAt: new Date().toISOString()
      };

      if (details !== undefined) {
        updates.details = details.trim();
      }

      if (parentId !== undefined) {
        updates.parentId = parentId?.trim() || undefined;
      }

      if (dependsOn !== undefined) {
        updates.dependsOn = dependsOn;
      }

      if (status !== undefined) {
        updates.status = status;
      }

      if (tags !== undefined) {
        updates.tags = tags;
      }

      if (actualHours !== undefined) {
        updates.actualHours = actualHours;
      }

      const updatedTask = await storage.updateTask(taskId, updates);

      if (!updatedTask) {
        return {
          content: [{
            type: 'text' as const,
            text: `Error: Failed to update task with ID "${taskId}".`
          }],
          isError: true
        };
      }

      // Get hierarchy information for display
      const currentParent = updatedTask.parentId ? await storage.getTask(updatedTask.parentId) : null;
      const taskLevel = updatedTask.level || 0;

      const changedFields = [];
      if (details !== undefined) changedFields.push('details');
      if (parentId !== undefined) changedFields.push('parent relationship');
      if (dependsOn !== undefined) changedFields.push('dependencies');
      if (status !== undefined) changedFields.push('status');
      if (tags !== undefined) changedFields.push('tags');
      if (actualHours !== undefined) changedFields.push('actual hours');

      const taskStatus = updatedTask.status;
      const levelIndicator = '  '.repeat(taskLevel) + '→';

      // Build hierarchy path
      let hierarchyPath = '';
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
  • Status: ${taskStatus}
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
      return {
        content: [{
          type: 'text' as const,
          text: `Error updating task: ${error instanceof Error ? error.message : 'Unknown error'}`
        }],
        isError: true
      };
    }
  };

  return {
    name: 'update_task',
    description: 'Update task properties including details, parent relationship (parentId), dependencies, status, tags, and time tracking. Use parentId to move tasks within the hierarchy.',
    parameters: {
      type: 'object',
      properties: {
        workingDirectory: { type: 'string', description: 'Working directory for the operation' },
        taskId: { type: 'string', description: 'The ID of the task to update' },
        details: { type: 'string', description: 'Updated task details' },
        parentId: { type: 'string', description: 'New parent task ID (optional)', nullable: true },
        dependsOn: { type: 'array', items: { type: 'string' }, description: 'Updated list of task dependencies' },
        status: { type: 'string', enum: ['pending', 'in_progress', 'done'], description: 'Updated status of the task' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Updated task tags' },
        actualHours: { type: 'number', minimum: 0, description: 'Actual hours spent on the task' },
      },
      required: ['workingDirectory', 'taskId']
    },
    handler: withValidationAndErrorHandling(updateTaskSchema, handler)
  };
}

/**
 * Move a task to a different parent in the hierarchy
 * ID=folder name, no name field
 *
 * @param storage - Storage instance
 * @returns MCP tool handler for moving tasks
 */
export function createMoveTaskTool(storage: Storage) {
  const handler = async ({ workingDirectory, taskId, newParentId }: z.infer<typeof moveTaskSchema>) => {
    try {
      if (!taskId || taskId.trim().length === 0) {
        return {
          content: [{
            type: 'text' as const,
            text: 'Error: Task ID is required.'
          }],
          isError: true
        };
      }

      const task = await storage.getTask(taskId.trim());
      if (!task) {
        return {
          content: [{
            type: 'text' as const,
            text: `Error: Task with ID "${taskId}" not found. Use list_tasks to see available tasks.`
          }],
          isError: true
        };
      }

      const oldParent = task.parentId ? await storage.getTask(task.parentId) : null;
      const newParent = newParentId ? await storage.getTask(newParentId.trim()) : null;

      // Validate new parent if specified
      if (newParentId && !newParent) {
        return {
          content: [{
            type: 'text' as const,
            text: `Error: New parent task with ID "${newParentId}" not found.`
          }],
          isError: true
        };
      }

      const movedTask = await storage.moveTask(taskId.trim(), newParentId?.trim());
      if (!movedTask) {
        return {
          content: [{
            type: 'text' as const,
            text: `Error: Failed to move task with ID "${taskId}".`
          }],
          isError: true
        };
      }

      // Build path information
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
    } catch (error: any) {
      return {
        content: [{
          type: 'text' as const,
          text: `Error moving task: ${error instanceof Error ? error.message : 'Unknown error'}`
        }],
        isError: true
      };
    }
  };

  return {
    name: 'move_task',
    description: 'Move a task to a different parent in the hierarchy. Set newParentId to move under another task, or leave empty to move to top level. Supports unlimited nesting depth.',
    parameters: {
      type: 'object',
      properties: {
        workingDirectory: { type: 'string', description: 'Working directory for the operation' },
        taskId: { type: 'string', description: 'The ID of the task to move' },
        newParentId: { type: 'string', description: 'The ID of the new parent task (optional)', nullable: true },
      },
      required: ['workingDirectory', 'taskId']
    },
    handler: withValidationAndErrorHandling(moveTaskSchema, handler)
  };
}

/**
 * Delete a task and all associated subtasks
 * ID=folder name, no name field
 *
 * @param storage - Storage instance
 * @returns MCP tool handler for deleting tasks
 */
export function createDeleteTaskTool(storage: Storage) {
  const handler = async ({ workingDirectory, taskId, confirm }: z.infer<typeof deleteTaskSchema>) => {
    try {
      // Validate inputs
      if (!taskId || taskId.trim().length === 0) {
        return {
          content: [{
            type: 'text' as const,
            text: 'Error: Task ID is required.'
          }],
          isError: true
        };
      }

      if (confirm !== true) {
        return {
          content: [{
            type: 'text' as const,
            text: 'Error: You must set confirm to true to delete a task.'
          }],
          isError: true
        };
      }

      const task = await storage.getTask(taskId.trim());

      if (!task) {
        return {
          content: [{
            type: 'text' as const,
            text: `Error: Task with ID "${taskId}" not found. Use list_tasks to see all available tasks.`
          }],
          isError: true
        };
      }

      // Get count of child tasks for confirmation message
      const childTasks = await storage.getTaskChildren(task.id);

      const deleted = await storage.deleteTask(taskId);

      if (!deleted) {
        return {
          content: [{
            type: 'text' as const,
            text: `Error: Failed to delete task with ID "${taskId}".`
          }],
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
      return {
        content: [{
          type: 'text' as const,
          text: `Error deleting task: ${error instanceof Error ? error.message : 'Unknown error'}`
        }],
        isError: true
      };
    }
  };

  return {
    name: 'delete_task',
    description: 'Delete a task and all its associated subtasks. This action cannot be undone.',
    parameters: {
      type: 'object',
      properties: {
        workingDirectory: { type: 'string', description: 'Working directory for the operation' },
        taskId: { type: 'string', description: 'The ID of the task to delete' },
        confirm: { type: 'boolean', const: true, description: 'Must be true to confirm deletion' },
      },
      required: ['workingDirectory', 'taskId', 'confirm']
    },
    handler: withValidationAndErrorHandling(deleteTaskSchema, handler)
  };
}

/**
 * Create all task management tools
 * 
 * @param storage - Storage instance
 * @returns Array of all task management tools
 */
export function createTaskTools(storage: Storage) {
  return [
    createCreateTaskTool(storage),
    createGetTaskTool(storage),
    createListTasksTool(storage),
    createUpdateTaskTool(storage),
    createMoveTaskTool(storage),
    createDeleteTaskTool(storage)
  ];
}

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