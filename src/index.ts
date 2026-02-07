#!/usr/bin/env node

// CRITICAL: Set up error handlers FIRST, before any imports that could fail
// This prevents the process from crashing on uncaught errors
process.on('uncaughtException', (error) => {
  console.error('[FATAL] Uncaught exception:', error);
  // Don't exit immediately - give stderr time to flush
  setTimeout(() => process.exit(1), 100);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[FATAL] Unhandled rejection at:', promise, 'reason:', reason);
  // Don't exit immediately - give stderr time to flush
  setTimeout(() => process.exit(1), 100);
});

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';
import { getVersionString } from './utils/version.js';
import { parseCommandLineArgs } from './utils/storage-config.js';
import { logger, LogLevel } from './utils/logger.js';

async function main() {
  try {
    const storageConfig = parseCommandLineArgs();

    if (process.env.DEBUG === 'true') {
      logger.setLevel(LogLevel.DEBUG);
    }

    const server = await createServer(storageConfig);
    const transport = new StdioServerTransport();
    
    // Connect to transport with error handling
    await server.connect(transport);

    logger.info(`Cortex MCP Server ${getVersionString()} started successfully`);

    if (storageConfig.useGlobalDirectory) {
      logger.info('Global directory mode: Using ~/.cortex/ for all data storage');
    } else {
      logger.info('Project-specific mode: Using .cortex/ within each working directory');
    }

    logger.info('Task Management: list, create, get, update, delete');
    logger.info('Artifact Support: explore, search, plan, build, test phases');
    logger.info('Use list_tasks to get started!');
  } catch (error) {
    logger.error('Failed to start MCP server', error);
    // Give logger time to write to stderr before exiting
    setTimeout(() => process.exit(1), 100);
  }
}

process.on('SIGINT', () => {
  logger.info('Shutting down MCP server...');
  setTimeout(() => process.exit(0), 50);
});

process.on('SIGTERM', () => {
  logger.info('Shutting down MCP server...');
  setTimeout(() => process.exit(0), 50);
});

main().catch((error) => {
  logger.error('Unhandled error in main', error);
  setTimeout(() => process.exit(1), 100);
});
