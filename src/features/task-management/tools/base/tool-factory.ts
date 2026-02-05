/**
 * Factory functions for creating MCP tools
 * Provides generic and specialized tool creation utilities
 */

import { z } from 'zod';
import { ToolDefinition, FactoryConfig, TaskOperationConfig, ArtifactOperationConfig } from './types.js';
import { withValidation, withErrorHandling, compose } from './handlers.js';
import { 
  createTaskIdParam,
  createWorkingDirectoryParam
} from './schemas.js';
import { McpToolHandler, McpToolResponse } from '../../../../types/common.js';
import { Storage } from '../../storage/storage.js';
import { createErrorResponse } from '../../../../utils/response-builder.js';

/**
 * Generic tool factory function
 * Creates a standardized tool with validation, error handling, and metadata
 * 
 * @template TInput - The input type for the tool
 * @param config - Configuration for the tool
 * @returns A complete tool definition
 */
export function createTool<TInput extends Record<string, unknown>>(
  config: FactoryConfig<TInput>
): ToolDefinition<TInput> {
  // Create a handler with error handling
  const errorHandler = withErrorHandling(config.handler);
  
  return {
    name: config.name,
    description: config.description,
    parameters: config.parameters,
    handler: errorHandler,
  };
}

/**
 * Creates a task operation tool (create, update, delete, etc.)
 * Specialized factory for task-related operations
 * 
 * @template TInput - The input type for the operation
 * @param operation - The operation type ('create', 'update', 'delete', etc.)
 * @param storage - Storage instance for data operations
 * @param handler - The handler function to execute the operation
 * @returns A complete tool definition for the task operation
 */
export function createTaskOperationTool<TInput extends Record<string, unknown>>(
  operation: string,
  storage: Storage,
  handler: (input: TInput, storage: Storage) => Promise<McpToolResponse>
): ToolDefinition<TInput> {
  // Define parameters based on operation type
  let parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
  };

  switch (operation.toLowerCase()) {
    case 'create':
      parameters = {
        type: 'object',
        properties: {
          workingDirectory: { type: 'string', description: 'Working directory for the operation' },
          details: { type: 'string', description: 'Task details and requirements' },
          parentId: { type: 'string', description: 'Parent task ID (optional)', nullable: true },
          status: { type: 'string', enum: ['pending', 'in_progress', 'done'], default: 'pending' },
          tags: { type: 'array', items: { type: 'string' }, description: 'Task tags for categorization' },
        },
        required: ['workingDirectory', 'details'],
      };
      break;
      
    case 'update':
      parameters = {
        type: 'object',
          properties: {
            workingDirectory: { type: 'string', description: 'Working directory for the operation' },
            taskId: { type: 'string', description: 'Task ID to update' },
            details: { type: 'string', description: 'Updated task details' },
            parentId: { type: 'string', description: 'New parent task ID (optional)', nullable: true },
            status: { type: 'string', enum: ['pending', 'in_progress', 'done'] },
            tags: { type: 'array', items: { type: 'string' }, description: 'Updated task tags' },
            actualHours: { type: 'number', description: 'Actual hours spent on the task' },
          },
        required: ['workingDirectory', 'taskId'],
      };
      break;
      
    case 'delete':
      parameters = {
        type: 'object',
          properties: {
            workingDirectory: { type: 'string', description: 'Working directory for the operation' },
            taskId: { type: 'string', description: 'Task ID to delete' },
            confirm: { type: 'boolean', const: true, description: 'Must be true to confirm deletion' },
          },
        required: ['workingDirectory', 'taskId', 'confirm'],
      };
      break;
      
    case 'get':
      parameters = {
        type: 'object',
          properties: {
            workingDirectory: { type: 'string', description: 'Working directory for the operation' },
            taskId: { type: 'string', description: 'Task ID to retrieve' },
          },
        required: ['workingDirectory', 'taskId'],
      };
      break;
      
    case 'list':
      parameters = {
        type: 'object',
          properties: {
            workingDirectory: { type: 'string', description: 'Working directory for the operation' },
            parentId: { type: 'string', description: 'Filter by parent task ID (optional)', nullable: true },
            status: { 
              oneOf: [
                { type: 'string', enum: ['pending', 'in_progress', 'done'] },
                { type: 'array', items: { type: 'string', enum: ['pending', 'in_progress', 'done'] } }
              ],
              description: 'Filter by status (optional)'
            },
            tags: { type: 'array', items: { type: 'string' }, description: 'Filter by tags (optional)' },
          },
        required: ['workingDirectory'],
      };
      break;
      
    default:
      parameters = {
        type: 'object',
        properties: {
          workingDirectory: { type: 'string', description: 'Working directory for the operation' },
          taskId: { type: 'string', description: 'Task ID for the operation' },
        },
        required: ['workingDirectory', 'taskId'],
      };
  }

  // Create a handler that wraps the provided handler with storage
  const wrappedHandler: (input: TInput) => Promise<McpToolResponse> = async (input: TInput) => {
    return await handler(input, storage);
  };

  return createTool<TInput>({
    name: `cortex_${operation}_task`,
    description: `Perform ${operation} operation on a task`,
    parameters,
    handler: wrappedHandler,
    options: {
      requiresConfirmation: operation.toLowerCase() === 'delete',
      categories: ['tasks'],
    }
  });
}

/**
 * Creates an artifact operation tool (create, update, delete, etc.)
 * Specialized factory for artifact-related operations
 * 
 * @template TInput - The input type for the operation
 * @param phase - The artifact phase ('explore', 'plan', 'build', etc.)
 * @param operation - The operation type ('create', 'update', 'delete', etc.)
 * @param storage - Storage instance for data operations
 * @param handler - The handler function to execute the operation
 * @returns A complete tool definition for the artifact operation
 */
export function createArtifactOperationTool<TInput extends Record<string, unknown>>(
  phase: string,
  operation: string,
  storage: Storage,
  handler: (input: TInput, storage: Storage) => Promise<McpToolResponse>
): ToolDefinition<TInput> {
  // Define parameters based on phase and operation type
  let parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
  };

  switch (operation.toLowerCase()) {
    case 'create':
      parameters = {
        type: 'object',
          properties: {
            workingDirectory: { type: 'string', description: 'Working directory for the operation' },
            taskId: { type: 'string', description: 'Task ID for the artifact' },
            phase: { type: 'string', const: phase, description: `Artifact phase: ${phase}` },
            content: { type: 'string', description: 'Artifact content in markdown format' },
            status: { 
              type: 'string', 
              enum: ['pending', 'in-progress', 'completed', 'failed', 'skipped'], 
              default: 'completed',
              description: 'Artifact status'
            },
            retries: { type: 'number', description: 'Number of retry attempts' },
            error: { type: 'string', description: 'Error message if status is failed' },
          },
        required: ['workingDirectory', 'taskId', 'phase', 'content'],
      };
      break;
      
    case 'update':
      parameters = {
        type: 'object',
          properties: {
            workingDirectory: { type: 'string', description: 'Working directory for the operation' },
            taskId: { type: 'string', description: 'Task ID for the artifact' },
            phase: { type: 'string', const: phase, description: `Artifact phase: ${phase}` },
            content: { type: 'string', description: 'Updated artifact content in markdown format' },
            status: { 
              type: 'string', 
              enum: ['pending', 'in-progress', 'completed', 'failed', 'skipped'],
              description: 'Updated artifact status'
            },
            retries: { type: 'number', description: 'Number of retry attempts' },
            error: { type: 'string', description: 'Error message if status is failed' },
          },
        required: ['workingDirectory', 'taskId', 'phase'],
      };
      break;
      
    case 'delete':
      parameters = {
        type: 'object',
          properties: {
            workingDirectory: { type: 'string', description: 'Working directory for the operation' },
            taskId: { type: 'string', description: 'Task ID for the artifact' },
            phase: { type: 'string', const: phase, description: `Artifact phase: ${phase}` },
            confirm: { type: 'boolean', const: true, description: 'Must be true to confirm deletion' },
          },
        required: ['workingDirectory', 'taskId', 'phase', 'confirm'],
      };
      break;
      
    case 'get':
       parameters = {
         type: 'object',
         properties: {
           workingDirectory: { type: 'string', description: 'Working directory for the operation' },
           taskId: { type: 'string', description: 'Task ID for the artifact' },
           phase: { type: 'string', const: phase, description: `Artifact phase: ${phase}` },
         },
         required: ['workingDirectory', 'taskId', 'phase'],
       };
      break;
      
    default:
      parameters = {
        type: 'object',
        properties: {
          workingDirectory: { type: 'string', description: 'Working directory for the operation' },
          taskId: { type: 'string', description: 'Task ID for the artifact' },
          phase: { type: 'string', const: phase, description: `Artifact phase: ${phase}` },
        },
        required: ['workingDirectory', 'taskId', 'phase'],
      };
  }

  // Create a handler that wraps the provided handler with storage
  const wrappedHandler: (input: TInput) => Promise<McpToolResponse> = async (input: TInput) => {
    return await handler(input, storage);
  };

  return createTool<TInput>({
    name: `cortex_${phase}_${operation}_artifact`,
    description: `Perform ${operation} operation on ${phase} artifact`,
    parameters,
    handler: wrappedHandler,
    options: {
      requiresConfirmation: operation.toLowerCase() === 'delete',
      categories: ['artifacts', phase],
    }
  });
}

/**
 * Creates a tool with storage dependency injection
 * Provides a convenient way to create tools that need access to storage
 * 
 * @template TInput - The input type for the tool
 * @param config - Configuration for the tool
 * @param storage - Storage instance to inject
 * @returns A complete tool definition with storage access
 */
export function createToolWithStorage<TInput extends Record<string, unknown>>(
  config: Omit<FactoryConfig<TInput>, 'handler'> & { 
    handler: (input: TInput, storage: Storage) => Promise<McpToolResponse> 
  },
  storage: Storage
): ToolDefinition<TInput> {
  // Wrap the handler to inject storage
  const wrappedHandler: (input: TInput) => Promise<McpToolResponse> = async (input: TInput) => {
    try {
      return await config.handler(input, storage);
    } catch (error) {
      return createErrorResponse(error);
    }
  };

  return createTool({
    ...config,
    handler: wrappedHandler,
  });
}

/**
 * Creates a tool with common task parameters
 * Provides a convenient way to create tools that operate on tasks
 * 
 * @template TInput - The extended input type for the tool
 * @param baseConfig - Base configuration for the tool
 * @param additionalParams - Additional parameters specific to the tool
 * @returns A complete tool definition with common task parameters
 */
export function createTaskTool<TInput extends Record<string, unknown>>(
  baseConfig: Omit<FactoryConfig<TInput>, 'parameters'>,
  additionalParams: Record<string, unknown> = {}
): ToolDefinition<TInput> {
  const parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
  } = {
    type: 'object',
    properties: {
      workingDirectory: { type: 'string', description: 'Working directory for the operation' },
      taskId: { type: 'string', description: 'Task ID for the operation' },
      ...additionalParams,
    },
    required: ['workingDirectory', 'taskId', ...Object.keys(additionalParams)],
  };

  return createTool({
    ...baseConfig,
    parameters,
  });
}

/**
 * Creates a tool with common artifact parameters
 * Provides a convenient way to create tools that operate on artifacts
 * 
 * @template TInput - The extended input type for the tool
 * @param baseConfig - Base configuration for the tool
 * @param phase - The artifact phase
 * @param additionalParams - Additional parameters specific to the tool
 * @returns A complete tool definition with common artifact parameters
 */
export function createArtifactTool<TInput extends Record<string, unknown>>(
  baseConfig: Omit<FactoryConfig<TInput>, 'parameters'>,
  phase: string,
  additionalParams: Record<string, unknown> = {}
): ToolDefinition<TInput> {
  const parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
  } = {
    type: 'object',
    properties: {
      workingDirectory: { type: 'string', description: 'Working directory for the operation' },
      taskId: { type: 'string', description: 'Task ID for the operation' },
      phase: { type: 'string', const: phase, description: `Artifact phase: ${phase}` },
      ...additionalParams,
    },
    required: ['workingDirectory', 'taskId', 'phase', ...Object.keys(additionalParams)],
  };

  return createTool({
    ...baseConfig,
    parameters,
  });
}