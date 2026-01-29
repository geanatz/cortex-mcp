import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { FileStorage } from './features/task-management/storage/file-storage.js';
import { FileStorage as MemoryFileStorage } from './features/agent-memories/storage/file-storage.js';
import { getVersion } from './utils/version.js';
import { StorageConfig, resolveWorkingDirectory, getWorkingDirectoryDescription } from './utils/storage-config.js';
import { createErrorResponse } from './utils/error-handler.js';
import { z } from 'zod';

// Task tools
import { createListTasksTool } from './features/task-management/tools/tasks/list.js';
import { createCreateTaskTool } from './features/task-management/tools/tasks/create.js';
import { createGetTaskTool } from './features/task-management/tools/tasks/get.js';
import { createUpdateTaskTool } from './features/task-management/tools/tasks/update.js';
import { createDeleteTaskTool } from './features/task-management/tools/tasks/delete.js';
import { createMoveTaskTool } from './features/task-management/tools/tasks/move.js';

// Memory tools
import { createCreateMemoryTool } from './features/agent-memories/tools/memories/create.js';
import { createSearchMemoriesTool } from './features/agent-memories/tools/memories/search.js';
import { createGetMemoryTool } from './features/agent-memories/tools/memories/get.js';
import { createListMemoriesTool } from './features/agent-memories/tools/memories/list.js';
import { createUpdateMemoryTool } from './features/agent-memories/tools/memories/update.js';
import { createDeleteMemoryTool } from './features/agent-memories/tools/memories/delete.js';

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
 * Create memory storage instance for a specific working directory
 */
async function createMemoryStorage(workingDirectory: string, config: StorageConfig): Promise<MemoryFileStorage> {
  const resolvedDirectory = resolveWorkingDirectory(workingDirectory, config);
  const storage = new MemoryFileStorage(resolvedDirectory);
  await storage.initialize();
  return storage;
}

/**
 * Create and configure the MCP server for task management and agent memories
 */
export async function createServer(config: StorageConfig = { useGlobalDirectory: false }): Promise<McpServer> {
  // Create MCP server with dynamic version from package.json
  const server = new McpServer({
    name: '@geanatz/cortex-mcp',
    version: getVersion()
  });

  // Register task management tools
  server.tool(
    'list_tasks',
    'Explore and organize your task portfolio with intelligent filtering and comprehensive progress tracking. View all tasks or focus on specific subtrees, perfect for sprint planning, progress reviews, and maintaining productivity momentum.',
    {
      workingDirectory: z.string().describe(getWorkingDirectoryDescription(config)),
      parentId: z.string().optional().describe('Filter to tasks under this parent (optional)'),
      showHierarchy: z.boolean().optional().describe('Show tasks in hierarchical tree format (default: true)'),
      includeCompleted: z.boolean().optional().describe('Include completed tasks in results (default: true)')
    },
    async ({ workingDirectory, parentId, showHierarchy, includeCompleted }) => {
      try {
        const storage = await createStorage(workingDirectory, config);
        const tool = createListTasksTool(storage);
        return await tool.handler({ parentId, showHierarchy, includeCompleted });
      } catch (error) {
        return createErrorResponse(error);
      }
    }
  );

  server.tool(
    'create_task',
    'Transform goals into actionable, trackable tasks. Build structured workflows that break down complex work into manageable components with unlimited hierarchy depth.',
    {
      workingDirectory: z.string().describe(getWorkingDirectoryDescription(config)),
      details: z.string().describe('Task description - used to generate the task ID (e.g., "Implement authentication" becomes "001-implement-authentication")'),
      parentId: z.string().optional().describe('Parent task ID for unlimited nesting (optional - creates top-level task if not specified)'),
      dependsOn: z.array(z.string()).optional().describe('Array of task IDs that must be completed before this task'),
      status: z.enum(['pending', 'in-progress', 'blocked', 'done']).optional().describe('Initial task status (defaults to pending)'),
      tags: z.array(z.string()).optional().describe('Tags for categorization and filtering')
    },
    async ({ workingDirectory, details, parentId, dependsOn, status, tags }) => {
      try {
        const storage = await createStorage(workingDirectory, config);
        const tool = createCreateTaskTool(storage);
        return await tool.handler({ details, parentId, dependsOn, status, tags });
      } catch (error) {
        return createErrorResponse(error);
      }
    }
  );

  server.tool(
    'get_task',
    'Deep-dive into task specifics with comprehensive details including progress status, creation history, and full context. Essential for task analysis, status reporting, and understanding dependencies when planning work or conducting progress reviews.',
    {
      workingDirectory: z.string().describe(getWorkingDirectoryDescription(config)),
      id: z.string().describe('The unique identifier of the task to retrieve')
    },
    async ({ workingDirectory, id }) => {
      try {
        const storage = await createStorage(workingDirectory, config);
        const tool = createGetTaskTool(storage);
        return await tool.handler({ id });
      } catch (error) {
        return createErrorResponse(error);
      }
    }
  );

  server.tool(
    'update_task',
    'Adapt and refine tasks with comprehensive updates including dependencies, status, tags, and time tracking. Keep your workflow current and accurate with advanced task management capabilities including unlimited hierarchy movement.',
    {
      workingDirectory: z.string().describe(getWorkingDirectoryDescription(config)),
      id: z.string().describe('The unique identifier of the task to update'),
      details: z.string().optional().describe('Updated task description (optional)'),
      completed: z.boolean().optional().describe('Mark task as completed (true) or incomplete (false) (optional)'),
      parentId: z.string().optional().describe('Updated parent task ID for moving between hierarchy levels (optional - use null/empty to move to top level)'),
      dependsOn: z.array(z.string()).optional().describe('Updated array of task IDs that must be completed before this task'),
      status: z.enum(['pending', 'in-progress', 'blocked', 'done']).optional().describe('Updated task status'),
      tags: z.array(z.string()).optional().describe('Updated tags for categorization and filtering'),
      actualHours: z.number().min(0).optional().describe('Actual time spent on the task in hours')
    },
    async ({ workingDirectory, id, details, completed, parentId, dependsOn, status, tags, actualHours }: {
      workingDirectory: string;
      id: string;
      details?: string;
      completed?: boolean;
      parentId?: string;
      dependsOn?: string[];
      status?: 'pending' | 'in-progress' | 'blocked' | 'done';
      tags?: string[];
      actualHours?: number;
    }) => {
      try {
        const storage = await createStorage(workingDirectory, config);
        const tool = createUpdateTaskTool(storage);
        return await tool.handler({ id, details, completed, parentId, dependsOn, status, tags, actualHours });
      } catch (error) {
        return createErrorResponse(error);
      }
    }
  );

  server.tool(
    'delete_task',
    'Streamline your workflow by safely removing obsolete or completed tasks with built-in confirmation protection. Maintain a clean, focused task environment while preventing accidental data loss through required confirmation safeguards.',
    {
      workingDirectory: z.string().describe(getWorkingDirectoryDescription(config)),
      id: z.string().describe('The unique identifier of the task to delete'),
      confirm: z.boolean().describe('Must be set to true to confirm deletion (safety measure)')
    },
    async ({ workingDirectory, id, confirm }) => {
      try {
        const storage = await createStorage(workingDirectory, config);
        const tool = createDeleteTaskTool(storage);
        return await tool.handler({ id, confirm });
      } catch (error) {
        return createErrorResponse(error);
      }
    }
  );

  server.tool(
    'move_task',
    'Move a task to a different parent in the hierarchy. Set newParentId to move under another task, or leave empty to move to top level. Supports unlimited nesting depth.',
    {
      workingDirectory: z.string().describe(getWorkingDirectoryDescription(config)),
      taskId: z.string().describe('The unique identifier of the task to move'),
      newParentId: z.string().optional().describe('The ID of the new parent task (optional - leave empty for top level)')
    },
    async ({ workingDirectory, taskId, newParentId }: { workingDirectory: string; taskId: string; newParentId?: string }) => {
      try {
        const storage = await createStorage(workingDirectory, config);
        const tool = createMoveTaskTool(storage);
        return await tool.handler({ taskId, newParentId });
      } catch (error) {
        return createErrorResponse(error);
      }
    }
  );

  // Register agent memory management tools
  server.tool(
    'create_memory',
    'Capture and preserve important information, insights, or context as searchable memories with intelligent file-based storage. Ideal for building a knowledge base of user preferences, technical decisions, project context, or any information you want to remember and retrieve later with organized categorization.',
    {
      workingDirectory: z.string().describe(getWorkingDirectoryDescription(config)),
      title: z.string().describe('Short title for the memory (max 50 characters for better file organization)'),
      content: z.string().describe('Detailed memory content/text (no character limit)'),
      metadata: z.record(z.any()).optional().describe('Optional metadata as key-value pairs for additional context'),
      category: z.string().optional().describe('Optional category to organize memories (e.g., "user_preferences", "project_context")')
    },
    async ({ workingDirectory, title, content, metadata, category }) => {
      try {
        const storage = await createMemoryStorage(workingDirectory, config);
        const tool = createCreateMemoryTool(storage);
        return await tool.handler({ title, content, metadata, category });
      } catch (error) {
        return createErrorResponse(error);
      }
    }
  );

  server.tool(
    'search_memories',
    'Intelligently search through your stored memories using advanced text matching algorithms to quickly find relevant information. Features multi-field search across titles, content, and metadata with customizable relevance scoring - perfect for retrieving past decisions, preferences, or contextual information when you need it most.',
    {
      workingDirectory: z.string().describe(getWorkingDirectoryDescription(config)),
      query: z.string().describe('The search query text to find matching memories'),
      limit: z.number().min(1).max(100).optional().describe('Maximum number of results to return (default: 10)'),
      threshold: z.number().min(0).max(1).optional().describe('Minimum relevance threshold 0-1 (default: 0.3)'),
      category: z.string().optional().describe('Filter results to memories in this specific category')
    },
    async ({ workingDirectory, query, limit, threshold, category }: {
      workingDirectory: string;
      query: string;
      limit?: number;
      threshold?: number;
      category?: string;
    }) => {
      try {
        const storage = await createMemoryStorage(workingDirectory, config);
        const tool = createSearchMemoriesTool(storage);
        return await tool.handler({ query, limit, threshold, category });
      } catch (error) {
        return createErrorResponse(error);
      }
    }
  );

  server.tool(
    'get_memory',
    'Access comprehensive memory details including full content, metadata, creation history, and categorization. Essential for reviewing stored knowledge, understanding context, and retrieving complete information when making decisions or referencing past insights.',
    {
      workingDirectory: z.string().describe(getWorkingDirectoryDescription(config)),
      id: z.string().describe('The unique identifier of the memory to retrieve')
    },
    async ({ workingDirectory, id }) => {
      try {
        const storage = await createMemoryStorage(workingDirectory, config);
        const tool = createGetMemoryTool(storage);
        return await tool.handler({ id });
      } catch (error) {
        return createErrorResponse(error);
      }
    }
  );

  server.tool(
    'list_memories',
    'Browse and explore your knowledge repository with organized memory listings and flexible category filtering. Perfect for reviewing stored information, discovering patterns in your knowledge base, and maintaining awareness of your accumulated insights and decisions.',
    {
      workingDirectory: z.string().describe(getWorkingDirectoryDescription(config)),
      category: z.string().optional().describe('Filter to memories in this specific category'),
      limit: z.number().min(1).max(1000).optional().describe('Maximum number of memories to return (default: 50)')
    },
    async ({ workingDirectory, category, limit }: {
      workingDirectory: string;
      category?: string;
      limit?: number;
    }) => {
      try {
        const storage = await createMemoryStorage(workingDirectory, config);
        const tool = createListMemoriesTool(storage);
        return await tool.handler({ category, limit });
      } catch (error) {
        return createErrorResponse(error);
      }
    }
  );

  server.tool(
    'update_memory',
    'Evolve and refine your stored knowledge with flexible updates to content, categorization, and metadata. Keep your memory repository current and accurate as understanding deepens, ensuring your knowledge base remains a reliable source of up-to-date insights and decisions.',
    {
      workingDirectory: z.string().describe(getWorkingDirectoryDescription(config)),
      id: z.string().describe('The unique identifier of the memory to update'),
      title: z.string().optional().describe('New title for the memory (max 50 characters for better file organization)'),
      content: z.string().optional().describe('New detailed content for the memory (no character limit)'),
      metadata: z.record(z.any()).optional().describe('New metadata as key-value pairs (replaces existing metadata)'),
      category: z.string().optional().describe('New category for organizing the memory')
    },
    async ({ workingDirectory, id, title, content, metadata, category }: {
      workingDirectory: string;
      id: string;
      title?: string;
      content?: string;
      metadata?: Record<string, any>;
      category?: string;
    }) => {
      try {
        const storage = await createMemoryStorage(workingDirectory, config);
        const tool = createUpdateMemoryTool(storage);
        return await tool.handler({ id, title, content, metadata, category });
      } catch (error) {
        return createErrorResponse(error);
      }
    }
  );

  server.tool(
    'delete_memory',
    'Safely remove outdated or irrelevant memories from your knowledge repository with built-in confirmation safeguards. Maintain a clean, focused memory collection while protecting against accidental loss of valuable information through required confirmation protocols.',
    {
      workingDirectory: z.string().describe(getWorkingDirectoryDescription(config)),
      id: z.string().describe('The unique identifier of the memory to delete'),
      confirm: z.boolean().describe('Must be set to true to confirm deletion (safety measure)')
    },
    async ({ workingDirectory, id, confirm }) => {
      try {
        const storage = await createMemoryStorage(workingDirectory, config);
        const tool = createDeleteMemoryTool(storage);
        return await tool.handler({ id, confirm });
      } catch (error) {
        return createErrorResponse(error);
      }
    }
  );

  return server;
}
