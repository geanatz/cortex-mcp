import { z } from 'zod';
import { Storage } from '../../storage/storage.js';

/**
 * Get project details by ID
 *
 * @param storage - Storage instance
 * @returns MCP tool handler for getting project details
 */
export function createGetProjectTool(storage: Storage) {
  return {
    name: 'get_project',
    description: 'Get detailed information about a specific project by its ID',
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
              text: 'Error: Project ID is required.'
            }],
            isError: true
          };
        }

        const project = await storage.getProject(id.trim());

        if (!project) {
          return {
            content: [{
              type: 'text' as const,
              text: `Error: Project with ID "${id}" not found. Use list_projects to see all available projects.`
            }],
            isError: true
          };
        }

        // Get related tasks for summary
        const tasks = await storage.getTasks(project.id);
        const completedTasks = tasks.filter(t => t.completed).length;

        return {
          content: [{
            type: 'text' as const,
            text: `**${project.name}** (ID: ${project.id})

**Description:** ${project.description}

**Created:** ${new Date(project.createdAt).toLocaleString()}
**Last Updated:** ${new Date(project.updatedAt).toLocaleString()}

**Progress Summary:**
Total Tasks: ${tasks.length} (${completedTasks} completed)

Use list_tasks with projectId="${project.id}" to see all tasks in this project.`
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: 'text' as const,
            text: `Error retrieving project: ${error instanceof Error ? error.message : 'Unknown error'}`
          }],
          isError: true
        };
      }
    }
  };
}
