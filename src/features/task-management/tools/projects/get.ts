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
    },
    handler: async () => {
      try {
        const project = await storage.getProject();

        if (!project) {
          return {
            content: [{
              type: 'text' as const,
              text: 'Error: No project initialized. Use create_project to start.'
            }],
            isError: true
          };
        }

        // Get related tasks for summary - all tasks belong to this project
        const tasks = await storage.getTasks();
        const completedTasks = tasks.filter(t => t.completed).length;

        return {
          content: [{
            type: 'text' as const,
            text: `**${project.name}**
ID: ${project.id}

**Description:** ${project.description}

**Progress Summary:**
Total Tasks: ${tasks.length} (${completedTasks} completed)

Use list_tasks to see all tasks.`
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
