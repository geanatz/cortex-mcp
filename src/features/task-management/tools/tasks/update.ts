import { z } from 'zod';
import { Storage } from '../../storage/storage.js';

/**
 * Update an existing task including hierarchy changes
 * Version 2.0: Updated for unified task model supporting unlimited hierarchy
 *
 * @param storage - Storage instance
 * @returns MCP tool handler for updating tasks
 */
export function createUpdateTaskTool(storage: Storage) {
  return {
    name: 'update_task',
    description: 'Update task properties including name, details, parent relationship (parentId), completion status, dependencies, priority, complexity, status, tags, and time estimates. Use parentId to move tasks within the hierarchy.',
    inputSchema: {
      id: z.string(),
      name: z.string().optional(),
      details: z.string().optional(),
      parentId: z.string().optional(),
      completed: z.boolean().optional(),
      dependsOn: z.array(z.string()).optional(),
      priority: z.number().min(1).max(10).optional(),
      complexity: z.number().min(1).max(10).optional(),
      status: z.enum(['pending', 'in-progress', 'blocked', 'done']).optional(),
      tags: z.array(z.string()).optional(),
      estimatedHours: z.number().min(0).optional(),
      actualHours: z.number().min(0).optional()
    },
    handler: async ({ id, name, details, parentId, completed, dependsOn, priority, complexity, status, tags, estimatedHours, actualHours }: {
      id: string;
      name?: string;
      details?: string;
      parentId?: string;
      completed?: boolean;
      dependsOn?: string[];
      priority?: number;
      complexity?: number;
      status?: 'pending' | 'in-progress' | 'blocked' | 'done';
      tags?: string[];
      estimatedHours?: number;
      actualHours?: number;
    }) => {
      try {
        // Validate inputs
        if (!id || id.trim().length === 0) {
          return {
            content: [{
              type: 'text' as const,
              text: 'Error: Task ID is required.'
            }],
            isError: true
          };
        }

        if (name !== undefined && (!name || name.trim().length === 0)) {
          return {
            content: [{
              type: 'text' as const,
              text: 'Error: Task name must not be empty.'
            }],
            isError: true
          };
        }

        if (name !== undefined && name.trim().length > 100) {
          return {
            content: [{
              type: 'text' as const,
              text: 'Error: Task name must be 100 characters or less.'
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

        if (name === undefined && details === undefined && parentId === undefined && completed === undefined &&
            dependsOn === undefined && priority === undefined && complexity === undefined &&
            status === undefined && tags === undefined && estimatedHours === undefined &&
            actualHours === undefined) {
          return {
            content: [{
              type: 'text' as const,
              text: 'Error: At least one field must be provided for update.'
            }],
            isError: true
          };
        }

        const existingTask = await storage.getTask(id.trim());

        if (!existingTask) {
          return {
            content: [{
              type: 'text' as const,
              text: `Error: Task with ID "${id}" not found. Use list_tasks to see all available tasks.`
            }],
            isError: true
          };
        }

        // Validate parentId if provided
        let newParentTask = null;
        if (parentId !== undefined) {
          if (parentId) {
            if (parentId === id) {
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

            // Ensure parent is not a child of the current task (circular reference check)
            // This is handled by moveTask in storage, but good to check here or rely on storage logic?
            // Storage logic is handled in storage.ts, here we just need to pass it.
            // But we already fetched newParentTask to validate existence.

            // Check for circular dependencies (would the new parent be a descendant?)
            const children = await storage.getTaskChildren(id);
            const allDescendants = await getAllDescendants(storage, id);
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

        // Check for name uniqueness within the same parent scope if name is being updated
        if (name && name.toLowerCase() !== existingTask.name.toLowerCase()) {
          const effectiveParentId = parentId !== undefined ? parentId : existingTask.parentId;
          const siblingTasks = await storage.getTasks(effectiveParentId);
          const nameExists = siblingTasks.some(t => t.id !== id && t.name.toLowerCase() === name.toLowerCase());

          if (nameExists) {
            const scopeDescription = newParentTask
              ? `under parent task "${newParentTask.name}"`
              : effectiveParentId
                ? 'in the current parent scope'
                : 'at the top level of this project';
            return {
              content: [{
                type: 'text' as const,
                text: `Error: A task with the name "${name}" already exists ${scopeDescription}. Please choose a different name.`
              }],
              isError: true
            };
          }
        }

        // Validate dependencies exist if provided
        if (dependsOn && dependsOn.length > 0) {
          for (const depId of dependsOn) {
            if (depId === id) {
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

        if (name !== undefined) {
          updates.name = name.trim();
        }

        if (details !== undefined) {
          updates.details = details.trim();
        }

        if (parentId !== undefined) {
          updates.parentId = parentId?.trim() || undefined;
        }

        if (completed !== undefined) {
          updates.completed = completed;
        }

        if (dependsOn !== undefined) {
          updates.dependsOn = dependsOn;
        }

        if (priority !== undefined) {
          updates.priority = priority;
        }

        if (complexity !== undefined) {
          updates.complexity = complexity;
        }

        if (status !== undefined) {
          updates.status = status;
        }

        if (tags !== undefined) {
          updates.tags = tags;
        }

        if (estimatedHours !== undefined) {
          updates.estimatedHours = estimatedHours;
        }

        if (actualHours !== undefined) {
          updates.actualHours = actualHours;
        }

        const updatedTask = await storage.updateTask(id, updates);

        if (!updatedTask) {
          return {
            content: [{
              type: 'text' as const,
              text: `Error: Failed to update task with ID "${id}".`
            }],
            isError: true
          };
        }

        // Get project and hierarchy information for display
        const project = await storage.getProject();
        const projectName = project ? project.name : 'Unknown Project';
        const currentParent = updatedTask.parentId ? await storage.getTask(updatedTask.parentId) : null;
        const taskLevel = updatedTask.level || 0;

        const changedFields = [];
        if (name !== undefined) changedFields.push('name');
        if (details !== undefined) changedFields.push('details');
        if (parentId !== undefined) changedFields.push('parent relationship');
        if (completed !== undefined) changedFields.push('completion status');
        if (dependsOn !== undefined) changedFields.push('dependencies');
        if (priority !== undefined) changedFields.push('priority');
        if (complexity !== undefined) changedFields.push('complexity');
        if (status !== undefined) changedFields.push('status');
        if (tags !== undefined) changedFields.push('tags');
        if (estimatedHours !== undefined) changedFields.push('estimated hours');
        if (actualHours !== undefined) changedFields.push('actual hours');

        const taskStatus = updatedTask.status || (updatedTask.completed ? 'done' : 'pending');
        const levelIndicator = '  '.repeat(taskLevel) + '→';

        // Build hierarchy path
        let hierarchyPath = projectName;
        if (currentParent) {
          const ancestors = await storage.getTaskAncestors(updatedTask.id);
          hierarchyPath = `${projectName} → ${ancestors.map(a => a.name).join(' → ')} → ${updatedTask.name}`;
        } else {
          hierarchyPath = `${projectName} → ${updatedTask.name}`;
        }

        return {
          content: [{
            type: 'text' as const,
            text: `✅ Task updated successfully!

**${levelIndicator} ${updatedTask.name}** (ID: ${updatedTask.id})
${currentParent ? `Parent: ${currentParent.name} (${currentParent.id})` : 'Top-level task'}
Project: ${projectName}
Level: ${taskLevel} ${taskLevel === 0 ? '(Top-level)' : `(${taskLevel} level${taskLevel > 1 ? 's' : ''} deep)`}
Path: ${hierarchyPath}

📋 **Task Properties:**
• Priority: ${updatedTask.priority || 'Not set'}/10
• Complexity: ${updatedTask.complexity || 'Not set'}/10
• Status: ${taskStatus}
• Completed: ${updatedTask.completed ? 'Yes' : 'No'}
• Tags: ${updatedTask.tags?.join(', ') || 'None'}
• Dependencies: ${updatedTask.dependsOn?.length ? updatedTask.dependsOn.join(', ') : 'None'}
• Estimated Hours: ${updatedTask.estimatedHours || 'Not set'}
• Actual Hours: ${updatedTask.actualHours || 'Not set'}
• Details: ${updatedTask.details}
• Last Updated: ${new Date(updatedTask.updatedAt).toLocaleString()}

✏️ **Updated fields:** ${changedFields.join(', ')}

🎯 **Next Steps:**
${parentId !== undefined ? '• Use `list_tasks` to see the updated hierarchy structure' : ''}
• Use \`get_next_task_recommendation\` to see what to work on next
• Run \`analyze_task_complexity\` if complexity has changed
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
    }
  };
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
