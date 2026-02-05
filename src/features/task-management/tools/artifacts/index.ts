import { z } from 'zod';
import { FileStorage } from '../../storage/file-storage.js';
import { Storage } from '../../storage/storage.js';
import { StorageConfig, resolveWorkingDirectory, getWorkingDirectoryDescription } from '../../../../utils/storage-config.js';
import { createErrorResponse } from '../../../../utils/response-builder.js';
import { createLogger } from '../../../../utils/logger.js';
import { 
  ArtifactPhase, 
  ArtifactStatus,
  ARTIFACT_PHASES,
  OPERATION_DESCRIPTIONS,
  PHASE_DESCRIPTIONS
} from '../../models/artifact.js';

// Import from base abstractions
import { ToolDefinition } from '../../tools/base/types.js';
import { createArtifactOperationTool } from '../../tools/base/tool-factory.js';
import { withErrorHandling } from '../../tools/base/handlers.js';
import { 
  workingDirectorySchema, 
  taskIdSchema, 
  contentSchema, 
  artifactStatusSchema 
} from '../../tools/base/schemas.js';

// Import new types
import { 
  ArtifactOperation,
  CreateArtifactInput,
  UpdateArtifactInput,
  DeleteArtifactInput
} from './types.js';

const logger = createLogger('artifact-tools');

/**
 * Factory function type for creating storage instances
 */
type StorageFactory = (workingDirectory: string, config: StorageConfig) => Promise<Storage>;

/**
 * Create all artifact tools (15 total: create/update/delete × 5 phases)
 * 
 * Tools follow naming convention: cortex_{operation}_{phase}
 * - cortex_create_explore, cortex_update_explore, cortex_delete_explore
 * - cortex_create_search, cortex_update_search, cortex_delete_search
 * - cortex_create_plan, cortex_update_plan, cortex_delete_plan
 * - cortex_create_build, cortex_update_build, cortex_delete_build
 * - cortex_create_test, cortex_update_test, cortex_delete_test
 */
export function createArtifactTools(
  config: StorageConfig,
  createStorage: StorageFactory
): ToolDefinition[] {
  const tools: ToolDefinition[] = [];

  for (const phase of ARTIFACT_PHASES) {
    // Create tool
    tools.push(createCreateArtifactTool(phase, config, createStorage));
    
    // Update tool
    tools.push(createUpdateArtifactTool(phase, config, createStorage));
    
    // Delete tool
    tools.push(createDeleteArtifactTool(phase, config, createStorage));
  }

  return tools;
}

/**
 * Create the "create" artifact tool for a specific phase using base factory
 */
function createCreateArtifactTool(
  phase: ArtifactPhase,
  config: StorageConfig,
  createStorage: StorageFactory
): ToolDefinition {
  // Create the base tool using the factory
  const baseTool = createArtifactOperationTool(
    phase,
    'create',
    {} as Storage, // We'll provide the actual storage in the handler
    async (params: any, storage: Storage) => {
      // This is a placeholder - the actual implementation is below
      return { content: [{ type: 'text', text: 'Placeholder' }] };
    }
  );

  // Override the handler to use our specific implementation
  const handler = async (params: any) => {
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

      return {
        content: [{
          type: 'text' as const,
          text: `**${phase.charAt(0).toUpperCase() + phase.slice(1)} artifact created for task "${taskId}"**

**Phase:** ${artifact.metadata.phase}
**Status:** ${artifact.metadata.status}
**Created:** ${new Date(artifact.metadata.createdAt).toLocaleString()}

---

${artifact.content.length > 500 ? artifact.content.substring(0, 500) + '...\n\n*(truncated - use cortex_get_task to see full content)*' : artifact.content}`
        }]
      };
    } catch (err) {
      return createErrorResponse(err);
    }
  };

  // Return the tool with the overridden handler and proper name
  return {
    name: `cortex_create_${phase}`,
    description: OPERATION_DESCRIPTIONS.create[phase],
    parameters: {
      type: 'object',
      properties: {
        workingDirectory: {
          type: 'string',
          description: getWorkingDirectoryDescription(config)
        },
        taskId: {
          type: 'string',
          description: 'The ID of the task to create the artifact for'
        },
        content: {
          type: 'string',
          description: `Markdown content for the ${phase} artifact. ${PHASE_DESCRIPTIONS[phase]}`
        },
        status: {
          type: 'string',
          enum: ['pending', 'in-progress', 'completed', 'failed', 'skipped'],
          description: 'Status of this phase (defaults to "completed")'
        },
        retries: {
          type: 'number',
          minimum: 0,
          description: 'Number of retry attempts for this phase'
        },
        error: {
          type: 'string',
          description: 'Error message if status is "failed"'
        }
      },
      required: ['workingDirectory', 'taskId', 'content']
    },
    handler: withErrorHandling(handler)
  };
}

/**
 * Create the "update" artifact tool for a specific phase using base factory
 */
function createUpdateArtifactTool(
  phase: ArtifactPhase,
  config: StorageConfig,
  createStorage: StorageFactory
): ToolDefinition {
  // Create the base tool using the factory
  const baseTool = createArtifactOperationTool(
    phase,
    'update',
    {} as Storage, // We'll provide the actual storage in the handler
    async (params: any, storage: Storage) => {
      // This is a placeholder - the actual implementation is below
      return { content: [{ type: 'text', text: 'Placeholder' }] };
    }
  );

  // Override the handler to use our specific implementation
  const handler = async (params: any) => {
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
        return {
          content: [{
            type: 'text' as const,
            text: `Error: ${phase.charAt(0).toUpperCase() + phase.slice(1)} artifact not found for task "${taskId}". Use cortex_create_${phase} to create it first.`
          }],
          isError: true
        };
      }

      return {
        content: [{
          type: 'text' as const,
          text: `**${phase.charAt(0).toUpperCase() + phase.slice(1)} artifact updated for task "${taskId}"**

**Phase:** ${artifact.metadata.phase}
**Status:** ${artifact.metadata.status}
**Updated:** ${new Date(artifact.metadata.updatedAt).toLocaleString()}${artifact.metadata.retries !== undefined ? `\n**Retries:** ${artifact.metadata.retries}` : ''}${artifact.metadata.error ? `\n**Error:** ${artifact.metadata.error}` : ''}`
        }]
      };
    } catch (err) {
      return createErrorResponse(err);
    }
  };

  // Return the tool with the overridden handler and proper name
  return {
    name: `cortex_update_${phase}`,
    description: OPERATION_DESCRIPTIONS.update[phase],
    parameters: {
      type: 'object',
      properties: {
        workingDirectory: {
          type: 'string',
          description: getWorkingDirectoryDescription(config)
        },
        taskId: {
          type: 'string',
          description: 'The ID of the task to update the artifact for'
        },
        content: {
          type: 'string',
          description: `Updated markdown content for the ${phase} artifact`
        },
        status: {
          type: 'string',
          enum: ['pending', 'in-progress', 'completed', 'failed', 'skipped'],
          description: 'Updated status of this phase'
        },
        retries: {
          type: 'number',
          minimum: 0,
          description: 'Updated number of retry attempts'
        },
        error: {
          type: 'string',
          description: 'Updated error message'
        }
      },
      required: ['workingDirectory', 'taskId']
    },
    handler: withErrorHandling(handler)
  };
}

/**
 * Create the "delete" artifact tool for a specific phase using base factory
 */
function createDeleteArtifactTool(
  phase: ArtifactPhase,
  config: StorageConfig,
  createStorage: StorageFactory
): ToolDefinition {
  // Create the base tool using the factory
  const baseTool = createArtifactOperationTool(
    phase,
    'delete',
    {} as Storage, // We'll provide the actual storage in the handler
    async (params: any, storage: Storage) => {
      // This is a placeholder - the actual implementation is below
      return { content: [{ type: 'text', text: 'Placeholder' }] };
    }
  );

  // Override the handler to use our specific implementation
  const handler = async (params: any) => {
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
        return {
          content: [{
            type: 'text' as const,
            text: `${phase.charAt(0).toUpperCase() + phase.slice(1)} artifact not found for task "${taskId}". Nothing to delete.`
          }]
        };
      }

      return {
        content: [{
          type: 'text' as const,
          text: `**${phase.charAt(0).toUpperCase() + phase.slice(1)} artifact deleted from task "${taskId}"**

The ${phase} phase has been reset and can be re-run.`
        }]
      };
    } catch (err) {
      return createErrorResponse(err);
    }
  };

  // Return the tool with the overridden handler and proper name
  return {
    name: `cortex_delete_${phase}`,
    description: OPERATION_DESCRIPTIONS.delete[phase],
    parameters: {
      type: 'object',
      properties: {
        workingDirectory: {
          type: 'string',
          description: getWorkingDirectoryDescription(config)
        },
        taskId: {
          type: 'string',
          description: 'The ID of the task to delete the artifact from'
        },
        confirm: {
          type: 'boolean',
          description: 'Must be set to true to confirm deletion (safety measure)'
        }
      },
      required: ['workingDirectory', 'taskId', 'confirm']
    },
    handler: withErrorHandling(handler)
  };
}
