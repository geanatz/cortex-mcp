import { z } from 'zod';
import { Storage } from '../../storage/storage.js';

/**
 * Get task details by ID
 * Version 5.0: Simplified - ID=folder name, no name field
 *
 * @param storage - Storage instance
 * @returns MCP tool handler for getting task details
 */
export function createGetTaskTool(storage: Storage) {
  return {
    name: 'get_task',
    description: 'Get detailed information about a specific task by its ID (folder name)',
    inputSchema: {
      id: z.string()
    },
    handler: async ({ id }: { id: string }) => {
      try {
        // Validate input
        if (!id || id.trim().length === 0) {
          return {
            content: [{
              type: 'text' as const,
              text: 'Error: Task ID is required.'
            }],
            isError: true
          };
        }

        const task = await storage.getTask(id.trim());

        if (!task) {
          return {
            content: [{
              type: 'text' as const,
              text: `Error: Task with ID "${id}" not found. Use list_tasks to see all available tasks.`
            }],
            isError: true
          };
        }

        // Get related child tasks for summary
        const childTasks = await storage.getTaskChildren(task.id);
        const completedChildren = childTasks.filter(t => t.completed).length;

        const status = task.completed ? '✅ Completed' : '⏳ Pending';
        const childTaskSummary = childTasks.length > 0
          ? `\n**Child Tasks:** ${completedChildren}/${childTasks.length} completed`
          : '\n**Child Tasks:** None';

        return {
          content: [{
            type: 'text' as const,
            text: `**${task.id}**

**Status:** ${task.status || 'pending'} ${task.completed ? '(Completed)' : ''}
**Details:** ${task.details}
**Tags:** ${task.tags?.join(', ') || 'None'}
**Dependencies:** ${task.dependsOn?.length ? task.dependsOn.join(', ') : 'None'}

**Created:** ${new Date(task.createdAt).toLocaleString()}
**Last Updated:** ${new Date(task.updatedAt).toLocaleString()}${childTaskSummary}

Use list_tasks with parentId="${task.id}" to see all child tasks for this task.`
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
    }
  };
}
