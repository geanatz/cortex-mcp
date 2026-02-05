import { z } from 'zod';
import { Storage } from '../../storage/storage.js';

/**
 * Update an existing task including hierarchy changes
 * ID=folder name, no name/priority/complexity fields
 *
 * @param storage - Storage instance
 * @returns MCP tool handler for updating tasks
 */
export function createUpdateTaskTool(storage: Storage) {
  return {
    name: 'update_task',
    description: 'Update task properties including details, parent relationship (parentId), dependencies, status, tags, and time tracking. Use parentId to move tasks within the hierarchy.',
    inputSchema: {
      id: z.string(),
      details: z.string().optional(),
      parentId: z.string().optional(),
      dependsOn: z.array(z.string()).optional(),
      status: z.enum(['pending', 'in_progress', 'done']).optional(),
      tags: z.array(z.string()).optional(),
      actualHours: z.number().min(0).optional()
    },
    handler: async ({ id, details, parentId, dependsOn, status, tags, actualHours }: {
      id: string;
      details?: string;
      parentId?: string;
      dependsOn?: string[];
      status?: 'pending' | 'in_progress' | 'done';
      tags?: string[];
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

            // Check for circular dependencies (would the new parent be a descendant?)
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
