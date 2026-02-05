import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { FileStorage } from './features/task-management/storage/file-storage.js';
import { Storage } from './features/task-management/storage/storage.js';
import { getVersion } from './utils/version.js';
import { StorageConfig, resolveWorkingDirectory, getWorkingDirectoryDescription } from './utils/storage-config.js';
import { createErrorResponse, response } from './utils/response-builder.js';
import { createLogger } from './utils/logger.js';
import { z } from 'zod';

// Task tools
import { createListTasksTool } from './features/task-management/tools/tasks/list.js';
import { createCreateTaskTool } from './features/task-management/tools/tasks/create.js';
import { createGetTaskTool } from './features/task-management/tools/tasks/get.js';
import { createUpdateTaskTool } from './features/task-management/tools/tasks/update.js';
import { createDeleteTaskTool } from './features/task-management/tools/tasks/delete.js';
import { createMoveTaskTool } from './features/task-management/tools/tasks/move.js';

// Artifact tools
import { createArtifactTools } from './features/task-management/tools/artifacts/index.js';

const logger = createLogger('server');

/**
 * Storage factory type
 */
type StorageFactory = (workingDirectory: string, config: StorageConfig) => Promise<Storage>;

/**
 * Create storage instance for a specific working directory
 */
async function createStorage(workingDirectory: string, config: StorageConfig): Promise<FileStorage> {
  const resolvedDirectory = resolveWorkingDirectory(workingDirectory, config);
  const storage = new FileStorage(resolvedDirectory);
  await storage.initialize();
  return storage;
}

/**
 * Create and configure the MCP server for task management with artifact support
 * 
 * Version 4.0.0 - Complete refactor focusing on task-based orchestration workflows
 * - Removed memory features (deprecated)
 * - Added artifact support (explore, search, plan, build, test)
 * - Each task folder contains task.json + phase artifacts (*.md)
 * - Enhanced caching and performance optimizations
 * - Improved error handling with typed errors
 */
export async function createServer(config: StorageConfig = { useGlobalDirectory: false }): Promise<McpServer> {
  logger.info('Creating MCP server', { config });
  
  // Create MCP server with dynamic version from package.json
  const server = new McpServer({
    name: '@geanatz/cortex-mcp',
    version: getVersion()
  });

  // Common schema for working directory
  const workingDirectorySchema = z.string().describe(getWorkingDirectoryDescription(config));

  // Register task management tools
  server.tool(
    'cortex_list_tasks',
    'List all tasks with hierarchical display. Filter by parentId for subtrees. Perfect for understanding current workflow state and task organization.',
    {
      workingDirectory: workingDirectorySchema,
      parentId: z.string().optional().describe('Filter to tasks under this parent (optional)'),
      showHierarchy: z.boolean().optional().describe('Show tasks in hierarchical tree format (default: true)'),
      includeDone: z.boolean().optional().describe('Include done tasks in results (default: true)')
    },
    async ({ workingDirectory, parentId, showHierarchy, includeDone }) => {
      try {
        const storage = await createStorage(workingDirectory, config);
        const tool = createListTasksTool(storage);
        return await tool.handler({ parentId, showHierarchy, includeDone });
      } catch (error) {
        logger.error('Error in cortex_list_tasks', error);
        return createErrorResponse(error);
      }
    }
  );

  server.tool(
    'cortex_create_task',
    'Create a new task for the orchestration workflow. Task ID is auto-generated from details. Use parentId to create subtasks for hierarchical organization.',
    {
      workingDirectory: workingDirectorySchema,
      details: z.string().describe('Task description - used to generate the task ID (e.g., "Implement authentication" becomes "001-implement-authentication")'),
      parentId: z.string().optional().describe('Parent task ID for creating subtasks (optional - creates top-level task if not specified)'),
      dependsOn: z.array(z.string()).optional().describe('Array of task IDs that must be completed before this task'),
      status: z.enum(['pending', 'in_progress', 'done']).optional().describe('Initial task status (defaults to pending)'),
      tags: z.array(z.string()).optional().describe('Tags for categorization and filtering')
    },
    async ({ workingDirectory, details, parentId, dependsOn, status, tags }) => {
      try {
        const storage = await createStorage(workingDirectory, config);
        const tool = createCreateTaskTool(storage);
        return await tool.handler({ details, parentId, dependsOn, status, tags });
      } catch (error) {
        logger.error('Error in cortex_create_task', error);
        return createErrorResponse(error);
      }
    }
  );

  server.tool(
    'cortex_get_task',
    'Retrieve complete task details including all phase artifacts (explore, search, plan, build, test). Essential for understanding current task state and accumulated knowledge.',
    {
      workingDirectory: workingDirectorySchema,
      id: z.string().describe('The unique identifier of the task to retrieve')
    },
    async ({ workingDirectory, id }) => {
      try {
        const storage = await createStorage(workingDirectory, config);
        const tool = createGetTaskTool(storage);
        return await tool.handler({ id });
      } catch (error) {
        logger.error('Error in cortex_get_task', error);
        return createErrorResponse(error);
      }
    }
  );

  server.tool(
    'cortex_update_task',
    'Update task properties including status, details, dependencies, and tags. Use this to mark progress and update task metadata.',
    {
      workingDirectory: workingDirectorySchema,
      id: z.string().describe('The unique identifier of the task to update'),
      details: z.string().optional().describe('Updated task description (optional)'),
      parentId: z.string().optional().describe('Updated parent task ID for moving between hierarchy levels (optional)'),
      dependsOn: z.array(z.string()).optional().describe('Updated array of task IDs that must be completed before this task'),
      status: z.enum(['pending', 'in_progress', 'done']).optional().describe('Updated task status'),
      tags: z.array(z.string()).optional().describe('Updated tags for categorization and filtering'),
      actualHours: z.number().min(0).optional().describe('Actual time spent on the task in hours')
    },
    async ({ workingDirectory, id, details, parentId, dependsOn, status, tags, actualHours }: {
      workingDirectory: string;
      id: string;
      details?: string;
      parentId?: string;
      dependsOn?: string[];
      status?: 'pending' | 'in_progress' | 'done';
      tags?: string[];
      actualHours?: number;
    }) => {
      try {
        const storage = await createStorage(workingDirectory, config);
        const tool = createUpdateTaskTool(storage);
        return await tool.handler({ id, details, parentId, dependsOn, status, tags, actualHours });
      } catch (error) {
        logger.error('Error in cortex_update_task', error);
        return createErrorResponse(error);
      }
    }
  );

  server.tool(
    'cortex_delete_task',
    'Delete a task and all its children. Requires confirmation to prevent accidental deletion.',
    {
      workingDirectory: workingDirectorySchema,
      id: z.string().describe('The unique identifier of the task to delete'),
      confirm: z.boolean().describe('Must be set to true to confirm deletion (safety measure)')
    },
    async ({ workingDirectory, id, confirm }) => {
      try {
        const storage = await createStorage(workingDirectory, config);
        const tool = createDeleteTaskTool(storage);
        return await tool.handler({ id, confirm });
      } catch (error) {
        logger.error('Error in cortex_delete_task', error);
        return createErrorResponse(error);
      }
    }
  );

  server.tool(
    'cortex_move_task',
    'Move a task to a different parent in the hierarchy. Set newParentId to move under another task, or leave empty to move to top level.',
    {
      workingDirectory: workingDirectorySchema,
      taskId: z.string().describe('The unique identifier of the task to move'),
      newParentId: z.string().optional().describe('The ID of the new parent task (optional - leave empty for top level)')
    },
    async ({ workingDirectory, taskId, newParentId }: { workingDirectory: string; taskId: string; newParentId?: string }) => {
      try {
        const storage = await createStorage(workingDirectory, config);
        const tool = createMoveTaskTool(storage);
        return await tool.handler({ taskId, newParentId });
      } catch (error) {
        logger.error('Error in cortex_move_task', error);
        return createErrorResponse(error);
      }
    }
  );

  // Register artifact tools (15 tools: create/update/delete for each phase)
  const artifactTools = createArtifactTools(config, createStorage);
  for (const tool of artifactTools) {
    server.tool(tool.name, tool.description, tool.schema, tool.handler);
  }

  logger.info('MCP server created successfully', { 
    taskTools: 6, 
    artifactTools: artifactTools.length 
  });

  return server;
}
