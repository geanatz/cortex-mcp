import { ToolHandler } from './types.js';
import { McpToolResponse } from '../../../../types/common.js';
import { createErrorResponse } from '../../../../utils/response-builder.js';

/**
 * Wrap a tool handler with top-level error handling.
 * Any thrown error is converted to an MCP error response.
 */
export function withErrorHandling<TInput, TOutput extends McpToolResponse>(
  handler: ToolHandler<TInput, TOutput>
): ToolHandler<TInput, TOutput> {
  return async (input: TInput): Promise<TOutput> => {
    try {
      return await handler(input);
    } catch (error) {
      return createErrorResponse(error) as TOutput;
    }
  };
}
