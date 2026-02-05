/**
 * Error handling utilities for MCP tool responses
 * 
 * @deprecated Use response-builder.ts instead for new code
 * This module is kept for backwards compatibility
 */

import { createErrorResponse as createErrorResponseNew } from './response-builder.js';

/**
 * Common error handling utility for MCP tool responses
 * 
 * @deprecated Use createErrorResponse from response-builder.ts
 */
export function createErrorResponse(error: unknown): { content: [{ type: 'text'; text: string }]; isError: true } {
  const response = createErrorResponseNew(error);
  return {
    content: [{ type: 'text', text: response.content[0].text }],
    isError: true
  };
}