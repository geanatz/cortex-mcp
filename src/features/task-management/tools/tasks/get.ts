import { z } from 'zod';
import { Storage } from '../../storage/storage.js';
import { ARTIFACT_PHASES, ArtifactPhase, Artifact } from '../../models/artifact.js';

/**
 * Get task details by ID including all phase artifacts
 * ID=folder name, no name field
 * Returns task metadata + all artifacts (explore, search, plan, build, test)
 *
 * @param storage - Storage instance
 * @returns MCP tool handler for getting task details
 */
export function createGetTaskTool(storage: Storage) {
  return {
    name: 'cortex_get_task',
    description: 'Get detailed information about a specific task including all phase artifacts (explore, search, plan, build, test). Essential for understanding current task state and accumulated knowledge.',
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
              text: `Error: Task with ID "${id}" not found. Use cortex_list_tasks to see all available tasks.`
            }],
            isError: true
          };
        }

        // Get all artifacts for this task
        const artifacts = await storage.getAllArtifacts(task.id);

        // Get related child tasks for summary
        const childTasks = await storage.getTaskChildren(task.id);
        const completedChildren = childTasks.filter(t => t.completed).length;

        const childTaskSummary = childTasks.length > 0
          ? `${completedChildren}/${childTasks.length} completed`
          : 'None';

        // Build artifact status summary
        const artifactSummary = ARTIFACT_PHASES.map(phase => {
          const artifact = artifacts[phase];
          if (artifact) {
            return `  - **${phase}:** ${artifact.metadata.status}${artifact.metadata.retries ? ` (retries: ${artifact.metadata.retries})` : ''}`;
          }
          return `  - **${phase}:** Not started`;
        }).join('\n');

        // Build full artifact content sections
        const artifactSections = ARTIFACT_PHASES.map(phase => {
          const artifact = artifacts[phase];
          if (artifact) {
            return formatArtifactSection(phase, artifact);
          }
          return null;
        }).filter(Boolean).join('\n\n');

        const taskInfo = `# Task: ${task.id}

## Metadata
- **Status:** ${task.status || 'pending'}${task.completed ? ' ✅ (Completed)' : ''}
- **Details:** ${task.details}
- **Tags:** ${task.tags?.join(', ') || 'None'}
- **Dependencies:** ${task.dependsOn?.length ? task.dependsOn.join(', ') : 'None'}
- **Child Tasks:** ${childTaskSummary}
- **Created:** ${new Date(task.createdAt).toLocaleString()}
- **Updated:** ${new Date(task.updatedAt).toLocaleString()}

## Phase Artifacts
${artifactSummary}`;

        const fullOutput = artifactSections 
          ? `${taskInfo}\n\n---\n\n${artifactSections}`
          : `${taskInfo}\n\n---\n\n*No artifacts created yet. Run explore phase to start.*`;

        return {
          content: [{
            type: 'text' as const,
            text: fullOutput
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

/**
 * Format a single artifact section for display
 */
function formatArtifactSection(phase: ArtifactPhase, artifact: Artifact): string {
  const phaseTitle = phase.charAt(0).toUpperCase() + phase.slice(1);
  const header = `## ${phaseTitle} Phase`;
  
  const metadata = [
    `**Status:** ${artifact.metadata.status}`,
    `**Created:** ${new Date(artifact.metadata.createdAt).toLocaleString()}`,
    `**Updated:** ${new Date(artifact.metadata.updatedAt).toLocaleString()}`
  ];

  if (artifact.metadata.retries !== undefined && artifact.metadata.retries > 0) {
    metadata.push(`**Retries:** ${artifact.metadata.retries}`);
  }

  if (artifact.metadata.error) {
    metadata.push(`**Error:** ${artifact.metadata.error}`);
  }

  return `${header}\n${metadata.join(' | ')}\n\n${artifact.content}`;
}
