import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { FileStorage } from './features/task-management/storage/file-storage.js';
import { Storage } from './features/task-management/storage/storage.js';
import { getVersion } from './utils/version.js';
import { StorageConfig, resolveWorkingDirectory } from './utils/storage-config.js';
import { createLogger } from './utils/logger.js';

// Tool factories
import { createTaskTools } from './features/task-management/tools/tasks/index.js';
import { createArtifactTools } from './features/task-management/tools/artifacts/index.js';

const logger = createLogger('server');

/**
 * Storage factory type — creates an initialized Storage for a given working directory.
 */
type StorageFactory = (workingDirectory: string, config: StorageConfig) => Promise<Storage>;

/**
 * Create and initialize a FileStorage instance for a specific working directory.
 */
async function createStorage(workingDirectory: string, config: StorageConfig): Promise<FileStorage> {
  const resolvedDirectory = resolveWorkingDirectory(workingDirectory, config);
  const storage = new FileStorage(resolvedDirectory);
  await storage.initialize();
  return storage;
}

/**
 * Create and configure the MCP server for task management with artifact support.
 *
 * All tools follow a uniform registration pattern:
 * 1. Factory functions return ToolDefinition[] with name, description, parameters, handler
 * 2. Each tool creates its own storage instance per-call via the shared StorageFactory
 * 3. Tools are registered in a single loop — no inline tool declarations
 */
export async function createServer(config: StorageConfig = { useGlobalDirectory: false }): Promise<McpServer> {
  logger.info('Creating MCP server', { config });

  const server = new McpServer({
    name: '@geanatz/cortex-mcp',
    version: getVersion()
  });

  // Build all tool definitions from factories
  const taskTools = createTaskTools(config, createStorage);
  const artifactTools = createArtifactTools(config, createStorage);
  const allTools = [...taskTools, ...artifactTools];

  // Register every tool uniformly
  for (const tool of allTools) {
    server.tool(tool.name, tool.description, tool.parameters, tool.handler);
  }

  logger.info('MCP server created successfully', {
    taskTools: taskTools.length,
    artifactTools: artifactTools.length
  });

  return server;
}
