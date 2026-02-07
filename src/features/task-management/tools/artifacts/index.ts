import { z } from 'zod';
import { Storage } from '../../storage/storage.js';
import { StorageConfig, getWorkingDirectoryDescription } from '../../../../utils/storage-config.js';
import { createErrorResponse } from '../../../../utils/response-builder.js';
import { createLogger } from '../../../../utils/logger.js';
import {
  ArtifactPhase,
  ArtifactStatus,
  ARTIFACT_PHASES,
  OPERATION_DESCRIPTIONS,
  PHASE_DESCRIPTIONS
} from '../../models/artifact.js';
import { ToolDefinition } from '../../tools/base/types.js';
import { withErrorHandling } from '../../tools/base/handlers.js';
import { workingDirectorySchema, taskIdSchema } from '../../tools/base/schemas.js';

const logger = createLogger('artifact-tools');

type StorageFactory = (workingDirectory: string, config: StorageConfig) => Promise<Storage>;

interface CreateArtifactParams {
  workingDirectory: string;
  taskId: string;
  content: string;
  status?: ArtifactStatus;
  retries?: number;
  error?: string;
}

interface UpdateArtifactParams {
  workingDirectory: string;
  taskId: string;
  content?: string;
  status?: ArtifactStatus;
  retries?: number;
  error?: string;
}

interface DeleteArtifactParams {
  workingDirectory: string;
  taskId: string;
  confirm: boolean;
}

function createCreateHandler(
  phase: ArtifactPhase,
  config: StorageConfig,
  createStorage: StorageFactory
) {
  return async (params: CreateArtifactParams) => {
    try {
      const { workingDirectory, taskId, content, status, retries, error } = params;

      if (!taskId || taskId.trim().length === 0) {
        return {
          content: [{ type: 'text' as const, text: 'Error: Task ID is required.' }],
          isError: true
        };
      }

      if (!content || content.trim().length === 0) {
        return {
          content: [{ type: 'text' as const, text: 'Error: Content is required.' }],
          isError: true
        };
      }

      const storage = await createStorage(workingDirectory, config);
      const artifact = await storage.createArtifact(taskId.trim(), phase, {
        content: content.trim(),
        status,
        retries,
        error
      });

      const phaseUpper = phase.charAt(0).toUpperCase() + phase.slice(1);
      const truncated = artifact.content.length > 500 
        ? artifact.content.substring(0, 500) + '...\n\n*(truncated - use get_task to see full content)*'
        : artifact.content;

      return {
        content: [{
          type: 'text' as const,
          text: `**${phaseUpper} artifact created for task "${taskId}"**\n\n**Phase:** ${artifact.metadata.phase}\n**Status:** ${artifact.metadata.status}\n**Created:** ${new Date(artifact.metadata.createdAt).toLocaleString()}\n\n---\n\n${truncated}`
        }]
      };
    } catch (err) {
      return createErrorResponse(err);
    }
  };
}

function createUpdateHandler(
  phase: ArtifactPhase,
  config: StorageConfig,
  createStorage: StorageFactory
) {
  return async (params: UpdateArtifactParams) => {
    try {
      const { workingDirectory, taskId, content, status, retries, error } = params;

      if (!taskId || taskId.trim().length === 0) {
        return {
          content: [{ type: 'text' as const, text: 'Error: Task ID is required.' }],
          isError: true
        };
      }

      const storage = await createStorage(workingDirectory, config);
      const artifact = await storage.updateArtifact(taskId.trim(), phase, {
        content: content?.trim(),
        status,
        retries,
        error
      });

      if (!artifact) {
        const phaseUpper = phase.charAt(0).toUpperCase() + phase.slice(1);
        return {
          content: [{
            type: 'text' as const,
            text: `Error: ${phaseUpper} artifact not found for task "${taskId}". Use create_${phase} to create it first.`
          }],
          isError: true
        };
      }

      const phaseUpper = phase.charAt(0).toUpperCase() + phase.slice(1);
      const extras = (artifact.metadata.retries !== undefined ? `\n**Retries:** ${artifact.metadata.retries}` : '') + (artifact.metadata.error ? `\n**Error:** ${artifact.metadata.error}` : '');
      
      return {
        content: [{
          type: 'text' as const,
          text: `**${phaseUpper} artifact updated for task "${taskId}"**\n\n**Phase:** ${artifact.metadata.phase}\n**Status:** ${artifact.metadata.status}\n**Updated:** ${new Date(artifact.metadata.updatedAt).toLocaleString()}${extras}`
        }]
      };
    } catch (err) {
      return createErrorResponse(err);
    }
  };
}

function createDeleteHandler(
  phase: ArtifactPhase,
  config: StorageConfig,
  createStorage: StorageFactory
) {
  return async (params: DeleteArtifactParams) => {
    try {
      const { workingDirectory, taskId, confirm } = params;

      if (!taskId || taskId.trim().length === 0) {
        return {
          content: [{ type: 'text' as const, text: 'Error: Task ID is required.' }],
          isError: true
        };
      }

      if (!confirm) {
        return {
          content: [{
            type: 'text' as const,
            text: `Error: Deletion not confirmed. Set confirm=true to delete the ${phase} artifact.`
          }],
          isError: true
        };
      }

      const storage = await createStorage(workingDirectory, config);
      const deleted = await storage.deleteArtifact(taskId.trim(), phase);

      if (!deleted) {
        const phaseUpper = phase.charAt(0).toUpperCase() + phase.slice(1);
        return {
          content: [{
            type: 'text' as const,
            text: `${phaseUpper} artifact not found for task "${taskId}". Nothing to delete.`
          }]
        };
      }

      const phaseUpper = phase.charAt(0).toUpperCase() + phase.slice(1);
      return {
        content: [{
          type: 'text' as const,
          text: `**${phaseUpper} artifact deleted from task "${taskId}"**\n\nThe ${phase} phase has been reset and can be re-run.`
        }]
      };
    } catch (err) {
      return createErrorResponse(err);
    }
  };
}

export function createArtifactTools(
  config: StorageConfig,
  createStorage: StorageFactory
): ToolDefinition[] {
  const tools: ToolDefinition[] = [];
  const wdSchema = workingDirectorySchema.describe(getWorkingDirectoryDescription(config));

  for (const phase of ARTIFACT_PHASES) {
    tools.push({
      name: `create_${phase}`,
      description: OPERATION_DESCRIPTIONS.create[phase],
      parameters: {
        workingDirectory: wdSchema,
        taskId: taskIdSchema.describe('The ID of the task to create the artifact for'),
        content: z.string().describe(`Markdown content for the ${phase} artifact. ${PHASE_DESCRIPTIONS[phase]}`),
        status: z.enum(['pending', 'in-progress', 'completed', 'failed', 'skipped']).optional().describe('Status of this phase (defaults to "completed")'),
        retries: z.number().min(0).optional().describe('Number of retry attempts for this phase'),
        error: z.string().optional().describe('Error message if status is "failed"')
      },
      handler: withErrorHandling(createCreateHandler(phase, config, createStorage))
    });

    tools.push({
      name: `update_${phase}`,
      description: OPERATION_DESCRIPTIONS.update[phase],
      parameters: {
        workingDirectory: wdSchema,
        taskId: taskIdSchema.describe('The ID of the task to update the artifact for'),
        content: z.string().optional().describe(`Updated markdown content for the ${phase} artifact`),
        status: z.enum(['pending', 'in-progress', 'completed', 'failed', 'skipped']).optional().describe('Updated status of this phase'),
        retries: z.number().min(0).optional().describe('Updated number of retry attempts'),
        error: z.string().optional().describe('Updated error message')
      },
      handler: withErrorHandling(createUpdateHandler(phase, config, createStorage))
    });

    tools.push({
      name: `delete_${phase}`,
      description: OPERATION_DESCRIPTIONS.delete[phase],
      parameters: {
        workingDirectory: wdSchema,
        taskId: taskIdSchema.describe('The ID of the task to delete the artifact from'),
        confirm: z.boolean().describe('Must be set to true to confirm deletion (safety measure)')
      },
      handler: withErrorHandling(createDeleteHandler(phase, config, createStorage))
    });
  }

  return tools;
}