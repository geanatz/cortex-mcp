import { z } from 'zod';
import { Storage } from '../../storage/storage.js';

/**
 * Update an existing project
 *
 * @param storage - Storage instance
 * @returns MCP tool handler for updating projects
 */
export function createUpdateProjectTool(storage: Storage) {
  return {
    name: 'update_project',
    description: 'Update the name and/or description of an existing project',
    inputSchema: {
      name: z.string().optional(),
      description: z.string().optional()
    },
    handler: async ({ name, description }: { name?: string; description?: string }) => {
      try {
        // Validate inputs
        if (name !== undefined && (!name || name.trim().length === 0)) {
          return {
            content: [{
              type: 'text' as const,
              text: 'Error: Project name must not be empty.'
            }],
            isError: true
          };
        }

        if (name !== undefined && name.trim().length > 100) {
          return {
            content: [{
              type: 'text' as const,
              text: 'Error: Project name must be 100 characters or less.'
            }],
            isError: true
          };
        }

        if (description !== undefined && (!description || description.trim().length === 0)) {
          return {
            content: [{
              type: 'text' as const,
              text: 'Error: Project description must not be empty.'
            }],
            isError: true
          };
        }

        if (description !== undefined && description.trim().length > 1000) {
          return {
            content: [{
              type: 'text' as const,
              text: 'Error: Project description must be 1000 characters or less.'
            }],
            isError: true
          };
        }

        if (name === undefined && description === undefined) {
          return {
            content: [{
              type: 'text' as const,
              text: 'Error: At least one field (name or description) must be provided for update.'
            }],
            isError: true
          };
        }

        const existingProject = await storage.getProject();

        if (!existingProject) {
          return {
            content: [{
              type: 'text' as const,
              text: 'Error: No project initialized to update. Use create_project first.'
            }],
            isError: true
          };
        }

        const updates: any = {};

        if (name !== undefined) {
          updates.name = name.trim();
        }

        if (description !== undefined) {
          updates.description = description.trim();
        }

        const updatedProject = await storage.updateProject(updates);

        if (!updatedProject) {
          return {
            content: [{
              type: 'text' as const,
              text: 'Error: Failed to update project.'
            }],
            isError: true
          };
        }

        const changedFields = [];
        if (name !== undefined) changedFields.push('name');
        if (description !== undefined) changedFields.push('description');

        return {
          content: [{
            type: 'text' as const,
            text: `✅ Project updated successfully!

**${updatedProject.name}** (ID: ${updatedProject.id})
Description: ${updatedProject.description}

Updated fields: ${changedFields.join(', ')}`
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: 'text' as const,
            text: `Error updating project: ${error instanceof Error ? error.message : 'Unknown error'}`
          }],
          isError: true
        };
      }
    }
  };
}
