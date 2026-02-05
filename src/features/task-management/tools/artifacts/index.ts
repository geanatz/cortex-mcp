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

const logger = createLogger('artifact-tools');

/**
 * Factory function type for creating storage instances
 */
type StorageFactory = (workingDirectory: string, config: StorageConfig) => Promise<Storage>;

/**
 * MCP tool definition structure
 */
interface ArtifactTool {
  name: string;
  description: string;
  schema: Record<string, z.ZodType>;
  handler: (params: Record<string, unknown>) => Promise<{ content: { type: 'text'; text: string }[]; isError?: boolean }>;
}

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
): ArtifactTool[] {
  const tools: ArtifactTool[] = [];

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
 * Create the "create" artifact tool for a specific phase
 */
function createCreateArtifactTool(
  phase: ArtifactPhase,
  config: StorageConfig,
  createStorage: StorageFactory
): ArtifactTool {
  return {
    name: `cortex_create_${phase}`,
    description: OPERATION_DESCRIPTIONS.create[phase],
    schema: {
      workingDirectory: z.string().describe(getWorkingDirectoryDescription(config)),
      taskId: z.string().describe('The ID of the task to create the artifact for'),
      content: z.string().describe(`Markdown content for the ${phase} artifact. ${PHASE_DESCRIPTIONS[phase]}`),
      status: z.enum(['pending', 'in-progress', 'completed', 'failed', 'skipped']).optional()
        .describe('Status of this phase (defaults to "completed")'),
      retries: z.number().min(0).optional().describe('Number of retry attempts for this phase'),
      error: z.string().optional().describe('Error message if status is "failed"')
    },
    handler: async (params) => {
      try {
        const { workingDirectory, taskId, content, status, retries, error } = params as {
          workingDirectory: string;
          taskId: string;
          content: string;
          status?: 'pending' | 'in-progress' | 'completed' | 'failed' | 'skipped';
          retries?: number;
          error?: string;
        };

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
    }
  };
}

/**
 * Create the "update" artifact tool for a specific phase
 */
function createUpdateArtifactTool(
  phase: ArtifactPhase,
  config: StorageConfig,
  createStorage: StorageFactory
): ArtifactTool {
  return {
    name: `cortex_update_${phase}`,
    description: OPERATION_DESCRIPTIONS.update[phase],
    schema: {
      workingDirectory: z.string().describe(getWorkingDirectoryDescription(config)),
      taskId: z.string().describe('The ID of the task to update the artifact for'),
      content: z.string().optional().describe(`Updated markdown content for the ${phase} artifact`),
      status: z.enum(['pending', 'in-progress', 'completed', 'failed', 'skipped']).optional()
        .describe('Updated status of this phase'),
      retries: z.number().min(0).optional().describe('Updated number of retry attempts'),
      error: z.string().optional().describe('Updated error message')
    },
    handler: async (params) => {
      try {
        const { workingDirectory, taskId, content, status, retries, error } = params as {
          workingDirectory: string;
          taskId: string;
          content?: string;
          status?: 'pending' | 'in-progress' | 'completed' | 'failed' | 'skipped';
          retries?: number;
          error?: string;
        };

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
    }
  };
}

/**
 * Create the "delete" artifact tool for a specific phase
 */
function createDeleteArtifactTool(
  phase: ArtifactPhase,
  config: StorageConfig,
  createStorage: StorageFactory
): ArtifactTool {
  return {
    name: `cortex_delete_${phase}`,
    description: OPERATION_DESCRIPTIONS.delete[phase],
    schema: {
      workingDirectory: z.string().describe(getWorkingDirectoryDescription(config)),
      taskId: z.string().describe('The ID of the task to delete the artifact from'),
      confirm: z.boolean().describe('Must be set to true to confirm deletion (safety measure)')
    },
    handler: async (params) => {
      try {
        const { workingDirectory, taskId, confirm } = params as {
          workingDirectory: string;
          taskId: string;
          confirm: boolean;
        };

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
    }
  };
}
