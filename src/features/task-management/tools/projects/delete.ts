import { z } from 'zod';
import { Storage } from '../../storage/storage.js';

/**
 * Delete all tasks and subtasks
 *
 * @param storage - Storage instance
 * @returns MCP tool handler for deleting all tasks
 */
export function createDeleteProjectTool(storage: Storage) {
  return {
    name: 'delete_project',
    description: 'Delete all tasks and subtasks. This action cannot be undone.',
    inputSchema: {
      confirm: z.boolean()
    },
    handler: async ({ confirm }: { confirm: boolean }) => {
      try {
        if (confirm !== true) {
          return {
            content: [{
              type: 'text' as const,
              text: 'Error: You must set confirm to true to delete all tasks.'
            }],
            isError: true
          };
        }

        // Get counts for confirmation message
        const tasks = await storage.getTasks();

        if (tasks.length === 0) {
          return {
            content: [{
              type: 'text' as const,
              text: 'No tasks to delete.'
            }]
          };
        }

        // Delete all tasks
        let deletedCount = 0;
        for (const task of tasks) {
          if (await storage.deleteTask(task.id)) {
            deletedCount++;
          }
        }

        return {
          content: [{
            type: 'text' as const,
            text: `✅ All tasks deleted successfully!

**Deleted:** ${deletedCount} task(s)

This action cannot be undone. All task data has been permanently removed.`
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: 'text' as const,
            text: `Error deleting tasks: ${error instanceof Error ? error.message : 'Unknown error'}`
          }],
          isError: true
        };
      }
    }
  };
}
