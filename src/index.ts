#!/usr/bin/env node

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
    await server.connect(transport);

    logger.info(`Cortex MCP Server ${getVersionString()} started successfully`);

    if (storageConfig.useGlobalDirectory) {
      logger.info('Global directory mode: Using ~/.cortex/ for all data storage');
    } else {
      logger.info('Project-specific mode: Using .cortex/ within each working directory');
    }

    logger.info('Task Management: list, create, get, update, delete, move');
    logger.info('Artifact Support: explore, search, plan, build, test phases');
    logger.info('Use list_tasks to get started!');
  } catch (error) {
    logger.error('Failed to start MCP server', error);
    process.exit(1);
  }
}

process.on('SIGINT', () => {
  logger.info('Shutting down MCP server...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Shutting down MCP server...');
  process.exit(0);
});

main().catch((error) => {
  logger.error('Unhandled error', error);
  process.exit(1);
});
