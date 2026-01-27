import { z } from 'zod';
import { Storage } from '../../storage/storage.js';

/**
 * Delete a project and all associated tasks and subtasks
 *
 * @param storage - Storage instance
 * @returns MCP tool handler for deleting projects
 */
export function createDeleteProjectTool(storage: Storage) {
  return {
    name: 'delete_project',
    description: 'Delete a project and all its associated tasks and subtasks. This action cannot be undone.',
    inputSchema: {
      confirm: z.boolean()
    },
    handler: async ({ confirm }: { confirm: boolean }) => {
      try {
        if (confirm !== true) {
          return {
            content: [{
              type: 'text' as const,
              text: 'Error: You must set confirm to true to delete a project.'
            }],
            isError: true
          };
        }

        const project = await storage.getProject();

        if (!project) {
          return {
            content: [{
              type: 'text' as const,
              text: 'Error: No project initialized to delete.'
            }],
            isError: true
          };
        }

        // Get counts for confirmation message
        const tasks = await storage.getTasks();

        const deleted = await storage.deleteProject();

        if (!deleted) {
          return {
            content: [{
              type: 'text' as const,
              text: 'Error: Failed to delete project.'
            }],
            isError: true
          };
        }

        return {
          content: [{
            type: 'text' as const,
            text: `✅ Project deleted successfully!

**Deleted:** "${project.name}" (ID: ${project.id})
**Also deleted:** ${tasks.length} task(s)

This action cannot be undone. All data associated with this project has been permanently removed.`
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: 'text' as const,
            text: `Error deleting project: ${error instanceof Error ? error.message : 'Unknown error'}`
          }],
          isError: true
        };
      }
    }
  };
}
