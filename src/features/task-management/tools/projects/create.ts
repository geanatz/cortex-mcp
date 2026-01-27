import { z } from 'zod';
import { randomUUID } from 'crypto';
import { Storage } from '../../storage/storage.js';
import { Project } from '../../models/project.js';

/**
 * Create a new project
 *
 * @param storage - Storage instance
 * @returns MCP tool handler for creating projects
 */
export function createCreateProjectTool(storage: Storage) {
  return {
    name: 'create_project',
    description: 'Create a new project in the task management system',
    inputSchema: {
      name: z.string(),
      description: z.string()
    },
    handler: async ({ name, description }: { name: string; description: string }) => {
      try {
        // Validate inputs
        if (!name || name.trim().length === 0) {
          return {
            content: [{
              type: 'text' as const,
              text: 'Error: Project name is required.'
            }],
            isError: true
          };
        }

        if (name.trim().length > 100) {
          return {
            content: [{
              type: 'text' as const,
              text: 'Error: Project name must be 100 characters or less.'
            }],
            isError: true
          };
        }

        if (!description || description.trim().length === 0) {
          return {
            content: [{
              type: 'text' as const,
              text: 'Error: Project description is required.'
            }],
            isError: true
          };
        }

        if (description.trim().length > 1000) {
          return {
            content: [{
              type: 'text' as const,
              text: 'Error: Project description must be 1000 characters or less.'
            }],
            isError: true
          };
        }

        // Validate that no project exists
        const hasProject = await storage.hasProject();
        if (hasProject) {
          const existing = await storage.getProject();
          return {
            content: [{
              type: 'text' as const,
              text: `Error: A project already exists (${existing?.name}). This workspace supports only one project. Use 'update_project' to modify it.`
            }],
            isError: true
          };
        }

        const project: Project = {
          id: randomUUID(),
          name: name.trim(),
          description: description.trim()
        };

        const createdProject = await storage.createProject(project);

        return {
          content: [{
            type: 'text' as const,
            text: `✅ Project initialized successfully!

**${createdProject.name}**
Description: ${createdProject.description}

You can now add tasks.`
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: 'text' as const,
            text: `Error creating project: ${error instanceof Error ? error.message : 'Unknown error'}`
          }],
          isError: true
        };
      }
    }
  };
}
