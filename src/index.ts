#!/usr/bin/env node

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';
import { getVersionString } from './utils/version.js';
import { parseCommandLineArgs } from './utils/storage-config.js';
import { logger, LogLevel } from './utils/logger.js';

/**
 * Main entry point for the MCP task management server
 * Uses STDIO transport for communication with MCP clients
 */
async function main() {
  try {
    // Parse command-line arguments
    const storageConfig = parseCommandLineArgs();

    // Set log level based on environment
    if (process.env.DEBUG === 'true') {
      logger.setLevel(LogLevel.DEBUG);
    }

    // Create the MCP server with configuration
    const server = await createServer(storageConfig);

    // Create STDIO transport
    const transport = new StdioServerTransport();

    // Connect server to transport
    await server.connect(transport);

    // Log server start (to stderr so it doesn't interfere with MCP communication)
    logger.info(`🚀 Cortex MCP Server ${getVersionString()} started successfully`);

    // Show storage mode
    if (storageConfig.useGlobalDirectory) {
      logger.info('🌐 Global directory mode: Using ~/.cortex/ for all data storage');
    } else {
      logger.info('📁 Project-specific mode: Using .cortex/ within each working directory');
    }

    logger.info('📋 Task Management: list, create, get, update, delete, move');
    logger.info('🧠 Artifact Support: explore, search, plan, build, test phases');
    logger.info('💡 Use cortex_list_tasks to get started!');
  } catch (error) {
    logger.error('❌ Failed to start MCP server', error);
    process.exit(1);
  }
}
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  logger.info('👋 Shutting down MCP server...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('👋 Shutting down MCP server...');
  process.exit(0);
});

// Start the server
main().catch((error) => {
  logger.error('❌ Unhandled error', error);
  process.exit(1);
});
