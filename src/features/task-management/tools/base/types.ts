/**
 * Base type definitions for MCP tools
 * Provides common interfaces and types for tool development
 */

import { McpToolHandler, McpToolResponse } from '../../../../types/common.js';
import { Storage } from '../../storage/storage.js';

/**
 * Base input interface for all tools
 * Contains common parameters that most tools require
 */
export interface BaseToolInput {
  /** Working directory for the operation */
  readonly workingDirectory: string;
  /** Task ID for the operation */
  readonly taskId: string;
}

/**
 * Extended base input with optional parent ID
 */
export interface BaseToolWithParentInput extends BaseToolInput {
  /** Optional parent task ID */
  readonly parentId?: string;
}

/**
 * Input interface with confirmation parameter
 */
export interface ConfirmableToolInput extends BaseToolInput {
  /** Confirmation flag for destructive operations */
  readonly confirm: boolean;
}

/**
 * Tool definition interface for MCP tool structure
 * Defines the contract for all MCP tools in the system
 */
export interface ToolDefinition<TInput = Record<string, unknown>> {
  /** Unique name of the tool */
  readonly name: string;
  /** Description of what the tool does */
  readonly description: string;
  /** Parameters accepted by the tool */
  readonly parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
  };
  /** Handler function that executes the tool */
  readonly handler: McpToolHandler<TInput>;
}

/**
 * Tool handler type for handler functions
 * Represents a function that takes input and returns an MCP response
 */
export type ToolHandler<TInput = Record<string, unknown>, TOutput = McpToolResponse> = (
  input: TInput
) => Promise<TOutput>;

/**
 * Storage-aware interface for tools that depend on storage
 * Provides access to the storage system
 */
export interface StorageAware {
  /** Storage instance for data persistence */
  readonly storage: Storage;
}

/**
 * Factory configuration interface for tool factory configuration
 * Defines the configuration options for creating tools
 */
export interface FactoryConfig<TInput = Record<string, unknown>> {
  /** Name of the tool */
  readonly name: string;
  /** Description of the tool */
  readonly description: string;
  /** Parameter schema for validation */
  readonly parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
  };
  /** Handler function for the tool */
  readonly handler: ToolHandler<TInput>;
  /** Additional configuration options */
  readonly options?: {
    /** Whether the tool requires confirmation for destructive operations */
    readonly requiresConfirmation?: boolean;
    /** Whether the tool requires authentication */
    readonly requiresAuth?: boolean;
    /** Categories for organizing tools */
    readonly categories?: readonly string[];
    /** Example usage of the tool */
    readonly examples?: readonly string[];
  };
}

/**
 * Configuration for task operation tools
 */
export interface TaskOperationConfig<TInput = Record<string, unknown>> {
  /** Operation name (e.g., 'create', 'update', 'delete') */
  readonly operation: string;
  /** Storage instance */
  readonly storage: Storage;
  /** Additional configuration */
  readonly config?: {
    /** Whether the operation requires confirmation */
    readonly requiresConfirmation?: boolean;
    /** Additional parameters for the operation */
    readonly additionalParams?: Record<string, unknown>;
  };
}

/**
 * Configuration for artifact operation tools
 */
export interface ArtifactOperationConfig<TInput = Record<string, unknown>> {
  /** Artifact phase (e.g., 'explore', 'plan', 'build') */
  readonly phase: string;
  /** Operation name (e.g., 'create', 'update', 'delete') */
  readonly operation: string;
  /** Storage instance */
  readonly storage: Storage;
  /** Additional configuration */
  readonly config?: {
    /** Whether the operation requires confirmation */
    readonly requiresConfirmation?: boolean;
    /** Additional parameters for the operation */
    readonly additionalParams?: Record<string, unknown>;
  };
}