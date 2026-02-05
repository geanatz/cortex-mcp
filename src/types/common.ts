/**
 * Common type definitions used throughout the application
 * Provides strong typing for MCP responses and tool definitions
 */

/**
 * MCP Tool response content item
 * Note: Includes index signature for MCP SDK compatibility
 */
export interface McpTextContent {
  type: 'text';
  text: string;
  [x: string]: unknown;
}

/**
 * Standard MCP tool response structure
 * Note: Includes index signature for MCP SDK compatibility
 */
export interface McpToolResponse {
  content: McpTextContent[];
  isError?: boolean;
  [x: string]: unknown;
}

/**
 * Success response helper type
 */
export type McpSuccessResponse = McpToolResponse & { isError?: false };

/**
 * Error response helper type
 */
export type McpErrorResponse = McpToolResponse & { isError: true };

/**
 * Generic async handler function type
 */
export type AsyncHandler<TParams, TResult> = (params: TParams) => Promise<TResult>;

/**
 * MCP tool handler type
 */
export type McpToolHandler<TParams = Record<string, unknown>> = AsyncHandler<TParams, McpToolResponse>;

/**
 * Base tool definition interface
 */
export interface BaseTool<TParams = Record<string, unknown>> {
  readonly name: string;
  readonly description: string;
  readonly handler: McpToolHandler<TParams>;
}

/**
 * Result type for operations that can succeed or fail
 */
export type Result<T, E = Error> = 
  | { readonly success: true; readonly data: T }
  | { readonly success: false; readonly error: E };

/**
 * Create a success result
 */
export function success<T>(data: T): Result<T, never> {
  return { success: true, data };
}

/**
 * Create a failure result
 */
export function failure<E>(error: E): Result<never, E> {
  return { success: false, error };
}

/**
 * Check if result is success
 */
export function isSuccess<T, E>(result: Result<T, E>): result is { success: true; data: T } {
  return result.success;
}

/**
 * Check if result is failure
 */
export function isFailure<T, E>(result: Result<T, E>): result is { success: false; error: E } {
  return !result.success;
}

/**
 * Pagination parameters
 */
export interface PaginationParams {
  readonly limit?: number;
  readonly offset?: number;
}

/**
 * Paginated result
 */
export interface PaginatedResult<T> {
  readonly items: readonly T[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
  readonly hasMore: boolean;
}

/**
 * Deep readonly type helper
 */
export type DeepReadonly<T> = {
  readonly [P in keyof T]: T[P] extends object ? DeepReadonly<T[P]> : T[P];
};

/**
 * Optional fields helper
 */
export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/**
 * Required fields helper
 */
export type RequiredFields<T, K extends keyof T> = Omit<T, K> & Required<Pick<T, K>>;
